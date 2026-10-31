// coach_pre_athletes.js — premium coach athletes panel, connected to /api/coach
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("coach");

// ATHLETES comes from coach_pre_common.js (const) — refilled in place from API
let filter = "همه";
const dismissed = new Set();
const reminded = new Set();
// replaced with server-persisted values in loadSettings()
let settings = { idleDays: 3, autoRemind: false, weight: false, pr: false, priority: false };

async function loadSettings() {
  const res = await apiFetch("/coach/settings");
  if (res && res.ok) {
    const s = res.data.settings;
    settings = {
      idleDays: s.idle_days,
      autoRemind: s.auto_remind,
      weight: s.alert_weight,
      pr: s.alert_pr,
      priority: s.priority_inbox,
    };
  }
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function loadAthletes() {
  const res = await apiFetch("/coach/athletes");
  if (res && res.ok) {
    ATHLETES.length = 0;
    ATHLETES.push(...(res.data.athletes || []));
  }
  renderStats();
  renderAlerts();
  renderFilters();
  renderList();
}

// ── Stats ────────────────────────────────────────────────────────────────────

function renderStats() {
  const a = ATHLETES;
  $("sTotal").textContent = fa(a.length);
  $("sActive").textContent = fa(a.filter((x) => x.idle === 0).length);
  $("sAttn").textContent = fa(
    a.filter((x) => x.idle >= settings.idleDays).length,
  );
  $("sAvg").textContent =
    fa(a.length ? a.reduce((s, x) => s + x.adherence, 0) / a.length : 0) + "٪";
}

// ── Alerts ───────────────────────────────────────────────────────────────────

function buildAlerts() {
  const list = [];
  ATHLETES.forEach((x) => {
    if (x.idle >= settings.idleDays)
      list.push({
        key: x.id + "i",
        x,
        title: "بدون ثبت تمرین",
        text: `${fa(x.idle)} روز است فعالیتی ثبت نکرده`,
        remind: true,
      });
    if (settings.weight && x.weight_delta != null && Math.abs(x.weight_delta) >= 2)
      list.push({
        key: x.id + "w",
        x,
        title: "تغییر مهم وزن",
        text: `${x.weight_delta > 0 ? "+" : "−"}${fa(Math.abs(x.weight_delta), 1)} کیلوگرم در ماه اخیر`,
        info: true,
      });
    if (settings.pr && x.new_record && x.record)
      list.push({
        key: x.id + "p",
        x,
        title: "رکورد جدید",
        text: x.record,
        info: true,
      });
  });
  return list.filter((a) => !dismissed.has(a.key));
}

function renderAlerts() {
  const box = $("alerts");
  box.innerHTML = "";
  const list = buildAlerts();
  $("alertN").textContent = fa(list.length);
  if (!list.length)
    box.appendChild(el("p", "empty", "هشدار جدیدی وجود ندارد."));
  list.forEach((a) => {
    const row = el("div", "alert" + (a.info ? " info" : ""));
    const txt = el("div", "alert-text");
    txt.append(
      el("strong", null, `${a.x.name} · ${a.title}`),
      el("span", null, a.text),
    );
    row.appendChild(txt);
    if (a.remind) {
      const auto = settings.autoRemind;
      const b = el(
        "button",
        "btn",
        auto || reminded.has(a.key) ? "ارسال شد" : "یادآوری",
      );
      b.type = "button";
      b.disabled = auto || reminded.has(a.key);
      b.title = auto ? "یادآوری خودکار فعال است" : "";
      b.addEventListener("click", async () => {
        b.disabled = true;
        // a reminder is a real direct message to the athlete
        const res = await apiFetch("/chat/messages", {
          method: "POST",
          body: JSON.stringify({
            receiver_id: a.x.id,
            text: "یادآوری: لطفاً تمرین‌ها و وعده‌های غذایی امروزت را ثبت کن 💪",
          }),
        });
        if (res && res.ok) {
          reminded.add(a.key);
          toast(`یادآوری برای ${a.x.name} ارسال شد`);
          renderAlerts();
        } else {
          b.disabled = false;
          toast((res && res.data && res.data.error) || "خطا در ارسال یادآوری");
        }
      });
      row.appendChild(b);
    }
    const x = el("button", "icon-btn", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "بستن هشدار");
    x.addEventListener("click", () => {
      dismissed.add(a.key);
      renderAlerts();
    });
    row.appendChild(x);
    box.appendChild(row);
  });
}

// ── Filters (unlocked on Premium) ────────────────────────────────────────────

function renderFilters() {
  const box = $("filters");
  box.innerHTML = "";
  ["همه", ...CATS].forEach((c) => {
    const b = el("button", "chip" + (c === filter ? " on" : ""), c);
    b.type = "button";
    b.addEventListener("click", () => {
      filter = c;
      renderFilters();
      renderList();
    });
    box.appendChild(b);
  });
}

// ── Weight trend mini chart (SVG) ────────────────────────────────────────────

function weightChart(series) {
  const pts = series.filter((s) => s.weight != null);
  if (pts.length < 2) return null;
  const W = 280, H = 90, px = 8, py = 10;
  const vals = pts.map((p) => p.weight);
  const min = Math.min(...vals) - 0.5;
  const max = Math.max(...vals) + 0.5;
  const span = Math.max(max - min, 0.1);
  const coords = vals.map(
    (v, i) =>
      [
        px + (i / (vals.length - 1)) * (W - 2 * px),
        py + (1 - (v - min) / span) * (H - 2 * py),
      ].join(","),
  );
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="روند وزن">
    <polyline points="${coords.join(" ")}" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linejoin="round"/>
    ${coords.map((c) => `<circle cx="${c.split(",")[0]}" cy="${c.split(",")[1]}" r="2.5" fill="#f97316"/>`).join("")}
  </svg>`;
}

// ── Athlete rows with lazy-loaded detail ─────────────────────────────────────

function renderList() {
  const box = $("athletes");
  box.innerHTML = "";
  const list = ATHLETES.filter(
    (x) => filter === "همه" || x.category === filter,
  ).sort((a, b) => b.adherence - a.adherence);
  if (!list.length)
    box.appendChild(el("p", "empty", "ورزشکاری در این دسته نیست."));
  list.forEach((x) => {
    const d = el("details", "ath");
    const s = el("summary");
    const top = el("div", "ath-top");
    top.append(
      el("span", "dot" + (x.idle >= settings.idleDays ? " idle" : "")),
      el("strong", null, x.name),
      el("span", "cat", x.category || "بدون دسته"),
    );
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = x.adherence + "%";
    bar.appendChild(fill);
    s.append(top, el("span", "pct", fa(x.adherence) + "٪"), bar);
    d.appendChild(s);

    const body = el("div", "ath-body");
    const cell = (label, val) => {
      const c = el("div");
      c.append(el("small", null, label), el("strong", null, val));
      return c;
    };
    body.append(
      cell("جلسات این ماه", fa(x.sessions_month)),
      cell("آخرین فعالیت", x.idle === 0 ? "امروز" : `${fa(x.idle)} روز پیش`),
      cell(
        "تغییر وزن (ماه)",
        x.weight_delta == null
          ? "—"
          : `${x.weight_delta > 0 ? "+" : x.weight_delta < 0 ? "−" : ""}${fa(Math.abs(x.weight_delta), 1)} کیلوگرم`,
      ),
      cell("بهترین رکورد", x.record || "—"),
    );

    // category editor
    const catWrap = el("div", "cat-edit");
    catWrap.style.gridColumn = "1 / -1";
    const catSel = el("select");
    ["", ...CATS].forEach((c) => {
      const o = el("option", null, c === "" ? "بدون دسته" : c);
      o.value = c;
      if (x.category === c) o.selected = true;
      catSel.appendChild(o);
    });
    catSel.addEventListener("change", async () => {
      const res = await apiFetch(`/coach/athletes/${x.id}/category`, {
        method: "PATCH",
        body: JSON.stringify({ category: catSel.value }),
      });
      if (res && res.ok) {
        x.category = catSel.value;
        toast("دسته‌بندی ذخیره شد");
        renderList();
      } else {
        toast((res && res.data && res.data.error) || "خطا در ذخیره دسته");
      }
    });
    catWrap.append(el("small", "muted", "دسته‌بندی شاگرد"), catSel);
    body.appendChild(catWrap);

    // lazy detail (weight trend + assigned plans) when the row opens
    const detailBox = el("div", "ath-detail");
    detailBox.style.gridColumn = "1 / -1";
    detailBox.hidden = true;
    d.addEventListener("toggle", async () => {
      if (!d.open || detailBox.loaded) return;
      detailBox.loaded = true;
      detailBox.hidden = false;
      detailBox.appendChild(el("p", "muted", "در حال بارگذاری عملکرد…"));
      const res = await apiFetch(`/coach/athletes/${x.id}/detail`);
      detailBox.innerHTML = "";
      if (!res || !res.ok) {
        detailBox.appendChild(el("p", "muted", "خطا در دریافت عملکرد ورزشکار."));
        return;
      }
      const det = res.data;
      const chart = weightChart(det.weight_series || []);
      if (chart) {
        const w = el("div", "ath-detail-chart");
        w.append(el("small", "muted", "روند وزن (۳۰ روز اخیر)"));
        w.insertAdjacentHTML("beforeend", chart);
        detailBox.appendChild(w);
      } else {
        detailBox.appendChild(el("p", "muted", "برای نمودار وزن، ورزشکار باید چند روز وزن خود را ثبت کند."));
      }
      const plans = [...det.programs, ...det.diets]
        .map((p) => `${p.name} (${fa(p.weeks)} هفته)`)
        .join(" · ");
      detailBox.appendChild(
        el("p", "muted", plans ? `برنامه‌های ارسال‌شده: ${plans}` : "برنامه‌ای برای این ورزشکار ارسال نشده."),
      );
      if (det.records && det.records.length) {
        const ul = el("ul", "detail-records");
        det.records.slice(0, 3).forEach((r) =>
          ul.appendChild(
            el("li", null, `${r.exercise_name} — ${fa(r.weight, 1)} کیلو × ${fa(r.reps)}`),
          ),
        );
        detailBox.append(el("small", "muted", "رکوردهای اخیر"), ul);
      }
    });
    body.appendChild(detailBox);

    const go = el("div", "go");
    const a1 = el("a", "btn ghost", "پیام");
    a1.href = "./coach_pre_chat.html";
    const a2 = el("a", "btn ghost", "ارسال برنامه");
    a2.href = "./coach_pre_programs.html";
    go.append(a1, a2);
    body.appendChild(go);
    d.appendChild(body);
    box.appendChild(d);
  });
}

// ── Add athlete by email (+ optional category) ───────────────────────────────

$("newCat").append(...CATS.map((c) => el("option", null, c)));
$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("newEmail").value.trim();
  if (!email) return;

  const res = await apiFetch("/coach/athletes", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res || !res.ok) {
    toast((res && res.data && res.data.error) || "خطا در افزودن ورزشکار");
    return;
  }

  const cat = $("newCat").value;
  if (cat) {
    await apiFetch(`/coach/athletes/${res.data.athlete.id}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category: cat }),
    });
  }
  $("newEmail").value = "";
  toast(res.data.message || "ورزشکار اضافه شد");
  await loadAthletes();
});

// refresh data periodically
setInterval(() => loadAthletes().catch(() => {}), 15000);
(async () => {
  await loadSettings();
  await loadAthletes();
})();
