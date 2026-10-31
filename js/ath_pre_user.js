// ath_pre_user.js — premium athlete profile, connected to /api/profile
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("athlete");

const fa = (n, d = 0) =>
  Number(n).toLocaleString("fa-IR", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;bottom:5.5rem;left:50%;transform:translateX(-50%);" +
    "background:#f97316;color:#181818;font-weight:600;padding:.6rem 1.1rem;" +
    "border-radius:.8rem;z-index:99;box-shadow:0 4px 14px rgba(0,0,0,.4)";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

let profile = {
  first_name: "",
  last_name: "",
  height: null,
  weight: null,
  city: "",
  country: "",
};
const badges = [
  { t: "۷ روز پیاپی", on: false },
  { t: "۳۰ روز پیاپی", on: false },
  { t: "اولین رکورد", on: false },
  { t: "۱۰۰ تمرین", on: false },
];

// ── Chart (shared for weight & body-fat) ─────────────────────────────────────

function drawChart(svgId, values, unit, labelRight) {
  const svg = $(svgId);
  if (!values.length) {
    svg.innerHTML = `<text x="160" y="70" text-anchor="middle" class="c-txt">داده‌ای ثبت نشده</text>`;
    return null;
  }
  const W = 320, H = 140, px = 16, py = 20;
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const span = Math.max(max - min, 0.1);
  const pts = values.map((w, i) => [
    px + (i / Math.max(values.length - 1, 1)) * (W - 2 * px),
    py + (1 - (w - min) / span) * (H - 2 * py - 14),
  ]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${px},${H - 14} ${line} ${W - px},${H - 14}`;
  const last = pts[pts.length - 1];
  svg.innerHTML = `
    <polygon points="${area}" class="c-area"/>
    <polyline points="${line}" class="c-line"/>
    ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" class="c-dot"/>`).join("")}
    <circle cx="${last[0]}" cy="${last[1]}" r="5" class="c-last"/>
    <text x="${px}" y="${H - 1}" class="c-txt">${labelRight ? "الان" : "قدیمی‌تر"}</text>
    <text x="${W - px}" y="${H - 1}" class="c-txt" text-anchor="end">${labelRight || "الان"}</text>`;
  return values[values.length - 1] - values[0];
}

function renderSeries(weightSeries) {
  const wPts = weightSeries.filter((x) => x.weight != null).map((x) => x.weight);
  const fPts = weightSeries.filter((x) => x.body_fat != null).map((x) => x.body_fat);

  const dw = drawChart("chart", wPts, "kg", wPts.length > 1 ? null : "الان");
  $("weightDelta").textContent =
    wPts.length < 2
      ? "برای روند، وزن را چند روز ثبت کنید"
      : `${dw <= 0 ? "−" : "+"}${fa(Math.abs(dw), 1)} کیلوگرم`;

  const fatCard = $("fatCard");
  if (fPts.length) {
    fatCard.hidden = false;
    const df = drawChart("fatChart", fPts, "%", fPts.length > 1 ? null : "الان");
    $("fatDelta").textContent =
      fPts.length < 2
        ? ""
        : `${df <= 0 ? "−" : "+"}${fa(Math.abs(df), 1)}٪ چربی`;
  }
}

// ── Render sections ──────────────────────────────────────────────────────────

function renderProfile() {
  $("fullName").textContent = `${profile.first_name} ${profile.last_name}`.trim();
  $("avatar").textContent = profile.first_name[0] || "؟";
  $("place").textContent = `${profile.city || "—"}، ${profile.country || "—"}`;
  $("sHeight").textContent = profile.height ? fa(profile.height) : "—";
  $("sWeight").textContent = profile.weight ? fa(profile.weight, 1) : "—";
  $("sBmi").textContent =
    profile.height && profile.weight
      ? fa(profile.weight / Math.pow(profile.height / 100, 2), 1)
      : "—";
  $("sYears").textContent = profile.years != null ? fa(profile.years) : "—";
}

function renderGame(game) {
  $("level").textContent = fa(game.level);
  $("xpText").textContent = `${fa(game.xp_into_level)} / ${fa(game.xp_per_level)} XP`;
  $("xpBar").style.width = (game.xp_into_level / game.xp_per_level) * 100 + "%";
  $("streak").textContent = fa(game.streak);
  $("coins").textContent = fa(game.coins);
  $("rank").textContent = fa(game.rank);
  $("badges").innerHTML = "";
  (game.badges || badges).forEach((b) => {
    const chip = document.createElement("span");
    chip.className = "chip" + (b.on ? " on" : "");
    chip.textContent = (b.on ? "✓ " : "قفل · ") + b.t;
    $("badges").appendChild(chip);
  });
}

function renderMedals(game) {
  $("medals").innerHTML = "";
  const earned = (game.badges || []).filter((b) => b.on);
  if (!earned.length) {
    const li = document.createElement("li");
    li.textContent = "با تیک زدن تمرین‌ها و ثبت رکورد، اولین نشان‌هایت را بگیر!";
    $("medals").appendChild(li);
    return;
  }
  earned.forEach((b) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong></strong><small></small>`;
    li.querySelector("strong").textContent = `🥇 نشان «${b.t}»`;
    li.querySelector("small").textContent = "به دست آوردی — ادامه بده!";
    $("medals").appendChild(li);
  });
}

function renderRecords(records) {
  const box = $("records");
  box.innerHTML = "";
  if (!records.length) {
    const li = document.createElement("li");
    li.textContent = "هنوز رکوردی ثبت نشده. اولین رکوردت را ثبت کن!";
    box.appendChild(li);
    return;
  }
  records.forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong></strong><small></small>`;
    li.querySelector("strong").textContent =
      `${r.exercise_name} — ${fa(r.weight, 1)} کیلو × ${fa(r.reps)}`;
    li.querySelector("small").textContent = new Date(
      String(r.created_at).replace(" ", "T") + "Z",
    ).toLocaleDateString("fa-IR");
    box.appendChild(li);
  });
}

function renderReport(analytics) {
  const box = $("reportStats");
  box.innerHTML = "";
  const cell = (label, val) => {
    const d = document.createElement("div");
    d.append(
      Object.assign(document.createElement("strong"), { textContent: val }),
      Object.assign(document.createElement("span"), { textContent: label }),
    );
    return d;
  };
  const wPts = analytics.weight_series.filter((x) => x.weight != null);
  const lastW = wPts.length ? wPts[wPts.length - 1].weight : null;
  box.append(
    cell("جلسات ثبت‌شده", fa(analytics.totals.sessions)),
    cell("روز استمرار", fa(analytics.totals.streak)),
    cell("مجموع تیک‌ها", fa(analytics.totals.total_done)),
    cell("وزن فعلی", lastW != null ? fa(lastW, 1) + " کیلو" : "—"),
  );
}

// ── Edit form ────────────────────────────────────────────────────────────────

const form = $("profileForm");
const editBtn = $("editBtn");
let editing = false;

const fillForm = () => {
  const map = {
    first: profile.first_name,
    last: profile.last_name,
    height: profile.height,
    weight: profile.weight,
    city: profile.city,
    country: profile.country,
    history: profile.history || "",
  };
  Object.keys(map).forEach((k) => {
    if (form.elements[k]) form.elements[k].value = map[k] ?? "";
  });
};

editBtn.addEventListener("click", async () => {
  if (editing) {
    const body = {
      first_name: form.elements["first"].value.trim() || undefined,
      last_name: form.elements["last"].value.trim() || undefined,
      city: form.elements["city"].value.trim() || undefined,
      country: form.elements["country"].value.trim() || undefined,
      height: parseFloat(form.elements["height"].value) || undefined,
      weight: parseFloat(form.elements["weight"].value) || undefined,
    };
    const res = await apiFetch("/profile", { method: "PATCH", body: JSON.stringify(body) });
    if (res && res.ok) {
      Object.keys(body).forEach((k) => body[k] != null && (profile[k] = body[k]));
      renderProfile();
      toast("پروفایل ذخیره شد");
    } else {
      alert((res && res.data && res.data.error) || "خطا در ذخیره پروفایل");
    }
  }
  editing = !editing;
  form.querySelectorAll("input").forEach((i) => (i.disabled = !editing));
  form.classList.toggle("editing", editing);
  editBtn.textContent = editing ? "ذخیره" : "ویرایش";
  if (!editing) fillForm();
});

// ── Record form ──────────────────────────────────────────────────────────────

$("recordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await apiFetch("/profile/records", {
    method: "POST",
    body: JSON.stringify({
      exercise_name: $("recName").value.trim(),
      weight: parseFloat($("recWeight").value),
    }),
  });
  if (res && res.ok) {
    $("recName").value = "";
    $("recWeight").value = "";
    toast("رکورد ثبت شد 🎉");
    const rec = await apiFetch("/profile/records");
    if (rec && rec.ok) renderRecords(rec.data.records);
  } else {
    alert((res && res.data && res.data.error) || "خطا در ثبت رکورد");
  }
});

$("reportBtn").addEventListener("click", () => window.print());

// ── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  // profile
  const res = await apiFetch("/profile");
  if (res && res.ok) {
    profile = { ...profile, ...res.data.user, ...res.data.profile };
    renderProfile();
    fillForm();
  }

  // coach name
  const conv = await apiFetch("/chat/conversations");
  if (conv && conv.ok && conv.data.conversations.length) {
    $("coachName").textContent = `مربی: ${conv.data.conversations[0].name}`;
  }

  // analytics: series + totals + records
  const an = await apiFetch("/profile/analytics");
  if (an && an.ok) {
    renderSeries(an.data.weight_series || []);
    renderRecords(an.data.records || []);
    renderReport(an.data);
    // fall back to the latest measurement if profile weight is unset
    const wPts = (an.data.weight_series || []).filter((x) => x.weight != null);
    if (!profile.weight && wPts.length) {
      profile.weight = wPts[wPts.length - 1].weight;
      renderProfile();
      fillForm();
    }
  }

  // gamification from the backend
  const g = await apiFetch("/profile/game");
  if (g && g.ok) {
    renderGame(g.data);
    renderMedals(g.data);
  } else {
    renderGame({ level: 1, xp_into_level: 0, xp_per_level: 500, streak: 0, coins: 0, rank: 1, badges: [] });
    renderMedals({ badges: [] });
  }
})();
