'use strict';
/* ============================================================
   Validación del documento de datos de DrakoTrack
   ------------------------------------------------------------
   Reproduce el fallo real: el perfil moderno (con exercises, records,
   prefs, profile y sesiones con series individuales) se guardaba en el
   dispositivo pero la API lo rechazaba con 400 invalid_data.
   ============================================================ */
const assert = require('node:assert/strict');
const security = require('./lib/security');
const dataHandler = require('./api/data/[action]');
const sb = require('./api/_lib/supabase');

const ISO = '2026-10-28T09:30:00.000Z';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const uid = n => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

let passed = 0;
function ok(value, label) {
  assert.equal(value, true, label);
  passed++;
}
function bad(data, label) {
  assert.equal(security.validateData(data), false, label);
  passed++;
}

/* ---------------------------------------------------------------- piezas */
const makeSet = (n, extra = {}) => ({
  id: uid(n), number: n, weight: 60, reps: 8, completed: true,
  type: 'working', rir: null, rpe: null, restSeconds: null, notes: '', ...extra,
});
const makeSessionExercise = (extra = {}) => ({
  id: uid(31), name: 'Press de banca', exId: 'press-de-banca',
  targetSets: 3, targetReps: 8, target: null, superset: false, rest: 90, done: true,
  setModel: 2, sets: [makeSet(1), makeSet(2)], ...extra,
});
const makeSession = (extra = {}) => ({
  id: uid(41), workoutId: uid(11), workoutName: 'Empuje', date: '2026-10-28',
  startedAt: ISO, lastSavedAt: ISO, finishedAt: ISO, durationSec: 1800,
  finished: true, status: 'completed', pausedMs: 0, pausedAt: null, notes: '',
  setModel: 2, currentExerciseId: uid(31), exercises: [makeSessionExercise()],
  records: [{ id: uid(51), setId: uid(1), exId: 'press-de-banca', exercise: 'Press de banca', weight: 60, reps: 8, previous: { weight: 55, reps: 8 }, at: ISO }],
  summary: {
    durationSec: 1800, exercisesDone: 1, exercisesTotal: 1, setsDone: 2, setsEffective: 2,
    warmupSets: 0, setsTotal: 2, reps: 16, volume: 960, records: [], at: ISO,
  },
  rest: null, ...extra,
});
const makeWorkout = (extra = {}) => ({
  id: uid(11), name: 'Empuje', bc: false,
  exercises: [{ id: uid(21), name: 'Press de banca', exId: 'press-de-banca', sets: 4, reps: 8, weight: 60, target: '4×8', rest: 120, superset: false }],
  ...extra,
});
const makeModernProfile = () => ({
  workouts: [makeWorkout()],
  sessions: [makeSession()],
  prs: [{ id: uid(61), exercise: 'Press de banca', exId: 'press-de-banca', date: '2026-10-28', weight: 100, reps: 1 }],
  weights: [{ id: uid(71), date: '2026-10-28', weight: 80 }],
  records: [{ id: uid(51), setId: uid(1), exId: 'press-de-banca', exercise: 'Press de banca', weight: 60, reps: 8, previous: { weight: 55, reps: 8 }, at: ISO, sessionId: uid(41), date: '2026-10-28', sessionName: 'Empuje' }],
  exercises: [{ id: 'custom:press-inclinado', name: 'Press inclinado', group: 'chest', equip: 'dumbbell', aliases: ['inclinado', 'banca inclinada'] }],
  prefs: { theme: 'dark', restAlerts: true, restSound: false, restVibrate: true, restAlertSeconds: 2, notifyRecords: true },
  profile: { goal: 'muscle', level: 'intermediate', days: 4, at: '2026-10-28', skipped: false },
  achievements: { 'primera-sesion': '2026-10-28', 'racha-4': '2026-10-28' },
  photo: null, hiddenLib: ['lib-push'],
  consent: { version: '2026-10-28', at: ISO, terms: true, age16: true, health: true },
});
/* Perfil tal y como lo escribían las versiones anteriores (lo que la API ya
   aceptaba antes de este cambio): sin exercises, records, prefs ni profile. */
const legacyProfile = () => ({
  workouts: [{ id: 'w1', name: 'Entreno', exercises: [{ id: 'e1', name: 'Sentadilla', sets: 4, reps: 8, weight: 50 }] }],
  sessions: [{ id: 's1', workoutId: 'w1', workoutName: 'Entreno', date: '2026-10-28', finished: true, exercises: [{ id: 'e1', name: 'Sentadilla', targetSets: 4, targetReps: 8, target: null, weight: 50, reps: 8, done: true }] }],
  prs: [{ id: 'p1', exercise: 'Sentadilla', date: '2026-10-28', weight: 100, reps: 1 }],
  weights: [{ id: 'x1', date: '2026-10-28', weight: 80 }],
  hiddenLib: ['lib-push'], photo: null,
  consent: { version: '2026-10-28', at: ISO, terms: true, age16: true, health: true },
});

/* ------------------------------------------------------- A. perfiles OK */
ok(security.validateData(makeModernProfile()), 'perfil moderno completo');
ok(security.validateData({}), 'perfil vacío');
ok(security.validateData({ workouts: [], sessions: [], prs: [], weights: [], records: [], exercises: [], prefs: {}, profile: null, hiddenLib: [] }), 'perfil moderno sin contenido');
ok(security.validateData(legacyProfile()), 'perfil antiguo');
ok(security.validateData({ ...makeModernProfile(), exercises: [{ id: 'custom:sentadilla-frontal', name: 'Sentadilla frontal', group: '', equip: '', aliases: [] }] }), 'ejercicio propio sin grupo ni equipo');
ok(security.validateData({ ...makeModernProfile(), prefs: {} }), 'prefs vacías');
ok(security.validateData({ ...makeModernProfile(), prefs: { theme: 'light' } }), 'prefs parciales');
ok(security.validateData({ ...makeModernProfile(), profile: { skipped: true, at: '2026-10-28' } }), 'perfil omitido del onboarding');
ok(security.validateData({ ...makeModernProfile(), photo: 'data:image/jpeg;base64,' + 'A'.repeat(2000) }), 'foto de progreso');
ok(security.validateData({ ...makeModernProfile(), weights: [] }), 'sin registros de peso');
ok(security.validateData({ ...makeModernProfile(), records: [] }), 'sin historial de récords');
ok(security.validateData({ ...makeModernProfile(), achievements: {} }), 'logros vacíos');
ok(security.validateData({ ...makeModernProfile(), achievements: undefined }), 'perfil antiguo sin logros');

/* --------------------------------------------- B. entrenamientos válidos */
ok(security.validateData({ workouts: [makeWorkout({ exercises: [{ id: uid(22), name: 'Sentadilla', sets: 3, reps: 5 }] })] }), 'entrenamiento tradicional');
ok(security.validateData({ workouts: [makeWorkout({ exercises: [{ name: 'Sentadilla', exId: 'sentadilla', sets: 3, reps: 5, weight: 0 }] })] }), 'entrenamiento con exId y sin id de fila');
ok(security.validateData({ workouts: [makeWorkout({ exercises: [makeWorkout().exercises[0], { id: uid(23), name: 'Fondos', sets: 3, reps: 12, superset: true }] })] }), 'entrenamiento con superserie');
ok(security.validateData({ workouts: [makeWorkout({ exercises: [{ id: uid(24), name: 'Plancha', sets: 3, reps: 60, rest: 60 }] })] }), 'entrenamiento con descanso configurado');
ok(security.validateData({ workouts: [makeWorkout({ id: 'bc:raider:0:0:0', bc: true, name: 'Raider — Día 1' })] }), 'entrenamiento de programa (bc)');

/* --------------------------------------------------- C. sesiones válidas */
const sessionVariants = {
  'sesión antigua sin workoutId': { id: 's-old-no-wid', workoutName: 'Viejo', date: '2026-01-02', finished: true, exercises: [{ id: 'e-old2', name: 'Sentadilla', weight: 70, reps: 5, done: true }] },
  'sesión antigua sin series': { id: 's-old', workoutId: 'w1', workoutName: 'Viejo', date: '2026-01-02', finished: true, exercises: [{ id: 'e-old', name: 'Sentadilla', weight: 70, reps: 5, done: true, targetSets: 3, targetReps: 5 }] },
  'sesión en curso': makeSession({ finished: false, status: 'in_progress', finishedAt: null, durationSec: null, summary: null, records: [] }),
  'sesión pausada': makeSession({ finished: false, status: 'paused', pausedAt: ISO, pausedMs: 120000, finishedAt: null, durationSec: null, summary: null, records: [] }),
  'sesión completada': makeSession(),
  'sesión cancelada': makeSession({ status: 'cancelled', summary: null }),
  'serie de calentamiento': makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { type: 'warmup', weight: 40 }), makeSet(2)] })] }),
  'serie efectiva': makeSession(),
  'drop set con RIR y RPE': makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { type: 'drop', rir: 1, rpe: 9.5 })] })] }),
  'serie con notas y descanso propio': makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { notes: 'última serie al fallo', restSeconds: 150 })] })] }),
  'sesión con descanso activo': makeSession({ finished: false, status: 'in_progress', finishedAt: null, durationSec: null, summary: null, records: [], rest: { startedAt: 1761642000000, duration: 90000, endsAt: 1761642090000, exId: uid(31), setId: uid(1), heavy: true } }),
  'sesión con series vacías': makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { weight: '', reps: '', completed: false })], done: false })] }),
};
for (const [label, session] of Object.entries(sessionVariants)) {
  ok(security.validateData({ sessions: [session] }), label);
}

/* --------------------------------------------------- D. datos inválidos */
bad({ workouts: [{ id: 'w1', name: 'x', exercises: [{ id: 'e1', name: 'Press', weight: -5 }] }] }, 'peso negativo');
bad({ prs: [{ exercise: 'Press', date: '2026-10-28', weight: 5000 }] }, 'peso fuera de rango');
bad({ prs: [{ exercise: 'Press', date: '2026-10-28', weight: 100, reps: 5000 }] }, 'repeticiones fuera de rango');
bad({ weights: [{ date: '2026-10-28', weight: '80' }] }, 'peso como texto');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { weight: NaN })] })] })] }, 'NaN en serie');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { reps: Infinity })] })] })] }, 'Infinity en repeticiones');
bad({ sessions: [makeSession({ date: '2026-02-31' })] }, 'fecha imposible');
bad({ sessions: [makeSession({ startedAt: 'ayer' })] }, 'marca de tiempo inválida');
bad({ sessions: [makeSession({ id: 'id con espacios' })] }, 'identificador malformado');
bad({ sessions: [makeSession({ status: 'abandonada' })] }, 'estado de sesión desconocido');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { type: 'cluster' })] })] })] }, 'tipo de serie desconocido');
bad({ sessions: [makeSession({ setModel: 3 })] }, 'modelo de series desconocido');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { rir: 9 })] })] })] }, 'RIR fuera de rango');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { rpe: 12 })] })] })] }, 'RPE fuera de rango');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { notes: 'x'.repeat(301) })] })] })] }, 'notas de serie demasiado largas');
bad({ sessions: [makeSession({ notes: 'x'.repeat(601) })] }, 'notas de sesión demasiado largas');
bad({ ...makeModernProfile(), admin: true }, 'campo desconocido en el perfil');
bad({ workouts: [makeWorkout({ role: 'admin' })] }, 'campo desconocido en entrenamiento');
bad({ workouts: [makeWorkout({ exercises: [{ id: 'e1', name: 'x', user_id: 'victim' }] })] }, 'campo de propiedad en ejercicio');
bad({ sessions: [makeSession({ user_id: 'victim' })] }, 'campo de propiedad en sesión');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: [makeSet(1, { pr: 'sí' })] })] })] }, 'tipo incorrecto en serie');
bad({ exercises: [{ id: 'custom:x', name: 'X', aliases: 'no-es-lista' }] }, 'alias malformados');
bad({ prefs: { theme: 'neon' } }, 'tema desconocido');
bad({ prefs: { restAlerts: 'sí' } }, 'preferencia con tipo incorrecto');
bad({ prefs: { desconocida: true } }, 'preferencia desconocida');
bad({ prefs: { restAlertSeconds: 99 } }, 'aviso de descanso fuera de rango');
bad({ profile: { days: 12 } }, 'días de plan fuera de rango');
bad({ achievements: { 'primera-sesion': 'ayer' } }, 'logro con fecha inválida');
bad({ achievements: { 'con espacios': '2026-10-28' } }, 'logro con identificador inválido');
bad({ achievements: [] }, 'logros en formato de lista');
bad({ achievements: Object.fromEntries(Array.from({ length: 201 }, (_, i) => ['logro-' + i, '2026-10-28'])) }, 'demasiados logros');
bad({ profile: { goal: '<script>' } }, 'objetivo malformado');
bad({ photo: 'data:text/html;base64,SGVsbG8=' }, 'foto que no es imagen');
bad({ hiddenLib: ['lib push'] }, 'biblioteca con identificador inválido');
bad({ consent: { version: '1', at: ISO, terms: false, age16: true, health: true } }, 'consentimiento sin términos');
bad({ workouts: 'no-es-lista' }, 'colección que no es lista');
bad({ sessions: [null] }, 'sesión nula');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: 'no-es-lista' })] })] }, 'series malformadas');
bad({ sessions: [makeSession({ summary: { volume: -1 } })] }, 'resumen con volumen negativo');
bad({ sessions: [makeSession({ records: [{ exercise: 'Press', weight: 60, reps: 8, previous: { weight: 'mucho', reps: 5 } }] })] }, 'récord con referencia inválida');
bad({ workouts: new Array(301).fill(makeWorkout()) }, 'demasiados entrenamientos');
bad({ sessions: new Array(2001).fill(makeSession()) }, 'demasiadas sesiones');
bad({ sessions: [makeSession({ exercises: new Array(101).fill(makeSessionExercise()) })] }, 'demasiados ejercicios en una sesión');
bad({ sessions: [makeSession({ exercises: [makeSessionExercise({ sets: new Array(51).fill(makeSet(1)) })] })] }, 'demasiadas series');
bad({ hiddenLib: new Array(201).fill('lib-push') }, 'demasiados elementos ocultos');
bad({ exercises: new Array(501).fill({ id: 'custom:x', name: 'X' }) }, 'demasiados ejercicios propios');
bad({ workouts: [{ id: 'w1', name: 'x'.repeat(121), exercises: [] }] }, 'nombre de entrenamiento demasiado largo');
bad({ prs: null }, 'récords nulos en lugar de lista');
bad('texto', 'documento que no es objeto');
bad([], 'documento que es una lista');

/* Documento válido por partes pero de más de 2 MB: el límite global sigue vivo. */
const heavy = { records: Array.from({ length: 20000 }, (_, i) => ({
  id: uid(i % 100), setId: uid(i % 100), exId: 'press-de-banca', exercise: 'Press de banca',
  weight: 60, reps: 8, previous: { weight: 55, reps: 8 }, at: ISO,
  sessionId: uid(41), date: '2026-10-28', sessionName: 'Empuje',
})) };
assert.ok(Buffer.byteLength(JSON.stringify(heavy)) > security.MAX_BODY_BYTES, 'el caso de tamaño supera 2 MB');
bad(heavy, 'documento que supera el tamaño permitido');

/* ------------------------------------------- E. regresión del fallo real */
const regression = makeModernProfile();
/* El caso exacto que devolvía 400: modelo moderno con exercises, records,
   prefs, profile, exId, setModel, status, startedAt, pausedMs,
   currentExerciseId, rir, rpe y restSeconds. */
regression.sessions[0].exercises[0].sets = [
  makeSet(1, { type: 'warmup', weight: 40, reps: 10, rir: null, rpe: null }),
  makeSet(2, { weight: 80, reps: 6, rir: 2, rpe: 8, restSeconds: 180, notes: 'buena técnica' }),
  makeSet(3, { weight: 60, reps: 10, type: 'drop', rir: 0, rpe: 10 }),
];
regression.sessions[0].status = 'in_progress';
regression.sessions[0].finished = false;
regression.sessions[0].startedAt = ISO;
regression.sessions[0].pausedMs = 45000;
regression.sessions[0].currentExerciseId = regression.sessions[0].exercises[0].id;
regression.sessions[0].exercises[0].setModel = 2;
ok(security.validateData(regression), 'el perfil que antes daba 400 ahora se acepta');

const mutate = (fn) => { const copy = JSON.parse(JSON.stringify(regression)); fn(copy); return copy; };
bad(mutate(d => { d.sessions[0].exercises[0].sets[1].weight = -1; }), 'regresión: peso negativo rechazado');
bad(mutate(d => { d.sessions[0].exercises[0].sets[1].reps = 1e9; }), 'regresión: repeticiones absurdas rechazadas');
bad(mutate(d => { d.sessions[0].status = 'terminada'; }), 'regresión: estado inventado rechazado');
bad(mutate(d => { d.sessions[0].exercises[0].sets[1].type = 'superset'; }), 'regresión: tipo de serie inventado rechazado');
bad(mutate(d => { d.prefs.injected = 'x'; }), 'regresión: preferencia inyectada rechazada');
bad(mutate(d => { d.sessions[0].exercises[0].sets[1].owner = USER_ID; }), 'regresión: propiedad inyectada rechazada');

/* ------------------------------------------------ F. integración con la API */
function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}
async function call(req) {
  const res = response();
  await dataHandler({ headers: { origin: 'https://drakotrack.vercel.app' }, query: {}, ...req }, res);
  return res;
}

(async () => {
  const origHasServerKey = sb.hasServerKey;
  const origRest = sb.rest;
  const origSession = sb.authenticatedSession;

  const writes = [];
  sb.hasServerKey = () => true;
  sb.rest = async (path, options = {}) => {
    writes.push({ path, options });
    return { ok: true, json: async () => [] };
  };
  sb.authenticatedSession = async () => ({ user: { id: USER_ID, email: 'user@drakotrack.test' }, accessToken: 'access-token' });

  try {
    let res = await call({ method: 'PUT', body: { data: makeModernProfile() } });
    assert.equal(res.statusCode, 204, 'PUT guarda un perfil válido');
    assert.equal(writes.length, 1, 'una sola escritura');
    assert.equal(writes[0].path, '/app_data', 'escribe en la tabla de datos');
    assert.equal(writes[0].options.body[0].user_id, USER_ID, 'usa el usuario de la sesión');
    passed += 3;

    writes.length = 0;
    res = await call({ method: 'PUT', body: { data: { ...makeModernProfile(), weights: [{ date: '2026-10-28', weight: -3 }] } } });
    assert.equal(res.statusCode, 400, 'PUT rechaza un peso negativo');
    assert.equal(JSON.parse(res.body).error, 'invalid_data', 'error de validación');
    assert.equal(writes.length, 0, 'no se escribe nada inválido');
    passed += 3;

    writes.length = 0;
    res = await call({ method: 'PUT', body: { data: { ...makeModernProfile(), user_id: 'otro-usuario' } } });
    assert.equal(res.statusCode, 400, 'PUT rechaza un user_id inyectado');
    assert.equal(writes.length, 0, 'sin escritura cuando se intenta cambiar de cuenta');
    passed += 2;

    writes.length = 0;
    res = await call({ method: 'PUT', body: { data: makeModernProfile(), user_id: 'otro-usuario' } });
    assert.equal(res.statusCode, 204, 'el user_id de la petición se ignora');
    assert.equal(writes[0].options.body[0].user_id, USER_ID, 'solo se guarda en la cuenta autenticada');
    passed += 2;

    writes.length = 0;
    res = await call({ method: 'GET' });
    assert.equal(res.statusCode, 200, 'GET responde 200');
    assert.ok(writes[0].path.startsWith(`/app_data?user_id=eq.${USER_ID}`), 'GET filtra por el usuario de la sesión');
    passed += 2;

    res = await call({ method: 'PUT', body: { data: { workoutNote: 'x'.repeat(1024) } } });
    assert.equal(res.statusCode, 400, 'PUT rechaza campos desconocidos en el perfil');
    passed += 1;

    const huge = { data: { sessions: [{ ...makeSession(), notes: 'x'.repeat(security.MAX_BODY_BYTES) }] } };
    res = await call({ method: 'PUT', body: huge });
    assert.equal(res.statusCode, 413, 'un cuerpo mayor que el límite devuelve 413');
    passed += 1;

    sb.authenticatedSession = async () => null;
    res = await call({ method: 'PUT', body: { data: makeModernProfile() } });
    assert.equal(res.statusCode, 401, 'sin sesión no se puede guardar');
    passed += 1;

    sb.authenticatedSession = origSession;
    res = await call({ method: 'PUT', headers: { origin: 'https://evil.example' }, body: { data: makeModernProfile() } });
    assert.equal(res.statusCode, 403, 'un origen ajeno no puede escribir');
    passed += 1;
  } finally {
    sb.hasServerKey = origHasServerKey;
    sb.rest = origRest;
    sb.authenticatedSession = origSession;
  }

  console.log(`data validation: ${passed} assertions passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
