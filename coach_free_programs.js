/**
 * coach_free_programs.js — Programs management page for coaches
 * Connects to /api/workouts/* backend
 */

// ── State ────────────────────────────────────────────────────────────────────
let plans    = [];
let athletes = [];
let sendPlan = null;

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
    top.append(
      el('h3', null, p.name),
      el('span', 'type' + (p.type === 'غذایی' ? ' food' : ''), p.type),
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

  const submitBtn = $('tplForm').querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const result = await apiFetch('/workouts/programs', {
    method: 'POST',
    body: JSON.stringify({
      name,
      type:  $('tplType').value,
      weeks: +$('tplWeeks').value || 4,
    }),
  });

  submitBtn.disabled = false;

  if (!result || !result.ok) {
    toast(result?.data?.error || 'خطا در ساخت برنامه.');
    return;
  }

  plans.unshift({ ...result.data.program, sent_count: 0 });
  $('tplName').value = '';
  renderPlans();
  toast('برنامه ساخته شد');
});

// ── Delete Program ────────────────────────────────────────────────────────────
async function deletePlan(p) {
  if (!confirm(`آیا می‌خواهید برنامه «${p.name}» را حذف کنید؟`)) return;

  const result = await apiFetch(`/workouts/programs/${p.id}`, { method: 'DELETE' });
  if (!result || !result.ok) {
    toast(result?.data?.error || 'خطا در حذف برنامه.');
    return;
  }

  plans = plans.filter((x) => x.id !== p.id);
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
    list.appendChild(el('p', 'muted', 'هنوز ورزشکاری ندارید. ابتدا برنامه‌ای به ورزشکاری اختصاص دهید یا از طریق لینک دعوت کنید.'));
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

  const result = await apiFetch(`/workouts/programs/${sendPlan.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ athlete_id: athleteId }),
  });

  $('sendDlg').close();

  if (!result || !result.ok) {
    toast(result?.data?.error || 'خطا در ارسال برنامه.');
    return;
  }

  // Update sent count locally
  const plan = plans.find((x) => x.id === sendPlan.id);
  if (plan) plan.sent_count = (plan.sent_count || 0) + 1;
  renderPlans();

  const name = athlete ? `${athlete.first_name} ${athlete.last_name}` : 'ورزشکار';
  toast(`برنامه برای ${name} ارسال شد`);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  if (!requireAuth()) return;

  // Load programs
  const progResult = await apiFetch('/workouts/programs');
  if (progResult && progResult.ok) {
    plans = progResult.data.programs || [];
  }
  renderPlans();

  // Load athletes for send dialog
  const athResult = await apiFetch('/workouts/athletes');
  if (athResult && athResult.ok) {
    athletes = athResult.data.athletes || [];
  }
}

init();
