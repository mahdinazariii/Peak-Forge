const express = require('express');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── Programs (Plans) ─────────────────────────────────────────────────────────

// GET /api/workouts/programs — coach: list own programs | athlete: list assigned programs
router.get('/programs', authMiddleware, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'coach') {
      rows = await dbAsync.all(
        `SELECT p.id, p.name, p.type, p.weeks,
                COUNT(DISTINCT pa.athlete_id) as sent_count
         FROM programs p
         LEFT JOIN program_assignments pa ON pa.program_id = p.id
         WHERE p.coach_id = ?
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [req.user.id]
      );
    } else {
      rows = await dbAsync.all(
        `SELECT p.id, p.name, p.type, p.weeks, pa.assigned_at,
                u.first_name || ' ' || u.last_name as coach_name
         FROM program_assignments pa
         JOIN programs p ON p.id = pa.program_id
         JOIN users u ON u.id = p.coach_id
         WHERE pa.athlete_id = ?
         ORDER BY pa.assigned_at DESC`,
        [req.user.id]
      );
    }
    return res.json({ programs: rows });
  } catch (err) {
    console.error('GET programs error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/workouts/programs — coach: create a new program
router.post('/programs', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند برنامه بسازند.' });
    }
    const { name, type, weeks } = req.body;
    if (!name) return res.status(400).json({ error: 'نام برنامه الزامی است.' });

    const result = await dbAsync.run(
      `INSERT INTO programs (coach_id, name, type, weeks) VALUES (?, ?, ?, ?)`,
      [req.user.id, name.trim(), type || 'تمرینی', parseInt(weeks) || 4]
    );
    const program = await dbAsync.get('SELECT * FROM programs WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'برنامه ساخته شد.', program });
  } catch (err) {
    console.error('POST programs error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// DELETE /api/workouts/programs/:id — coach: delete own program
router.delete('/programs/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const prog = await dbAsync.get(
      'SELECT id FROM programs WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!prog) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    await dbAsync.run('DELETE FROM programs WHERE id = ?', [req.params.id]);
    return res.json({ message: 'برنامه حذف شد.' });
  } catch (err) {
    console.error('DELETE programs error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Exercises inside a Program ────────────────────────────────────────────────

// GET /api/workouts/programs/:id/exercises — list exercises for a program
router.get('/programs/:id/exercises', authMiddleware, async (req, res) => {
  try {
    const exercises = await dbAsync.all(
      `SELECT * FROM exercises WHERE program_id = ? ORDER BY day_index ASC, sort_order ASC`,
      [req.params.id]
    );
    return res.json({ exercises });
  } catch (err) {
    console.error('GET exercises error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/workouts/programs/:id/exercises — coach: add exercise to program
router.post('/programs/:id/exercises', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند حرکت اضافه کنند.' });
    }
    const { name, sets, rest, day_index, day_name, focus, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'نام حرکت الزامی است.' });

    const result = await dbAsync.run(
      `INSERT INTO exercises (program_id, name, sets, rest, day_index, day_name, focus, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        name.trim(),
        sets || '',
        rest || '',
        day_index ?? 0,
        day_name || '',
        focus || '',
        sort_order ?? 0
      ]
    );
    const exercise = await dbAsync.get('SELECT * FROM exercises WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'حرکت اضافه شد.', exercise });
  } catch (err) {
    console.error('POST exercises error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Assign Program to Athlete ─────────────────────────────────────────────────

// POST /api/workouts/programs/:id/assign — coach: assign program to an athlete
router.post('/programs/:id/assign', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند برنامه ارسال کنند.' });
    }
    const { athlete_id } = req.body;
    if (!athlete_id) return res.status(400).json({ error: 'شناسه ورزشکار الزامی است.' });

    // Verify program belongs to this coach
    const prog = await dbAsync.get(
      'SELECT id FROM programs WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!prog) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    // Upsert assignment
    await dbAsync.run(
      `INSERT OR REPLACE INTO program_assignments (program_id, athlete_id, assigned_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [req.params.id, athlete_id]
    );

    const athlete = await dbAsync.get(
      'SELECT first_name, last_name FROM users WHERE id = ?',
      [athlete_id]
    );
    const name = athlete ? `${athlete.first_name} ${athlete.last_name}` : 'ورزشکار';
    return res.json({ message: `برنامه برای ${name} ارسال شد.` });
  } catch (err) {
    console.error('Assign error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Athlete Exercise Log (tick done/undone) ───────────────────────────────────

// GET /api/workouts/log — get today's exercise log for logged-in athlete
router.get('/log', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logs = await dbAsync.all(
      `SELECT exercise_id, done FROM exercise_logs WHERE athlete_id = ? AND log_date = ?`,
      [req.user.id, today]
    );
    return res.json({ logs, date: today });
  } catch (err) {
    console.error('GET log error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/workouts/log — athlete: toggle an exercise done/undone
router.post('/log', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'فقط ورزشکاران می‌توانند لاگ بزنند.' });
    }
    const { exercise_id, done } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    await dbAsync.run(
      `INSERT OR REPLACE INTO exercise_logs (athlete_id, exercise_id, log_date, done)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, exercise_id, today, done ? 1 : 0]
    );
    return res.json({ message: 'ثبت شد.' });
  } catch (err) {
    console.error('POST log error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// GET /api/workouts/athletes — coach: list their athletes (users assigned to them)
router.get('/athletes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const athletes = await dbAsync.all(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
       FROM users u
       JOIN program_assignments pa ON pa.athlete_id = u.id
       JOIN programs p ON p.id = pa.program_id
       WHERE p.coach_id = ?`,
      [req.user.id]
    );
    return res.json({ athletes });
  } catch (err) {
    console.error('GET athletes error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
