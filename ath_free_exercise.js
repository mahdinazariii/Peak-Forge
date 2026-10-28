/**
 * ath_free_exercise.js — Athlete workout page (free tier)
 * Loads assigned workout program from /api/workouts/programs
 * and syncs daily exercise completion to /api/workouts/log
 */

// ── Constants ────────────────────────────────────────────────────────────────
const DAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const DAY_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

// ── State ────────────────────────────────────────────────────────────────────
let days       = [];     // [{day_index, day_name, focus, rest, list:[exercise]}]
let logs       = {};     // { exercise_id: done(bool) }
let selected   = 0;
let program    = null;   // { id, name, weeks, ... }

const todayIdx = (new Date().getDay() + 6) % 7; // 0=شنبه ... 6=جمعه

// ── Helpers ──────────────────────────────────────────────────────────────────
const fa    = (n) => Math.round(Number(n)).toLocaleString('fa-IR');
const pctOf = (day) =>
  day.list && day.list.length
    ? (day.list.filter((e) => logs[e.id]).length / day.list.length) * 100
    : 0;

// ── Render ───────────────────────────────────────────────────────────────────
function renderWeek() {
  const box = document.getElementById('week');
  box.innerHTML = '';
  days.forEach((day, i) => {
    const b   = document.createElement('button');
    b.type    = 'button';
    b.className =
      'day' +
      (i === selected  ? ' selected-day' : '') +
      (i === todayIdx  ? ' today'         : '') +
      (day.rest        ? ' is-rest'       : '');
    b.innerHTML = `<div class="col"><i></i></div><span></span>`;
    b.querySelector('i').style.height = day.rest
      ? '4%'
      : Math.max(pctOf(day), 4) + '%';
    b.querySelector('span').textContent = DAY_SHORT[i] || String(i);
    b.title = (day.day_name || DAY_NAMES[i]) + (day.rest ? ' (استراحت)' : ` — ${fa(pctOf(day))}٪`);
    b.addEventListener('click', () => { selected = i; render(); });
    box.appendChild(b);
  });
}

function makeExerciseItem(e, onToggle) {
  const label  = document.createElement('label');
  const isDone = !!logs[e.id];
  label.className = 'item' + (isDone ? ' done' : '');
  label.innerHTML = `
    <input type="checkbox" />
    <span class="box"></span>
    <div>
      <strong></strong>
      <small></small>
    </div>
    <button type="button" class="lock-mini" data-premium="ثبت جزئیات تمرین (وزن، تکرار، رکورد)">🔒 جزئیات</button>
  `;
  label.querySelector('input').checked           = isDone;
  label.querySelector('strong').textContent      = e.name;
  label.querySelector('small').textContent       = `${e.sets || ''}${e.rest ? ' · استراحت ' + e.rest : ''}`;
  label.querySelector('input').addEventListener('change', onToggle);
  return label;
}

function renderDay() {
  const day  = days[selected];
  if (!day) return;
  const done = day.list ? day.list.filter((e) => logs[e.id]).length : 0;
  const pct  = pctOf(day);

  document.getElementById('dayName').textContent  =
    (day.day_name || DAY_NAMES[selected]) + (selected === todayIdx ? ' (امروز)' : '');
  document.getElementById('dayFocus').textContent = day.focus || '';
  document.getElementById('dayCount').textContent = day.rest
    ? 'روز استراحت'
    : `${fa(done)} از ${fa(day.list.length)} حرکت`;
  document.getElementById('percent').textContent  = day.rest ? '—' : fa(pct) + '٪';

  const C    = 2 * Math.PI * 52;
  const ring = document.getElementById('ringFill');
  ring.style.strokeDasharray  = C;
  ring.style.strokeDashoffset = C * (1 - (day.rest ? 0 : pct) / 100);

  document.getElementById('lists').hidden   = !!day.rest;
  document.getElementById('restBox').hidden = !day.rest;
  if (day.rest) return;

  const todo = document.getElementById('todoList');
  const dn   = document.getElementById('doneList');
  todo.innerHTML = '';
  dn.innerHTML   = '';

  day.list.forEach((e) => {
    const isDone = !!logs[e.id];
    (isDone ? dn : todo).appendChild(
      makeExerciseItem(e, async () => {
        const newDone = !logs[e.id];
        logs[e.id]   = newDone;

        // Persist to backend
        await apiFetch('/workouts/log', {
          method: 'POST',
          body:   JSON.stringify({ exercise_id: e.id, done: newDone }),
        });

        render();
      })
    );
  });

  if (!todo.children.length)
    todo.innerHTML = `<p class="empty">همه‌ی حرکت‌ها انجام شد. دمت گرم! 💪</p>`;
  if (!dn.children.length)
    dn.innerHTML   = `<p class="empty">هنوز حرکتی انجام نشده. با اولین حرکت شروع کنید.</p>`;

  document.getElementById('todoN').textContent = fa(day.list.length - done);
  document.getElementById('doneN').textContent = fa(done);
}

function renderProgram() {
  if (!program) return;
  const sessionDays = days.filter((x) => !x.rest);
  const perWeek     = sessionDays.length || 1;
  const totalWeeks  = program.weeks || 1;
  const total       = totalWeeks * perWeek;

  const thisWeekDone = sessionDays.reduce((s, x) => s + pctOf(x) / 100, 0);
  const pct          = (thisWeekDone / total) * 100;

  document.getElementById('programWeek').textContent  = `برنامه: ${program.name}`;
  document.getElementById('programBar').style.width   = Math.min(pct, 100) + '%';
  document.getElementById('programText').textContent  = `${fa(pct)}٪ از دوره طی شده`;
  document.getElementById('programLeft').textContent  = `${fa(totalWeeks)} هفته مجموع`;
}

function render() {
  renderWeek();
  renderDay();
  renderProgram();
}

// ── Build days structure from flat exercises list ────────────────────────────
function buildDays(exercises) {
  // Group by day_index (0-6)
  const map = {};
  exercises.forEach((e) => {
    const idx = e.day_index ?? 0;
    if (!map[idx]) {
      map[idx] = {
        day_index: idx,
        day_name:  e.day_name  || DAY_NAMES[idx] || `روز ${idx + 1}`,
        focus:     e.focus     || '',
        rest:      false,
        list:      [],
      };
    }
    map[idx].list.push(e);
  });

  // Fill all 7 days; mark missing ones as rest
  const result = [];
  for (let i = 0; i < 7; i++) {
    if (map[i]) {
      result.push(map[i]);
    } else {
      result.push({
        day_index: i,
        day_name:  DAY_NAMES[i],
        focus:     'استراحت',
        rest:      true,
        list:      [],
      });
    }
  }
  return result;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  if (!requireAuth()) return;

  // 1. Load assigned programs
  const progResult = await apiFetch('/workouts/programs');
  if (!progResult || !progResult.ok || !progResult.data.programs.length) {
    // No program assigned — show placeholder
    days    = Array.from({ length: 7 }, (_, i) => ({
      day_index: i, day_name: DAY_NAMES[i], focus: '—', rest: true, list: [],
    }));
    program = { name: 'هنوز برنامه‌ای دریافت نکرده‌اید', weeks: 1 };
    selected = todayIdx;
    render();
    return;
  }

  // Take the most recent (first) assigned program
  program = progResult.data.programs[0];

  // 2. Load exercises for that program
  const exResult = await apiFetch(`/workouts/programs/${program.id}/exercises`);
  const exercises = exResult?.data?.exercises || [];
  days            = buildDays(exercises);
  selected        = todayIdx;

  // 3. Load today's logs
  const logResult = await apiFetch('/workouts/log');
  if (logResult && logResult.ok) {
    logResult.data.logs.forEach((l) => {
      logs[l.exercise_id] = !!l.done;
    });
  }

  render();
}

init();
