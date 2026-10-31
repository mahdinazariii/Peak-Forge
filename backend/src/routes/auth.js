const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { dbAsync } = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Helper to normalize persian/arabic numbers
function normalizeDigits(str) {
  if (!str) return str;
  return String(str)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace('٫', '.');
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const {
      role,
      first,
      last,
      email,
      password,
      country,
      city,
      height,
      weight,
      years,
      cert
    } = req.body;

    if (!role || !email || !password || !first || !last) {
      return res.status(400).json({ error: 'لطفاً فیلدهای الزامی را پر کنید.' });
    }

    if (!['athlete', 'coach'].includes(role)) {
      return res.status(400).json({ error: 'نقش کاربری نامعتبر است.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await dbAsync.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'کاربری با این ایمیل از قبل ثبت‌نام کرده است.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const userResult = await dbAsync.run(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, country, city, tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'free')`,
      [cleanEmail, passwordHash, role, first.trim(), last.trim(), country || '', city || '']
    );

    const userId = userResult.lastID;

    // Role specific profiles
    if (role === 'athlete') {
      const h = height ? parseFloat(normalizeDigits(height)) : null;
      const w = weight ? parseFloat(normalizeDigits(weight)) : null;
      await dbAsync.run(
        `INSERT INTO athlete_profiles (user_id, height, weight) VALUES (?, ?, ?)`,
        [userId, h, w]
      );
    } else if (role === 'coach') {
      const exp = years ? parseFloat(normalizeDigits(years)) : 0;
      await dbAsync.run(
        `INSERT INTO coach_profiles (user_id, experience_years, certifications) VALUES (?, ?, ?)`,
        [userId, exp, cert || '']
      );
    }

    const newUser = {
      id: userId,
      email: cleanEmail,
      role,
      tier: 'free',
      first_name: first.trim(),
      last_name: last.trim()
    };

    const token = generateToken(newUser);

    return res.status(201).json({
      message: 'ثبت‌نام با موفقیت انجام شد.',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'خطای سرور در ثبت‌نام.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'ایمیل و رمز عبور الزامی است.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await dbAsync.get(
      'SELECT id, email, password_hash, role, first_name, last_name, country, city, tier FROM users WHERE email = ?',
      [cleanEmail]
    );

    if (!user) {
      return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
    }

    const userPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
      first_name: user.first_name,
      last_name: user.last_name,
      country: user.country,
      city: user.city
    };

    const token = generateToken(userPayload);

    return res.json({
      message: 'ورود موفقیت‌آمیز بود.',
      token,
      user: userPayload
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'خطای سرور در ورود.' });
  }
});

// GET /api/auth/me (Returns logged in user with profile details)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await dbAsync.get(
      'SELECT id, email, role, first_name, last_name, country, city, tier, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }

    let profile = null;
    if (user.role === 'athlete') {
      profile = await dbAsync.get('SELECT height, weight FROM athlete_profiles WHERE user_id = ?', [user.id]);
    } else if (user.role === 'coach') {
      profile = await dbAsync.get('SELECT experience_years, certifications FROM coach_profiles WHERE user_id = ?', [user.id]);
    }

    return res.json({
      user,
      profile
    });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Password reset (simulated email: the code is returned in the response) ───

// POST /api/auth/forgot { email } → issues a 6-digit code valid for 10 minutes
router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'ایمیل الزامی است.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const user = await dbAsync.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);

    // Generic answer for unknown emails (no account enumeration)
    if (!user) {
      return res.json({
        message: 'اگر این ایمیل در سیستم ثبت شده باشد، کد بازیابی ارسال شده است.',
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await dbAsync.run(
      'UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?',
      [code, expires, user.id]
    );

    // No email gateway in this project — the code is "delivered" in the response
    return res.json({
      message: 'کد بازیابی ارسال شد. (شبیه‌سازی ایمیل — کد در همین پاسخ آمده است)',
      reset_code: code,
      expires_in_minutes: 10,
    });
  } catch (err) {
    console.error('Forgot error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/auth/reset { email, code, new_password } → sets the new password
router.post('/reset', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password) {
      return res.status(400).json({ error: 'همه‌ی فیلدها الزامی است.' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await dbAsync.get(
      'SELECT id, reset_code, reset_expires FROM users WHERE email = ?',
      [cleanEmail]
    );
    if (!user || !user.reset_code) {
      return res.status(400).json({ error: 'کد بازیابی معتبر نیست. دوباره درخواست بده.' });
    }
    if (String(user.reset_code) !== String(code).trim()) {
      return res.status(400).json({ error: 'کد بازیابی اشتباه است.' });
    }
    if (new Date(user.reset_expires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'کد بازیابی منقضی شده است. دوباره درخواست بده.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(new_password), salt);
    await dbAsync.run(
      'UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?',
      [passwordHash, user.id]
    );
    return res.json({ message: 'رمز عبور با موفقیت عوض شد. حالا وارد شو.' });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
