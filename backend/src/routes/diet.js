const express = require('express');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { addXp, XP } = require('../game');

const router = express.Router();

// ── Diet Plans ────────────────────────────────────────────────────────────────

// GET /api/diet/plans — coach: list own diet plans | athlete: list assigned diet plans
router.get('/plans', authMiddleware, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'coach') {
      rows = await dbAsync.all(
        `SELECT dp.id, dp.name, dp.weeks,
                COUNT(DISTINCT da.athlete_id) as sent_count
         FROM diet_plans dp
         LEFT JOIN diet_assignments da ON da.diet_plan_id = dp.id
         WHERE dp.coach_id = ?
         GROUP BY dp.id
         ORDER BY dp.created_at DESC`,
        [req.user.id]
      );
    } else {
      rows = await dbAsync.all(
        `SELECT dp.id, dp.name, dp.weeks, da.assigned_at,
                u.first_name || ' ' || u.last_name as coach_name
         FROM diet_assignments da
         JOIN diet_plans dp ON dp.id = da.diet_plan_id
         JOIN users u ON u.id = dp.coach_id
         WHERE da.athlete_id = ?
         ORDER BY da.assigned_at DESC`,
        [req.user.id]
      );
    }
    return res.json({ plans: rows });
  } catch (err) {
    console.error('GET diet plans error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/diet/plans — coach: create a new diet plan
router.post('/plans', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند برنامه غذایی بسازند.' });
    }
    const { name, weeks } = req.body;
    if (!name) return res.status(400).json({ error: 'نام برنامه الزامی است.' });

    const result = await dbAsync.run(
      `INSERT INTO diet_plans (coach_id, name, weeks) VALUES (?, ?, ?)`,
      [req.user.id, name.trim(), parseInt(weeks) || 4]
    );
    const plan = await dbAsync.get('SELECT * FROM diet_plans WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'برنامه غذایی ساخته شد.', plan });
  } catch (err) {
    console.error('POST diet plans error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// DELETE /api/diet/plans/:id — coach: delete own diet plan
router.delete('/plans/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const plan = await dbAsync.get(
      'SELECT id FROM diet_plans WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!plan) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    await dbAsync.run('DELETE FROM diet_plans WHERE id = ?', [req.params.id]);
    return res.json({ message: 'برنامه غذایی حذف شد.' });
  } catch (err) {
    console.error('DELETE diet plans error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Meals inside a Diet Plan ──────────────────────────────────────────────────

// GET /api/diet/plans/:id/meals — list meals for a diet plan
router.get('/plans/:id/meals', authMiddleware, async (req, res) => {
  try {
    const meals = await dbAsync.all(
      `SELECT * FROM meals WHERE diet_plan_id = ? ORDER BY sort_order ASC, id ASC`,
      [req.params.id]
    );
    return res.json({ meals });
  } catch (err) {
    console.error('GET meals error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/diet/plans/:id/meals — coach: add meal to diet plan
router.post('/plans/:id/meals', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند وعده اضافه کنند.' });
    }
    const { name, time, items, sort_order, kcal, alt } = req.body;
    if (!name) return res.status(400).json({ error: 'نام وعده الزامی است.' });

    const result = await dbAsync.run(
      `INSERT INTO meals (diet_plan_id, name, time, items, sort_order, kcal, alt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, name.trim(), time || '', items || '', sort_order ?? 0,
       kcal == null || kcal === '' ? null : parseFloat(kcal), alt || '']
    );
    const meal = await dbAsync.get('SELECT * FROM meals WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'وعده اضافه شد.', meal });
  } catch (err) {
    console.error('POST meals error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// PATCH /api/diet/plans/:id — coach: rename a diet plan / change weeks
router.patch('/plans/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const plan = await dbAsync.get(
      'SELECT id FROM diet_plans WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!plan) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    const { name, weeks } = req.body;
    await dbAsync.run(
      `UPDATE diet_plans SET name = COALESCE(?, name), weeks = COALESCE(?, weeks) WHERE id = ?`,
      [name && String(name).trim() ? String(name).trim() : null,
       weeks ? parseInt(weeks) : null,
       req.params.id]
    );
    const updated = await dbAsync.get('SELECT * FROM diet_plans WHERE id = ?', [req.params.id]);
    return res.json({ message: 'برنامه به‌روزرسانی شد.', plan: updated });
  } catch (err) {
    console.error('PATCH diet plan error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/diet/plans/:id/copy — coach: duplicate a diet plan with its meals
router.post('/plans/:id/copy', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const src = await dbAsync.get(
      'SELECT * FROM diet_plans WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!src) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    const result = await dbAsync.run(
      `INSERT INTO diet_plans (coach_id, name, weeks) VALUES (?, ?, ?)`,
      [req.user.id, req.body && req.body.name ? String(req.body.name).trim() : `${src.name} (کپی)`, src.weeks]
    );
    const newId = result.lastID;

    const srcMeals = await dbAsync.all(
      'SELECT name, time, items, sort_order, kcal, alt FROM meals WHERE diet_plan_id = ? ORDER BY sort_order ASC',
      [src.id]
    );
    for (const m of srcMeals) {
      await dbAsync.run(
        `INSERT INTO meals (diet_plan_id, name, time, items, sort_order, kcal, alt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId, m.name, m.time, m.items, m.sort_order, m.kcal, m.alt]
      );
    }
    const plan = await dbAsync.get('SELECT * FROM diet_plans WHERE id = ?', [newId]);
    return res.status(201).json({ message: 'کپی ساخته شد.', plan, meals_copied: srcMeals.length });
  } catch (err) {
    console.error('COPY diet plan error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// DELETE /api/diet/plans/:planId/meals/:mealId — coach: remove a meal
router.delete('/plans/:planId/meals/:mealId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    await dbAsync.run('DELETE FROM meals WHERE id = ? AND diet_plan_id = ?', [req.params.mealId, req.params.planId]);
    return res.json({ message: 'وعده حذف شد.' });
  } catch (err) {
    console.error('DELETE meal error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Assign Diet Plan to Athlete ───────────────────────────────────────────────

// POST /api/diet/plans/:id/assign — coach: assign diet plan to an athlete
router.post('/plans/:id/assign', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند برنامه ارسال کنند.' });
    }
    const { athlete_id } = req.body;
    if (!athlete_id) return res.status(400).json({ error: 'شناسه ورزشکار الزامی است.' });

    const plan = await dbAsync.get(
      'SELECT id FROM diet_plans WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!plan) return res.status(404).json({ error: 'برنامه یافت نشد.' });

    await dbAsync.run(
      `INSERT OR REPLACE INTO diet_assignments (diet_plan_id, athlete_id, assigned_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [req.params.id, athlete_id]
    );

    // Link coach-athlete so the athlete shows up in chat/contacts
    await dbAsync.run(
      `INSERT OR IGNORE INTO coach_athletes (coach_id, athlete_id) VALUES (?, ?)`,
      [req.user.id, athlete_id]
    );

    const athlete = await dbAsync.get(
      'SELECT first_name, last_name FROM users WHERE id = ?', [athlete_id]
    );
    const name = athlete ? `${athlete.first_name} ${athlete.last_name}` : 'ورزشکار';
    return res.json({ message: `برنامه غذایی برای ${name} ارسال شد.` });
  } catch (err) {
    console.error('Assign diet error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Athlete Meal Log (tick done/undone) ───────────────────────────────────────

// GET /api/diet/log — get today's meal log for logged-in athlete
router.get('/log', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logs = await dbAsync.all(
      `SELECT meal_id, done FROM meal_logs WHERE athlete_id = ? AND log_date = ?`,
      [req.user.id, today]
    );
    return res.json({ logs, date: today });
  } catch (err) {
    console.error('GET meal log error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/diet/log — athlete: toggle a meal done/undone
router.post('/log', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'athlete') {
      return res.status(403).json({ error: 'فقط ورزشکاران می‌توانند لاگ بزنند.' });
    }
    const { meal_id, done } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    const existing = await dbAsync.get(
      'SELECT xp_awarded FROM meal_logs WHERE athlete_id = ? AND meal_id = ? AND log_date = ?',
      [req.user.id, meal_id, today]
    );
    const wasAwarded = !!(existing && existing.xp_awarded);

    await dbAsync.run(
      `INSERT INTO meal_logs (athlete_id, meal_id, log_date, done)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(athlete_id, meal_id, log_date) DO UPDATE SET done = excluded.done`,
      [req.user.id, meal_id, today, done ? 1 : 0]
    );

    if (done && !wasAwarded) {
      await addXp(req.user.id, XP.TICK_MEAL);
      await dbAsync.run(
        `UPDATE meal_logs SET xp_awarded = 1
         WHERE athlete_id = ? AND meal_id = ? AND log_date = ?`,
        [req.user.id, meal_id, today]
      );
    }
    return res.json({ message: 'ثبت شد.' });
  } catch (err) {
    console.error('POST meal log error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
