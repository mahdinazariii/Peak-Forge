// ath_pre_exercise.js — premium athlete workout page, connected to /api/workouts
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("athlete");

// ── Constants ────────────────────────────────────────────────────────────────
const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const DAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

// ── State ────────────────────────────────────────────────────────────────────
let days = [];    // [{day_index, day_name, focus, rest, list:[exercise]}]
let logs = {};    // { exercise_id: done(bool) }
let selected = 0;
let program = null;

const todayIdx = (new Date().getDay() + 1) % 7; // 0=شنبه … 6=جمعه

// ── Helpers ──────────────────────────────────────────────────────────────────
const fa = (n) => Math.round(Number(n)).toLocaleString("fa-IR");
const pctOf = (day) =>
  day.list && day.list.length
    ? (day.list.filter((e) => logs[e.id]).length / day.list.length) * 100
    : 0;

// ── Render ───────────────────────────────────────────────────────────────────
function renderWeek() {
  const box = document.getElementById("week");
  box.innerHTML = "";
  days.forEach((day, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "day" +
      (i === selected ? " selected-day" : "") +
      (i === todayIdx ? " today" : "") +
      (day.rest ? " is-rest" : "");
    b.innerHTML = `<div class="col"><i></i></div><span></span>`;
    b.querySelector("i").style.height = day.rest
      ? "4%"
      : Math.max(pctOf(day), 4) + "%";
    b.querySelector("span").textContent = DAY_SHORT[i] || String(i);
    b.title =
      (day.day_name || DAY_NAMES[i]) +
      (day.rest ? " (استراحت)" : " — " + fa(pctOf(day)) + "٪");
    b.addEventListener("click", () => {
      selected = i;
      render();
    });
    box.appendChild(b);
  });
}

function item(e, onToggle) {
  const el = document.createElement("label");
  el.className = "item" + (logs[e.id] ? " done" : "");
  el.innerHTML = `<input type="checkbox" /><span class="box"></span><div><strong></strong><small></small></div><button type="button" class="btn-ghost sets-btn">جزئیات ست‌ها</button>`;
  el.querySelector("input").checked = !!logs[e.id];
  el.querySelector("strong").textContent = e.name;
  el.querySelector("small").textContent =
    `${e.sets || ""}${e.rest ? " · استراحت " + e.rest : ""}`;
  el.querySelector("input").addEventListener("change", onToggle);
  el.querySelector(".sets-btn").addEventListener("click", (ev) => {
    ev.preventDefault();
    openSetsDialog(e);
  });
  return el;
}

// ── Per-set details dialog ───────────────────────────────────────────────────
let setsExercise = null;
const $id = (id) => document.getElementById(id);

function setRow(weight = "", reps = "") {
  const row = document.createElement("div");
  row.className = "set-row";
  row.innerHTML = `
    <span class="set-idx"></span>
    <label>وزن (کیلوگرم)<input class="set-weight" type="number" min="0" step="0.5" inputmode="decimal" /></label>
    <label>تکرار<input class="set-reps" type="number" min="0" step="1" inputmode="numeric" /></label>
    <button type="button" class="set-del" aria-label="حذف ست">✕</button>`;
  row.querySelector(".set-idx").textContent = "";
  row.querySelector(".set-weight").value = weight;
  row.querySelector(".set-reps").value = reps;
  row.querySelector(".set-del").addEventListener("click", () => {
    row.remove();
    renumberSets();
  });
  return row;
}

function renumberSets() {
  [...$id("setsList").children].forEach((r, i) => {
    r.querySelector(".set-idx").textContent = "ست " + fa(i + 1);
  });
}

async function openSetsDialog(exercise) {
  setsExercise = exercise;
  $id("setsTitle").textContent = exercise.name;
  $id("setsSub").textContent = "وزن و تکرار هر ست امروز را ثبت کن";
  const list = $id("setsList");
  list.innerHTML = "";

  const res = await apiFetch(`/workouts/sets?exercise_id=${exercise.id}`);
  const saved = res && res.ok ? res.data.sets : [];
  if (saved.length) saved.forEach((s) => list.appendChild(setRow(s.weight ?? "", s.reps ?? "")));
  else list.appendChild(setRow());

  renumberSets();
  $id("setsDlg").showModal();
}

$id("addSetBtn").addEventListener("click", () => {
  $id("setsList").appendChild(setRow());
  renumberSets();
  const rows = $id("setsList").children;
  rows[rows.length - 1].querySelector(".set-weight").focus();
});

$id("setsClose").addEventListener("click", () => $id("setsDlg").close());

$id("saveSets").addEventListener("click", async () => {
  if (!setsExercise) return;
  const sets = [...$id("setsList").children].map((r) => ({
    weight: r.querySelector(".set-weight").value,
    reps: r.querySelector(".set-reps").value,
  }));
  const res = await apiFetch("/workouts/sets", {
    method: "POST",
    body: JSON.stringify({ exercise_id: setsExercise.id, sets }),
  });
  if (!res || !res.ok) {
    alert((res && res.data && res.data.error) || "خطا در ثبت ست‌ها");
    return;
  }
  // a logged set counts as training — tick the exercise if not done yet
  if (!logs[setsExercise.id]) {
    logs[setsExercise.id] = true;
    await apiFetch("/workouts/log", {
      method: "POST",
      body: JSON.stringify({ exercise_id: setsExercise.id, done: true }),
    });
  }
  $id("setsDlg").close();
  render();
});

function renderDay() {
  const day = days[selected];
  if (!day) return;
  const done = day.list ? day.list.filter((e) => logs[e.id]).length : 0;
  const pct = pctOf(day);

  document.getElementById("dayName").textContent =
    (day.day_name || DAY_NAMES[selected]) + (selected === todayIdx ? " (امروز)" : "");
  document.getElementById("dayFocus").textContent = day.focus || "";
  document.getElementById("dayCount").textContent = day.rest
    ? "روز استراحت"
    : `${fa(done)} از ${fa(day.list.length)} حرکت`;
  document.getElementById("percent").textContent = day.rest ? "—" : fa(pct) + "٪";

  const C = 2 * Math.PI * 52;
  const ring = document.getElementById("ringFill");
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - (day.rest ? 0 : pct) / 100);

  document.getElementById("lists").hidden = !!day.rest;
  document.getElementById("restBox").hidden = !day.rest;
  if (day.rest) return;

  const todo = document.getElementById("todoList");
  const dn = document.getElementById("doneList");
  todo.innerHTML = "";
  dn.innerHTML = "";
  day.list.forEach((e) => {
    (logs[e.id] ? dn : todo).appendChild(
      item(e, async () => {
        const newDone = !logs[e.id];
        logs[e.id] = newDone;
        await apiFetch("/workouts/log", {
          method: "POST",
          body: JSON.stringify({ exercise_id: e.id, done: newDone }),
        });
        render();
      }),
    );
  });
  if (!todo.children.length)
    todo.innerHTML = `<p class="empty">همه‌ی حرکت‌ها انجام شد. دمت گرم! 💪</p>`;
  if (!dn.children.length)
    dn.innerHTML = `<p class="empty">هنوز حرکتی انجام نشده. با اولین حرکت شروع کنید.</p>`;
  document.getElementById("todoN").textContent = fa(day.list.length - done);
  document.getElementById("doneN").textContent = fa(done);
}

function renderProgram() {
  const perWeek = days.filter((x) => !x.rest).length || 1;
  const totalWeeks = program.weeks || 1;

  // current week from assignment date, capped at the program length
  let current = 1;
  if (program.assigned_at) {
    const assigned = new Date(String(program.assigned_at).replace(" ", "T") + "Z");
    const daysIn = Math.max(0, Math.floor((Date.now() - assigned.getTime()) / 86400000));
    current = Math.min(totalWeeks, Math.floor(daysIn / 7) + 1);
  }

  const total = totalWeeks * perWeek;
  const pastDone = (current - 1) * perWeek;
  const thisWeek = days
    .filter((x) => !x.rest)
    .reduce((s, x) => s + pctOf(x) / 100, 0);
  const pct = ((pastDone + thisWeek) / total) * 100;

  document.getElementById("programWeek").textContent =
    `هفته‌ی ${fa(current)} از ${fa(totalWeeks)}`;
  document.getElementById("programBar").style.width = Math.min(pct, 100) + "%";
  document.getElementById("programText").textContent =
    `${fa(pct)}٪ از دوره طی شده`;
  document.getElementById("programLeft").textContent =
    `${fa(totalWeeks - current)} هفته‌ی دیگر`;
}

function render() {
  renderWeek();
  renderDay();
  renderProgram();
}

// ── Build days structure from flat exercises list ────────────────────────────
function buildDays(exercises) {
  const map = {};
  exercises.forEach((e) => {
    const idx = e.day_index ?? 0;
    if (!map[idx]) {
      map[idx] = {
        day_index: idx,
        day_name: e.day_name || DAY_NAMES[idx] || `روز ${idx + 1}`,
        focus: e.focus || "",
        rest: false,
        list: [],
      };
    }
    map[idx].list.push(e);
  });

  const result = [];
  for (let i = 0; i < 7; i++) {
    result.push(
      map[i] || {
        day_index: i,
        day_name: DAY_NAMES[i],
        focus: "استراحت",
        rest: true,
        list: [],
      },
    );
  }
  return result;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
(async () => {
  const progResult = await apiFetch("/workouts/programs");
  if (!progResult || !progResult.ok || !progResult.data.programs.length) {
    days = Array.from({ length: 7 }, (_, i) => ({
      day_index: i, day_name: DAY_NAMES[i], focus: "—", rest: true, list: [],
    }));
    program = { name: "هنوز برنامه‌ای دریافت نکرده‌اید", weeks: 1 };
    selected = todayIdx;
    render();
    return;
  }

  program = progResult.data.programs[0];

  const exResult = await apiFetch(`/workouts/programs/${program.id}/exercises`);
  const exercises = exResult?.data?.exercises || [];
  days = buildDays(exercises);
  selected = todayIdx;

  const logResult = await apiFetch("/workouts/log");
  if (logResult && logResult.ok) {
    logResult.data.logs.forEach((l) => {
      logs[l.exercise_id] = !!l.done;
    });
  }

  render();
})();
