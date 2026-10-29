/* End-to-end test of the chat API */
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
  // 1. Signup coach + athlete
  const c = await req('POST', '/auth/signup', null, {
    role: 'coach', first: 'علی', last: 'رضایی', email: `coach${stamp}@t.ir`, password: '123456',
  });
  check('signup coach', c.status === 201, c.data);
  const a = await req('POST', '/auth/signup', null, {
    role: 'athlete', first: 'سارا', last: 'محمدی', email: `ath${stamp}@t.ir`, password: '123456', height: 170, weight: 65,
  });
  check('signup athlete', a.status === 201, a.data);

  const coach = c.data.user; const ath = a.data.user;
  const cTok = c.data.token; const aTok = a.data.token;
  check('tokens returned', !!cTok && !!aTok, c.data);

  // 2. Coach creates program and assigns it → should auto-link coach_athletes
  const prog = await req('POST', '/workouts/programs', cTok, { name: 'برنامه حجم', weeks: 4 });
  check('create program', prog.status === 201, prog.data);
  const asg = await req('POST', `/workouts/programs/${prog.data.program.id}/assign`, cTok, { athlete_id: ath.id });
  check('assign program', asg.status === 200, asg.data);

  // 3. Conversations (before any message)
  const cc1 = await req('GET', '/chat/conversations', cTok);
  check('coach sees athlete conv', cc1.status === 200 && cc1.data.conversations.length === 1 &&
    cc1.data.conversations[0].id === ath.id, cc1.data);
  const ac1 = await req('GET', '/chat/conversations', aTok);
  check('athlete sees coach conv', ac1.status === 200 && ac1.data.conversations[0].id === coach.id, ac1.data);

  // 4. Access control: stranger is blocked
  const s = await req('POST', '/auth/signup', null, {
    role: 'athlete', first: 'غریبه', last: 'غریبه', email: `str${stamp}@t.ir`, password: '123456',
  });
  const sDm = await req('POST', '/chat/messages', s.data.token, { receiver_id: coach.id, text: 'سلام' });
  check('stranger DM blocked (403)', sDm.status === 403, sDm);

  // 5. Athlete sends priority DM
  const dm1 = await req('POST', '/chat/messages', aTok, { receiver_id: coach.id, text: 'تمرین امروز رو فردا انجام بدم؟', is_priority: true });
  check('athlete DM sent', dm1.status === 201, dm1.data);

  const cc2 = await req('GET', '/chat/conversations', cTok);
  const conv = cc2.data.conversations[0];
  check('coach sees last_text + pending', conv.last_text === 'تمرین امروز رو فردا انجام بدم؟' && conv.unread === 1 && conv.pending_priority === 1, cc2.data);

  // 6. Coach opens thread → marks read
  const th = await req('GET', `/chat/messages/${ath.id}`, cTok);
  check('coach thread history', th.status === 200 && th.data.messages.length === 1 && th.data.messages[0].text.includes('تمرین'), th.data);
  const cc3 = await req('GET', '/chat/conversations', cTok);
  check('unread cleared after read', cc3.data.conversations[0].unread === 0, cc3.data);

  // 7. Coach replies → priority answered
  const dm2 = await req('POST', '/chat/messages', cTok, { receiver_id: ath.id, text: 'مشکلی نیست، جابه‌جا کن.' });
  check('coach reply sent', dm2.status === 201, dm2.data);

  // 9. unread counter (before athlete reads the thread)
  const un = await req('GET', '/chat/unread', aTok);
  check('athlete unread = 1 (coach reply)', un.data.unread === 1, un.data);

  const athTh = await req('GET', `/chat/messages/${coach.id}`, aTok);
  check('athlete sees 2 msgs, coach msg is mine=false',
    athTh.data.messages.length === 2 && athTh.data.messages[1].mine === false, athTh.data);
  const cc4 = await req('GET', '/chat/conversations', cTok);
  check('priority answered after reply', cc4.data.conversations[0].pending_priority === 0, cc4.data);

  // 8. Forums
  const f1 = await req('POST', '/chat/forums', cTok, { name: 'گروه حجم' });
  check('coach creates forum', f1.status === 201, f1.data);
  const fid = f1.data.forum.id;
  const fa1 = await req('POST', `/chat/forums/${fid}/messages`, cTok, { text: 'وزنه‌ها رو ثبت کنید' });
  check('coach posts to forum', fa1.status === 201, fa1.data);
  const fa2 = await req('POST', `/chat/forums/${fid}/messages`, aTok, { text: 'چشم مربی!' });
  check('athlete posts to forum', fa2.status === 201, fa2.data);

  const fl = await req('GET', '/chat/forums', aTok);
  check('athlete lists coach forum', fl.status === 200 && fl.data.forums.some(f => f.id === fid && f.members === 1), fl.data);
  const fm = await req('GET', `/chat/forums/${fid}/messages`, aTok);
  check('forum history w/ sender names',
    fm.data.messages.length === 2 &&
    fm.data.messages[0].sender_name === 'علی رضایی' && fm.data.messages[0].sender_role === 'coach' &&
    fm.data.messages[1].mine === true, fm.data);

  // stranger can't read forum
  const fS = await req('GET', `/chat/forums/${fid}/messages`, s.data.token);
  check('stranger forum blocked (404)', fS.status === 404, fS);

  // unread cleared after athlete reads the DM thread
  const un2 = await req('GET', '/chat/unread', aTok);
  check('athlete unread cleared after read', un2.data.unread === 0, un2.data);

  console.log('\nDone.');
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
