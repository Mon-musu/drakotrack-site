'use strict';
/* Clave pública ficticia: permite probar la fusión de metadata sin red ni
   credenciales reales. Si el entorno ya trae una, se respeta. */
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_test_only';
const assert = require('node:assert/strict');
const security = require('./lib/security');
const authHandler = require('./api/auth/[action]');
const dataHandler = require('./api/data/[action]');
const accountHandler = require('./api/account/[action]');
const sb = require('./api/_lib/supabase');

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

  const originEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.equal(security.isSameOrigin({ headers: { origin: 'https://preview-abc.vercel.app', host: 'preview-abc.vercel.app' } }), true, 'allows same-host Vercel previews');
  assert.equal(security.isSameOrigin({ headers: { origin: 'https://evil.example', host: 'preview-abc.vercel.app' } }), false, 'rejects a foreign origin even on a preview');
  assert.equal(security.isSameOrigin({ headers: { origin: 'http://preview-abc.vercel.app', host: 'preview-abc.vercel.app' } }), false, 'requires HTTPS in production');
  process.env.NODE_ENV = originEnv;

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

  const previousDtProduction = process.env.DT_PRODUCTION;
  process.env.DT_PRODUCTION = '1';
  const secureRuntimeRes = response();
  security.cookieSession(secureRuntimeRes, { access_token: 'a', refresh_token: 'r', expires_in: 3600 });
  assert.ok(secureRuntimeRes.headers['set-cookie'].every(value => value.startsWith('__Host-dt_') && value.includes('Secure')), 'HTTPS runtime sets __Host- Secure cookies');
  if (previousDtProduction === undefined) delete process.env.DT_PRODUCTION;
  else process.env.DT_PRODUCTION = previousDtProduction;

  const origHasServerKey = sb.hasServerKey;
  const origIsSameOrigin = security.isSameOrigin;
  sb.hasServerKey = () => false;
  security.isSameOrigin = () => true;
  let res = await call(authHandler, { method: 'POST', query: { action: 'signin' }, headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' }, body: {} });
  assert.equal(res.statusCode, 503, 'auth API fails closed when server Supabase key missing');
  res = await call(dataHandler, { method: 'PUT', query: { action: 'profile' }, headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' }, body: {} });
  assert.equal(res.statusCode, 503, 'data API fails closed when server Supabase key missing');
  res = await call(accountHandler, { method: 'DELETE', headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' } });
  assert.equal(res.statusCode, 503, 'account API fails closed when server Supabase key missing');
  sb.hasServerKey = origHasServerKey;

  res = await call(authHandler, { method: 'POST', query: { action: 'signin' }, headers: { origin: 'https://evil.example', host: 'drakotrack.vercel.app' }, body: {} });
  assert.equal(res.statusCode, 403, 'auth API rejects cross-origin POST before auth upstream');
  res = await call(dataHandler, { method: 'PUT', query: { action: 'profile' }, headers: { origin: 'https://evil.example', host: 'drakotrack.vercel.app' }, body: {} });
  assert.equal(res.statusCode, 403, 'data API rejects cross-origin write before auth upstream');
  security.isSameOrigin = origIsSameOrigin;

  /* ---------------- El registro ya no pide captcha ---------------- */
  const originalSignUp = sb.signUp;
  sb.hasServerKey = () => true;
  security.isSameOrigin = () => true;
  let signupCalls = 0;
  sb.signUp = async () => {
    signupCalls++;
    return { response: { ok: true, status: 200 }, data: { user: { id: '11111111-2222-3333-4444-555555555555', email: 'nuevo@drakotrack.test' }, access_token: 'at', refresh_token: 'rt', expires_in: 3600 } };
  };

  const signupBody = { email: 'nuevo@drakotrack.test', password: 'correct-horse-battery', consent: valid.consent };
  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' }, body: signupBody });
  assert.equal(res.statusCode, 201, 'signup creates the account without a captcha');
  assert.equal(signupCalls, 1, 'signup reaches Supabase on the first attempt');
  assert.equal(JSON.parse(res.body).user.email, 'nuevo@drakotrack.test', 'signup returns the safe user');

  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' }, body: { ...signupBody, altcha: 'stale-proof' } });
  assert.equal(res.statusCode, 201, 'a leftover captcha field is ignored, not rejected');

  res = await call(authHandler, { method: 'GET', query: { action: 'challenge' } });
  assert.equal(res.statusCode, 404, 'the captcha challenge endpoint is gone');

  res = await call(authHandler, { method: 'POST', query: { action: 'signup' }, headers: { origin: 'https://drakotrack.vercel.app', host: 'drakotrack.vercel.app' }, body: { ...signupBody, password: 'short' } });
  assert.equal(res.statusCode, 400, 'short passwords are still rejected');

  sb.signUp = originalSignUp;
  sb.hasServerKey = origHasServerKey;
  security.isSameOrigin = origIsSameOrigin;

  /* ---------------- Cambiar el nombre no borra el consentimiento ---------------- */
  const originalFetch = global.fetch;
  const originalHasKey = sb.hasServerKey;
  const profileCalls = [];
  sb.hasServerKey = () => true;
  global.fetch = async (url, options = {}) => {
    profileCalls.push({ url: String(url), options });
    if (!options.method || options.method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ id: 'u1', user_metadata: { drakotrack_consent: { version: '2026-10-28' }, tema: 'drako' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: 'u1', user_metadata: JSON.parse(options.body).data }) };
  };
  try {
    const updated = await sb.updateProfile('token', 'Nuevo Nombre');
    assert.equal(updated.response.ok, true);
    const put = profileCalls.find(call => call.options.method === 'PUT');
    assert.ok(put, 'profile update reaches the upstream PUT');
    const sent = JSON.parse(put.options.body).data;
    assert.equal(sent.username, 'Nuevo Nombre');
    assert.deepEqual(sent.drakotrack_consent, { version: '2026-10-28' }, 'keeps existing consent metadata');
    assert.equal(sent.tema, 'drako', 'keeps unrelated metadata');

    profileCalls.length = 0;
    global.fetch = async (url, options = {}) => {
      profileCalls.push({ url: String(url), options });
      return { ok: false, status: 401, json: async () => ({}) };
    };
    const denied = await sb.updateProfile('expired', 'Nuevo Nombre');
    assert.equal(denied.data, null);
    assert.equal(profileCalls.filter(call => call.options.method === 'PUT').length, 0, 'does not write when the session is invalid');
  } finally {
    global.fetch = originalFetch;
    sb.hasServerKey = originalHasKey;
  }

  console.log('security tests passed: profile/API, preview origin, metadata and signup assertions');
})().catch(error => { console.error(error); process.exitCode = 1; });
