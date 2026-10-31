const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../peak_forge.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    // SQLite has FK enforcement OFF by default — without this, ON DELETE
    // CASCADE leaves orphan rows (meals of deleted plans, etc.)
    db.run('PRAGMA foreign_keys = ON');
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

  // Diet plans table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS diet_plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id   INTEGER NOT NULL,
      name       TEXT NOT NULL,
      weeks      INTEGER DEFAULT 4,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(coach_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Meals inside diet plans
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      diet_plan_id INTEGER NOT NULL,
      name         TEXT NOT NULL,
      time         TEXT DEFAULT '',
      items        TEXT DEFAULT '',
      sort_order   INTEGER DEFAULT 0,
      FOREIGN KEY(diet_plan_id) REFERENCES diet_plans(id) ON DELETE CASCADE
    )
  `);

  // Diet plan assignments (coach assigns diet plan to athlete)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS diet_assignments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      diet_plan_id INTEGER NOT NULL,
      athlete_id   INTEGER NOT NULL,
      assigned_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(diet_plan_id, athlete_id),
      FOREIGN KEY(diet_plan_id) REFERENCES diet_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(athlete_id)   REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Daily meal log (athlete marks meal as done)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS meal_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id  INTEGER NOT NULL,
      meal_id     INTEGER NOT NULL,
      log_date    TEXT NOT NULL,
      done        INTEGER DEFAULT 0,
      UNIQUE(athlete_id, meal_id, log_date),
      FOREIGN KEY(athlete_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(meal_id)    REFERENCES meals(id) ON DELETE CASCADE
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

  // Forums (group chat rooms owned by a coach; members = his linked athletes)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS forums (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id   INTEGER NOT NULL,
      name       TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(coach_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Messages: DMs (receiver_id set, forum_id NULL) or forum posts (forum_id set)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER NOT NULL,
      receiver_id INTEGER,
      forum_id    INTEGER,
      text        TEXT NOT NULL,
      is_priority INTEGER DEFAULT 0,
      is_read     INTEGER DEFAULT 0,
      answered    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK(receiver_id IS NOT NULL OR forum_id IS NOT NULL),
      FOREIGN KEY(sender_id)   REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(forum_id)    REFERENCES forums(id) ON DELETE CASCADE
    )
  `);

  // Coach-side category tag for each linked athlete (free text, e.g. حجم)
  try {
    await dbAsync.run(`ALTER TABLE coach_athletes ADD COLUMN category TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }

  // Premium meal extras: calories and an alternative suggestion
  try {
    await dbAsync.run(`ALTER TABLE meals ADD COLUMN kcal REAL`);
  } catch (e) { /* column already exists */ }
  try {
    await dbAsync.run(`ALTER TABLE meals ADD COLUMN alt TEXT DEFAULT ''`);
  } catch (e) { /* column already exists */ }

  // Daily body measurements logged by the athlete (weight in kg, body_fat in %)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL,
      log_date   TEXT NOT NULL,
      weight     REAL,
      body_fat   REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(athlete_id, log_date),
      FOREIGN KEY(athlete_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Personal records claimed by the athlete (e.g. ددلیفت ۸۵ کیلو × ۱)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS personal_records (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id    INTEGER NOT NULL,
      exercise_name TEXT NOT NULL,
      weight        REAL NOT NULL,
      reps          INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(athlete_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Per-set training details logged by the athlete for one exercise/day
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS exercise_sets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id  INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      log_date    TEXT NOT NULL,
      set_index   INTEGER NOT NULL,
      weight      REAL,
      reps        INTEGER,
      UNIQUE(athlete_id, exercise_id, log_date, set_index),
      FOREIGN KEY(athlete_id)  REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    )
  `);

  // Gamification state (XP is incremented by ticks, records, weight logs)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS athlete_game (
      user_id INTEGER PRIMARY KEY,
      xp      INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Per-coach notification/alert settings (premium panel)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS coach_settings (
      coach_id       INTEGER PRIMARY KEY,
      idle_days      INTEGER DEFAULT 3,
      auto_remind    INTEGER DEFAULT 0,
      alert_weight   INTEGER DEFAULT 0,
      alert_pr       INTEGER DEFAULT 0,
      priority_inbox INTEGER DEFAULT 0,
      FOREIGN KEY(coach_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Coach weekly send-plan (which template goes to which target on which day)
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS coach_schedule (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id  INTEGER NOT NULL,
      day_index INTEGER NOT NULL CHECK(day_index BETWEEN 0 AND 6),
      plan_kind TEXT NOT NULL CHECK(plan_kind IN ('workout', 'diet')),
      plan_id   INTEGER NOT NULL,
      target    TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(coach_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Coach self-claimed honors/medals shown on the premium profile
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS coach_honors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id   INTEGER NOT NULL,
      title      TEXT NOT NULL,
      detail     TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(coach_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // anti-farming flags: XP is awarded only the first time per item/day
  try {
    await dbAsync.run(`ALTER TABLE exercise_logs ADD COLUMN xp_awarded INTEGER DEFAULT 0`);
  } catch (e) { /* column already exists */ }
  try {
    await dbAsync.run(`ALTER TABLE meal_logs ADD COLUMN xp_awarded INTEGER DEFAULT 0`);
  } catch (e) { /* column already exists */ }

  // Password reset (simulated email delivery — code + 10-minute expiry)
  try {
    await dbAsync.run(`ALTER TABLE users ADD COLUMN reset_code TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    await dbAsync.run(`ALTER TABLE users ADD COLUMN reset_expires DATETIME`);
  } catch (e) { /* column already exists */ }

  // Backfill coach_athletes for assignments made before the auto-link existed
  await dbAsync.run(`
    INSERT OR IGNORE INTO coach_athletes (coach_id, athlete_id)
    SELECT p.coach_id, pa.athlete_id
    FROM program_assignments pa JOIN programs p ON p.id = pa.program_id
  `);
  await dbAsync.run(`
    INSERT OR IGNORE INTO coach_athletes (coach_id, athlete_id)
    SELECT dp.coach_id, da.athlete_id
    FROM diet_assignments da JOIN diet_plans dp ON dp.id = da.diet_plan_id
  `);

  console.log('Database tables verified/initialized.');
}

module.exports = {
  db,
  dbAsync,
  initDb
};
