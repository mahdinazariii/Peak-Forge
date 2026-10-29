// coach_free_athletes.js — coach athletes management, connected to /api/coach
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("coach");

// ATHLETES and ATHLETE_LIMIT come from coach_free_common.js (const) — we
// refill ATHLETES in place from the API instead of redeclaring it.
let filter = "همه";
const dismissed = new Set();
const settings = getSettings();

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

// ── Stats row ────────────────────────────────────────────────────────────────

function renderStats() {
  const a = ATHLETES;
  $("limitNote").textContent =
    `ظرفیت اشتراک رایگان: ${fa(a.length)} از ${fa(ATHLETE_LIMIT)} ورزشکار`;
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
      const b = el("button", "btn ghost lock-mini", "🔒 یادآوری");
      b.type = "button";
      b.dataset.premium = "ارسال یادآوری به ورزشکار";
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

// ── Filters ──────────────────────────────────────────────────────────────────

function renderFilters() {
  const box = $("filters");
  box.innerHTML = "";
  ["همه", ...CATS].forEach((c) => {
    const b = el("button", "chip" + (c === filter ? " on" : ""), c);
    b.type = "button";
    if (c === "همه")
      b.addEventListener("click", () => {
        filter = c;
        renderFilters();
        renderList();
      });
    else {
      // category chips unlock on the Premium tier
      b.dataset.premium = "دسته‌بندی ورزشکاران";
      b.textContent = "🔒 " + c;
    }
    box.appendChild(b);
  });
}

// ── Athlete rows ─────────────────────────────────────────────────────────────

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
    body.appendChild(cell("جلسات ثبت‌شده", fa(x.sessions)));
    body.appendChild(
      cell(
        "تغییر وزن (ماه اخیر)",
        x.weight_delta == null
          ? "—"
          : (x.weight_delta > 0 ? "+" : "−") + fa(Math.abs(x.weight_delta), 1) + " کیلو",
      ),
    );
    body.appendChild(cell("آخرین رکورد", x.record || "—"));
    body.appendChild(cell("دسته", x.category || "—"));

    const lk = el("button", "lock-card");
    lk.type = "button";
    lk.dataset.premium = "مشاهده‌ی عملکرد کامل هر ورزشکار";
    lk.style.gridColumn = "1 / -1";
    lk.innerHTML = `<span class="lock-ico">🔒</span><span><strong>عملکرد کامل ورزشکار</strong><small>نمودار وزن و چربی، تاریخچه‌ی رکوردها</small></span><span class="pro">Premium</span>`;
    body.appendChild(lk);
    const go = el("div", "go");
    const a1 = el("a", "btn ghost", "پیام");
    a1.href = "./coach_free_chat.html";
    const a2 = el("a", "btn ghost", "ارسال برنامه");
    a2.href = "./coach_free_programs.html";
    go.append(a1, a2);
    body.appendChild(go);
    d.appendChild(body);
    box.appendChild(d);
  });
}

// ── Add athlete by email ─────────────────────────────────────────────────────

$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("newEmail").value.trim();
  if (!email) return;

  const res = await apiFetch("/coach/athletes", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  if (res && res.ok) {
    $("newEmail").value = "";
    toast(res.data.message || "ورزشکار اضافه شد");
    await loadAthletes();
  } else if (res && res.data && res.data.premium) {
    premiumNote("مدیریت تعداد بیشتر ورزشکار");
  } else {
    toast((res && res.data && res.data.error) || "خطا در افزودن ورزشکار");
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

loadAthletes();
