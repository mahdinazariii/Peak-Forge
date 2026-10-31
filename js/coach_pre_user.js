// coach_pre_user.js — premium coach profile, connected to /api/profile
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("coach");

let coachUser = {};
let coachProfile = {};
// storefront has no backend tables yet — kept as local demo data
const store = {
  name: "فروشگاه مربی",
  products: [
    { name: "پروتئین وی ۲ پوند", price: 1450000 },
    { name: "کش تمرینی مقاومتی", price: 320000 },
    { name: "پکیج مشاوره‌ی ماهانه", price: 900000 },
  ],
};
const medals = [
  { t: "مربی برتر استان", s: "فدراسیون بدنسازی · ۱۴۰۳" },
  { t: "مدرک مربیگری درجه‌ی یک", s: "فدراسیون بدنسازی · ۱۳۹۹" },
  { t: "مربی تیم قهرمان لیگ شهری", s: "۱۴۰۲" },
];

function renderProfile() {
  $("fullName").textContent = `${coachUser.first_name || ""} ${coachUser.last_name || ""}`.trim() || "—";
  $("avatar").textContent = (coachUser.first_name || "؟")[0];
  $("place").textContent = `${coachUser.city || "—"}، ${coachUser.country || "—"}`;
  $("history").textContent = coachProfile.certifications || "—";
  $("sAth").textContent = fa(coachStats.athlete_count ?? ATHLETES.length);
  $("sYears").textContent = fa(coachProfile.experience_years || 0);
  $("sProd").textContent = fa(store.products.length);
}

let coachStats = {};

function renderMedals() {
  $("medals").innerHTML = "";
  medals.forEach((m) => {
    const li = el("li");
    li.append(el("strong", null, m.t), el("small", null, m.s));
    $("medals").appendChild(li);
  });
}

// ── Edit form ────────────────────────────────────────────────────────────────

const form = $("profileForm");
const editBtn = $("editBtn");
let editing = false;

const fillForm = () => {
  const map = {
    first: coachUser.first_name,
    last: coachUser.last_name,
    height: coachProfile.experience_years, // form field reused for experience years
    weight: coachUser.weight,
    city: coachUser.city,
    country: coachUser.country,
    history: coachProfile.certifications,
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
      experience_years: parseFloat(form.elements["height"].value) || undefined,
      certifications: form.elements["history"].value.trim() || undefined,
    };
    const res = await apiFetch("/profile", { method: "PATCH", body: JSON.stringify(body) });
    if (res && res.ok) {
      Object.keys(body).forEach((k) => {
        if (body[k] == null) return;
        if (k in coachProfile) coachProfile[k] = body[k];
        else coachUser[k] = body[k];
      });
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

// ── Store (local demo) ───────────────────────────────────────────────────────

function renderStore() {
  $("storeName").textContent = store.name;
  const box = $("products");
  box.innerHTML = "";
  if (!store.products.length)
    box.appendChild(el("p", "empty", "هنوز محصولی ثبت نشده."));
  store.products.forEach((p) => {
    const row = el("div", "product");
    row.append(
      el("strong", null, p.name),
      el("span", "price", fa(p.price) + " تومان"),
    );
    const x = el("button", "icon-btn", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "حذف محصول");
    x.addEventListener("click", () => {
      store.products.splice(store.products.indexOf(p), 1);
      renderStore();
      renderProfile();
    });
    row.appendChild(x);
    box.appendChild(row);
  });
}
$("prodForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("pName").value.trim();
  const price = +$("pPrice").value;
  if (!name || price < 0) return;
  store.products.push({ name, price });
  $("pName").value = "";
  $("pPrice").value = "";
  renderStore();
  renderProfile();
  toast("محصول ثبت شد");
});

// ── Notification settings (persisted on the server) ──────────────────────────

let coachSettings = {
  idle_days: 3,
  auto_remind: false,
  alert_weight: false,
  alert_pr: false,
  priority_inbox: false,
};

function fillSettingsForm() {
  const choices = [...new Set([2, 3, 5, 7, coachSettings.idle_days])].sort((a, b) => a - b);
  $("idleDays").innerHTML = "";
  choices.forEach((d) => {
    const o = el("option", null, `${fa(d)} روز`);
    o.value = d;
    $("idleDays").appendChild(o);
  });
  $("idleDays").value = coachSettings.idle_days;
  $("autoRemind").checked = coachSettings.auto_remind;
  $("weight").checked = coachSettings.alert_weight;
  $("pr").checked = coachSettings.alert_pr;
  $("priority").checked = coachSettings.priority_inbox;
}

async function saveSettingsPatch(patch) {
  const res = await apiFetch("/coach/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (res && res.ok) toast("تنظیمات ذخیره شد");
  else toast((res && res.data && res.data.error) || "خطا در ذخیره تنظیمات");
}

$("idleDays").addEventListener("change", () => {
  coachSettings.idle_days = +$("idleDays").value;
  saveSettingsPatch({ idle_days: coachSettings.idle_days });
});
[
  ["autoRemind", "auto_remind"],
  ["weight", "alert_weight"],
  ["pr", "alert_pr"],
  ["priority", "priority_inbox"],
].forEach(([elmId, key]) => {
  $(elmId).addEventListener("change", () => {
    coachSettings[key] = $(elmId).checked;
    saveSettingsPatch({ [key]: coachSettings[key] });
  });
});

// ── Honors (persisted on the server) ─────────────────────────────────────────

function renderHonors(honors) {
  $("medals").innerHTML = "";
  if (!honors.length) {
    $("medals").appendChild(el("li", null, "هنوز افتخاری ثبت نشده است."));
    return;
  }
  honors.forEach((h) => {
    const li = el("li");
    li.append(el("strong", null, h.title), el("small", null, h.detail || ""));
    const x = el("button", "icon-btn", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "حذف افتخار");
    x.addEventListener("click", async () => {
      const res = await apiFetch(`/coach/honors/${h.id}`, { method: "DELETE" });
      if (res && res.ok) loadHonors();
      else toast((res && res.data && res.data.error) || "خطا در حذف");
    });
    li.appendChild(x);
    $("medals").appendChild(li);
  });
}

async function loadHonors() {
  const res = await apiFetch("/coach/honors");
  if (res && res.ok) renderHonors(res.data.honors || []);
}

$("honorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("hTitle").value.trim();
  if (!title) return;
  const res = await apiFetch("/coach/honors", {
    method: "POST",
    body: JSON.stringify({ title, detail: $("hDetail").value.trim() }),
  });
  if (res && res.ok) {
    $("hTitle").value = "";
    $("hDetail").value = "";
    toast("افتخار ثبت شد");
    loadHonors();
  } else {
    toast((res && res.data && res.data.error) || "خطا در ثبت افتخار");
  }
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  const res = await apiFetch("/profile");
  if (res && res.ok) {
    coachUser = res.data.user;
    coachProfile = res.data.profile || {};
  }
  const stats = await apiFetch("/profile/stats/coach");
  if (stats && stats.ok) coachStats = stats.data;

  const st = await apiFetch("/coach/settings");
  if (st && st.ok) coachSettings = { ...coachSettings, ...st.data.settings };

  renderProfile();
  renderMedals();
  fillForm();
  fillSettingsForm();
  renderStore();
  loadHonors();
})();
