'use strict';
/* Live end-to-end test against the real Supabase project.
   node test-backend.js signup|verify|cleanup
   Uses the configured public key from the environment; never read credentials from app source. */
const fs = require('fs');
const SB = 'https://rxamdcgcpjzfeygxeukj.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
if (process.argv[2] && !KEY) { console.error('Set SUPABASE_PUBLISHABLE_KEY in the environment before running a live test.'); process.exit(2); }
const phase = process.argv[2];

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const hdr = extra => Object.assign({ 'apikey': KEY, 'Content-Type': 'application/json' }, extra || {});
const state = () => JSON.parse(fs.readFileSync('test-users.json', 'utf8'));
const done = () => { console.log(`PHASE ${phase}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

(async () => {
  if (phase === 'signup') {
    const crypto = require('crypto');
    const rand = () => crypto.randomBytes(6).toString('hex');
    const a = `dt-test-a-${rand()}@drakotrack.test`;
    const b = `dt-test-b-${rand()}@drakotrack.test`;
    const pw = 'TestPass123!';
    fs.writeFileSync('test-users.json', JSON.stringify({ a, b, pw }));
    let res = await fetch(SB + '/auth/v1/signup', { method: 'POST', headers: hdr(), body: JSON.stringify({ email: a, password: pw }) });
    check('signup A created (' + res.status + ')', res.ok);
    const su = await res.json().catch(() => ({}));
    check('signup returns session immediately (autoconfirm on)', !!su.access_token && !!su.refresh_token && !!su.user);
    res = await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: hdr(), body: JSON.stringify({ email: a, password: pw }) });
    check('password grant works right after signup (' + res.status + ')', res.ok);
    res = await fetch(SB + '/auth/v1/signup', { method: 'POST', headers: hdr(), body: JSON.stringify({ email: b, password: pw }) });
    check('signup B created', res.ok);
    res = await fetch(SB + '/auth/v1/recover', { method: 'POST', headers: hdr(), body: JSON.stringify({ email: 'nobody-' + rand() + '@drakotrack.test', email_redirect_to: 'https://drakotrack.vercel.app' }) });
    check('recover answers (' + res.status + ')', res.status === 200 || res.status === 400 || res.status === 422);
    return done();
  }

  const { a, b, pw } = state();
  const login = async mail => {
    const res = await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: hdr(), body: JSON.stringify({ email: mail, password: pw }) });
    if (!res.ok) return null;
    return res.json();
  };

  if (phase === 'verify') {
    const sa = await login(a);
    check('login A after confirmation', !!sa && !!sa.access_token);
    const sb = await login(b);
    check('login B after confirmation', !!sb && !!sb.access_token);
    if (!sa) return done();

    const authA = { Authorization: 'Bearer ' + sa.access_token };
    const authB = { Authorization: 'Bearer ' + sb.access_token };
    const docA = { workouts: [{ id: 'w1', name: 'A solo para A', exercises: [] }], sessions: [{ id: 's1', finished: true, date: '2026-10-25' }], prs: [], weights: [{ id: 'p1', date: '2026-10-25', weight: 80 }], photo: null, hiddenLib: [] };

    // upsert A's doc
    let res = await fetch(SB + '/rest/v1/app_data', { method: 'POST', headers: hdr(Object.assign({ Prefer: "resolution=merge-duplicates,return=minimal" }, authA)), body: JSON.stringify([{ user_id: sa.user.id, data: docA }]) });
    check('upsert A (' + res.status + ')', res.ok || res.status === 201);

    // A reads own row
    res = await fetch(SB + '/rest/v1/app_data?user_id=eq.' + sa.user.id + '&select=data,updated_at', { headers: hdr(authA) });
    let rows = await res.json().catch(() => []);
    check('A reads own row', res.ok && rows.length === 1 && rows[0].data.workouts[0].name === 'A solo para A');
    check('updated_at present', !!(rows[0] && rows[0].updated_at));

    // B tries to read A's row → empty (RLS)
    res = await fetch(SB + '/rest/v1/app_data?user_id=eq.' + sa.user.id + '&select=user_id,data', { headers: hdr(authB) });
    rows = await res.json().catch(() => []);
    check('RLS: B cannot see A row (' + JSON.stringify(rows) + ')', Array.isArray(rows) && rows.length === 0);

    // B tries to write into A's row → rejected by with check
    res = await fetch(SB + '/rest/v1/app_data', { method: 'POST', headers: hdr(Object.assign({ Prefer: "resolution=merge-duplicates,return=minimal" }, authB)), body: JSON.stringify([{ user_id: sa.user.id, data: { hacked: true } }]) });
    check('RLS: B cannot write A row (status ' + res.status + ')', !res.ok);

    // anon (no session) reads nothing
    res = await fetch(SB + '/rest/v1/app_data?select=user_id', { headers: hdr() });
    rows = await res.json().catch(() => []);
    check('anon without session sees no rows', res.ok && Array.isArray(rows) && rows.length === 0);

    // update A doc (second write merges)
    docA.weights.push({ id: 'p2', date: '2026-10-25', weight: 81.5 });
    res = await fetch(SB + '/rest/v1/app_data', { method: 'POST', headers: hdr(Object.assign({ Prefer: "resolution=merge-duplicates,return=minimal" }, authA)), body: JSON.stringify([{ user_id: sa.user.id, data: docA }]) });
    check('second upsert ok (' + res.status + ')', res.ok || res.status === 201);
    res = await fetch(SB + '/rest/v1/app_data?user_id=eq.' + sa.user.id + '&select=data', { headers: hdr(authA) });
    rows = await res.json().catch(() => []);
    check('doc roundtrip keeps arrays', rows.length === 1 && rows[0].data.weights.length === 2 && rows[0].data.workouts.length === 1);

    return done();
  }

  if (phase === 'cleanup') {
    console.log('cleanup is done via management SQL (integration tool)');
    return done();
  }
  console.log('unknown phase');
  process.exit(2);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
