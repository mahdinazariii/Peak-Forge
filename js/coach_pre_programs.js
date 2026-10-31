// coach_pre_programs.js — premium coach templates/calendar, connected to API
if (typeof requireAuth === "function" && !requireAuth()) throw new Error("unauthorized");
if (typeof requireRole === "function") requireRole("coach");

// templates = real workout programs + diet plans: {id, _kind, name, type, weeks, sent}
let templates = [];
let athletes = [];

const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const todayIdx = (new Date().getDay() + 1) % 7;

// weekly send-schedule persisted on the server (coach_schedule table)
let schedule = []; // [{id, day_index, plan_kind, plan_id, target}]
const tplName = (kind, id) => {
  const t = templates.find((x) => x._kind === kind && String(x.id) === String(id));
  return t ? t.name : "(حذف‌شده)";
};

async function loadSchedule() {
  const res = await apiFetch("/coach/schedule");
  if (res && res.ok) schedule = res.data.schedule || [];
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function loadTemplates() {
  const [workout, diet] = await Promise.all([
    apiFetch("/workouts/programs"),
    apiFetch("/diet/plans"),
  ]);
  templates = [];
  if (workout && workout.ok)
    (workout.data.programs || []).forEach((p) =>
      templates.push({ ...p, _kind: "workout", type: p.type || "تمرینی", sent: p.sent_count || 0 }),
    );
  if (diet && diet.ok)
    (diet.data.plans || []).forEach((p) =>
      templates.push({ ...p, _kind: "diet", type: "غذایی", sent: p.sent_count || 0 }),
    );
  renderTemplates();
  renderCalSelects();
}

async function loadAthletes() {
  const res = await apiFetch("/coach/athletes");
  if (res && res.ok) athletes = res.data.athletes || [];
}

// ── Templates ────────────────────────────────────────────────────────────────

function renderTemplates() {
  const box = $("templates");
  box.innerHTML = "";
  if (!templates.length)
    box.appendChild(el("p", "empty", "هنوز قالبی نساخته‌اید."));
  templates.forEach((t) => {
    const c = el("article", "card tpl");
    const top = el("div", "tpl-top");
    top.append(
      el("h3", null, t.name),
      el("span", "type" + (t.type === "غذایی" ? " food" : ""), t.type),
    );
    const meta = el("div", "tpl-meta");
    meta.append(
      el("span", "muted", `${fa(t.weeks)} هفته`),
      el("span", "muted", `ارسال‌شده به ${fa(t.sent)} ورزشکار`),
    );
    const act = el("div", "tpl-actions");
    const send = el("button", "btn", "ارسال گروهی");
    const copy = el("button", "btn ghost", "کپی");
    const edit = el("button", "btn ghost", "شخصی‌سازی نام");
    [send, copy, edit].forEach((b) => (b.type = "button"));
    send.addEventListener("click", () => openSend(t));
    copy.addEventListener("click", async () => {
      const path = t._kind === "diet" ? `/diet/plans/${t.id}/copy` : `/workouts/programs/${t.id}/copy`;
      const res = await apiFetch(path, { method: "POST", body: JSON.stringify({}) });
      if (res && res.ok) {
        toast("نسخه‌ی کپی ساخته شد");
        await loadTemplates();
      } else {
        toast((res && res.data && res.data.error) || "خطا در کپی");
      }
    });
    edit.addEventListener("click", async () => {
      const n = prompt("نام جدید قالب:", t.name);
      if (!n || !n.trim() || n.trim() === t.name) return;
      const path = t._kind === "diet" ? `/diet/plans/${t.id}` : `/workouts/programs/${t.id}`;
      const res = await apiFetch(path, { method: "PATCH", body: JSON.stringify({ name: n.trim() }) });
      if (res && res.ok) {
        t.name = n.trim();
        renderTemplates();
        renderCalSelects();
        renderCalendar();
        toast("نام قالب تغییر کرد");
      } else {
        toast((res && res.data && res.data.error) || "خطا در تغییر نام");
      }
    });
    act.append(send, copy, edit);
    c.append(top, meta, act);
    box.appendChild(c);
  });
}

$("tplForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("tplName").value.trim();
  if (!name) return;
  const isDiet = $("tplType").value === "غذایی";
  const path = isDiet ? "/diet/plans" : "/workouts/programs";
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify({ name, weeks: +$("tplWeeks").value || 4 }),
  });
  if (res && res.ok) {
    $("tplName").value = "";
    toast("قالب ساخته شد — محتوای آن را از تب برنامه‌ها کامل کنید");
    await loadTemplates();
  } else {
    toast((res && res.data && res.data.error) || "خطا در ساخت قالب");
  }
});

// ── Bulk send ────────────────────────────────────────────────────────────────

let sendTpl = null;
function openSend(t) {
  sendTpl = t;
  $("sendTitle").textContent = `ارسال «${t.name}»`;
  const cats = $("sendCats");
  cats.innerHTML = "";
  const boxes = $("sendList");
  boxes.innerHTML = "";

  if (!athletes.length) {
    boxes.appendChild(el("p", "muted", "هنوز ورزشکاری به شما متصل نیست."));
  }
  athletes.forEach((a) => {
    const row = el("label", "check-row");
    const cb = el("input");
    cb.type = "checkbox";
    cb.value = a.id;
    cb.dataset.cat = a.category || "";
    row.append(cb, el("span", null, a.name), el("small", null, a.category || "بدون دسته"));
    boxes.appendChild(row);
  });
  const mk = (label, fn) => {
    const b = el("button", "chip", label);
    b.type = "button";
    b.addEventListener("click", fn);
    cats.appendChild(b);
  };
  mk("همه", () =>
    boxes.querySelectorAll("input").forEach((i) => (i.checked = true)),
  );
  CATS.forEach((c) =>
    mk(c, () =>
      boxes
        .querySelectorAll("input")
        .forEach((i) => (i.checked = i.dataset.cat === c)),
    ),
  );
  mk("هیچ‌کدام", () =>
    boxes.querySelectorAll("input").forEach((i) => (i.checked = false)),
  );
  $("sendDlg").showModal();
}
$("sendCancel").addEventListener("click", () => $("sendDlg").close());
$("sendGo").addEventListener("click", async () => {
  const ids = [...$("sendList").querySelectorAll("input:checked")].map((i) => i.value);
  if (!ids.length) return toast("حداقل یک ورزشکار انتخاب کنید");

  const path =
    sendTpl._kind === "diet"
      ? `/diet/plans/${sendTpl.id}/assign`
      : `/workouts/programs/${sendTpl.id}/assign`;

  let ok = 0;
  for (const id of ids) {
    const res = await apiFetch(path, {
      method: "POST",
      body: JSON.stringify({ athlete_id: id }),
    });
    if (res && res.ok) ok += 1;
  }
  $("sendDlg").close();
  await loadTemplates();
  toast(`برنامه برای ${fa(ok)} ورزشکار ارسال شد`);
});

// ── Weekly calendar (stored locally) ─────────────────────────────────────────

function renderCalendar() {
  const box = $("calendar");
  box.innerHTML = "";
  DAYS.forEach((d, i) => {
    const c = el("div", "card day-card" + (i === todayIdx ? " today" : ""));
    const name = el("div", "day-name", d);
    if (i === todayIdx) name.appendChild(el("small", null, "امروز"));
    const slots = el("div", "slots");
    const items = schedule.filter((s) => s.day_index === i);
    if (!items.length)
      slots.appendChild(el("span", "muted", "برنامه‌ای ثبت نشده"));
    items.forEach((s) => {
      const chip = el("span", "slot");
      chip.append(
        el("span", null, tplName(s.plan_kind, s.plan_id)),
        el("small", null, s.target || ""),
      );
      const x = el("button", "icon-btn", "✕");
      x.type = "button";
      x.setAttribute("aria-label", "حذف از تقویم");
      x.addEventListener("click", async () => {
        const res = await apiFetch(`/coach/schedule/${s.id}`, { method: "DELETE" });
        if (res && res.ok) {
          await loadSchedule();
          renderCalendar();
        } else {
          toast((res && res.data && res.data.error) || "خطا در حذف");
        }
      });
      chip.appendChild(x);
      slots.appendChild(chip);
    });
    c.append(name, slots);
    box.appendChild(c);
  });
}

function renderCalSelects() {
  $("calTpl").innerHTML = "";
  templates.forEach((t) => {
    const o = el("option", null, t.name);
    o.value = t._kind + ":" + t.id;
    $("calTpl").appendChild(o);
  });
}
DAYS.forEach((d, i) => {
  const o = el("option", null, d);
  o.value = i;
  $("calDay").appendChild(o);
});
function fillCalTargets() {
  $("calTarget").innerHTML = "";
  [
    "همه‌ی ورزشکاران",
    ...CATS.map((c) => "دسته‌ی " + c),
    ...athletes.map((a) => a.name),
  ].forEach((t) => $("calTarget").appendChild(el("option", null, t)));
}
$("calDay").value = todayIdx;
$("calForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = String($("calTpl").value || "");
  const [kind, tplId] = raw.split(":");
  if (!tplId || !templates.some((t) => String(t.id) === tplId && t._kind === kind)) {
    return toast("اول یک قالب بسازید");
  }
  const res = await apiFetch("/coach/schedule", {
    method: "POST",
    body: JSON.stringify({
      day_index: +$("calDay").value,
      plan_kind: kind,
      plan_id: +tplId,
      target: $("calTarget").value,
    }),
  });
  if (res && res.ok) {
    await loadSchedule();
    renderCalendar();
    toast("به تقویم اضافه شد");
  } else {
    toast((res && res.data && res.data.error) || "خطا در افزودن به تقویم");
  }
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  await Promise.all([loadTemplates(), loadAthletes(), loadSchedule()]);
  fillCalTargets();
  renderCalendar();
})();
