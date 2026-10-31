const fa = (n, d = 0) =>
  Number(n).toLocaleString("fa-IR", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function toast(msg) {
  const t = el("div", "toast", msg);
  t.setAttribute("role", "status");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

const CATS = ["کاهش وزن", "حجم", "مبتدی"];

const ATHLETES = [
  {
    id: 1,
    name: "سارا محمدی",
    cat: "حجم",
    adh: 92,
    idle: 0,
    wd: 1.2,
    sessions: 14,
    pr: "ددلیفت ۸۵ کیلو",
    newPr: true,
  },
  {
    id: 2,
    name: "امیر کریمی",
    cat: "کاهش وزن",
    adh: 85,
    idle: 1,
    wd: -2.4,
    sessions: 12,
    pr: "پرس سینه ۷۰ کیلو",
  },
  {
    id: 3,
    name: "مهدی احمدی",
    cat: "مبتدی",
    adh: 48,
    idle: 5,
    wd: 0.3,
    sessions: 5,
    pr: "اسکوات ۴۰ کیلو",
  },
  {
    id: 4,
    name: "نگار رستمی",
    cat: "کاهش وزن",
    adh: 78,
    idle: 2,
    wd: -1.6,
    sessions: 11,
    pr: "لانژ ۲۰ کیلو",
  },
  {
    id: 5,
    name: "پویا صادقی",
    cat: "حجم",
    adh: 66,
    idle: 4,
    wd: 2.1,
    sessions: 8,
    pr: "ددلیفت ۱۱۰ کیلو",
  },
  {
    id: 6,
    name: "الهام نوری",
    cat: "مبتدی",
    adh: 95,
    idle: 0,
    wd: -0.8,
    sessions: 15,
    pr: "پلانک ۲ دقیقه",
  },
  {
    id: 7,
    name: "حسین فرجی",
    cat: "حجم",
    adh: 71,
    idle: 3,
    wd: 1.0,
    sessions: 9,
    pr: "پرس سرشانه ۴۵ کیلو",
  },
];

const ATHLETE_LIMIT = 5;
ATHLETES.splice(ATHLETE_LIMIT);

function getSettings() {
  return {
    autoRemind: false,
    idleDays: 3,
    weight: false,
    pr: false,
    priority: false,
  };
}
function saveSettings() {}

let premiumDlg;
function premiumNote(feature) {
  if (typeof getLocalUser === "function" && getLocalUser()?.tier === "premium") {
    return; // already premium — data-premium locks no longer apply
  }
  if (!premiumDlg) {
    premiumDlg = document.createElement("dialog");
    premiumDlg.className = "premium";
    premiumDlg.innerHTML = `
      <h2>🔒 مخصوص مربیان Premium</h2>
      <p class="pm-msg"></p>
      <ul>
        <li>پنل حرفه‌ای: مدیریت و دسته‌بندی تعداد زیادی ورزشکار</li>
        <li>قالب برنامه، کپی، ارسال گروهی و تقویم تمرینی</li>
        <li>اعلان و یادآوری پیشرفته‌ی خودکار</li>
        <li>صندوق اختصاصی پیام‌های اولویت‌دار</li>
      </ul>
      <div class="pm-actions">
        <a class="pm-buy" href="#">خرید اشتراک Premium</a>
        <button class="pm-close" type="button">بعداً</button>
      </div>`;
    premiumDlg
      .querySelector(".pm-close")
      .addEventListener("click", () => premiumDlg.close());
    premiumDlg.addEventListener("click", (e) => {
      if (e.target === premiumDlg) premiumDlg.close();
    });
    // simulated purchase: flip the account tier, then reload
    premiumDlg.querySelector(".pm-buy").addEventListener("click", async (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      if (typeof apiFetch !== "function") {
        alert("برای خرید، از داخل برنامه وارد شوید.");
        return;
      }
      btn.textContent = "در حال فعال‌سازی…";
      const res = await apiFetch("/profile/upgrade", { method: "POST" });
      if (res && res.ok) {
        try {
          const u = getLocalUser() || {};
          u.tier = "premium";
          localStorage.setItem("user", JSON.stringify(u));
        } catch {}
        premiumDlg.close();
        setTimeout(() => location.reload(), 400);
      } else {
        btn.textContent = "خطا — دوباره تلاش کن";
      }
    });
    document.body.appendChild(premiumDlg);
  }
  premiumDlg.querySelector(".pm-msg").textContent =
    feature === "upgrade"
      ? "با اشتراک Premium به همه‌ی ابزارهای حرفه‌ای مدیریت ورزشکاران دسترسی پیدا می‌کنید."
      : `برای استفاده از «${feature}» باید اشتراک Premium تهیه کنید.`;
  premiumDlg.showModal();
}
document.addEventListener(
  "click",
  (e) => {
    const t = e.target.closest("[data-premium]");
    if (!t) return;
    if (typeof getLocalUser === "function" && getLocalUser()?.tier === "premium") {
      return; // premium users pass through
    }
    e.preventDefault();
    e.stopPropagation();
    premiumNote(t.dataset.premium);
  },
  true,
);
