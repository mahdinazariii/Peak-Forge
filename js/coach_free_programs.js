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
    const content = el('button', 'btn ghost', 'محتوا');
    const send  = el('button', 'btn',       'ارسال به ورزشکار');
    const group = el('button', 'lock-mini', '🔒 ارسال گروهی');
    const copy  = el('button', 'lock-mini', '🔒 کپی و شخصی‌سازی');
    const del   = el('button', 'btn ghost', 'حذف');

    group.dataset.premium = 'ارسال گروهی برنامه';
    copy.dataset.premium  = 'کپی و شخصی‌سازی برنامه';

    [content, send, group, copy, del].forEach((b) => (b.type = 'button'));

    content.addEventListener('click', () => openContent(p));
    send.addEventListener('click', () => openSend(p));
    del.addEventListener('click',  () => deletePlan(p));

    act.append(content, send, group, copy, del);
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

// ── Content Editor (exercises / meals) ────────────────────────────────────────
const DAY_NAMES_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
let contentPlan = null;

DAY_NAMES_FA.forEach((d, i) => {
  const o = el('option', null, d);
  o.value = i;
  $('cDay').appendChild(o);
});

async function openContent(p) {
  contentPlan = p;
  const isDiet = p._kind === 'diet';
  $('contentTitle').textContent = `محتوای «${p.name}»`;
  $('contentSub').textContent = isDiet
    ? 'وعده‌های برنامه‌ی غذایی را مدیریت کنید'
    : 'حرکات برنامه‌ی تمرینی را مدیریت کنید';

  // show/hide fields per plan kind
  $('cDayWrap').hidden   = isDiet;
  $('cSetsWrap').hidden  = isDiet;
  $('cRestWrap').hidden  = isDiet;
  $('cTimeWrap').hidden  = !isDiet;
  $('cKcalWrap').hidden  = !isDiet;
  $('cItemsWrap').hidden = !isDiet;
  $('cAltWrap').hidden   = !isDiet;

  await renderContentList();
  $('contentDlg').showModal();
}

async function renderContentList() {
  const box = $('contentList');
  box.innerHTML = '';
  const isDiet = contentPlan._kind === 'diet';
  const path = isDiet
    ? `/diet/plans/${contentPlan.id}/meals`
    : `/workouts/programs/${contentPlan.id}/exercises`;

  const result = await apiFetch(path);
  const items = (result && result.ok && (result.data.meals || result.data.exercises)) || [];

  if (!items.length) {
    box.appendChild(el('p', 'muted', isDiet ? 'هنوز وعده‌ای اضافه نشده.' : 'هنوز حرکتی اضافه نشده.'));
    return;
  }

  items.forEach((item) => {
    const row = el('div', 'content-row');
    const txt = el('div', 'content-text');
    if (isDiet) {
      txt.append(
        el('strong', null, `${item.name}${item.time ? ' · ' + item.time : ''}`),
        el('small', null,
          `${item.items || '—'}${item.kcal != null ? ' · ' + fa(item.kcal) + ' کیلوکالری' : ''}${item.alt ? ' · جایگزین: ' + item.alt : ''}`),
      );
    } else {
      txt.append(
        el('strong', null, item.name),
        el('small', null,
          `${item.sets || '—'}${item.rest ? ' · استراحت ' + item.rest : ''} · ${item.day_name || DAY_NAMES_FA[item.day_index] || ''}`),
      );
    }
    const x = el('button', 'icon-btn', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'حذف');
    x.addEventListener('click', async () => {
      const delPath = isDiet
        ? `/diet/plans/${contentPlan.id}/meals/${item.id}`
        : `/workouts/programs/${contentPlan.id}/exercises/${item.id}`;
      const res = await apiFetch(delPath, { method: 'DELETE' });
      if (res && res.ok) renderContentList();
      else toast((res && res.data && res.data.error) || 'خطا در حذف');
    });
    row.append(txt, x);
    box.appendChild(row);
  });
}

$('contentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!contentPlan) return;
  const isDiet = contentPlan._kind === 'diet';
  const name = $('cName').value.trim();
  if (!name) return;

  const path = isDiet
    ? `/diet/plans/${contentPlan.id}/meals`
    : `/workouts/programs/${contentPlan.id}/exercises`;

  const body = isDiet
    ? {
        name,
        time: $('cTime').value.trim(),
        items: $('cItems').value.trim(),
        kcal: $('cKcal').value === '' ? null : +$('cKcal').value,
        alt: $('cAlt').value.trim(),
      }
    : {
        name,
        sets: $('cSets').value.trim(),
        rest: $('cRest').value.trim(),
        day_index: +$('cDay').value,
        day_name: DAY_NAMES_FA[+$('cDay').value],
      };

  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (res && res.ok) {
    $('cName').value = '';
    $('cSets').value = '';
    $('cRest').value = '';
    $('cTime').value = '';
    $('cItems').value = '';
    $('cKcal').value = '';
    $('cAlt').value = '';
    toast(isDiet ? 'وعده اضافه شد' : 'حرکت اضافه شد');
    await renderContentList();
  } else {
    toast((res && res.data && res.data.error) || 'خطا در افزودن');
  }
});
$('contentClose').addEventListener('click', () => $('contentDlg').close());

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
