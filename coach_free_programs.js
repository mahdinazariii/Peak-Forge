/**
 * coach_free_programs.js — Programs management page for coaches
 * Connects to /api/workouts/* and /api/diet/* backend
 * Programs with type="غذایی" use diet API, others use workouts API.
 */

// ── State ────────────────────────────────────────────────────────────────────
let plans    = [];   // merged list from both workout + diet APIs
let athletes = [];
let sendPlan = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function apiPath(plan) {
  return plan._kind === 'diet' ? '/diet' : '/workouts';
}

// ── Render Programs ───────────────────────────────────────────────────────────
function renderPlans() {
  const box = $('templates');
  box.innerHTML = '';
  if (!plans.length) {
    box.appendChild(el('p', 'empty', 'هنوز برنامه‌ای تعریف نکرده‌اید.'));
    return;
  }
  plans.forEach((p) => {
    const c = el('article', 'card tpl');

    const top = el('div', 'tpl-top');
    const typeLabel = p._kind === 'diet' ? 'غذایی' : (p.type || 'تمرینی');
    top.append(
      el('h3', null, p.name),
      el('span', 'type' + (p._kind === 'diet' ? ' food' : ''), typeLabel),
    );

    const meta = el('div', 'tpl-meta');
    meta.append(
      el('span', 'muted', `${fa(p.weeks)} هفته`),
      el('span', 'muted', `ارسال‌شده به ${fa(p.sent_count || 0)} ورزشکار`),
    );

    const act = el('div', 'tpl-actions');
    const send  = el('button', 'btn',       'ارسال به ورزشکار');
    const group = el('button', 'lock-mini', '🔒 ارسال گروهی');
    const copy  = el('button', 'lock-mini', '🔒 کپی و شخصی‌سازی');
    const del   = el('button', 'btn ghost', 'حذف');

    group.dataset.premium = 'ارسال گروهی برنامه';
    copy.dataset.premium  = 'کپی و شخصی‌سازی برنامه';

    [send, group, copy, del].forEach((b) => (b.type = 'button'));

    send.addEventListener('click', () => openSend(p));
    del.addEventListener('click',  () => deletePlan(p));

    act.append(send, group, copy, del);
    c.append(top, meta, act);
    box.appendChild(c);
  });
}

// ── Create Program ────────────────────────────────────────────────────────────
$('tplForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('tplName').value.trim();
  if (!name) return;

  const type  = $('tplType').value;
  const weeks = +$('tplWeeks').value || 4;
  const isDiet = (type === 'غذایی');
  const path   = isDiet ? '/diet/plans' : '/workouts/programs';

  const submitBtn = $('tplForm').querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const body = isDiet
    ? { name, weeks }
    : { name, type, weeks };

  const result = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  submitBtn.disabled = false;

  if (!result || !result.ok) {
    toast(result?.data?.error || 'خطا در ساخت برنامه.');
    return;
  }

  const newPlan = result.data.program || result.data.plan;
  newPlan._kind = isDiet ? 'diet' : 'workout';
  newPlan.sent_count = 0;
  plans.unshift(newPlan);
  $('tplName').value = '';
  renderPlans();
  toast('برنامه ساخته شد');
});

// ── Delete Program ────────────────────────────────────────────────────────────
async function deletePlan(p) {
  if (!confirm(`آیا می‌خواهید برنامه «${p.name}» را حذف کنید؟`)) return;

  const path = p._kind === 'diet'
    ? `/diet/plans/${p.id}`
    : `/workouts/programs/${p.id}`;

  const result = await apiFetch(path, { method: 'DELETE' });
  if (!result || !result.ok) {
    toast(result?.data?.error || 'خطا در حذف برنامه.');
    return;
  }

  plans = plans.filter((x) => !(x.id === p.id && x._kind === p._kind));
  renderPlans();
  toast('برنامه حذف شد.');
}

// ── Send Dialog ───────────────────────────────────────────────────────────────
function openSend(p) {
  sendPlan = p;
  $('sendTitle').textContent = `ارسال «${p.name}»`;
  const list = $('sendList');
  list.innerHTML = '';

  if (!athletes.length) {
    list.appendChild(el('p', 'muted', 'هنوز ورزشکاری ندارید.'));
    $('sendDlg').showModal();
    return;
  }

  athletes.forEach((a, i) => {
    const row = el('label', 'check-row');
    const r   = el('input');
    r.type    = 'radio';
    r.name    = 'target';
    r.value   = a.id;
    r.checked = i === 0;
    row.append(r, el('span', null, `${a.first_name} ${a.last_name}`));
    list.appendChild(row);
  });

  $('sendDlg').showModal();
}

$('sendCancel').addEventListener('click', () => $('sendDlg').close());

$('sendGo').addEventListener('click', async () => {
  const r = $('sendList').querySelector('input:checked');
  if (!r) return;

  const athleteId = r.value;
  const athlete   = athletes.find((x) => String(x.id) === String(athleteId));

  const path = sendPlan._kind === 'diet'
    ? `/diet/plans/${sendPlan.id}/assign`
    : `/workouts/programs/${sendPlan.id}/assign`;

  const result = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify({ athlete_id: athleteId }),
  });

  $('sendDlg').close();

  if (!result || !result.ok) {
    toast(result?.data?.error || 'خطا در ارسال برنامه.');
    return;
  }

  const plan = plans.find((x) => x.id === sendPlan.id && x._kind === sendPlan._kind);
  if (plan) plan.sent_count = (plan.sent_count || 0) + 1;
  renderPlans();

  const name = athlete ? `${athlete.first_name} ${athlete.last_name}` : 'ورزشکار';
  toast(`برنامه برای ${name} ارسال شد`);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  if (!requireAuth()) return;

  // Load workout programs
  const workoutResult = await apiFetch('/workouts/programs');
  if (workoutResult && workoutResult.ok) {
    (workoutResult.data.programs || []).forEach((p) => {
      p._kind = 'workout';
      plans.push(p);
    });
  }

  // Load diet plans
  const dietResult = await apiFetch('/diet/plans');
  if (dietResult && dietResult.ok) {
    (dietResult.data.plans || []).forEach((p) => {
      p._kind = 'diet';
      plans.push(p);
    });
  }

  renderPlans();

  // Load athletes for send dialog
  const athResult = await apiFetch('/workouts/athletes');
  if (athResult && athResult.ok) {
    athletes = athResult.data.athletes || [];
  }
}

init();
