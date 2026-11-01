'use strict';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const APP_ORIGIN = 'https://drakotrack.vercel.app';
const APP_DATA_FIELDS = new Set(['workouts', 'sessions', 'prs', 'weights', 'photo', 'hiddenLib', 'consent']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => isRecord(value) && Object.keys(value).every(key => keys.has(key));
function hasNoRequestBody(req) {
  if (req.body === undefined || req.body === null || req.body === '') return true;
  if (Buffer.isBuffer(req.body)) return req.body.length === 0;
  if (typeof req.body === 'string') return req.body.trim() === '' || req.body.trim() === '{}';
  return isRecord(req.body) && Object.keys(req.body).length === 0;
}
function hasOnlyQueryKeys(req, allowed) {
  const query = req.query || {};
  return isRecord(query) && Object.keys(query).every(key => allowed.has(key));
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(value === null ? '' : JSON.stringify(value));
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > limit) throw Object.assign(new Error('too_large'), { status: 413 });
    try { return typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(raw || '{}'); }
    catch (_) { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > limit) throw Object.assign(new Error('too_large'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch (_) { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

function isSameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return false;
  if (origin === APP_ORIGIN) return true;
  if (process.env.NODE_ENV === 'production') return false;
  const host = req.headers.host;
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin) && origin.endsWith(`://${host}`);
}

function cookieValues(req) {
  const out = {};
  for (const part of String((req.headers && req.headers.cookie) || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      const key = part.slice(0, i).trim();
      try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { /* Ignore malformed untrusted cookies. */ }
    }
  }
  return out;
}
function cookieName(base) { return process.env.NODE_ENV === 'production' ? `__Host-dt_${base}` : `dt_${base}`; }
function writeCookies(res, values) {
  const secure = process.env.NODE_ENV === 'production';
  const base = `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  const entries = Object.entries(values).map(([key, value]) => {
    const name = cookieName(key);
    return value
      ? `${name}=${encodeURIComponent(value.value)}; ${base}; Max-Age=${Math.max(0, Math.floor(value.maxAge || 0))}`
      : `${name}=; ${base}; Max-Age=0`;
  });
  if (entries.length) res.setHeader('Set-Cookie', entries);
}
function readCookie(req, key) {
  const all = cookieValues(req);
  const name = cookieName(key);
  if (process.env.NODE_ENV === 'production') return all[name] || null;
  return all[name] || all[`dt_${key}`] || null;
}
function cookieSession(res, data) {
  if (!data || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') return;
  const age = Math.min(Math.max(Number(data.expires_in) || 3600, 60), 86400);
  writeCookies(res, {
    access: { value: data.access_token, maxAge: age },
    refresh: { value: data.refresh_token, maxAge: 60 * 60 * 24 * 30 },
  });
}
function clearCookies(res) { writeCookies(res, { access: null, refresh: null, recovery: null }); }
function safeUser(user) {
  if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : null };
}

function validateData(data) {
  const id = value => typeof value === 'string' && value.length <= 200 && /^[a-z0-9:_-]+$/i.test(value);
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  const number = (value, max, allowEmpty = false) => (allowEmpty && value === '') || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max);
  const name = value => typeof value === 'string' && value.length > 0 && value.length <= 120;
  const workoutKeys = new Set(['id', 'name', 'exercises', 'bc']);
  const workoutExerciseKeys = new Set(['id', 'name', 'sets', 'reps', 'weight', 'target']);
  const sessionKeys = new Set(['id', 'workoutId', 'workoutName', 'date', 'finished', 'exercises']);
  const sessionExerciseKeys = new Set(['id', 'name', 'targetSets', 'targetReps', 'target', 'weight', 'reps', 'done']);
  const recordKeys = new Set(['id', 'date', 'weight']);
  const prKeys = new Set(['id', 'exercise', 'date', 'weight', 'reps']);
  if (!onlyKeys(data, APP_DATA_FIELDS) || Buffer.byteLength(JSON.stringify(data)) > MAX_BODY_BYTES) return false;
  for (const field of ['workouts', 'sessions', 'prs', 'weights', 'hiddenLib']) {
    if (data[field] !== undefined && !Array.isArray(data[field])) return false;
  }
  if (data.workouts && (data.workouts.length > 300 || data.workouts.some(w =>
    !onlyKeys(w, workoutKeys) || !id(w.id) || !name(w.name) || !Array.isArray(w.exercises) || w.exercises.length > 100 ||
    (w.bc !== undefined && typeof w.bc !== 'boolean') || w.exercises.some(e =>
      !onlyKeys(e, workoutExerciseKeys) || !name(e.name) || (e.id !== undefined && !id(e.id)) ||
      (e.sets !== undefined && !number(e.sets, 50)) || (e.reps !== undefined && !number(e.reps, 2000)) ||
      (e.weight !== undefined && !number(e.weight, 1000, true)) ||
      (e.target !== undefined && e.target !== null && (typeof e.target !== 'string' || e.target.length > 160))
    )
  ))) return false;
  if (data.sessions && (data.sessions.length > 2000 || data.sessions.some(s =>
    !onlyKeys(s, sessionKeys) || !id(s.id) || !id(s.workoutId) || !name(s.workoutName) || !date(s.date) ||
    typeof s.finished !== 'boolean' || !Array.isArray(s.exercises) || s.exercises.length > 100 || s.exercises.some(e =>
      !onlyKeys(e, sessionExerciseKeys) || !id(e.id) || !name(e.name) ||
      !number(e.targetSets, 50) || !number(e.targetReps, 2000) || typeof e.done !== 'boolean' ||
      (e.target !== undefined && e.target !== null && (typeof e.target !== 'string' || e.target.length > 160)) ||
      (e.weight !== undefined && !number(e.weight, 1000, true)) || (e.reps !== undefined && !number(e.reps, 2000, true))
    )
  ))) return false;
  if (data.prs && (data.prs.length > 5000 || data.prs.some(p =>
    !onlyKeys(p, prKeys) || (p.id !== undefined && !id(p.id)) || !name(p.exercise) || !date(p.date) ||
    !number(p.weight, 1000) || (p.reps !== undefined && p.reps !== null && !number(p.reps, 2000))
  ))) return false;
  if (data.weights && (data.weights.length > 5000 || data.weights.some(w =>
    !onlyKeys(w, recordKeys) || (w.id !== undefined && !id(w.id)) || !date(w.date) || !number(w.weight, 1000)
  ))) return false;
  if (data.hiddenLib && data.hiddenLib.some(value => typeof value !== 'string' || value.length > 80 || !/^[a-z0-9_-]+$/i.test(value))) return false;
  if (data.photo !== undefined && data.photo !== null && (typeof data.photo !== 'string' || data.photo.length > 1500000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data.photo))) return false;
  if (data.consent !== undefined && data.consent !== null && (
    !onlyKeys(data.consent, new Set(['version', 'at', 'terms', 'age16', 'health'])) ||
    typeof data.consent.version !== 'string' || data.consent.version.length > 40 ||
    typeof data.consent.at !== 'string' || Number.isNaN(Date.parse(data.consent.at)) ||
    data.consent.terms !== true || data.consent.age16 !== true || data.consent.health !== true
  )) return false;
  return true;
}

module.exports = { APP_ORIGIN, MAX_BODY_BYTES, isRecord, onlyKeys, hasNoRequestBody, hasOnlyQueryKeys, json, readJson, isSameOrigin, readCookie, cookieName, writeCookies, cookieSession, clearCookies, safeUser, validateData };
