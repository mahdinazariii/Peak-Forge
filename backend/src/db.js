const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../peak_forge.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper for promise-based queries
const dbAsync = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

async function initDb() {
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('athlete', 'coach')),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      country TEXT,
      city TEXT,
      tier TEXT DEFAULT 'free' CHECK(tier IN ('free', 'premium')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS athlete_profiles (
      user_id INTEGER PRIMARY KEY,
      height REAL,
      weight REAL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS coach_profiles (
      user_id INTEGER PRIMARY KEY,
      experience_years REAL,
      certifications TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Programs table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS programs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id   INTEGER NOT NULL,
      name       TEXT NOT NULL,
      type       TEXT DEFAULT 'تمرینی',
      weeks      INTEGER DEFAULT 4,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(coach_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Exercises inside programs
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id  INTEGER NOT NULL,
      name        TEXT NOT NULL,
      sets        TEXT DEFAULT '',
      rest        TEXT DEFAULT '',
      day_index   INTEGER DEFAULT 0,
      day_name    TEXT DEFAULT '',
      focus       TEXT DEFAULT '',
      sort_order  INTEGER DEFAULT 0,
      FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE CASCADE
    )
  `);

  // Program assignments (coach assigns program to athlete)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS program_assignments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id  INTEGER NOT NULL,
      athlete_id  INTEGER NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(program_id, athlete_id),
      FOREIGN KEY(program_id)  REFERENCES programs(id) ON DELETE CASCADE,
      FOREIGN KEY(athlete_id)  REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Daily exercise log (athlete marks exercise as done)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS exercise_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id  INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      log_date    TEXT NOT NULL,
      done        INTEGER DEFAULT 0,
      UNIQUE(athlete_id, exercise_id, log_date),
      FOREIGN KEY(athlete_id)  REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    )
  `);

  // Coach-Athlete relationship table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS coach_athletes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id   INTEGER NOT NULL,
      athlete_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(coach_id, athlete_id),
      FOREIGN KEY(coach_id)   REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(athlete_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables verified/initialized.');
}

module.exports = {
  db,
  dbAsync,
  initDb
};
