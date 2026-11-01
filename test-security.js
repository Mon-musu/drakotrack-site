'use strict';
const assert = require('node:assert/strict');
const security = require('./lib/security');
const authHandler = require('./api/auth/[action]');
const dataHandler = require('./api/data/[action]');
const accountHandler = require('./api/account/[action]');
const sb = require('./api/_lib/supabase');
const { solveChallenge } = require('altcha-lib');
const { deriveKey } = require('altcha-lib/algorithms/pbkdf2');

/* Secreto HMAC de prueba: en producción viene de la variable de entorno
   ALTCHA_HMAC_SECRET, nunca del repositorio. */
process.env.ALTCHA_HMAC_SECRET = 'test-hmac-secret-' + 'a'.repeat(40);
const altcha = require('./api/_lib/altcha');

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}
async function call(handler, req) {
  const res = response();
  await handler({ headers: {}, query: {}, ...req }, res);
  return res;
}

(async () => {
  const valid = {
    workouts: [{ id: 'w1', name: 'Entreno', exercises: [{ id: 'e1', name: 'Sentadilla', sets: 4, reps: 8, weight: 50 }] }],
    sessions: [{ id: 's1', workoutId: 'w1', workoutName: 'Entreno', date: '2026-10-28', finished: true, exercises: [{ id: 'e1', name: 'Sentadilla', targetSets: 4, targetReps: 8, target: null, weight: 50, reps: 8, done: true }] }],
    prs: [{ id: 'p1', exercise: 'Sentadilla', date: '2026-10-28', weight: 100, reps: 1 }],
    weights: [{ id: 'x1', date: '2026-10-28', weight: 80 }],
    hiddenLib: ['lib-push'], photo: null,
    consent: { version: '2026-10-28', at: '2026-10-28T00:00:00.000Z', terms: true, age16: true, health: true },
  };
  assert.equal(security.validateData(valid), true, 'allows app profile shape');
  assert.equal(security.validateData({ ...valid, admin: true }), false, 'rejects unknown profile fields');
  assert.equal(security.validateData({ ...valid, workouts: [{ id: 'w1', name: 'x', exercises: [], role: 'admin' }] }), false, 'rejects unknown workout fields');
  assert.equal(security.validateData({ ...valid, prs: [{ id: 'p1', exercise: '<img>', date: '2026-10-28', weight: 100, reps: 1, user_id: 'victim' }] }), false, 'rejects user-controlled ownership fields');
  assert.equal(security.validateData({ ...valid, sessions: [{ ...valid.sessions[0], date: 'not-a-date' }] }), false, 'rejects invalid dates');
  assert.equal(security.validateData({ ...valid, weights: [{ id: 'x', date: '2026-10-28', weight: '999999999' }] }), false, 'requires numeric value within limits');
  assert.equal(security.validateData({ ...valid, photo: 'data:text/html;base64,SGVsbG8=' }), false, 'rejects non-image data URL');
  assert.equal(security.validateData({ ...valid, consent: { ...valid.consent, terms: false } }), false, 'rejects malformed consent');
  assert.equal(security.validateData({ workouts: [], sessions: [], prs: [], weights: [], hiddenLib: [], consent: { version: '1', at: '2026-10-28T00:00:00.000Z', terms: false, age16: true, health: true } }), false, 'rejects invalid consent when profile is otherwise empty');

  assert.equal(security.isSameOrigin({ headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' } }), true);
  assert.equal(security.isSameOrigin({ headers: { origin: 'https://evil.example', host: 'drakotrack.vercel.app' } }), false);
  assert.equal(security.isSameOrigin({ headers: { host: 'drakotrack.vercel.app' } }), false, 'rejects absent origin for cookie mutations');

  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const cookieRes = response();
  security.cookieSession(cookieRes, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
  assert.equal(cookieRes.headers['set-cookie'].length, 2);
  assert.ok(cookieRes.headers['set-cookie'].every(value => value.includes('HttpOnly') && value.includes('Secure') && value.includes('SameSite=Strict') && value.includes('Path=/')));
  const cookieHeader = cookieRes.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');
  assert.equal(security.readCookie({ headers: { cookie: cookieHeader } }, 'access'), 'access');
  assert.equal(security.readCookie({ headers: { cookie: 'dt_access=legacy' } }, 'access'), null, 'does not accept unprefixed production cookies');
  process.env.NODE_ENV = previousEnv;

  const origHasServerKey = sb.hasServerKey;
  const origIsSameOrigin = security.isSameOrigin;
  sb.hasServerKey = () => false;
  security.isSameOrigin = () => true;
  let res = await call(authHandler, { method: 'POST', query: { action: 'signin' }, headers: { origin: 'https://drakotrack.vercel.app' }, body: {} });
  assert.equal(res.statusCode, 503, 'auth API fails closed when server Supabase key missing');
  res = await call(dataHandler, { method: 'PUT', headers: { origin: 'https://drakotrack.vercel.app' }, body: {} });
  assert.equal(res.statusCode, 503, 'data API fails closed when server Supabase key missing');
  res = await call(accountHandler, { method: 'DELETE', headers: { origin: 'https://drakotrack.vercel.app' } });
  assert.equal(res.statusCode, 503, 'account API fails closed when server Supabase key missing');
  sb.hasServerKey = origHasServerKey;

  res = await call(authHandler, { method: 'POST', query: { action: 'signin' }, headers: { origin: 'https://evil.example' }, body: {} });
  assert.equal(res.statusCode, 403, 'auth API rejects cross-origin POST before auth upstream');
  res = await call(dataHandler, { method: 'PUT', headers: { origin: 'https://evil.example' }, body: {} });
  assert.equal(res.statusCode, 403, 'data API rejects cross-origin write before auth upstream');
  security.isSameOrigin = origIsSameOrigin;

  /* ---------------- Captcha ALTCHA del registro ---------------- */
  const originalRpc = sb.rpc;
  const originalSignUp = sb.signUp;
  const consumed = new Set();
  sb.rpc = async (name, body) => {
    if (name === 'altcha_register') return true;
    if (name === 'altcha_consume') {
      if (consumed.has(body.p_id)) return false;
      consumed.add(body.p_id);
      return true;
    }
    return null;
  };
  sb.hasServerKey = () => true;
  security.isSameOrigin = () => true;
  let signupCalls = 0;
  sb.signUp = async () => {
    signupCalls++;
    return { response: { ok: true, status: 200 }, data: { user: { id: '11111111-2222-3333-4444-555555555555', email: 'nuevo@drakotrack.test' }, access_token: 'at', refresh_token: 'rt', expires_in: 3600 } };
  };

  res = await call(authHandler, { method: 'GET', query: { action: 'challenge' } });
  assert.equal(res.statusCode, 200, 'issues a captcha challenge');
  const challenge = JSON.parse(res.body);
  assert.equal(challenge.parameters.algorithm, 'PBKDF2/SHA-256', 'challenge uses the signed PoW algorithm');
  assert.equal(challenge.parameters.cost, altcha.COST, 'challenge carries the server-side cost');
  assert.ok(typeof challenge.signature === 'string' && challenge.signature.length >= 32, 'challenge is HMAC signed');
  const challengeId = challenge.parameters.data && challenge.parameters.data.challengeId;
  assert.match(String(challengeId), /^[A-Za-z0-9_-]{16,128}$/, 'challenge embeds its server-side id');
  assert.equal(res.headers['cache-control'], 'private, no-store', 'challenge is never cached');

  const solution = await solveChallenge({ challenge, deriveKey });
  assert.ok(solution, 'challenge can be solved by a real client');
  const proof = Buffer.from(JSON.stringify({ challenge, solution }), 'utf8').toString('base64');

  const signupBody = { email: 'nuevo@drakotrack.test', password: 'correct-horse-battery', consent: valid.consent, altcha: proof };
  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app' }, body: signupBody });
  assert.equal(res.statusCode, 201, 'signup accepts a valid captcha proof');
  assert.equal(signupCalls, 1, 'signup reaches Supabase only after captcha verification');

  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app' }, body: signupBody });
  assert.equal(res.statusCode, 400, 'replayed captcha proof is rejected');
  assert.equal(JSON.parse(res.body).error, 'captcha_failed');
  assert.equal(signupCalls, 1, 'replayed proof never creates an account');

  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app' }, body: { ...signupBody, altcha: undefined } });
  assert.equal(res.statusCode, 400, 'signup without captcha is rejected');
  assert.equal(JSON.parse(res.body).error, 'captcha_required');
  assert.equal(signupCalls, 1, 'missing captcha never creates an account');

  const tampered = JSON.parse(Buffer.from(proof, 'base64').toString('utf8'));
  tampered.challenge.parameters.cost = 1;
  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app' }, body: { ...signupBody, altcha: Buffer.from(JSON.stringify(tampered)).toString('base64') } });
  assert.equal(res.statusCode, 400, 'tampered challenge (lower cost) is rejected');
  assert.equal(signupCalls, 1, 'tampered proof never creates an account');

  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app' }, body: { ...signupBody, altcha: 'not-a-proof' } });
  assert.equal(res.statusCode, 400, 'malformed captcha payload is rejected');

  res = await call(authHandler, { method: 'POST', query: { action: 'challenge' } });
  assert.equal(res.statusCode, 405, 'challenge endpoint only answers GET');

  const savedSecret = process.env.ALTCHA_HMAC_SECRET;
  delete process.env.ALTCHA_HMAC_SECRET;
  res = await call(authHandler, { method: 'GET', query: { action: 'challenge' } });
  assert.equal(res.statusCode, 503, 'captcha fails closed when its secret is missing');
  assert.equal(JSON.parse(res.body).error, 'captcha_not_configured');
  process.env.ALTCHA_HMAC_SECRET = savedSecret;

  sb.rpc = originalRpc;
  sb.signUp = originalSignUp;
  sb.hasServerKey = origHasServerKey;
  security.isSameOrigin = origIsSameOrigin;

  console.log('security tests: 19 profile/API assertions + 17 captcha assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
