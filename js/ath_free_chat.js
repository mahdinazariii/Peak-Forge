// ath_free_chat.js — athlete chat, connected to /api/chat
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("athlete");

const coachList = document.getElementById("coachMessages");
const forumList = document.getElementById("forumMessages");
const coachForm = document.querySelector('form[data-list="coachMessages"]');
const forumForm = document.querySelector('form[data-list="forumMessages"]');
const priorityBtn = coachForm.querySelector(".priority-btn");
const forumSelect = document.getElementById("forumSelect");

let myCoach = null;
let forums = [];
let activeForumId = null;
let lastDMId = 0;
let lastForumMsgId = 0;

const faTime = (utc) =>
  new Date(utc.replace(" ", "T") + "Z").toLocaleTimeString("fa-IR", {
    hour: "numeric",
    minute: "2-digit",
  });

// "امروز" / "دیروز" / full date for message day dividers
function dayLabel(utc) {
  const d = new Date(utc.replace(" ", "T") + "Z");
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "امروز";
  if (same(d, yest)) return "دیروز";
  return d.toLocaleDateString("fa-IR");
}

function emptyBox(list, text) {
  list.innerHTML = "";
  const p = el2("p", "empty", text);
  list.appendChild(p);
}

// tiny local helper (ath_free_common.js has no el())
function el2(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Render API messages into a list, with day dividers
function renderMessages(list, msgs, isForum) {
  list.innerHTML = "";
  if (!msgs.length) {
    emptyBox(list, isForum ? "هنوز پیامی در این تالار نیست." : "گفت‌وگو را شروع کنید.");
    return;
  }
  let lastDay = null;
  msgs.forEach((m) => {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      list.appendChild(el2("div", "day", day));
      lastDay = day;
    }
    const div = el2("div", "msg " + (m.mine ? "out" : "in") + (m.is_priority ? " priority" : ""));
    if (isForum && !m.mine) {
      const sender = el2("span", "sender", m.sender_role === "coach" ? m.sender_name + " · مربی" : m.sender_name);
      div.appendChild(sender);
    }
    div.appendChild(document.createTextNode(m.text));
    div.appendChild(el2("span", "time", faTime(m.created_at)));
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
}

async function loadCoachThread() {
  if (!myCoach) return;
  const res = await apiFetch(`/chat/messages/${myCoach.id}`);
  if (!res || !res.ok) return;
  const msgs = res.data.messages;
  const fresh = msgs.length ? msgs[msgs.length - 1].id : 0;
  if (fresh === lastDMId && coachList.querySelector(".msg, .empty")) return;
  lastDMId = fresh;
  renderMessages(coachList, msgs, false);
}

async function loadCoachInfo() {
  const res = await apiFetch("/chat/conversations");
  if (!res || !res.ok) return;
  const convs = res.data.conversations;
  document.getElementById("coachPeerName").textContent =
    convs.length ? convs[0].name : "مربی من";
  if (!convs.length) {
    myCoach = null;
    document.getElementById("coachPeerStatus").textContent = "مربی‌ای ثبت نشده";
    emptyBox(coachList, "هنوز به مربی‌ای متصل نیستید. وقتی مربی برای شما برنامه‌ای ارسال کند، اینجا گفت‌وگو فعال می‌شود.");
    return;
  }
  myCoach = convs[0];
  document.getElementById("coachPeerStatus").textContent =
    myCoach.unread > 0 ? `${myCoach.unread} پیام خوانده‌نشده` : "همه‌ی پیام‌ها خوانده شد";
  await loadCoachThread();
}

coachForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = coachForm.querySelector("input");
  const text = input.value.trim();
  if (!text) return;
  if (!myCoach) return;
  const isPriority = priorityBtn.getAttribute("aria-pressed") === "true";
  const res = await apiFetch("/chat/messages", {
    method: "POST",
    body: JSON.stringify({ receiver_id: myCoach.id, text, is_priority: isPriority }),
  });
  if (!res || !res.ok) {
    alert((res && res.data && res.data.error) || "ارسال پیام ناموفق بود.");
    return;
  }
  input.value = "";
  lastDMId = 0; // force refresh
  await loadCoachThread();
});

// ── Forum tab ────────────────────────────────────────────────────────────────

async function loadForums() {
  const res = await apiFetch("/chat/forums");
  if (!res || !res.ok) return;
  forums = res.data.forums;
  forumSelect.innerHTML = "";
  if (!forums.length) {
    const opt = el2("option", null, "تالاری وجود ندارد");
    forumSelect.appendChild(opt);
    activeForumId = null;
    emptyBox(forumList, "مربی شما هنوز تالاری نساخته است.");
    return;
  }
  forums.forEach((f) => {
    const opt = el2("option", null, f.name);
    opt.value = f.id;
    forumSelect.appendChild(opt);
  });
  if (!forums.some((f) => f.id === activeForumId)) activeForumId = forums[0].id;
  forumSelect.value = activeForumId;
  await loadForumThread();
}

async function loadForumThread() {
  if (!activeForumId) return;
  const res = await apiFetch(`/chat/forums/${activeForumId}/messages`);
  if (!res || !res.ok) return;
  const msgs = res.data.messages;
  const fresh = msgs.length ? msgs[msgs.length - 1].id : 0;
  if (fresh === lastForumMsgId && forumList.querySelector(".msg, .empty")) return;
  lastForumMsgId = fresh;
  renderMessages(forumList, msgs, true);
}

forumSelect.addEventListener("change", () => {
  activeForumId = parseInt(forumSelect.value);
  lastForumMsgId = 0;
  loadForumThread();
});

forumForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = forumForm.querySelector("input");
  const text = input.value.trim();
  if (!text || !activeForumId) return;
  const res = await apiFetch(`/chat/forums/${activeForumId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  if (!res || !res.ok) {
    alert((res && res.data && res.data.error) || "ارسال پیام ناموفق بود.");
    return;
  }
  input.value = "";
  lastForumMsgId = 0;
  await loadForumThread();
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    const panel = document.getElementById(tab.dataset.target);
    panel.classList.add("active");
    if (tab.dataset.target === "forum") loadForums();
    else if (myCoach) loadCoachThread();
  });
});

// ── Polling for new messages ─────────────────────────────────────────────────

async function poll() {
  const activePanel = document.querySelector(".panel.active");
  if (!activePanel) return;
  try {
    if (activePanel.id === "coach" && myCoach) await loadCoachThread();
    if (activePanel.id === "forum" && activeForumId) await loadForumThread();
  } catch {
    /* offline — retry next tick */
  }
}
setInterval(poll, 4000);

// ── Init ─────────────────────────────────────────────────────────────────────

// Priority star is a Premium feature on the free tier (data-premium blocks the
// click in ath_free_common.js); the toggle still works if the lock is removed
priorityBtn.addEventListener("click", () => {
  const pressed = priorityBtn.getAttribute("aria-pressed") === "true";
  priorityBtn.setAttribute("aria-pressed", pressed ? "false" : "true");
  coachForm.classList.toggle("is-priority", !pressed);
});

loadCoachInfo();
