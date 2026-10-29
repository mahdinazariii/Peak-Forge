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

// ── Notification settings (persisted locally) ────────────────────────────────

const settings = getSettings();
[2, 3, 5, 7].forEach((d) => {
  const o = el("option", null, `${fa(d)} روز`);
  o.value = d;
  $("idleDays").appendChild(o);
});
$("idleDays").value = settings.idleDays;
["autoRemind", "weight", "pr", "priority"].forEach((k) => {
  $(k).checked = settings[k];
  $(k).addEventListener("change", () => {
    settings[k] = $(k).checked;
    saveSettings(settings);
  });
});
$("idleDays").addEventListener("change", () => {
  settings.idleDays = +$("idleDays").value;
  saveSettings(settings);
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

  renderProfile();
  renderMedals();
  fillForm();
  renderStore();
})();
