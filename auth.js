const $ = (id) => document.getElementById(id);

const HOME = {
  athlete: "./ath_free_chat.html",
  coach: "./coach_free_athletes.html",
};

const normDigits = (s) =>
  s
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace("٫", ".");
const num = (v) => parseFloat(normDigits(v.trim()));
const required = (msg) => (v) => v.trim() !== "" || msg;
const range = (min, max, msg) => (v) =>
  (!isNaN(num(v)) && num(v) >= min && num(v) <= max) || msg;

const rules = {
  email: (v) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "ایمیل معتبر وارد کنید.",
  password: (v) =>
    (v.length >= 8 && /\p{L}/u.test(v) && /\d/.test(v)) ||
    "رمز باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد.",
  confirm: (v, f) =>
    v === f.elements.password.value || "تکرار رمز با رمز عبور یکسان نیست.",
  first: required("نام را وارد کنید."),
  last: required("نام خانوادگی را وارد کنید."),
  height: range(100, 250, "قد را بین ۱۰۰ تا ۲۵۰ سانتی‌متر وارد کنید."),
  weight: range(30, 250, "وزن را بین ۳۰ تا ۲۵۰ کیلوگرم وارد کنید."),
  country: required("کشور را وارد کنید."),
  city: required("شهر را وارد کنید."),
  years: range(0, 60, "سال‌های سابقه را (۰ تا ۶۰) وارد کنید."),
};

function setError(input, msg) {
  const err = input.closest(".field").querySelector(".err");
  err.textContent = msg || "";
  input.setAttribute("aria-invalid", msg ? "true" : "false");
}

function validate(container, form, ruleSet) {
  let firstBad = null;
  container.querySelectorAll("input[name], textarea[name]").forEach((inp) => {
    const rule = ruleSet[inp.name];
    if (!rule || inp.type === "radio" || inp.type === "checkbox") return;
    const res = rule(inp.value, form);
    setError(inp, res === true ? "" : res);
    if (res !== true && !firstBad) firstBad = inp;
  });
  if (firstBad) firstBad.focus();
  return !firstBad;
}

function setMode(mode) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  $("loginPanel").hidden = mode !== "login";
  $("signupPanel").hidden = mode !== "signup";
}
document
  .querySelectorAll(".tab")
  .forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
document
  .querySelectorAll("[data-go]")
  .forEach((b) => b.addEventListener("click", () => setMode(b.dataset.go)));

document.querySelectorAll(".eye").forEach((b) =>
  b.addEventListener("click", () => {
    const i = b.previousElementSibling;
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    b.textContent = show ? "پنهان" : "نمایش";
    b.setAttribute("aria-label", show ? "پنهان کردن رمز" : "نمایش رمز");
  }),
);

const toast = (msg) => {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
};
$("forgot").addEventListener("click", (e) => {
  e.preventDefault();
  toast("لینک بازیابی رمز به ایمیل شما ارسال می‌شود (نیازمند بک‌اند)");
});

const loginForm = $("loginForm");
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = validate(loginForm, loginForm, {
    email: rules.email,
    password: (v) => v !== "" || "رمز عبور را وارد کنید.",
  });
  if (!ok) return;

  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;
  const submitBtn = loginForm.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "خطا در ورود به حساب.");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("role", data.user.role);

    toast("ورود موفقیت‌آمیز بود");
    setTimeout(() => {
      location.href = HOME[data.user.role] || HOME.athlete;
    }, 600);
  } catch (err) {
    console.error(err);
    toast("خطا در برقراری ارتباط با سرور");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

const form = $("signupForm");
const steps = [...form.querySelectorAll("fieldset")];
let step = 1;

function showStep(n) {
  step = n;
  steps.forEach((f) => (f.hidden = +f.dataset.step !== n));
  document
    .querySelectorAll("#steps li")
    .forEach((li, i) => li.classList.toggle("on", i < n));
  $("backBtn").hidden = n === 1;
  $("nextBtn").textContent = n === 3 ? "ساخت حساب" : "ادامه";
}

function stepValid(n) {
  const box = steps[n - 1];
  if (n === 1) {
    const ok = !!form.elements.role.value;
    $("roleErr").textContent = ok ? "" : "لطفاً یک نقش را انتخاب کنید.";
    return ok;
  }
  let ok = validate(box, form, rules);
  if (n === 3 && !form.elements.terms.checked) {
    $("termsErr").textContent = "برای ادامه باید قوانین را بپذیرید.";
    ok = false;
  } else if (n === 3) $("termsErr").textContent = "";
  return ok;
}

$("backBtn").addEventListener("click", () => showStep(step - 1));
form
  .querySelectorAll('input[name="role"]')
  .forEach((r) =>
    r.addEventListener("change", () => ($("roleErr").textContent = "")),
  );

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!stepValid(step)) return;
  if (step < 3) return showStep(step + 1);

  const f = form.elements;
  const data = {
    role: f.role.value,
    email: f.email.value.trim(),
    password: f.password.value,
    first: f.first.value.trim(),
    last: f.last.value.trim(),
    height: num(f.height.value),
    weight: num(f.weight.value),
    country: f.country.value.trim(),
    city: f.city.value.trim(),
    years: num(f.years.value),
    history: f.history.value.trim(),
    medals: f.medals.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };

  const nextBtn = $("nextBtn");
  if (nextBtn) nextBtn.disabled = true;

  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const resp = await res.json();
    if (!res.ok) {
      toast(resp.error || "خطا در ثبت‌نام.");
      return;
    }

    localStorage.setItem("token", resp.token);
    localStorage.setItem("user", JSON.stringify(resp.user));
    localStorage.setItem("role", data.role);

    form.hidden = true;
    $("steps").hidden = true;
    $("done").hidden = false;
    $("doneTitle").textContent = `${data.first} عزیز، خوش آمدید`;
    $("doneLink").href = HOME[data.role];
  } catch (err) {
    console.error(err);
    toast("خطا در برقراری ارتباط با سرور");
  } finally {
    if (nextBtn) nextBtn.disabled = false;
  }
});

form.elements.password.addEventListener("input", (e) => {
  const v = e.target.value;
  let s = 0;
  if (v.length >= 8) s++;
  if (v.length >= 12) s++;
  if (/\p{L}/u.test(v) && /\d/.test(v)) s++;
  if (/[^\p{L}\d]/u.test(v)) s++;
  const labels = ["بسیار ضعیف", "ضعیف", "متوسط", "خوب", "قوی"];
  $("meterBar").style.width = (v ? Math.max(s, 1) * 25 : 0) + "%";
  $("meterText").textContent = v
    ? `قدرت رمز: ${labels[s]}`
    : "حداقل ۸ کاراکتر، شامل حرف و عدد";
});

document.querySelectorAll("input, textarea").forEach((i) =>
  i.addEventListener("input", () => {
    if (i.closest(".field")) setError(i, "");
  }),
);

showStep(1);
