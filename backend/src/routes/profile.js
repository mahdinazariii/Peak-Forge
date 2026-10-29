const express = require('express');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/profile — get logged-in user's full profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await dbAsync.get(
      `SELECT id, email, role, first_name, last_name, country, city, tier, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'کاربر یافت نشد.' });

    let profile = {};
    if (user.role === 'athlete') {
      profile = await dbAsync.get(
        `SELECT height, weight FROM athlete_profiles WHERE user_id = ?`,
        [user.id]
      ) || {};
    } else if (user.role === 'coach') {
      profile = await dbAsync.get(
        `SELECT experience_years, certifications FROM coach_profiles WHERE user_id = ?`,
        [user.id]
      ) || {};
    }

    return res.json({ user, profile });
  } catch (err) {
    console.error('Profile GET error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// PATCH /api/profile — update logged-in user's profile
router.patch('/', authMiddleware, async (req, res) => {
  try {
    const { first_name, last_name, city, country, height, weight, experience_years, certifications } = req.body;
    const userId = req.user.id;

    // Update users table
    await dbAsync.run(
      `UPDATE users SET first_name = COALESCE(?, first_name),
                        last_name  = COALESCE(?, last_name),
                        city       = COALESCE(?, city),
                        country    = COALESCE(?, country)
       WHERE id = ?`,
      [first_name || null, last_name || null, city || null, country || null, userId]
    );

    // Update role-specific profile
    if (req.user.role === 'athlete') {
      await dbAsync.run(
        `UPDATE athlete_profiles
         SET height = COALESCE(?, height), weight = COALESCE(?, weight)
         WHERE user_id = ?`,
        [height || null, weight || null, userId]
      );
    } else if (req.user.role === 'coach') {
      await dbAsync.run(
        `UPDATE coach_profiles
         SET experience_years  = COALESCE(?, experience_years),
             certifications    = COALESCE(?, certifications)
         WHERE user_id = ?`,
        [experience_years || null, certifications || null, userId]
      );
    }

    return res.json({ message: 'پروفایل با موفقیت به‌روزرسانی شد.' });
  } catch (err) {
    console.error('Profile PATCH error:', err);
    return res.status(500).json({ error: 'خطای سرور در به‌روزرسانی پروفایل.' });
  }
});

// GET /api/profile/stats/coach — coach dashboard stats
router.get('/stats/coach', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی فقط برای مربیان.' });
    }

    const athleteCount = await dbAsync.get(
      `SELECT COUNT(*) as count FROM coach_athletes WHERE coach_id = ?`,
      [req.user.id]
    );

    return res.json({
      athlete_count: athleteCount?.count || 0,
    });
  } catch (err) {
    console.error('Coach stats error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Body measurements (weight / body fat) ─────────────────────────────────────

// GET /api/profile/weight — athlete: own measurement series (chronological)
router.get('/weight', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'فقط ورزشکاران وزن دارند.' });
    }
    const logs = await dbAsync.all(
      `SELECT log_date, weight, body_fat FROM weight_logs
       WHERE athlete_id = ? ORDER BY log_date ASC`,
      [req.user.id]
    );
    return res.json({ logs });
  } catch (err) {
    console.error('GET weight error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/profile/weight — athlete: log today's weight/body-fat (upsert)
router.post('/weight', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'فقط ورزشکاران می‌توانند وزن ثبت کنند.' });
    }
    const { weight, body_fat } = req.body;
    if (weight == null && body_fat == null) {
      return res.status(400).json({ error: 'وزن یا درصد چربی الزامی است.' });
    }
    const w = weight == null ? null : parseFloat(weight);
    const f = body_fat == null ? null : parseFloat(body_fat);
    if ((w != null && (isNaN(w) || w <= 0 || w > 500)) ||
        (f != null && (isNaN(f) || f < 0 || f > 70))) {
      return res.status(400).json({ error: 'مقدار وزن یا چربی نامعتبر است.' });
    }
    const today = new Date().toISOString().slice(0, 10);

    await dbAsync.run(
      `INSERT INTO weight_logs (athlete_id, log_date, weight, body_fat)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(athlete_id, log_date) DO UPDATE SET
         weight  = COALESCE(excluded.weight,  weight_logs.weight),
         body_fat = COALESCE(excluded.body_fat, weight_logs.body_fat)`,
      [req.user.id, today, w, f]
    );

    // keep athlete_profiles.weight in sync with the latest measurement
    if (w != null) {
      await dbAsync.run(
        `UPDATE athlete_profiles SET weight = ? WHERE user_id = ?`,
        [w, req.user.id]
      );
    }
    return res.json({ message: 'ثبت شد.' });
  } catch (err) {
    console.error('POST weight error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Personal records ──────────────────────────────────────────────────────────

// GET /api/profile/records — athlete: own records (newest first)
router.get('/records', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const records = await dbAsync.all(
      `SELECT id, exercise_name, weight, reps, created_at
       FROM personal_records WHERE athlete_id = ? ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );
    return res.json({ records });
  } catch (err) {
    console.error('GET records error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/profile/records — athlete: claim a new personal record
router.post('/records', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'فقط ورزشکاران می‌توانند رکورد ثبت کنند.' });
    }
    const { exercise_name, weight, reps } = req.body;
    const w = parseFloat(weight);
    if (!exercise_name || !String(exercise_name).trim() || isNaN(w) || w <= 0) {
      return res.status(400).json({ error: 'نام حرکت و وزن معتبر الزامی است.' });
    }
    const result = await dbAsync.run(
      `INSERT INTO personal_records (athlete_id, exercise_name, weight, reps)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, String(exercise_name).trim(), w, parseInt(reps) || 1]
    );
    const record = await dbAsync.get('SELECT * FROM personal_records WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'رکورد ثبت شد.', record });
  } catch (err) {
    console.error('POST records error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// GET /api/profile/analytics — athlete: measurement series + daily adherence
// for the last 7 days + totals (sessions, streak, ticks) + recent records
router.get('/analytics', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'دسترسی فقط برای ورزشکاران.' });
    }
    const since7 = new Date();
    since7.setDate(since7.getDate() - 6);
    const since7Iso = since7.toISOString().slice(0, 10);
    const since90 = new Date();
    since90.setDate(since90.getDate() - 89);
    const since90Iso = since90.toISOString().slice(0, 10);

    // Expected exercise ticks per weekday (0=شنبه … 6=جمعه), from assigned programs
    const perDow = [0, 0, 0, 0, 0, 0, 0];
    const exByDow = await dbAsync.all(
      `SELECT e.day_index AS di, COUNT(*) AS c
       FROM program_assignments pa
       JOIN programs p ON p.id = pa.program_id
       JOIN exercises e ON e.program_id = p.id
       WHERE pa.athlete_id = ?
       GROUP BY e.day_index`,
      [req.user.id]
    );
    exByDow.forEach((r) => {
      const idx = Math.max(0, Math.min(6, parseInt(r.di) || 0));
      perDow[idx] += r.c;
    });

    // Expected meal ticks per day = meals across assigned diet plans (daily)
    const mealsRow = await dbAsync.get(
      `SELECT COUNT(*) AS c
       FROM diet_assignments da
       JOIN meals m ON m.diet_plan_id = da.diet_plan_id
       WHERE da.athlete_id = ?`,
      [req.user.id]
    );
    const mealsPerDay = mealsRow?.c || 0;

    // Actual ticks per day over the last 7 days
    const exDone = await dbAsync.all(
      `SELECT log_date, COUNT(*) AS c FROM exercise_logs
       WHERE athlete_id = ? AND done = 1 AND log_date >= ?
       GROUP BY log_date`,
      [req.user.id, since7Iso]
    );
    const mealDone = await dbAsync.all(
      `SELECT log_date, COUNT(*) AS c FROM meal_logs
       WHERE athlete_id = ? AND done = 1 AND log_date >= ?
       GROUP BY log_date`,
      [req.user.id, since7Iso]
    );
    const exMap = Object.fromEntries(exDone.map((r) => [r.log_date, r.c]));
    const mealMap = Object.fromEntries(mealDone.map((r) => [r.log_date, r.c]));

    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(since7);
      d.setDate(since7.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      // Persian weekday: 0=شنبه … 6=جمعه
      const dow = (d.getUTCDay() + 1) % 7;
      const expEx = perDow[dow];
      const dnEx = exMap[iso] || 0;
      const expDi = mealsPerDay;
      const dnDi = mealMap[iso] || 0;
      const exPct = expEx > 0 ? Math.min(100, Math.round((dnEx / expEx) * 100)) : null;
      const diPct = expDi > 0 ? Math.min(100, Math.round((dnDi / expDi) * 100)) : null;
      const parts = [exPct, diPct].filter((x) => x !== null);
      week.push({
        date: iso,
        dow,
        exercise: { expected: expEx, done: dnEx, pct: exPct },
        diet: { expected: expDi, done: dnDi, pct: diPct },
        overall: parts.length ? Math.round(parts.reduce((s, x) => s + x, 0) / parts.length) : null,
      });
    }

    // Totals
    const sessionsRow = await dbAsync.get(
      `SELECT COUNT(DISTINCT log_date) AS c FROM exercise_logs
       WHERE athlete_id = ? AND done = 1`,
      [req.user.id]
    );
    const totalRow = await dbAsync.get(
      `SELECT
         (SELECT COUNT(*) FROM exercise_logs WHERE athlete_id = ? AND done = 1) +
         (SELECT COUNT(*) FROM meal_logs    WHERE athlete_id = ? AND done = 1) AS c`,
      [req.user.id, req.user.id]
    );

    // Current streak: consecutive days ending today (or yesterday) with ≥1 tick
    const activeDates = new Set(
      [...exDone.map((r) => r.log_date), ...mealDone.map((r) => r.log_date)]
    );
    let streak = 0;
    const cursor = new Date();
    if (!activeDates.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
    while (activeDates.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const weight_series = await dbAsync.all(
      `SELECT log_date, weight, body_fat FROM weight_logs
       WHERE athlete_id = ? AND log_date >= ? ORDER BY log_date ASC`,
      [req.user.id, since90Iso]
    );

    const records = await dbAsync.all(
      `SELECT id, exercise_name, weight, reps, created_at FROM personal_records
       WHERE athlete_id = ? ORDER BY created_at DESC, id DESC LIMIT 5`,
      [req.user.id]
    );

    return res.json({
      week,
      weight_series,
      records,
      totals: {
        sessions: sessionsRow?.c || 0,
        streak,
        total_done: totalRow?.c || 0,
      },
    });
  } catch (err) {
    console.error('GET analytics error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
