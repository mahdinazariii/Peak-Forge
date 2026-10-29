const express = require('express');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const FREE_ATHLETE_LIMIT = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

const daysAgoIso = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (fromDate, toDate) =>
  Math.max(0, Math.floor((new Date(toDate) - new Date(fromDate)) / 86400000));

// Adherence % = done ticks of last 7 days ÷ exercises/meals in assigned plans
// (each planned item is expected to be ticked once per week)
function computeAdherence(expectedEx, doneEx, expectedMeals, doneMeals) {
  const pct = (expected, done) =>
    expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : null;
  const ex = pct(expectedEx, doneEx);
  const di = pct(expectedMeals, doneMeals);
  const parts = [ex, di].filter((x) => x !== null);
  return {
    exercise: ex,
    diet: di,
    overall: parts.length ? Math.round(parts.reduce((s, x) => s + x, 0) / parts.length) : 0,
  };
}

async function getLinkedAthlete(coachId, athleteId) {
  return dbAsync.get(
    `SELECT u.id, u.first_name, u.last_name, ca.category
     FROM coach_athletes ca JOIN users u ON u.id = ca.athlete_id
     WHERE ca.coach_id = ? AND ca.athlete_id = ?`,
    [coachId, athleteId]
  );
}

// ── Athletes list (dashboard) ─────────────────────────────────────────────────

// GET /api/coach/athletes — linked athletes with adherence, idle days, weight
// delta, sessions, latest record and category
router.get('/athletes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی فقط برای مربیان.' });
    }
    const since7 = daysAgoIso(7);
    const since30 = daysAgoIso(30);

    const rows = await dbAsync.all(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.tier,
              ca.category, ca.created_at AS linked_at,

              (SELECT COUNT(*) FROM program_assignments pa
                 JOIN programs p ON p.id = pa.program_id
                 JOIN exercises e ON e.program_id = p.id
                WHERE pa.athlete_id = u.id) AS expected_ex,

              (SELECT COUNT(*) FROM exercise_logs el
                WHERE el.athlete_id = u.id AND el.done = 1 AND el.log_date >= ?) AS done_ex,

              (SELECT COUNT(*) FROM diet_assignments da
                 JOIN diet_plans dp ON dp.id = da.diet_plan_id
                 JOIN meals m ON m.diet_plan_id = dp.id
                WHERE da.athlete_id = u.id) AS expected_meals,

              (SELECT COUNT(*) FROM meal_logs ml
                WHERE ml.athlete_id = u.id AND ml.done = 1 AND ml.log_date >= ?) AS done_meals,

              (SELECT MAX(log_date) FROM exercise_logs el2
                WHERE el2.athlete_id = u.id AND el2.done = 1) AS last_ex_date,

              (SELECT MAX(log_date) FROM meal_logs ml2
                WHERE ml2.athlete_id = u.id AND ml2.done = 1) AS last_meal_date,

              (SELECT COUNT(DISTINCT log_date) FROM exercise_logs el3
                WHERE el3.athlete_id = u.id AND el3.done = 1) AS sessions,

              (SELECT COUNT(DISTINCT log_date) FROM exercise_logs el4
                WHERE el4.athlete_id = u.id AND el4.done = 1 AND el4.log_date >= ?) AS sessions_month,

              (SELECT weight FROM weight_logs w1
                WHERE w1.athlete_id = u.id AND w1.weight IS NOT NULL
                ORDER BY log_date DESC LIMIT 1) AS last_weight,

              (SELECT weight FROM weight_logs w2
                WHERE w2.athlete_id = u.id AND w2.weight IS NOT NULL AND w2.log_date >= ?
                ORDER BY log_date ASC LIMIT 1) AS base_weight,

              (SELECT pr.exercise_name FROM personal_records pr
                WHERE pr.athlete_id = u.id
                ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS pr_name,

              (SELECT pr.weight FROM personal_records pr
                WHERE pr.athlete_id = u.id
                ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS pr_weight,

              (SELECT COUNT(*) FROM personal_records pr3
                WHERE pr3.athlete_id = u.id
                  AND pr3.created_at >= datetime('now', '-3 days')) AS recent_prs

       FROM coach_athletes ca
       JOIN users u ON u.id = ca.athlete_id
       WHERE ca.coach_id = ?
       ORDER BY u.id`,
      [since7, since7, since30, since30, req.user.id]
    );

    const todayIso = daysAgoIso(0);
    const athletes = rows.map((r) => {
      // meals are daily → weekly expectation is meals × 7 days
      const adherence = computeAdherence(
        r.expected_ex, r.done_ex, (r.expected_meals || 0) * 7, r.done_meals
      );
      const lastActive = [r.last_ex_date, r.last_meal_date].sort().pop();
      const idle = lastActive
        ? daysBetween(lastActive, todayIso)
        : daysBetween(String(r.linked_at).slice(0, 10), todayIso);
      const wd =
        r.last_weight != null && r.base_weight != null
          ? Math.round((r.last_weight - r.base_weight) * 10) / 10
          : null;
      return {
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        email: r.email,
        tier: r.tier,
        category: r.category || '',
        adherence: adherence.overall,
        adherence_detail: { exercise: adherence.exercise, diet: adherence.diet },
        idle,
        weight_delta: wd,
        last_weight: r.last_weight,
        sessions: r.sessions || 0,
        sessions_month: r.sessions_month || 0,
        record: r.pr_name ? `${r.pr_name} ${r.pr_weight} کیلو` : null,
        new_record: (r.recent_prs || 0) > 0,
      };
    });

    return res.json({ athletes });
  } catch (err) {
    console.error('GET coach athletes error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/coach/athletes — link an already-registered athlete by email
router.post('/athletes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی فقط برای مربیان.' });
    }
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'ایمیل ورزشکار الزامی است.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const athlete = await dbAsync.get(
      `SELECT id, first_name, last_name FROM users WHERE email = ? AND role = 'athlete'`,
      [cleanEmail]
    );
    if (!athlete) {
      return res.status(404).json({ error: 'ورزشکاری با این ایمیل ثبت‌نام نکرده است.' });
    }

    const existing = await dbAsync.get(
      'SELECT id FROM coach_athletes WHERE coach_id = ? AND athlete_id = ?',
      [req.user.id, athlete.id]
    );
    if (existing) {
      return res.status(409).json({ error: 'این ورزشکار قبلاً به شما متصل شده است.' });
    }

    // free-tier capacity check
    if ((req.user.tier || 'free') === 'free') {
      const cnt = await dbAsync.get(
        'SELECT COUNT(*) AS c FROM coach_athletes WHERE coach_id = ?',
        [req.user.id]
      );
      if ((cnt?.c || 0) >= FREE_ATHLETE_LIMIT) {
        return res.status(403).json({ error: 'ظرفیت اشتراک رایگان تکمیل شده است.', premium: true });
      }
    }

    await dbAsync.run(
      'INSERT INTO coach_athletes (coach_id, athlete_id) VALUES (?, ?)',
      [req.user.id, athlete.id]
    );
    return res.status(201).json({
      message: `${athlete.first_name} ${athlete.last_name} به شاگردان شما اضافه شد.`,
      athlete: { id: athlete.id, name: `${athlete.first_name} ${athlete.last_name}` },
    });
  } catch (err) {
    console.error('POST coach athletes error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// PATCH /api/coach/athletes/:id/category — set athlete category tag
router.patch('/athletes/:id/category', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی فقط برای مربیان.' });
    }
    const { category } = req.body;
    if (category == null || String(category).length > 40) {
      return res.status(400).json({ error: 'نام دسته نامعتبر است.' });
    }
    const link = await getLinkedAthlete(req.user.id, req.params.id);
    if (!link) return res.status(404).json({ error: 'ورزشکار یافت نشد.' });

    await dbAsync.run(
      'UPDATE coach_athletes SET category = ? WHERE coach_id = ? AND athlete_id = ?',
      [String(category).trim(), req.user.id, req.params.id]
    );
    return res.json({ message: 'دسته‌بندی ذخیره شد.' });
  } catch (err) {
    console.error('PATCH category error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Single athlete detail (feeds the premium per-athlete panel) ──────────────

// GET /api/coach/athletes/:id/detail — adherence breakdown, measurement series,
// records and assigned plans for one linked athlete
router.get('/athletes/:id/detail', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی فقط برای مربیان.' });
    }
    const link = await getLinkedAthlete(req.user.id, req.params.id);
    if (!link) return res.status(404).json({ error: 'ورزشکار یافت نشد.' });
    const athleteId = req.params.id;
    const since7 = daysAgoIso(7);
    const since30 = daysAgoIso(30);

    const user = await dbAsync.get(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.tier, u.created_at,
              ap.height, ap.weight
       FROM users u LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       WHERE u.id = ?`,
      [athleteId]
    );

    const expected_ex = (await dbAsync.get(
      `SELECT COUNT(*) AS c FROM program_assignments pa
         JOIN programs p ON p.id = pa.program_id
         JOIN exercises e ON e.program_id = p.id
        WHERE pa.athlete_id = ?`,
      [athleteId]
    )).c;
    const done_ex = (await dbAsync.get(
      `SELECT COUNT(*) AS c FROM exercise_logs
        WHERE athlete_id = ? AND done = 1 AND log_date >= ?`,
      [athleteId, since7]
    )).c;
    const expected_meals = (await dbAsync.get(
      `SELECT COUNT(*) AS c FROM diet_assignments da
         JOIN diet_plans dp ON dp.id = da.diet_plan_id
         JOIN meals m ON m.diet_plan_id = dp.id
        WHERE da.athlete_id = ?`,
      [athleteId]
    )).c;
    const done_meals = (await dbAsync.get(
      `SELECT COUNT(*) AS c FROM meal_logs
        WHERE athlete_id = ? AND done = 1 AND log_date >= ?`,
      [athleteId, since7]
    )).c;
    // meals are daily → weekly expectation is meals × 7 days
    const adherence = computeAdherence(
      expected_ex, done_ex, expected_meals * 7, done_meals
    );

    const sessions = (await dbAsync.get(
      `SELECT COUNT(DISTINCT log_date) AS c FROM exercise_logs
        WHERE athlete_id = ? AND done = 1`,
      [athleteId]
    )).c;

    const weight_series = await dbAsync.all(
      `SELECT log_date, weight, body_fat FROM weight_logs
        WHERE athlete_id = ? AND log_date >= ? ORDER BY log_date ASC`,
      [athleteId, since30]
    );

    const records = await dbAsync.all(
      `SELECT id, exercise_name, weight, reps, created_at
         FROM personal_records WHERE athlete_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 10`,
      [athleteId]
    );

    const programs = await dbAsync.all(
      `SELECT p.id, p.name, p.type, p.weeks, pa.assigned_at
         FROM program_assignments pa JOIN programs p ON p.id = pa.program_id
        WHERE pa.athlete_id = ? ORDER BY pa.assigned_at DESC`,
      [athleteId]
    );
    const diets = await dbAsync.all(
      `SELECT dp.id, dp.name, dp.weeks, da.assigned_at
         FROM diet_assignments da JOIN diet_plans dp ON dp.id = da.diet_plan_id
        WHERE da.athlete_id = ? ORDER BY da.assigned_at DESC`,
      [athleteId]
    );

    return res.json({
      athlete: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        tier: user.tier,
        height: user.height,
        weight: user.weight,
        category: link.category || '',
      },
      adherence: {
        overall: adherence.overall,
        exercise: { expected: expected_ex, done: done_ex, pct: adherence.exercise },
        diet: { expected: expected_meals * 7, done: done_meals, pct: adherence.diet },
      },
      sessions,
      weight_series,
      records,
      programs,
      diets,
    });
  } catch (err) {
    console.error('GET athlete detail error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
