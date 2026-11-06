'use strict';
/* Pruebas del limitador de solicitudes y de su conexión con las rutas reales.
   No hay red: Supabase y el reloj están simulados. */

const rateLimit = require('./api/_lib/rate-limit');
const sb = require('./api/_lib/supabase');
const authHandler = require('./api/auth/[action]');
const dataHandler = require('./api/data/[action]');
const accountHandler = require('./api/account/[action]');

const ORIGIN = 'https://drakotrack.vercel.app';
const validDocument = { data: { workouts: [], sessions: [], prs: [], weights: [], hiddenLib: [] } };

let pass = 0;
let fail = 0;
function ok(condition, name) {
  if (condition) { pass += 1; console.log('  ok  ' + name); }
  else { fail += 1; console.log('  FAIL ' + name); }
}

let nowMs = Date.UTC(2026, 10, 2, 12, 0, 0);
let restCalls = [];
let rpcCalls = [];
let signInCalls = 0;
let signUpCalls = 0;
let sessionUser = { id: 'user-a', email: 'a@example.com' };

sb.hasServerKey = () => true;
sb.authenticatedSession = async () => (sessionUser ? { accessToken: 'access-token', user: sessionUser } : null);
sb.rest = async (path, options) => { restCalls.push({ path, options }); return { ok: true, status: 204, json: async () => [] }; };
sb.rpcAuthed = async (name, body = {}) => {
  rpcCalls.push({ name, body });
  if (name === 'dt_save_app_data') return { ok: true, json: async () => ({ ok: true, rev: 1, replay: false }) };
  if (name === 'dt_app_data_history') return { ok: true, json: async () => [] };
  if (name === 'dt_restore_app_data') return { ok: true, json: async () => ({ ok: true, rev: 2, restored: 1 }) };
  return { ok: true, json: async () => ({ ok: true }) };
};
sb.auth = async () => ({ ok: true, status: 200, json: async () => ({}) });
sb.signIn = async () => {
  signInCalls += 1;
  return { response: { ok: true, status: 200 }, data: { user: { id: 'user-a', email: 'a@example.com' }, access_token: 'a', refresh_token: 'r' } };
};
sb.signUp = async () => {
  signUpCalls += 1;
  return { response: { ok: true, status: 201 }, data: { user: { id: 'user-a', email: 'a@example.com' }, access_token: 'a', refresh_token: 'r' } };
};

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

function fresh() {
  rateLimit.__test.reset();
  rateLimit.__test.setClock(() => nowMs);
  restCalls = [];
  rpcCalls = [];
  signInCalls = 0;
  signUpCalls = 0;
  sessionUser = { id: 'user-a', email: 'a@example.com' };
}

function credentials(email = 'a@example.com', password = 'secret123') {
  return { email, password, consent: { version: '2026-10-28', at: '2026-10-28T00:00:00.000Z', terms: true, age16: true, health: true } };
}

function request({ method = 'POST', action, body, ip = '203.0.113.10', headers = {} } = {}) {
  return {
    method,
    query: { action },
    body,
    headers: { origin: ORIGIN, host: 'drakotrack.vercel.app', 'x-real-ip': ip, ...headers },
  };
}

async function call(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

const signIn = (options = {}) => call(authHandler, request({ action: 'signin', body: credentials(), ...options }));
const signUp = (options = {}) => call(authHandler, request({ action: 'signup', body: credentials(), ...options }));
const recover = (options = {}) => call(authHandler, request({ action: 'recover', body: { email: 'a@example.com' }, ...options }));
const readData = (options = {}) => call(dataHandler, request({ method: 'GET', action: 'profile', ...options }));
const writeData = (options = {}) => call(dataHandler, request({ method: 'PUT', action: 'profile', body: { ...validDocument, base_rev: 0 }, ...options }));
const deleteData = (options = {}) => call(dataHandler, request({ method: 'DELETE', action: 'profile', ...options }));
const deleteAccount = (options = {}) => call(accountHandler, request({ method: 'DELETE', action: 'delete', ...options }));

function bodyOf(res) {
  try { return JSON.parse(res.body || '{}'); } catch (_) { return null; }
}

(async () => {
  console.log('rate limiting');

  // ---- políticas coherentes con el uso real ---------------------------------
  const names = Object.keys(rateLimit.POLICIES);
  ok(names.length >= 10, 'declara una política por tipo de operación');
  ok(names.every(name => {
    const policy = rateLimit.POLICIES[name];
    return Number.isInteger(policy.limit) && policy.limit > 0 &&
      Number.isInteger(policy.windowSec) && policy.windowSec >= 60 && policy.windowSec <= 3600 &&
      (policy.scope === 'ip' || policy.scope === 'user');
  }), 'cada política tiene límite, ventana y ámbito válidos');
  ok(rateLimit.POLICIES['data:write'].limit >= Math.ceil(60000 / 1500),
    'la escritura admite todo el ritmo del debounce de sincronización (1,5 s)');
  ok(rateLimit.POLICIES['data:delete'].limit < rateLimit.POLICIES['data:write'].limit &&
    rateLimit.POLICIES['account:delete'].limit < rateLimit.POLICIES['data:delete'].limit + 1,
    'las operaciones destructivas tienen límites más estrictos que las lecturas');

  // ---- 1. una solicitud normal se acepta -----------------------------------
  fresh();
  let res = await signIn();
  ok(res.statusCode === 200 && signInCalls === 1, 'una solicitud normal se acepta');
  ok(!('retry-after' in res.headers), 'la respuesta aceptada no lleva Retry-After');

  // ---- 2. las repetidas terminan en 429 ------------------------------------
  fresh();
  const firstTen = [];
  for (let i = 0; i < 10; i += 1) firstTen.push((await signIn()).statusCode);
  ok(firstTen.every(code => code === 200), 'los 10 intentos de inicio de sesión permitidos pasan');
  res = await signIn();
  const blocked = bodyOf(res);
  ok(res.statusCode === 429, 'el intento 11 devuelve 429');
  ok(blocked && blocked.error === 'rate_limited', 'el cuerpo usa el formato de error habitual');
  ok(typeof blocked.message === 'string' && /Demasiadas solicitudes/.test(blocked.message), 'el mensaje es genérico y claro');
  ok(Number(res.headers['retry-after']) >= 1 && Number(res.headers['retry-after']) <= 300, 'Retry-After indica los segundos restantes');
  ok(blocked.retry_after === Number(res.headers['retry-after']), 'el cuerpo y la cabecera coinciden');
  ok(res.headers['content-type'] === 'application/json; charset=utf-8' && res.headers['cache-control'] === 'private, no-store',
    'las cabeceras del 429 no permiten caché');
  ok(signInCalls === 10, 'las solicitudes bloqueadas no llegan a Supabase');
  ok(!/stack|supabase|token|password/i.test(res.body), 'la respuesta no filtra detalles internos');
  ok(!('account_exists' in blocked), 'no revela si la cuenta existe');

  // ---- 3. la ventana se restablece -----------------------------------------
  nowMs += 300 * 1000;
  res = await signIn();
  ok(res.statusCode === 200, 'al terminar la ventana el usuario vuelve a entrar');
  nowMs = Date.UTC(2026, 10, 2, 12, 0, 0);

  // ---- 4. cada endpoint aplica su propio límite -----------------------------
  fresh();
  const codes = [];
  for (let i = 0; i < 6; i += 1) codes.push((await signUp()).statusCode);
  ok(codes.slice(0, 5).every(code => code === 201) && codes[5] === 429,
    'signup permite 5 altas por hora y bloquea la sexta');
  ok(signInCalls === 0, 'el límite de signup no consume el de signin');

  fresh();
  const recoverCodes = [];
  for (let i = 0; i < 4; i += 1) recoverCodes.push((await recover()).statusCode);
  ok(recoverCodes.slice(0, 3).every(code => code === 200) && recoverCodes[3] === 429,
    'recover permite 3 correos cada 15 minutos');
  ok(signUpCalls === 0, 'el límite de recover es independiente del alta');

  fresh();
  const writeCodes = [];
  for (let i = 0; i < 61; i += 1) writeCodes.push((await writeData({ ip: '198.51.100.2' })).statusCode);
  ok(writeCodes.slice(0, 60).every(code => code === 200) && writeCodes[60] === 429,
    'la escritura de datos permite 60 sincronizaciones por minuto');
  ok(rpcCalls.length === 60, 'la escritura bloqueada no llega a Supabase');

  fresh();
  const deleteCodes = [];
  for (let i = 0; i < 6; i += 1) deleteCodes.push((await deleteData({ ip: '198.51.100.3' })).statusCode);
  ok(deleteCodes.slice(0, 5).every(code => code === 204) && deleteCodes[5] === 429,
    'el borrado de datos se limita a 5 por hora');

  fresh();
  const accountCodes = [];
  for (let i = 0; i < 4; i += 1) accountCodes.push((await deleteAccount({ ip: '198.51.100.4' })).statusCode);
  ok(accountCodes.slice(0, 3).every(code => code === 200) && accountCodes[3] === 429,
    'el borrado de cuenta se limita a 3 por hora');

  fresh();
  const readCodes = [];
  for (let i = 0; i < 121; i += 1) readCodes.push((await readData({ ip: '198.51.100.5' })).statusCode);
  ok(readCodes.slice(0, 120).every(code => code === 200) && readCodes[120] === 429,
    'la lectura de datos permite 120 consultas por minuto');

  // ---- 5. no se elude cambiando parámetros ----------------------------------
  fresh();
  for (let i = 0; i < 10; i += 1) await signIn({ ip: '198.51.100.9' });
  res = await signIn({
    ip: '198.51.100.9',
    action: 'signin',
    headers: { 'x-forwarded-for': '9.9.9.9', 'x-vercel-forwarded-for': '9.9.9.9' },
  });
  ok(res.statusCode === 429, 'un x-forwarded-for falso no crea un cubo nuevo');
  fresh();
  const spoofedUser = await call(dataHandler, {
    method: 'GET', query: { action: 'profile', user_id: 'other-user', ip: '9.9.9.9' },
    headers: { origin: ORIGIN, 'x-real-ip': '198.51.100.9' },
  });
  ok(spoofedUser.statusCode === 200 && restCalls.length === 1 && /user_id=eq\.user-a/.test(restCalls[0].path),
    'la identidad autenticada sale de la sesión, no de la URL');
  ok(!rateLimit.__test.bucketFor('api:ip', { req: { headers: { 'x-real-ip': '198.51.100.9' } } }).includes('198.51.100.9'),
    'los cubos guardan un hash, no la IP');
  ok(rateLimit.trustedIp({ socket: { remoteAddress: '10.0.0.7' } }) === '10.0.0.7', 'usa la IP del socket si falta la cabecera de plataforma');
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  process.env.NODE_ENV = 'production';
  process.env.VERCEL = '1';
  ok(rateLimit.trustedIp({ headers: { 'x-forwarded-for': '9.9.9.9' } }) === 'unknown',
    'en producción solo se acepta la IP de la plataforma');
  if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.VERCEL === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalEnv.VERCEL;

  // ---- 6. los endpoints protegidos siguen exigiendo sesión ------------------
  fresh();
  sessionUser = null;
  ok((await readData()).statusCode === 401, 'leer datos sin sesión sigue dando 401');
  ok((await writeData()).statusCode === 401, 'escribir datos sin sesión sigue dando 401');
  ok((await deleteData()).statusCode === 401, 'borrar datos sin sesión sigue dando 401');
  ok((await deleteAccount()).statusCode === 401, 'borrar la cuenta sin sesión sigue dando 401');
  res = await call(authHandler, request({ action: 'change-password', body: { password: 'nueva1234', current_password: 'vieja1234' } }));
  ok(res.statusCode === 401, 'cambiar la contraseña sin sesión sigue dando 401');
  ok(restCalls.length === 0 && rpcCalls.length === 0, 'ninguna operación protegida llegó a Supabase sin sesión');

  // ---- 7. el uso legítimo no se bloquea antes de tiempo ---------------------
  fresh();
  const legit = [];
  for (let i = 0; i < 9; i += 1) legit.push((await signIn({ ip: '198.51.100.20' })).statusCode);
  ok(legit.every(code => code === 200), 'nueve intentos legítimos seguidos siguen pasando');

  fresh();
  const burst = [];
  for (let i = 0; i < 45; i += 1) burst.push((await writeData({ ip: '198.51.100.21' })).statusCode);
  ok(burst.every(code => code === 200), 'una sesión de entrenamiento con muchas series sincroniza sin bloqueos');

  fresh();
  sessionUser = { id: 'user-a', email: 'a@example.com' };
  for (let i = 0; i < 61; i += 1) await writeData({ ip: '198.51.100.22' });
  sessionUser = { id: 'user-b', email: 'b@example.com' };
  res = await writeData({ ip: '198.51.100.22' });
  ok(res.statusCode === 200, 'agotar el límite de un usuario no bloquea a otro en la misma IP');

  // ---- 8. los errores del almacén fallan cerrado ---------------------------
  fresh();
  rateLimit.__test.setStore({ kind: 'roto', async bump() { throw new Error('store down'); } });
  res = await signIn({ ip: '198.51.100.30' });
  ok(res.statusCode === 503, 'un fallo del almacén devuelve 503, no deja pasar');
  ok(bodyOf(res).error === 'rate_limit_unavailable', 'el 503 usa un error estable');
  ok(Number(res.headers['retry-after']) >= 1, 'el 503 invita a reintentar más tarde');
  ok(signInCalls === 0, 'con el almacén caído no se ejecuta la operación protegida');
  res = await writeData({ ip: '198.51.100.30' });
  ok(res.statusCode === 503 && restCalls.length === 0 && rpcCalls.length === 0, 'tampoco se escribe en Supabase si el almacén falla');

  // el límite global por IP se aplica antes que el de la operación concreta
  fresh();
  rateLimit.__test.setStore({
    kind: 'sonda',
    async bump(bucket) {
      return bucket.startsWith('api:ip|') ? { hits: 601, resetInSec: 30 } : { hits: 1, resetInSec: 30 };
    },
  });
  res = await signIn({ ip: '198.51.100.41' });
  ok(res.statusCode === 429 && Number(res.headers['retry-after']) === 30, 'la protección global por IP se aplica a todas las rutas');
  ok(signInCalls === 0, 'la protección global por IP corta antes de tocar Supabase');

  // ---- 9. almacén compartido de Supabase ----------------------------------
  fresh();
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  rateLimit.__test.reset();
  ok(rateLimit.__test.storeKind() === 'memory', 'sin clave secreta usa el almacén en memoria');

  fresh();
  process.env.SUPABASE_SECRET_KEY = 'clave-de-prueba';
  rateLimit.__test.reset();
  ok(rateLimit.__test.storeKind() === 'supabase', 'con clave secreta usa el almacén compartido de Supabase');
  const realFetch = global.fetch;
  let rpc = null;
  global.fetch = async (url, options) => { rpc = { url: String(url), options }; return { ok: false, status: 500 }; };
  res = await signIn({ ip: '198.51.100.40' });
  ok(res.statusCode === 503, 'si el almacén compartido responde con error, la operación se bloquea');
  ok(rpc && /\/rest\/v1\/rpc\/rate_limit_hit$/.test(rpc.url), 'usa el RPC dedicado y no la tabla directamente');
  ok(rpc && rpc.options.headers.Authorization === 'Bearer clave-de-prueba', 'presenta la clave de servidor al RPC');
  ok(rpc && !('password' in JSON.parse(rpc.options.body)) && !("email" in JSON.parse(rpc.options.body)),
    'al RPC solo viaja el cubo hasheado, sin correo ni contraseña');
  global.fetch = realFetch;
  delete process.env.SUPABASE_SECRET_KEY;
  rateLimit.__test.reset();
  sessionUser = { id: 'user-a', email: 'a@example.com' };

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(error => { console.error('CRASH', error); process.exit(2); });
