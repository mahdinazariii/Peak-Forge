# Peak-Forge — Sports Coaching Platform

A full-stack platform that connects athletes and coaches: training and nutrition
programs, daily adherence tracking, direct & group chat, progress analytics,
personal records, and a gamification system — with a Free/Premium tier model.

Built as a Software Engineering course project.

## Tech Stack

| Layer     | Technology                                                    |
|-----------|---------------------------------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript (no framework), SVG charts    |
| Backend   | Node.js + Express (REST API)                                  |
| Database  | SQLite (file: `peak_forge.db`)                                |
| Auth      | JWT (7-day tokens) + bcrypt password hashing                  |

## Getting Started

```bash
cd backend
npm install
npm start          # serves the API and the frontend on http://localhost:3000
```

Open <http://localhost:3000/auth.html> — the Express server serves the
frontend files from the project root, so there is no separate frontend build.

Demo accounts (password: `123456`):

| Email               | Role    | Tier    |
|---------------------|---------|---------|
| `smoke.coach@pf.ir` | Coach   | Premium |
| `smoke.ath@pf.ir`   | Athlete | Premium |
| `negar.smoke@pf.ir` | Athlete | Free    |

Premium can also be unlocked in-app: any premium-locked (🔒) button opens a
dialog whose "خرید اشتراک" action flips the account tier (simulated payment).

## Architecture

```
Peak-Forge/
├── api.js                  # shared frontend helper (JWT fetch wrapper, auth guards, logout)
├── ath_*.html/js/css       # athlete pages  (free = *_free_*, premium = *_pre_*)
├── coach_*.html/js/css     # coach pages    (same convention)
├── *_common.js             # per-role shared helpers + premium-lock dialogs
└── backend/
    └── src/
        ├── server.js       # Express bootstrap, mounts /api/* and serves ../ statically
        ├── db.js           # SQLite connection (PRAGMA foreign_keys=ON), schema init
        ├── game.js         # XP awarding helpers
        ├── middleware/
        │   └── auth.js     # JWT sign/verify middleware
        └── routes/
            ├── auth.js     # signup / login
            ├── profile.js  # profile CRUD, weight/body-fat logs, personal records,
            │               # analytics (7-day adherence, measurement series, streak),
            │               # gamification state (GET /game), tier upgrade
            ├── workouts.js # programs, exercises (CRUD + copy), assignments, exercise
            │               # logs, per-set details, coach athlete list
            ├── diet.js     # diet plans, meals (with kcal/alt), assignments, meal logs
            ├── chat.js     # conversations, direct messages, group forums, unread,
            │               # priority messages with answered-flow
            └── coach.js    # athlete dashboard (adherence, weight delta, records),
                            # add-by-email with free-tier cap, category tagging
```

### Database schema (main tables)

`users` · `athlete_profiles` · `coach_profiles` · `coach_athletes` (link table,
auto-populated when a program/diet is assigned) · `programs` → `exercises` ·
`diet_plans` → `meals` · `program_assignments` / `diet_assignments` ·
`exercise_logs` / `meal_logs` (daily ticks, XP-award flags) · `exercise_sets`
(per-set weight/reps) · `weight_logs` (weight + body fat) · `personal_records` ·
`messages` (DMs + forum posts, priority/read/answered) · `forums` ·
`athlete_game` (XP).

### How adherence is measured

- **Exercise:** ticks in the last 7 days ÷ total exercises of the assigned
  programs (each planned exercise is expected once per week).
- **Diet:** ticks in the last 7 days ÷ (meals per day × 7) — meals are daily.
- Overall = average of the available metrics; per-day values power the weekly chart.

### Gamification

XP is awarded server-side: +10 first exercise tick of the day, +5 first meal
tick, +10 weight log, +50 personal record. A per-row `xp_awarded` flag makes
untick/retick farming impossible. Level = `⌊xp / 500⌋ + 1`, coins = `⌊xp / 50⌋`,
rank = position among all athletes. Milestone badges (7/30-day streak, first
record, 100 ticks) are computed on demand.

## Feature Map

### Free tier
- Auth (signup/login), athlete & coach profiles
- Programs: create workout programs + exercises, diet plans + meals, assign to athletes
- Daily tick lists for exercises & meals, per-set training details
- Direct chat + group forums with the linked coach/athletes
- Coach dashboard: linked athletes, adherence bars, inactivity alerts, add-by-email

### Premium (athlete)
- Weight & body-fat trend charts, personal records, printable progress report
- Calorie & food-alternative display per meal, weekly adherence chart
- Priority messages to the coach, XP/level/coins/rank/badges panel

### Premium (coach)
- Unlimited athletes, category tags + filters, per-athlete detail (trend chart,
  records, assigned plans), priority inbox, bulk send, program/diet copy & rename

## Testing

Two end-to-end API test scripts run against a live server on port 3000:

```bash
cd backend
node test-chat.js    # 23 assertions: chat, forums, priority flow, access control
node test-coach.js   # 24 assertions: linking, adherence math, caps, detail endpoint
```

## Known Limitations / Next Steps

- Payment is simulated (no gateway); the coach storefront is a local demo.
- Weekly coach calendar and notification settings persist in `localStorage`.
- Notifications/reminders are not yet automated server-side.

## Project Status

**Status:** Functional — all planned core and premium features implemented and
covered by API tests and browser smoke tests.
