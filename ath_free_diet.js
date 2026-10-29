/**
 * ath_free_diet.js — Athlete diet page (free tier)
 * Loads assigned diet plan from /api/diet/plans
 * and syncs daily meal completion to /api/diet/log
 */

// ── State ────────────────────────────────────────────────────────────────────
let meals    = [];     // [{id, name, time, items}]
let logs     = {};     // { meal_id: done(bool) }
let dietPlan = null;   // { id, name, weeks, ... }

const DAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const todayIdx  = (new Date().getDay() + 1) % 7; // 0=شنبه ... 6=جمعه

const fa = (n) => Math.round(Number(n)).toLocaleString('fa-IR');

// ── Render Meals ─────────────────────────────────────────────────────────────
function renderMeals() {
  const box = document.getElementById('meals');
  box.innerHTML = '';

  if (!meals.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'هنوز برنامه غذایی‌ای دریافت نکرده‌اید.';
    box.appendChild(p);
    return;
  }

  meals.forEach((m) => {
    const isDone = !!logs[m.id];
    const el = document.createElement('article');
    el.className = 'meal' + (isDone ? ' done' : '');
    el.innerHTML = `
      <button class="check" aria-label="ثبت انجام" aria-pressed="${isDone}"></button>
      <div class="meal-body">
        <div class="row-head"><h3></h3><span class="muted"></span></div>
        <p class="items"></p>
        <div class="meal-foot">
          <button type="button" class="lock-mini" data-premium="محاسبه‌ی کالری و درشت‌مغذی‌ها">🔒 کالری و درشت‌مغذی‌ها</button>
          <button class="alt-btn lock-mini" type="button" data-premium="پیشنهاد جایگزین غذایی">🔒 جایگزین</button>
        </div>
      </div>`;
    el.querySelector('h3').textContent      = m.name;
    el.querySelector('.muted').textContent   = m.time || '';
    el.querySelector('.items').textContent   = m.items || '';

    el.querySelector('.check').addEventListener('click', async () => {
      const newDone = !logs[m.id];
      logs[m.id] = newDone;

      // Persist to backend
      await apiFetch('/diet/log', {
        method: 'POST',
        body: JSON.stringify({ meal_id: m.id, done: newDone }),
      });

      renderMeals();
      updateProgress();
    });

    box.appendChild(el);
  });
}

// ── Progress Ring & Stats ────────────────────────────────────────────────────
function updateProgress() {
  const total = meals.length;
  const done  = meals.filter((m) => logs[m.id]).length;
  const pct   = total ? (done / total) * 100 : 0;

  const R = 52, C = 2 * Math.PI * R;
  const ring = document.getElementById('ringFill');
  ring.style.strokeDasharray  = C;
  ring.style.strokeDashoffset = C * (1 - pct / 100);

  document.getElementById('percent').textContent  = fa(pct) + '٪';
  document.getElementById('calDone').textContent   = fa(done);
  document.getElementById('calTotal').textContent  = fa(total);

  renderWeek(pct);
}

// ── Weekly Adherence Chart ───────────────────────────────────────────────────
function renderWeek(todayPct) {
  const box = document.getElementById('week');
  box.innerHTML = '';

  // Placeholder week — only today is real data
  for (let i = 0; i < 7; i++) {
    const col = document.createElement('div');
    col.className = 'day' + (i === todayIdx ? ' today' : '');
    const val = (i === todayIdx) ? (todayPct || 0) : 0;
    col.innerHTML = `<div class="col"><i></i></div><span></span>`;
    col.querySelector('i').style.height    = Math.max(val, 4) + '%';
    col.querySelector('span').textContent  = DAY_SHORT[i];
    col.title = fa(val) + '٪';
    box.appendChild(col);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  if (!requireAuth()) return;

  // 1. Load assigned diet plans
  const planResult = await apiFetch('/diet/plans');
  if (!planResult || !planResult.ok || !planResult.data.plans.length) {
    meals    = [];
    dietPlan = null;
    renderMeals();
    updateProgress();
    return;
  }

  // Take the most recent assigned plan
  dietPlan = planResult.data.plans[0];

  // 2. Load meals for that plan
  const mealsResult = await apiFetch(`/diet/plans/${dietPlan.id}/meals`);
  meals = mealsResult?.data?.meals || [];

  // 3. Load today's logs
  const logResult = await apiFetch('/diet/log');
  if (logResult && logResult.ok) {
    logResult.data.logs.forEach((l) => {
      logs[l.meal_id] = !!l.done;
    });
  }

  renderMeals();
  updateProgress();
}

init();
