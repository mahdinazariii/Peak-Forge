const express = require('express');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { addXp, XP } = require('../game');

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

// PATCH /api/workouts/programs/:id — coach: rename a program / change weeks
router.patch('/programs/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const prog = await dbAsync.get(
      'SELECT id FROM programs WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!prog) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    const { name, weeks } = req.body;
    await dbAsync.run(
      `UPDATE programs SET name = COALESCE(?, name), weeks = COALESCE(?, weeks) WHERE id = ?`,
      [name && String(name).trim() ? String(name).trim() : null,
       weeks ? parseInt(weeks) : null,
       req.params.id]
    );
    const updated = await dbAsync.get('SELECT * FROM programs WHERE id = ?', [req.params.id]);
    return res.json({ message: 'برنامه به‌روزرسانی شد.', program: updated });
  } catch (err) {
    console.error('PATCH program error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/workouts/programs/:id/copy — coach: duplicate a program with its exercises
router.post('/programs/:id/copy', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const src = await dbAsync.get(
      'SELECT * FROM programs WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!src) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    const result = await dbAsync.run(
      `INSERT INTO programs (coach_id, name, type, weeks) VALUES (?, ?, ?, ?)`,
      [req.user.id, req.body && req.body.name ? String(req.body.name).trim() : `${src.name} (کپی)`, src.type, src.weeks]
    );
    const newId = result.lastID;

    const srcEx = await dbAsync.all(
      `SELECT name, sets, rest, day_index, day_name, focus, sort_order
       FROM exercises WHERE program_id = ? ORDER BY sort_order ASC, id ASC`,
      [src.id]
    );
    for (const e of srcEx) {
      await dbAsync.run(
        `INSERT INTO exercises (program_id, name, sets, rest, day_index, day_name, focus, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, e.name, e.sets, e.rest, e.day_index, e.day_name, e.focus, e.sort_order]
      );
    }
    const program = await dbAsync.get('SELECT * FROM programs WHERE id = ?', [newId]);
    return res.status(201).json({ message: 'کپی ساخته شد.', program, exercises_copied: srcEx.length });
  } catch (err) {
    console.error('COPY program error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// DELETE /api/workouts/programs/:id/exercises/:exId — coach: remove an exercise
router.delete('/programs/:id/exercises/:exId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const prog = await dbAsync.get(
      'SELECT id FROM programs WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!prog) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    await dbAsync.run(
      'DELETE FROM exercises WHERE id = ? AND program_id = ?',
      [req.params.exId, req.params.id]
    );
    return res.json({ message: 'حرکت حذف شد.' });
  } catch (err) {
    console.error('DELETE exercise error:', err);
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

    // Link coach-athlete so the athlete shows up in chat/contacts
    await dbAsync.run(
      `INSERT OR IGNORE INTO coach_athletes (coach_id, athlete_id) VALUES (?, ?)`,
      [req.user.id, athlete_id]
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

// ── Per-set training details ──────────────────────────────────────────────────

// GET /api/workouts/sets?exercise_id=X — athlete: today's logged sets for one exercise
router.get('/sets', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const exerciseId = parseInt(req.query.exercise_id);
    if (!exerciseId) return res.status(400).json({ error: 'شناسه حرکت الزامی است.' });
    const today = new Date().toISOString().slice(0, 10);
    const sets = await dbAsync.all(
      `SELECT set_index, weight, reps FROM exercise_sets
       WHERE athlete_id = ? AND exercise_id = ? AND log_date = ?
       ORDER BY set_index ASC`,
      [req.user.id, exerciseId, today]
    );
    return res.json({ sets, date: today });
  } catch (err) {
    console.error('GET sets error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/workouts/sets — athlete: replace today's sets for one exercise
// body: { exercise_id, sets: [{ weight, reps }, ...] }
router.post('/sets', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'فقط ورزشکاران می‌توانند ست ثبت کنند.' });
    }
    const { exercise_id, sets } = req.body;
    const exerciseId = parseInt(exercise_id);
    if (!exerciseId || !Array.isArray(sets) || sets.length === 0) {
      return res.status(400).json({ error: 'حرکت و لیست ست‌ها الزامی است.' });
    }
    if (sets.length > 20) {
      return res.status(400).json({ error: 'حداکثر ۲۰ ست مجاز است.' });
    }
    for (const s of sets) {
      const w = s.weight == null || s.weight === '' ? null : parseFloat(s.weight);
      const r = s.reps == null || s.reps === '' ? null : parseInt(s.reps);
      if ((w != null && (isNaN(w) || w < 0 || w > 1000)) ||
          (r != null && (isNaN(r) || r < 0 || r > 1000))) {
        return res.status(400).json({ error: 'مقدار وزن یا تکرار نامعتبر است.' });
      }
    }

    const exercise = await dbAsync.get('SELECT id FROM exercises WHERE id = ?', [exerciseId]);
    if (!exercise) return res.status(404).json({ error: 'حرکت یافت نشد.' });

    const today = new Date().toISOString().slice(0, 10);
    await dbAsync.run(
      'DELETE FROM exercise_sets WHERE athlete_id = ? AND exercise_id = ? AND log_date = ?',
      [req.user.id, exerciseId, today]
    );
    let i = 0;
    for (const s of sets) {
      const w = s.weight == null || s.weight === '' ? null : parseFloat(s.weight);
      const r = s.reps == null || s.reps === '' ? null : parseInt(s.reps);
      await dbAsync.run(
        `INSERT INTO exercise_sets (athlete_id, exercise_id, log_date, set_index, weight, reps)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, exerciseId, today, i++, w, r]
      );
    }

    const saved = await dbAsync.all(
      `SELECT set_index, weight, reps FROM exercise_sets
       WHERE athlete_id = ? AND exercise_id = ? AND log_date = ?
       ORDER BY set_index ASC`,
      [req.user.id, exerciseId, today]
    );
    return res.json({ message: 'ست‌ها ثبت شد.', sets: saved });
  } catch (err) {
    console.error('POST sets error:', err);
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

    const existing = await dbAsync.get(
      'SELECT xp_awarded FROM exercise_logs WHERE athlete_id = ? AND exercise_id = ? AND log_date = ?',
      [req.user.id, exercise_id, today]
    );
    const wasAwarded = !!(existing && existing.xp_awarded);

    // upsert keeps xp_awarded intact so untick/retick cannot re-award XP
    await dbAsync.run(
      `INSERT INTO exercise_logs (athlete_id, exercise_id, log_date, done)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(athlete_id, exercise_id, log_date) DO UPDATE SET done = excluded.done`,
      [req.user.id, exercise_id, today, done ? 1 : 0]
    );

    // reward the first completion of the day only (no XP farming via re-ticks)
    if (done && !wasAwarded) {
      await addXp(req.user.id, XP.TICK_EXERCISE);
      await dbAsync.run(
        `UPDATE exercise_logs SET xp_awarded = 1
         WHERE athlete_id = ? AND exercise_id = ? AND log_date = ?`,
        [req.user.id, exercise_id, today]
      );
    }
    return res.json({ message: 'ثبت شد.' });
  } catch (err) {
    console.error('POST log error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// GET /api/workouts/athletes — coach: list their linked athletes
router.get('/athletes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const athletes = await dbAsync.all(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM coach_athletes ca
       JOIN users u ON u.id = ca.athlete_id
       WHERE ca.coach_id = ?
       ORDER BY u.first_name, u.last_name`,
      [req.user.id]
    );
    return res.json({ athletes });
  } catch (err) {
    console.error('GET athletes error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
