'use strict';
/* ============================================================
   ALTCHA — captcha autohospedado (prueba de trabajo) para el registro
   ============================================================
   - El reto lo firma este servidor con HMAC: el cliente no puede bajar
     el coste ni el prefijo, porque la firma cubre todos los parámetros.
   - Cada reto lleva un id aleatorio firmado dentro de `parameters.data`
     y se registra en Supabase (`altcha_register`). Al verificar se marca
     como usado con una función atómica (`altcha_consume`), así una misma
     prueba no sirve dos veces aunque haya varias instancias del API.
   - El secreto HMAC vive solo en variables de entorno del servidor
     (`ALTCHA_HMAC_SECRET`). Nunca se envía al navegador ni al repositorio.
   Basado en https://altcha.org (MIT) y la librería `altcha-lib` v2.
   ============================================================ */

const crypto = require('crypto');
const { createChallenge, verifySolution } = require('altcha-lib');
const { deriveKey } = require('altcha-lib/algorithms/pbkdf2');
const sb = require('./supabase');

const ALGORITHM = 'PBKDF2/SHA-256';
/* Coste del PoW: ~200 ms en un móvil de gama media; un bot recibe el mismo coste. */
const COST = 5000;
const TTL_MS = 10 * 60 * 1000;          // el reto caduca en 10 minutos
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_PAYLOAD_CHARS = 8192;

/* Secreto HMAC del servidor. Sin él el registro no puede verificarse,
   así que se falla cerrado (503) en lugar de aceptar cuentas sin captcha. */
function hmacSecret() {
  const value = process.env.ALTCHA_HMAC_SECRET;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 32 ? trimmed : null;
}

function isConfigured() { return Boolean(hmacSecret()) && sb.hasServerKey(); }

function newId() { return crypto.randomBytes(24).toString('base64url'); }

/* Emite un reto firmado y lo registra para poder consumirlo una sola vez. */
async function create() {
  const secret = hmacSecret();
  if (!secret || !sb.hasServerKey()) return null;
  const challengeId = newId();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const challenge = await createChallenge({
    algorithm: ALGORITHM,
    cost: COST,
    deriveKey,
    expiresAt,
    hmacSignatureSecret: secret,
    data: { challengeId },
  });
  const registered = await sb.rpc('altcha_register', { p_id: challengeId, p_expires: expiresAt.toISOString() });
  if (registered !== true) throw new Error('altcha_store_unavailable');
  return challenge;
}

/* Extrae el id del reto SOLO después de comprobar la firma: el id va dentro
   de los parámetros firmados, así que no se puede inyectar uno ajeno. */
function decodePayload(payload) {
  if (typeof payload !== 'string') return null;
  const raw = payload.trim();
  if (raw.length < 32 || raw.length > MAX_PAYLOAD_CHARS) return null;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const challenge = parsed.challenge;
  const solution = parsed.solution;
  if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) return null;
  if (!solution || typeof solution !== 'object' || Array.isArray(solution)) return null;
  const parameters = challenge.parameters;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return null;
  if (typeof parameters.algorithm !== 'string' || parameters.algorithm !== ALGORITHM) return null;
  if (typeof solution.counter !== 'number' || !Number.isInteger(solution.counter) || solution.counter < 0) return null;
  if (typeof solution.derivedKey !== 'string' || !/^[0-9a-f]{32,256}$/i.test(solution.derivedKey)) return null;
  const data = parameters.data;
  const challengeId = data && typeof data === 'object' && !Array.isArray(data) ? data.challengeId : null;
  if (typeof challengeId !== 'string' || !ID_PATTERN.test(challengeId)) return null;
  return { challenge, solution, challengeId };
}

/* Verifica criptográficamente la prueba y la marca como usada.
   Devuelve { ok, reason } — `reason` solo se registra, no se muestra al cliente. */
async function verify(payload) {
  const secret = hmacSecret();
  if (!secret) return { ok: false, reason: 'not_configured' };
  const decoded = decodePayload(payload);
  if (!decoded) return { ok: false, reason: 'malformed' };
  let result;
  try {
    result = await verifySolution({
      challenge: decoded.challenge,
      solution: decoded.solution,
      deriveKey,
      hmacSignatureSecret: secret,
    });
  } catch (_) {
    return { ok: false, reason: 'invalid' };
  }
  if (!result || !result.verified) return { ok: false, reason: result && result.expired ? 'expired' : 'invalid' };
  const consumed = await sb.rpc('altcha_consume', { p_id: decoded.challengeId });
  if (consumed !== true) return { ok: false, reason: 'replay' };
  return { ok: true, reason: null };
}

module.exports = { ALGORITHM, COST, TTL_MS, MAX_PAYLOAD_CHARS, isConfigured, create, verify };
