// coach_free_chat.js — coach chat, connected to /api/chat
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("coach");

let convs = []; // {id, name, last_text, unread, pending_priority}
let forums = []; // {id, name, members, last_text}
let tab = "convs";
let open = null; // { kind: "conv" | "forum", id }
let threadMsgs = [];
let lastThreadId = null;

const pending = (c) => c.pending_priority > 0;
const lastText = (x) => x.last_text || "هنوز پیامی نیست";

// UTC "YYYY-MM-DD HH:MM:SS" from API → short Persian label
function msgTime(utc) {
  const d = new Date(utc.replace(" ", "T") + "Z");
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("fa-IR", { hour: "numeric", minute: "2-digit" });
  return (
    d.toLocaleDateString("fa-IR", { month: "numeric", day: "numeric" }) +
    " - " +
    d.toLocaleTimeString("fa-IR", { hour: "numeric", minute: "2-digit" })
  );
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadConvs() {
  const res = await apiFetch("/chat/conversations");
  if (res && res.ok) convs = res.data.conversations;
}

async function loadForums() {
  const res = await apiFetch("/chat/forums");
  if (res && res.ok) forums = res.data.forums;
}

async function loadThread() {
  if (!open) return;
  const res =
    open.kind === "conv"
      ? await apiFetch(`/chat/messages/${open.id}`)
      : await apiFetch(`/chat/forums/${open.id}/messages`);
  if (res && res.ok) {
    threadMsgs = res.data.messages;
    lastThreadId = open.kind + open.id;
  }
}

// ── List rendering ───────────────────────────────────────────────────────────

function convRow(c, showStar) {
  const b = el("button", "conv" + (pending(c) ? " prio" : ""));
  b.type = "button";
  const extra = c.unread > 0 ? ` · ${fa(c.unread)} جدید` : "";
  const body = el("div", "conv-body");
  body.append(el("strong", null, c.name), el("span", null, lastText(c) + extra));
  b.append(el("div", "avatar", c.name[0]), body);
  if (showStar && pending(c)) b.appendChild(el("span", "star", "★"));
  b.addEventListener("click", () => {
    open = { kind: "conv", id: c.id };
    renderThread();
  });
  return b;
}

function renderList() {
  const view = $("view");
  view.innerHTML = "";
  const list = el("div", "list");
  if (tab === "priority") {
    const items = convs.filter(pending);
    if (!items.length)
      list.appendChild(el("p", "empty", "پیام اولویت‌دار بی‌پاسخی ندارید."));
    items.forEach((c) => list.appendChild(convRow(c, true)));
  } else if (tab === "convs") {
    if (!convs.length)
      list.appendChild(
        el("p", "empty", "هنوز ورزشکاری به شما متصل نیست. با ارسال برنامه، ورزشکاران اینجا دیده می‌شوند."),
      );
    convs.forEach((c) => list.appendChild(convRow(c, true)));
  } else {
    const form = el("form", "card new-forum");
    form.innerHTML = `<div class="form-row"><label class="field">تالار جدید<input required placeholder="نام تالار" /></label><button class="btn" type="submit">ایجاد</button></div>`;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.querySelector("input").value.trim();
      if (!name) return;
      const res = await apiFetch("/chat/forums", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (res && res.ok) {
        toast("تالار ایجاد شد");
        await loadForums();
        render();
      } else {
        toast((res && res.data && res.data.error) || "خطا در ساخت تالار");
      }
    });
    list.appendChild(form);
    if (!forums.length) list.appendChild(el("p", "empty", "هنوز تالاری نساخته‌اید."));
    forums.forEach((f) => {
      const b = el("button", "conv");
      b.type = "button";
      const body = el("div", "conv-body");
      body.append(
        el("strong", null, f.name),
        el("span", null, `${fa(f.members)} عضو · ${lastText(f)}`),
      );
      b.append(el("div", "avatar", f.name[0]), body);
      b.addEventListener("click", () => {
        open = { kind: "forum", id: f.id };
        renderThread();
      });
      list.appendChild(b);
    });
  }
  view.appendChild(list);
}

// ── Thread rendering ─────────────────────────────────────────────────────────

function drawMsgs(box) {
  box.innerHTML = "";
  if (!threadMsgs.length)
    box.appendChild(el("p", "empty", "گفت‌وگو را شروع کنید."));
  threadMsgs.forEach((m) => {
    const d = el("div", "msg " + (m.mine ? "out" : "in") + (m.is_priority ? " priority" : ""));
    if (!m.mine && open.kind === "forum") {
      const label =
        m.sender_role === "coach" ? m.sender_name + " · مربی" : m.sender_name;
      d.appendChild(el("span", "sender", label));
    }
    d.append(m.text, el("span", "time", msgTime(m.created_at)));
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
}

// id of the newest message currently on screen (for change detection in polling)
const drawnLastId = () =>
  threadMsgs.length ? threadMsgs[threadMsgs.length - 1].id : 0;

async function renderThread() {
  const view = $("view");
  view.innerHTML = "";
  $("tabs").hidden = true;
  await loadThread();

  const isForum = open.kind === "forum";
  const current = isForum
    ? forums.find((f) => f.id === open.id)
    : convs.find((c) => c.id === open.id);
  const name = current ? current.name : "گفت‌وگو";

  const peer = el("div", "peer");
  const back = el("button", "icon-btn", "‹ بازگشت");
  back.type = "button";
  back.addEventListener("click", () => {
    open = null;
    $("tabs").hidden = false;
    render();
  });
  peer.append(back, el("h2", null, name), el("div", "avatar", name[0]));

  const box = el("div", "messages");
  const form = el("form", "composer");
  form.innerHTML = `<input type="text" placeholder="${isForum ? "پیام به تالار…" : "پاسخ به ورزشکار…"}" aria-label="پیام" /><button class="send-btn" type="submit" aria-label="ارسال">➤</button>`;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    const t = input.value.trim();
    if (!t) return;
    const res =
      open.kind === "conv"
        ? await apiFetch("/chat/messages", {
            method: "POST",
            body: JSON.stringify({ receiver_id: open.id, text: t }),
          })
        : await apiFetch(`/chat/forums/${open.id}/messages`, {
            method: "POST",
            body: JSON.stringify({ text: t }),
          });
    if (!res || !res.ok) {
      toast((res && res.data && res.data.error) || "ارسال پیام ناموفق بود");
      return;
    }
    input.value = "";
    await loadThread();
    await Promise.all([loadConvs(), loadForums()]);
    if (open) drawMsgs(box);
  });
  view.append(peer, box, form);
  drawMsgs(box);
}

async function render() {
  await Promise.all([loadConvs(), loadForums()]);
  if (open) {
    // thread deleted (e.g. forum removed) → fall back to list
    const exists =
      open.kind === "conv"
        ? convs.some((c) => c.id === open.id)
        : forums.some((f) => f.id === open.id);
    if (!exists) open = null;
  }
  $("tabs").hidden = !!open;
  open ? await renderThread() : renderList();
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    tab = t.dataset.tab;
    document
      .querySelectorAll(".tab")
      .forEach((x) => x.classList.toggle("active", x === t));
    render();
  }),
);

// refresh lists + open thread periodically (redraw only when a new message arrived)
setInterval(async () => {
  try {
    if (open) {
      const before = drawnLastId();
      await loadThread();
      await Promise.all([loadConvs(), loadForums()]);
      const box = document.querySelector("#view .messages");
      if (box && open && drawnLastId() !== before) drawMsgs(box);
    } else {
      await render();
    }
  } catch {
    /* offline — retry next tick */
  }
}, 5000);

render();
