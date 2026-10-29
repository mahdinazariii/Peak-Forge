const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const workoutRoutes = require('./routes/workouts');
const dietRoutes = require('./routes/diet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files directly from parent directory
app.use(express.static(path.resolve(__dirname, '../../')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/diet', dietRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start Server after DB init
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Peak-Forge Server running on http://localhost:${PORT}`);
      console.log(`Frontend accessible at: http://localhost:${PORT}/auth.html`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
  });
