const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'peak_forge_super_secret_jwt_key_2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier || 'free'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'دسترسی غیرمجاز. لطفاً ابتدا وارد حساب شوید.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده است.' });
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authMiddleware
};
