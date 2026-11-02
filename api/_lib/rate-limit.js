'use strict';

/* Limitación de solicitudes de la API pública.
   -------------------------------------------------------------------------
   Dos almacenes posibles:

   1. Supabase (`rate_limit_hit`, SECURITY DEFINER sobre `public.rate_limits`).
      Es el único compartido entre instancias de Vercel, así que es el que hay
      que usar en producción. Se activa solo cuando existe una clave secreta
      de servidor (`SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`).
   2. Memoria del proceso, usada en desarrollo y como respaldo mientras no haya
      clave secreta. En Vercel cada instancia tiene su propio contador, así que
      los límites reales son (instancias × límite): mitiga ráfagas, no ataques
      coordinados. El módulo lo avisa una vez por proceso.

   Identidad: nunca se acepta un identificador enviado por el cliente. Las
   operaciones sin sesión usan la IP que pone la plataforma (`x-real-ip`), y las
   autenticadas el id del usuario validado contra Supabase. Todo se guarda como
   hash con sal, así que ni la base ni los contadores contienen IPs o correos.
   Si el almacén falla se responde 503: nunca se deja pasar una operación
   protegida sin contar. */

const crypto = require('crypto');
const { json } = require('../../lib/security');
const { URL: SUPABASE_URL } = require('./supabase');

/* Límites calculados con el uso real de la app:
   - La sincronización se agrupa con 1500 ms de debounce (scheduleCloudSync),
     así que 60 escrituras/min por usuario es el doble del máximo teórico.
   - La sesión se consulta al abrir la app y al volver a ella: 120/min sobra.
   - El inicio de sesión permite 10 intentos cada 5 minutos por IP: cubre
     errores de tecleo y varios usuarios tras la misma IP (gimnasio, casa).
   - Recuperación de contraseña: 3 cada 15 minutos por IP; es lo que evita el
     envío masivo de correos.
   - Borrado de datos y de cuenta son raros y destructivos: ventanas largas. */
const POLICIES = Object.freeze({
  'api:ip': { limit: 600, windowSec: 60, scope: 'ip' },
  'auth:session': { limit: 120, windowSec: 60, scope: 'ip' },
  'auth:signin': { limit: 10, windowSec: 300, scope: 'ip' },
  'auth:signup': { limit: 5, windowSec: 3600, scope: 'ip' },
  'auth:recover': { limit: 3, windowSec: 900, scope: 'ip' },
  'auth:reset': { limit: 5, windowSec: 900, scope: 'ip' },
  'auth:signout': { limit: 30, windowSec: 60, scope: 'ip' },
  'auth:change-password': { limit: 5, windowSec: 900, scope: 'user' },
  'data:read': { limit: 120, windowSec: 60, scope: 'user' },
  'data:write': { limit: 60, windowSec: 60, scope: 'user' },
  'data:delete': { limit: 5, windowSec: 3600, scope: 'user' },
  'account:delete': { limit: 3, windowSec: 3600, scope: 'user' },
});

const UNKNOWN_IP = 'unknown';
const MEMORY_LIMIT = 5000;
const SWEEP_EVERY = 500;

let clock = () => Date.now();
let saltValue = null;
let selectedStore = null;

function secretKey() {
  return String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
}

function headerValue(req, name) {
  const raw = req && req.headers ? req.headers[name] : undefined;
  if (Array.isArray(raw)) return raw.length ? String(raw[0]) : '';
  return typeof raw === 'string' ? raw : '';
}

/* `x-real-ip` lo sobreescribe la plataforma con la dirección que vio, así que un
   cliente no puede elegir su propio cubo. `x-forwarded-for` solo se mira en
   local, nunca en producción ni en preview. */
function trustedIp(req) {
  const real = headerValue(req, 'x-real-ip').trim();
  if (real) return real;
  const socket = req && req.socket && typeof req.socket.remoteAddress === 'string' ? req.socket.remoteAddress : '';
  if (socket) return socket;
  if (!process.env.VERCEL) {
    const forwarded = headerValue(req, 'x-forwarded-for').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return UNKNOWN_IP;
}

function salt() {
  if (saltValue) return saltValue;
  const secret = secretKey();
  saltValue = secret
    ? crypto.createHash('sha256').update('drakotrack-rate-limit:' + secret).digest('hex')
    : crypto.randomBytes(16).toString('hex');
  return saltValue;
}

function digest(value) {
  return crypto.createHash('sha256').update(salt() + ':' + value).digest('hex').slice(0, 32);
}

function memoryStore() {
  const buckets = new Map();
  let sinceSweep = 0;
  return {
    kind: 'memory',
    async bump(bucket, windowSec) {
      const windowMs = windowSec * 1000;
      const now = clock();
      const start = Math.floor(now / windowMs) * windowMs;
      const previous = buckets.get(bucket);
      const record = previous && previous.start === start ? previous : { start, hits: 0, expiresAt: start + windowMs };
      record.hits += 1;
      buckets.set(bucket, record);
      if (++sinceSweep >= SWEEP_EVERY) {
        sinceSweep = 0;
        for (const [key, value] of buckets) if (value.expiresAt <= now) buckets.delete(key);
        if (buckets.size > MEMORY_LIMIT) {
          for (const key of buckets.keys()) {
            buckets.delete(key);
            if (buckets.size <= MEMORY_LIMIT) break;
          }
        }
      }
      return { hits: record.hits, resetInSec: Math.max(1, Math.ceil((record.expiresAt - now) / 1000)) };
    },
  };
}

function supabaseStore(url, key) {
  return {
    kind: 'supabase',
    async bump(bucket, windowSec, limit) {
      const response = await fetch(`${url}/rest/v1/rpc/rate_limit_hit`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p_bucket: bucket, p_window: windowSec, p_limit: limit }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('rate_limit_store_unavailable');
      const payload = await response.json().catch(() => null);
      const row = Array.isArray(payload) ? payload[0] : payload;
      if (!row || !Number.isFinite(Number(row.hits))) throw new Error('rate_limit_store_invalid');
      return { hits: Number(row.hits), resetInSec: Number(row.reset_in) || windowSec };
    },
  };
}

function activeStore() {
  if (selectedStore) return selectedStore;
  if (secretKey()) {
    selectedStore = supabaseStore(SUPABASE_URL.replace(/\/+$/, ''), secretKey());
  } else {
    selectedStore = memoryStore();
    if (process.env.VERCEL) {
      console.warn('[rate-limit] SUPABASE_SECRET_KEY no está configurada: los límites se aplican por instancia.');
    }
  }
  return selectedStore;
}

function bucketFor(name, options) {
  const policy = POLICIES[name];
  if (!policy) throw new Error('unknown_rate_limit_policy');
  if (policy.scope === 'user') {
    const userId = options && options.userId;
    if (!userId) throw new Error('rate_limit_requires_user');
    return { bucket: `${name}|user:${digest(String(userId))}`, policy };
  }
  const ip = trustedIp(options && options.req);
  return { bucket: `${name}|ip:${ip === UNKNOWN_IP ? UNKNOWN_IP : digest(ip)}`, policy };
}

/* Devuelve true cuando ya respondió (429 o 503) y el handler debe salir. */
async function enforce(req, res, name, options = {}) {
  const { bucket, policy } = bucketFor(name, { req, userId: options.userId });
  let result;
  try {
    result = await activeStore().bump(bucket, policy.windowSec, policy.limit);
  } catch (error) {
    console.error('[rate-limit] almacén no disponible:', error && error.message);
    res.setHeader('Retry-After', '30');
    json(res, 503, {
      error: 'rate_limit_unavailable',
      message: 'La protección contra abusos no está disponible ahora mismo. Inténtalo de nuevo en unos segundos.',
    });
    return true;
  }
  if (result.hits <= policy.limit) return false;
  const retryAfter = Math.max(1, Math.min(86400, Math.ceil(result.resetInSec || policy.windowSec)));
  res.setHeader('Retry-After', String(retryAfter));
  json(res, 429, {
    error: 'rate_limited',
    message: 'Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentarlo.',
    retry_after: retryAfter,
  });
  return true;
}

const __test = {
  reset() {
    selectedStore = null;
    saltValue = null;
    clock = () => Date.now();
  },
  setStore(store) { selectedStore = store; },
  setClock(fn) { clock = fn || (() => Date.now()); },
  storeKind() { return activeStore().kind; },
  bucketFor(name, options = {}) { return bucketFor(name, options).bucket; },
  trustedIp,
};

module.exports = { POLICIES, UNKNOWN_IP, enforce, bucketFor, trustedIp, __test };
