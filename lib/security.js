'use strict';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const APP_ORIGIN = 'https://drakotrack.vercel.app';
/* Shape of the document app.js produces. Every level lists its keys so the API
   rejects unknown fields instead of storing them. Optional fields stay optional:
   an account created before a feature existed must keep syncing unchanged. */
const APP_DATA_FIELDS = new Set(['workouts', 'sessions', 'prs', 'weights', 'records', 'exercises', 'prefs', 'profile', 'achievements', 'photo', 'hiddenLib', 'consent']);
const SET_TYPES = new Set(['working', 'warmup', 'failure', 'drop', 'rest-pause', 'descending', 'technique']);
const SESSION_STATUSES = new Set(['in_progress', 'paused', 'completed', 'cancelled']);
const PREF_KEYS = new Set(['theme', 'restAlerts', 'restSound', 'restVibrate', 'restAlertSeconds', 'notifyRecords', 'weightStep']);
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

/* Nombres de campo que el servidor acepta en cada nivel. Vive aquí para que el
   validador y la prueba de contrato de test-flows lean la misma lista: si
   app.js empieza a escribir un campo nuevo, la prueba falla y dice cuál. */
const DATA_KEYS = {
  profile: APP_DATA_FIELDS,
  prefs: PREF_KEYS,
  set: new Set(['id', 'number', 'weight', 'reps', 'completed', 'type', 'rir', 'rpe', 'restSeconds', 'notes', 'pr']),
  /* Lápida de una serie borrada: mismo contenido que la serie + su hora. */
  setTombstone: new Set(['id', 'number', 'weight', 'reps', 'completed', 'type', 'rir', 'rpe', 'restSeconds', 'notes', 'pr', 'at']),
  sessionRecord: new Set(['id', 'setId', 'exId', 'exercise', 'weight', 'reps', 'previous', 'at']),
  sessionExercise: new Set(['id', 'name', 'exId', 'targetSets', 'targetReps', 'target', 'weight', 'reps', 'done', 'superset', 'rest', 'setModel', 'sets', 'setTombstones']),
  rest: new Set(['startedAt', 'duration', 'endsAt', 'exId', 'setId', 'heavy', 'notifiedAt', 'pausedAt', 'remainingMs']),
  summary: new Set(['durationSec', 'exercisesDone', 'exercisesTotal', 'setsDone', 'setsEffective', 'warmupSets', 'setsTotal', 'reps', 'volume', 'records', 'at']),
  summaryRecord: new Set(['exercise', 'exId', 'weight', 'reps', 'previous']),
  session: new Set(['id', 'workoutId', 'workoutName', 'date', 'startedAt', 'lastSavedAt', 'finishedAt', 'durationSec', 'finished', 'status', 'pausedMs', 'pausedAt', 'notes', 'setModel', 'currentExerciseId', 'exercises', 'records', 'summary', 'rest']),
  workoutExercise: new Set(['id', 'name', 'exId', 'sets', 'reps', 'weight', 'target', 'rest', 'superset']),
  workout: new Set(['id', 'name', 'exercises', 'bc']),
  pr: new Set(['id', 'exercise', 'exId', 'date', 'weight', 'reps']),
  weight: new Set(['id', 'date', 'weight']),
  historyRecord: new Set(['id', 'setId', 'exId', 'exercise', 'weight', 'reps', 'previous', 'at', 'sessionId', 'date', 'sessionName']),
  ownExercise: new Set(['id', 'name', 'group', 'equip', 'aliases']),
  plan: new Set(['goal', 'level', 'days', 'at', 'skipped']),
  consent: new Set(['version', 'at', 'terms', 'age16', 'health']),
  best: new Set(['weight', 'reps']),
};

function validateData(data) {
  const isText = (value, max, min = 1) => typeof value === 'string' && value.length >= min && value.length <= max;
  const isSlug = (value, max = 200) => typeof value === 'string' && value.length >= 1 && value.length <= max && /^[a-z0-9:_.-]+$/i.test(value);
  const isDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  const isTimestamp = value => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
  const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const isNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const isBool = value => typeof value === 'boolean';
  const isArrayOf = (value, max, check) => Array.isArray(value) && value.length <= max && value.every(check);
  const isOptionalText = (value, max) => value === undefined || value === null || (typeof value === 'string' && value.length <= max);
  /* Series guardan '' cuando el campo está vacío (makeSet/normalizeSet), así que
     '' y null son válidos; cualquier otro valor debe ser un número finito. */
  const isWeight = value => value === undefined || value === null || value === '' || isNumber(value, 0, 1000);
  const isReps = value => value === undefined || value === null || value === '' || isNumber(value, 0, 2000);
  const isOptionalDate = value => value === undefined || value === null || isDate(value);
  const isOptionalTimestamp = value => value === undefined || value === null || isTimestamp(value);
  const isOptionalId = value => value === undefined || value === null || isSlug(value);
  const isOptionalInt = (value, min, max) => value === undefined || value === null || isInt(value, min, max);
  const isSlugOrEmpty = value => value === undefined || value === null || value === '' || isSlug(value, 60);
  const isBest = value => value === undefined || value === null ||
    (onlyKeys(value, DATA_KEYS.best) && isNumber(value.weight, 0, 1000) && isReps(value.reps));

  /* ---------------------------------------------------------------- series */
  const validSet = st => onlyKeys(st, DATA_KEYS.set) &&
    isOptionalId(st.id) &&
    isOptionalInt(st.number, 0, 50) &&
    isWeight(st.weight) && isReps(st.reps) &&
    (st.completed === undefined || isBool(st.completed)) &&
    (st.type === undefined || SET_TYPES.has(st.type)) &&
    (st.rir === undefined || st.rir === null || isNumber(st.rir, 0, 5)) &&
    (st.rpe === undefined || st.rpe === null || isNumber(st.rpe, 0, 10)) &&
    isOptionalInt(st.restSeconds, 0, 600) &&
    isOptionalText(st.notes, 300) &&
    (st.pr === undefined || isBool(st.pr));

  const validTombstone = t => onlyKeys(t, DATA_KEYS.setTombstone) &&
    isOptionalId(t.id) &&
    isOptionalInt(t.number, 0, 50) &&
    isWeight(t.weight) && isReps(t.reps) &&
    (t.completed === undefined || isBool(t.completed)) &&
    (t.type === undefined || SET_TYPES.has(t.type)) &&
    (t.rir === undefined || t.rir === null || isNumber(t.rir, 0, 5)) &&
    (t.rpe === undefined || t.rpe === null || isNumber(t.rpe, 0, 10)) &&
    isOptionalInt(t.restSeconds, 0, 600) &&
    isOptionalText(t.notes, 300) &&
    (t.pr === undefined || isBool(t.pr)) &&
    isOptionalInt(t.at, 0, 1e14);
  const validTombstones = map => isRecord(map) && Object.keys(map).length <= 60 &&
    Object.entries(map).every(([key, tomb]) => isSlug(key, 80) && validTombstone(tomb));

  /* ------------------------------------------------------------- sesiones */
  const validSessionRecord = r => onlyKeys(r, DATA_KEYS.sessionRecord) &&
    isOptionalId(r.id) && isOptionalId(r.setId) &&
    (r.exId === undefined || r.exId === null || isSlug(r.exId)) &&
    isText(r.exercise, 120) &&
    isNumber(r.weight, 0, 1000) && isReps(r.reps) &&
    isBest(r.previous) &&
    isOptionalTimestamp(r.at);

  const validSessionExercise = e => onlyKeys(e, DATA_KEYS.sessionExercise) &&
    isOptionalId(e.id) && isText(e.name, 120) &&
    (e.exId === undefined || e.exId === null || isSlug(e.exId)) &&
    isOptionalInt(e.targetSets, 0, 50) &&
    isOptionalInt(e.targetReps, 0, 2000) &&
    isOptionalText(e.target, 160) &&
    isWeight(e.weight) && isReps(e.reps) &&
    (e.done === undefined || isBool(e.done)) &&
    (e.superset === undefined || isBool(e.superset)) &&
    isOptionalInt(e.rest, 0, 600) &&
    (e.setModel === undefined || e.setModel === 1 || e.setModel === 2) &&
    (e.setTombstones === undefined || e.setTombstones === null || validTombstones(e.setTombstones)) &&
    (e.sets === undefined || isArrayOf(e.sets, 50, validSet));

  const validRest = r => onlyKeys(r, DATA_KEYS.rest) &&
    isOptionalInt(r.startedAt, 0, 1e14) && (r.duration === undefined || r.duration === null || isNumber(r.duration, 0, 86400000)) &&
    isOptionalInt(r.endsAt, 0, 1e14) && isOptionalInt(r.notifiedAt, 0, 1e14) &&
    isOptionalInt(r.pausedAt, 0, 1e14) && isOptionalInt(r.remainingMs, 0, 600000) &&
    (r.exId === undefined || r.exId === null || isSlug(r.exId)) &&
    (r.setId === undefined || r.setId === null || isSlug(r.setId)) &&
    (r.heavy === undefined || isBool(r.heavy));

  const validSummaryRecord = r => onlyKeys(r, DATA_KEYS.summaryRecord) &&
    isText(r.exercise, 120) && (r.exId === undefined || r.exId === null || isSlug(r.exId)) &&
    isNumber(r.weight, 0, 1000) && isReps(r.reps) && isBest(r.previous);
  const validSummary = m => onlyKeys(m, DATA_KEYS.summary) &&
    (m.durationSec === undefined || m.durationSec === null || isNumber(m.durationSec, 0, 604800)) &&
    isOptionalInt(m.exercisesDone, 0, 100000) && isOptionalInt(m.exercisesTotal, 0, 100000) &&
    isOptionalInt(m.setsDone, 0, 100000) && isOptionalInt(m.setsEffective, 0, 100000) &&
    isOptionalInt(m.warmupSets, 0, 100000) && isOptionalInt(m.setsTotal, 0, 100000) &&
    isOptionalInt(m.reps, 0, 10000000) && (m.volume === undefined || m.volume === null || isNumber(m.volume, 0, 1e9)) &&
    (m.records === undefined || isArrayOf(m.records, 200, validSummaryRecord)) &&
    isOptionalTimestamp(m.at);

  const validSession = s => onlyKeys(s, DATA_KEYS.session) &&
    isSlug(s.id) && isOptionalId(s.workoutId) && isText(s.workoutName, 120) && isDate(s.date) &&
    isOptionalTimestamp(s.startedAt) && isOptionalTimestamp(s.lastSavedAt) && isOptionalTimestamp(s.finishedAt) &&
    (s.durationSec === undefined || s.durationSec === null || isNumber(s.durationSec, 0, 604800)) &&
    (s.finished === undefined || isBool(s.finished)) &&
    (s.status === undefined || SESSION_STATUSES.has(s.status)) &&
    (s.pausedMs === undefined || s.pausedMs === null || isNumber(s.pausedMs, 0, 604800000)) &&
    isOptionalTimestamp(s.pausedAt) &&
    isOptionalText(s.notes, 600) &&
    (s.setModel === undefined || s.setModel === 1 || s.setModel === 2) &&
    (s.currentExerciseId === undefined || s.currentExerciseId === null || isSlug(s.currentExerciseId)) &&
    Array.isArray(s.exercises) && isArrayOf(s.exercises, 100, validSessionExercise) &&
    (s.records === undefined || isArrayOf(s.records, 200, validSessionRecord)) &&
    (s.summary === undefined || s.summary === null || validSummary(s.summary)) &&
    (s.rest === undefined || s.rest === null || validRest(s.rest));

  /* ---------------------------------------------------------- entrenamientos */
  const validWorkoutExercise = e => onlyKeys(e, DATA_KEYS.workoutExercise) &&
    isOptionalId(e.id) && isText(e.name, 120) &&
    (e.exId === undefined || e.exId === null || isSlug(e.exId)) &&
    isOptionalInt(e.sets, 0, 50) && isOptionalInt(e.reps, 0, 2000) &&
    isWeight(e.weight) && isOptionalText(e.target, 160) &&
    isOptionalInt(e.rest, 0, 600) &&
    (e.superset === undefined || isBool(e.superset));

  const validWorkout = w => onlyKeys(w, DATA_KEYS.workout) &&
    isSlug(w.id) && isText(w.name, 120) &&
    isArrayOf(w.exercises, 100, validWorkoutExercise) &&
    (w.bc === undefined || isBool(w.bc));

  /* --------------------------------------------------------------- récords */
  const validPR = p => onlyKeys(p, DATA_KEYS.pr) &&
    isOptionalId(p.id) && isText(p.exercise, 120) &&
    (p.exId === undefined || p.exId === null || isSlug(p.exId)) &&
    isDate(p.date) && isNumber(p.weight, 0, 1000) && isReps(p.reps);

  const validWeightEntry = w => onlyKeys(w, DATA_KEYS.weight) &&
    isOptionalId(w.id) && isDate(w.date) && isNumber(w.weight, 0, 1000);

  const validHistoryRecord = r => onlyKeys(r, DATA_KEYS.historyRecord) &&
    isOptionalId(r.id) && isOptionalId(r.setId) && isOptionalId(r.sessionId) &&
    (r.exId === undefined || r.exId === null || isSlug(r.exId)) &&
    isText(r.exercise, 120) &&
    isNumber(r.weight, 0, 1000) && isReps(r.reps) && isBest(r.previous) &&
    isOptionalTimestamp(r.at) && isOptionalDate(r.date) &&
    isOptionalText(r.sessionName, 120);

  /* ------------------------------------------- ejercicios propios y ajustes */
  const validOwnExercise = e => onlyKeys(e, DATA_KEYS.ownExercise) &&
    isSlug(e.id) && isText(e.name, 120) &&
    isSlugOrEmpty(e.group) && isSlugOrEmpty(e.equip) &&
    (e.aliases === undefined || isArrayOf(e.aliases, 12, a => isText(a, 120)));

  const validPrefs = p => onlyKeys(p, DATA_KEYS.prefs) &&
    (p.theme === undefined || p.theme === 'light' || p.theme === 'dark') &&
    (p.restAlerts === undefined || isBool(p.restAlerts)) &&
    (p.restSound === undefined || isBool(p.restSound)) &&
    (p.restVibrate === undefined || isBool(p.restVibrate)) &&
    (p.notifyRecords === undefined || isBool(p.notifyRecords)) &&
    (p.weightStep === undefined || isNumber(p.weightStep, 0.1, 20)) &&
    isOptionalInt(p.restAlertSeconds, 1, 4);

  const validProfile = p => onlyKeys(p, DATA_KEYS.plan) &&
    (p.goal === undefined || isSlug(p.goal)) &&
    (p.level === undefined || isSlug(p.level)) &&
    isOptionalInt(p.days, 1, 7) &&
    isOptionalDate(p.at) &&
    (p.skipped === undefined || isBool(p.skipped));

  /* Logros: mapa id -> fecha en que se desbloqueó (unlockAchievements). */
  const validAchievements = a => isRecord(a) &&
    Object.keys(a).length <= 200 &&
    Object.entries(a).every(([key, at]) => isSlug(key, 60) && isDate(at));

  /* ------------------------------------------------------------ documento */
  if (!isRecord(data) || !onlyKeys(data, APP_DATA_FIELDS)) return false;
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BODY_BYTES) return false;
  if (data.workouts !== undefined && !isArrayOf(data.workouts, 300, validWorkout)) return false;
  if (data.sessions !== undefined && !isArrayOf(data.sessions, 2000, validSession)) return false;
  if (data.prs !== undefined && !isArrayOf(data.prs, 5000, validPR)) return false;
  if (data.weights !== undefined && !isArrayOf(data.weights, 5000, validWeightEntry)) return false;
  if (data.records !== undefined && !isArrayOf(data.records, 20000, validHistoryRecord)) return false;
  if (data.exercises !== undefined && !isArrayOf(data.exercises, 500, validOwnExercise)) return false;
  if (data.prefs !== undefined && data.prefs !== null && !validPrefs(data.prefs)) return false;
  if (data.profile !== undefined && data.profile !== null && !validProfile(data.profile)) return false;
  if (data.achievements !== undefined && data.achievements !== null && !validAchievements(data.achievements)) return false;
  if (data.hiddenLib !== undefined && data.hiddenLib !== null && !isArrayOf(data.hiddenLib, 200, value => isSlug(value, 80))) return false;
  if (data.photo !== undefined && data.photo !== null && (typeof data.photo !== 'string' || data.photo.length > 1500000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data.photo))) return false;
  if (data.consent !== undefined && data.consent !== null && (
    !onlyKeys(data.consent, DATA_KEYS.consent) ||
    typeof data.consent.version !== 'string' || data.consent.version.length > 40 ||
    typeof data.consent.at !== 'string' || Number.isNaN(Date.parse(data.consent.at)) ||
    data.consent.terms !== true || data.consent.age16 !== true || data.consent.health !== true
  )) return false;
  return true;
}
module.exports = { APP_ORIGIN, MAX_BODY_BYTES, DATA_KEYS, isRecord, onlyKeys, hasNoRequestBody, hasOnlyQueryKeys, json, readJson, isSameOrigin, readCookie, cookieName, writeCookies, cookieSession, clearCookies, safeUser, validateData };
