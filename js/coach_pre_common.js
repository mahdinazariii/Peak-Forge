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

const DEFAULT_SETTINGS = {
  autoRemind: true,
  idleDays: 3,
  weight: true,
  pr: true,
  priority: true,
};
function getSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem("coachSettings") || "{}"),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem("coachSettings", JSON.stringify(s));
  } catch {}
}
