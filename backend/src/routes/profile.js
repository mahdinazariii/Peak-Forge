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

module.exports = router;
