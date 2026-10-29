// ath_pre_diet.js — premium athlete diet page, connected to /api/diet
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("athlete");

// ── State ────────────────────────────────────────────────────────────────────
let meals = [];      // [{id, name, time, items, kcal, alt}]
let logs = {};       // { meal_id: done(bool) }
let dietPlan = null; // { id, name, weeks, assigned_at }

const DAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const todayIdx = (new Date().getDay() + 1) % 7; // 0=شنبه … 6=جمعه

const fa = (n) => Math.round(Number(n)).toLocaleString("fa-IR");

// ── Meals ────────────────────────────────────────────────────────────────────
function renderMeals() {
  const box = document.getElementById("meals");
  box.innerHTML = "";

  if (!meals.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "هنوز برنامه غذایی‌ای دریافت نکرده‌اید.";
    box.appendChild(p);
    return;
  }

  meals.forEach((m) => {
    const isDone = !!logs[m.id];
    const el = document.createElement("article");
    el.className = "meal" + (isDone ? " done" : "");
    el.innerHTML = `
      <button class="check" aria-label="ثبت انجام" aria-pressed="${isDone}"></button>
      <div class="meal-body">
        <div class="row-head"><h3></h3><span class="muted"></span></div>
        <p class="items"></p>
        <p class="alt" hidden></p>
        <div class="meal-foot">
          <span class="kcal"></span>
          <button class="alt-btn" type="button" hidden>جایگزین</button>
        </div>
      </div>`;
    el.querySelector("h3").textContent = m.name;
    el.querySelector(".muted").textContent = m.time || "";
    el.querySelector(".items").textContent = m.items || "";

    if (m.kcal != null) {
      el.querySelector(".kcal").textContent = `${fa(m.kcal)} کیلوکالری`;
    } else {
      el.querySelector(".kcal").textContent = "";
    }
    if (m.alt) {
      el.querySelector(".alt").textContent = "پیشنهاد جایگزین: " + m.alt;
      el.querySelector(".alt-btn").hidden = false;
      el.querySelector(".alt-btn").addEventListener("click", () => {
        const a = el.querySelector(".alt");
        a.hidden = !a.hidden;
      });
    }

    el.querySelector(".check").addEventListener("click", async () => {
      const newDone = !logs[m.id];
      logs[m.id] = newDone;
      await apiFetch("/diet/log", {
        method: "POST",
        body: JSON.stringify({ meal_id: m.id, done: newDone }),
      });
      renderMeals();
      update();
    });

    box.appendChild(el);
  });
}

// ── Progress ring + kcal ─────────────────────────────────────────────────────
function update() {
  const hasKcal = meals.some((m) => m.kcal != null);
  const totalKcal = meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const doneKcal = meals.reduce((s, m) => s + (logs[m.id] ? m.kcal || 0 : 0), 0);
  const doneCount = meals.filter((m) => logs[m.id]).length;

  const pct = hasKcal && totalKcal
    ? (doneKcal / totalKcal) * 100
    : meals.length
      ? (doneCount / meals.length) * 100
      : 0;

  const R = 52, C = 2 * Math.PI * R;
  const ring = document.getElementById("ringFill");
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - pct / 100);

  document.getElementById("percent").textContent = fa(pct) + "٪";
  if (hasKcal) {
    document.getElementById("calDone").textContent = fa(doneKcal);
    document.getElementById("calTotal").textContent = fa(totalKcal);
  } else {
    document.getElementById("calDone").textContent = fa(doneCount);
    document.getElementById("calTotal").textContent = fa(meals.length);
  }

  // in-app macros are not tracked per meal yet — hide those rows
  document.querySelectorAll(".macro").forEach((row) => (row.hidden = true));

  renderCourse();
  renderWeek(pct);
}

// ── Course progress (current week from assignment date) ─────────────────────
function renderCourse() {
  if (!dietPlan) return;
  const totalWeeks = dietPlan.weeks || 1;
  let current = 1;
  if (dietPlan.assigned_at) {
    const assigned = new Date(String(dietPlan.assigned_at).replace(" ", "T") + "Z");
    const daysIn = Math.max(0, Math.floor((Date.now() - assigned.getTime()) / 86400000));
    current = Math.min(totalWeeks, Math.floor(daysIn / 7) + 1);
  }
  const pct = (current / totalWeeks) * 100;

  document.getElementById("dietWeek").textContent =
    `هفته‌ی ${fa(current)} از ${fa(totalWeeks)}`;
  document.getElementById("dietBar").style.width = pct + "%";
  document.getElementById("dietPct").textContent = `${fa(pct)}٪ از رژیم طی شده`;
  document.getElementById("dietLeft").textContent =
    `${fa(totalWeeks - current)} هفته مانده`;
}

// ── Weekly adherence chart from real analytics ───────────────────────────────
function renderWeek(todayPct) {
  const box = document.getElementById("week");
  box.innerHTML = "";
  // 7 columns شنبه…جمعه; values come from /profile/analytics (diet pct per day)
  for (let i = 0; i < 7; i++) {
    const col = document.createElement("div");
    col.className = "day" + (i === todayIdx ? " today" : "");
    const val = i === todayIdx ? (todayPct || 0) : (weekDietPct[i] ?? 0);
    col.innerHTML = `<div class="col"><i></i></div><span></span>`;
    col.querySelector("i").style.height = Math.max(val, 4) + "%";
    col.querySelector("span").textContent = DAY_SHORT[i];
    col.title = val != null ? fa(val) + "٪" : "—";
    box.appendChild(col);
  }
}

let weekDietPct = {}; // { dow: pct }

// ── Bootstrap ────────────────────────────────────────────────────────────────
(async () => {
  const plansRes = await apiFetch("/diet/plans");
  const plans = plansRes && plansRes.ok ? plansRes.data.plans : [];
  if (!plans.length) {
    dietPlan = null;
    document.getElementById("dietWeek").textContent = "رژیمی دریافت نشده";
    renderMeals();
    update();
  } else {
    dietPlan = plans[0];
    const mealsRes = await apiFetch(`/diet/plans/${dietPlan.id}/meals`);
    meals = mealsRes && mealsRes.ok ? mealsRes.data.meals : [];
    const logRes = await apiFetch("/diet/log");
    if (logRes && logRes.ok) {
      logRes.data.logs.forEach((l) => {
        logs[l.meal_id] = !!l.done;
      });
    }
    renderMeals();
    update();
  }

  // fill the past 6 days of the week chart from analytics
  const an = await apiFetch("/profile/analytics");
  if (an && an.ok) {
    (an.data.week || []).forEach((d) => {
      if (d.dow !== todayIdx && d.diet && d.diet.pct != null) {
        weekDietPct[d.dow] = d.diet.pct;
      }
    });
    renderWeek(meals.length ? (meals.filter((m) => logs[m.id]).length / meals.length) * 100 : 0);
  }
})();
