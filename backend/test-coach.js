/* End-to-end test of coach athletes-management API (مرحله ۲) */
const BASE = 'http://localhost:3000/api';
const stamp = Date.now();

async function req(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  // 1. Setup: coach + 6 athletes (6th to test the free-tier cap)
  const c = await req('POST', '/auth/signup', null, {
    role: 'coach', first: 'مریم', last: 'مدیری', email: `mgr${stamp}@t.ir`, password: '123456',
  });
  const cTok = c.data.token;
  const aths = [];
  for (let i = 1; i <= 6; i++) {
    const a = await req('POST', '/auth/signup', null, {
      role: 'athlete', first: `ورزشکار${i}`, last: 'تستی', email: `ath${i}_${stamp}@t.ir`, password: '123456', weight: 70,
    });
    aths.push(a.data.user);
  }
  check('setup: 1 coach + 6 athletes', !!cTok && aths.every(x => x && x.id), c.data);

  // 2. Add by email: 404 unknown, then 5 successful links
  const bad = await req('POST', '/coach/athletes', cTok, { email: 'nobody@t.ir' });
  check('add unknown email → 404', bad.status === 404, bad);
  for (let i = 0; i < 5; i++) {
    const r = await req('POST', '/coach/athletes', cTok, { email: aths[i].email });
    check(`add athlete ${i + 1}`, r.status === 201, r.data);
  }
  const dup = await req('POST', '/coach/athletes', cTok, { email: aths[0].email });
  check('duplicate link → 409', dup.status === 409, dup);
  const cap = await req('POST', '/coach/athletes', cTok, { email: aths[5].email });
  check('free cap 5 → 403 premium', cap.status === 403 && cap.data.premium === true, cap);

  // athlete tries the coach API
  const forbidden = await req('GET', '/coach/athletes', undefined);
  check('no token → 401', forbidden.status === 401, forbidden);

  // 3. Assign program with 3 exercises to athlete 1; diet with 2 meals
  const prog = await req('POST', '/workouts/programs', cTok, { name: 'برنامه تست', weeks: 1 });
  const pid = prog.data.program.id;
  for (const n of ['اسکوات', 'پرس سینه', 'ددلیفت']) {
    await req('POST', `/workouts/programs/${pid}/exercises`, cTok, { name: n, sets: '3×10', day_index: 1, day_name: 'شنبه' });
  }
  await req('POST', `/workouts/programs/${pid}/assign`, cTok, { athlete_id: aths[0].id });

  const diet = await req('POST', '/diet/plans', cTok, { name: 'رژیم تست', weeks: 1 });
  const did = diet.data.plan.id;
  for (const n of ['صبحانه', 'ناهار']) {
    await req('POST', `/diet/plans/${did}/meals`, cTok, { name: n, time: '08:00', items: 'سویا' });
  }
  await req('POST', `/diet/plans/${did}/assign`, cTok, { athlete_id: aths[0].id });

  // 4. Athlete 1 ticks 2/3 exercises and 1/2 meals → adherence
  const aTok1 = (await req('POST', '/auth/login', null, { email: aths[0].email, password: '123456' })).data.token;
  const exs = (await req('GET', `/workouts/programs/${pid}/exercises`, aTok1)).data.exercises;
  for (let i = 0; i < 2; i++) {
    await req('POST', '/workouts/log', aTok1, { exercise_id: exs[i].id, done: true });
  }
  const meals = (await req('GET', `/diet/plans/${did}/meals`, aTok1)).data.meals;
  await req('POST', '/diet/log', aTok1, { meal_id: meals[0].id, done: true });

  // 5. Weight logs: seed an older record directly, then POST today's
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database('../peak_forge.db');
  await new Promise((res, rej) => db.run(
    "INSERT INTO weight_logs (athlete_id, log_date, weight, body_fat) VALUES (?, date('now','-20 day'), 72.5, 22)",
    [aths[0].id], (e) => (e ? rej(e) : res())
  ));
  db.close();
  await req('POST', '/profile/weight', aTok1, { weight: 70.4, body_fat: 20.5 });
  const wSeries = await req('GET', '/profile/weight', aTok1);
  check('weight series has 2 points', wSeries.data.logs.length === 2 &&
    wSeries.data.logs[0].weight === 72.5 && wSeries.data.logs[1].body_fat === 20.5, wSeries.data);

  // record
  const rec = await req('POST', '/profile/records', aTok1, { exercise_name: 'ددلیفت', weight: 85, reps: 3 });
  check('record created', rec.status === 201, rec.data);

  // 6. Coach list: adherence, wd, sessions, record, category
  const list = await req('GET', '/coach/athletes', cTok);
  const a1 = list.data.athletes.find(x => x.id === aths[0].id);
  const a2 = list.data.athletes.find(x => x.id === aths[1].id);
  check('a1 adherence = 37 (67% ex of 3 + 7% diet of 14)', a1.adherence === 37, a1);
  check('a1 weight_delta = -2.1', a1.weight_delta === -2.1, a1);
  check('a1 sessions = 1, record set, new_record', a1.sessions === 1 && a1.record === 'ددلیفت 85 کیلو' && a1.new_record === true, a1);
  check('a2 zero stats', a2.adherence === 0 && a2.weight_delta === null && a2.record === null, a2);

  // 7. Category
  const cat = await req('PATCH', `/coach/athletes/${aths[0].id}/category`, cTok, { category: 'حجم' });
  check('set category', cat.status === 200, cat.data);
  const list2 = await req('GET', '/coach/athletes', cTok);
  check('category persisted', list2.data.athletes.find(x => x.id === aths[0].id).category === 'حجم', list2.data);

  // 8. Detail endpoint
  const det = await req('GET', `/coach/athletes/${aths[0].id}/detail`, cTok);
  check('detail: adherence breakdown', det.data.adherence.exercise.pct === 67 &&
    det.data.adherence.diet.pct === 7 && det.data.adherence.overall === 37, det.data.adherence);
  check('detail: weight series + records + programs', det.data.weight_series.length === 2 &&
    det.data.records.length === 1 && det.data.programs.length === 1 && det.data.diets.length === 1, det.data);
  const detOther = await req('GET', `/coach/athletes/${aths[5].id}/detail`, cTok);
  check('detail of unlinked athlete → 404', detOther.status === 404, detOther);

  // 9. /workouts/athletes returns all 5 linked athletes (for send dialog)
  const wa = await req('GET', '/workouts/athletes', cTok);
  check('workouts/athletes = 5', wa.data.athletes.length === 5, wa.data);

  console.log('\nDone.');
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
