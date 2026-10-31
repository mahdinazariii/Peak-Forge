// game.js — XP helper for the gamification system
const { dbAsync } = require('./db');

const XP_PER_LEVEL = 500;
const XP = { TICK_EXERCISE: 10, TICK_MEAL: 5, NEW_RECORD: 50, WEIGHT_LOG: 10 };

// Increment XP for an athlete (row is created on first award)
async function addXp(athleteId, delta) {
  await dbAsync.run(
    `INSERT INTO athlete_game (user_id, xp) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET xp = xp + excluded.xp`,
    [athleteId, delta]
  );
}

module.exports = { addXp, XP_PER_LEVEL, XP };
