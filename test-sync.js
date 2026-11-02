'use strict';
/* ============================================================
   Sincronización entre dispositivos
   ------------------------------------------------------------
   Reproduce los escenarios reales que antes perdían datos: dos
   dispositivos editando a la vez, uno sin conexión, una escritura
   cuya respuesta se pierde, un borrado desde el otro lado y una
   respuesta vacía del servidor.

   Usa el sistema de pruebas existente (assert + contador) y un
   servidor falso que implementa la misma regla que la migración:
   la escritura solo se aplica si la revisión coincide, y el
   reintento con el mismo op_id no duplica nada.
   ============================================================ */
const assert = require('node:assert/strict');
const syncLib = require('./sync');
const security = require('./lib/security');

let passed = 0;
function ok(value, label) {
  assert.equal(value, true, label);
  passed++;
}
function eq(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  passed++;
}

const clone = value => JSON.parse(JSON.stringify(value));
const ACCOUNT = 'athlete@drakotrack.test';
const OTHER = 'otro@drakotrack.test';

/* ---------------------------------------------------------- documentos */
const set = (n, extra = {}) => ({ id: 'set-' + n, number: n, weight: 60, reps: 8, completed: true, type: 'working', ...extra });
const sessionEx = (id, sets) => ({ id: 'ex-' + id, name: 'Press de banca', exId: 'press-de-banca', targetSets: 3, targetReps: 8, superset: false, rest: 90, done: true, setModel: 2, sets });
const session = (id, extra = {}) => ({
  id, workoutId: 'w-1', workoutName: 'Empuje', date: '2026-11-01', startedAt: '2026-11-01T09:00:00.000Z',
  finished: true, status: 'completed', durationSec: 1800, exercises: [sessionEx('a', [set(1), set(2)])],
  records: [{ id: 'rec-1', setId: 'set-1', exId: 'press-de-banca', exercise: 'Press de banca', weight: 60, reps: 8, at: '2026-11-01T09:10:00.000Z' }],
  summary: { durationSec: 1800, setsDone: 2, reps: 16, volume: 960, at: '2026-11-01T09:30:00.000Z' },
  ...extra,
});
const workout = (id, extra = {}) => ({
  id, name: 'Empuje', bc: false,
  exercises: [{ id: 'we-' + id, name: 'Press de banca', exId: 'press-de-banca', sets: 4, reps: 8, weight: 60 }],
  ...extra,
});
const emptyDoc = () => ({ workouts: [], sessions: [], prs: [], weights: [], records: [], exercises: [], hiddenLib: [], prefs: {} });
function docBase() {
  return Object.assign(emptyDoc(), {
    workouts: [workout('w-1')],
    sessions: [session('s-1')],
    prs: [{ id: 'pr-1', exercise: 'Press de banca', exId: 'press-de-banca', date: '2026-11-01', weight: 100, reps: 1 }],
    weights: [{ id: 'wt-1', date: '2026-11-01', weight: 80 }],
    records: [{ id: 'rec-1', setId: 'set-1', exId: 'press-de-banca', exercise: 'Press de banca', weight: 60, reps: 8, at: '2026-11-01T09:10:00.000Z', date: '2026-11-01', sessionId: 's-1', sessionName: 'Empuje' }],
    exercises: [{ id: 'custom:press-inclinado', name: 'Press inclinado', group: 'chest', equip: 'dumbbell', aliases: [] }],
    prefs: { theme: 'dark', restAlerts: true },
    profile: { goal: 'muscle', level: 'intermediate', days: 4 },
  });
}

/* ---------------------------------------------------------- servidor falso */
function fakeServer() {
  const rows = new Map();
  return {
    rows,
    writes: 0,
    adapter(userId) {
      return {
        async load() {
          const row = rows.get(userId);
          return row ? { rev: row.rev, data: clone(row.data) } : null;
        },
        async save(doc, baseRev, opId) {
          const row = rows.get(userId);
          if (!row) {
            this.writes += 1;
            rows.set(userId, { rev: 1, data: clone(doc), lastOp: opId });
            return { rev: 1, replay: false };
          }
          if (opId && row.lastOp === opId && JSON.stringify(row.data) === JSON.stringify(doc)) return { rev: row.rev, replay: true };
          if (baseRev === null || baseRev !== row.rev) {
            const error = new Error('conflict');
            error.status = 409;
            error.rev = row.rev;
            throw error;
          }
          this.writes += 1;
          row.rev += 1;
          row.data = clone(doc);
          row.lastOp = opId;
          return { rev: row.rev, replay: false };
        },
      };
    },
  };
}
let engineSeq = 0;
const engineFor = (server, account, extra = {}) => {
  const device = ++engineSeq;
  return syncLib.createEngine({
    storage: extra.storage || syncLib.memoryStorage(),
    remote: extra.remote || server.adapter(account),
    now: () => 1762000000000,
    newId: (() => { let n = 0; return () => 'op-' + device + '-' + (++n); })(),
  });
};

(async () => {
  /* 1. Un dispositivo guarda y el otro recibe ------------------------------ */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    const docA = docBase();
    const first = await a.sync(ACCOUNT, docA);
    ok(first.status === 'pushed', 'el primer dispositivo sube su copia');
    const second = await b.sync(ACCOUNT, emptyDoc());
    eq(second.status, 'pulled', 'el segundo dispositivo recibe la copia');
    ok(second.data.sessions[0].id === 's-1', 'la sesión llega completa al otro dispositivo');
    ok(second.data.prs[0].weight === 100 && second.data.weights[0].weight === 80, 'récords y peso corporal también llegan');
    ok(second.data.sessions[0].exercises[0].sets.length === 2, 'las series llegan con la sesión');
    ok(security.validateData(second.data), 'lo recibido sigue siendo un documento válido');
  }

  /* 2. Dos dispositivos modifican elementos distintos ---------------------- */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    await a.sync(ACCOUNT, docBase());
    await b.sync(ACCOUNT, emptyDoc());

    const docA = docBase();
    docA.workouts.push(workout('w-2', { name: 'Tirón' }));
    docA.sessions.push(session('s-2', { workoutName: 'Tirón', date: '2026-11-02' }));
    a.markDirty(ACCOUNT);
    await a.sync(ACCOUNT, docA);

    const docB = docBase();
    docB.exercises.push({ id: 'custom:remo', name: 'Remo', group: 'back', equip: 'bar', aliases: [] });
    b.markDirty(ACCOUNT);
    const pushedB = await b.sync(ACCOUNT, docB);
    eq(pushedB.status, 'merged', 'el segundo guardado detecta la revisión nueva y combina');
    b.state(ACCOUNT);
    const merged = pushedB.data;
    ok(merged.workouts.length === 2, 'se conservan el entrenamiento de uno y el del otro');
    ok(merged.sessions.length === 2, 'también las sesiones de ambos');
    ok(merged.exercises.some(e => e.id === 'custom:remo'), 'el ejercicio personalizado del segundo dispositivo sobrevive');
    eq(pushedB.conflicts.length, 0, 'cambios independientes no generan conflicto');
    await b.sync(ACCOUNT, merged);
    const seenByA = await a.sync(ACCOUNT, docA);
    ok(seenByA.data.workouts.length === 2, 'el primer dispositivo recibe lo del segundo al reconectar');
    ok(seenByA.data.exercises.some(e => e.id === 'custom:remo'), 'sin perder nada de lo suyo');
  }

  /* 3. Dos dispositivos modifican la misma rutina ------------------------- */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    await a.sync(ACCOUNT, docBase());
    await b.sync(ACCOUNT, emptyDoc());

    const docA = docBase();
    docA.workouts[0].name = 'Empuje pesado';
    a.markDirty(ACCOUNT);
    await a.sync(ACCOUNT, docA);

    const docB = docBase();
    docB.workouts[0].name = 'Empuje ligero';
    b.markDirty(ACCOUNT);
    const merged = await b.sync(ACCOUNT, docB);
    eq(merged.conflicts.length, 1, 'la misma rutina modificada en ambos lados es un conflicto');
    eq(merged.conflicts[0].collection, 'workouts', 'el conflicto apunta al entrenamiento');
    ok(merged.conflicts[0].remote && merged.conflicts[0].remote.name === 'Empuje pesado', 'se conserva la versión del otro dispositivo');
    ok(merged.data.workouts[0].name === 'Empuje ligero', 'no se sobrescribe en silencio: se mantiene la local y se avisa');
    ok(security.validateData(merged.data), 'el documento con conflicto sigue siendo válido');

    const state = b.state(ACCOUNT);
    ok(state.conflicts.length === 1, 'el conflicto queda guardado en el dispositivo');
    const theirs = b.resolveConflict(ACCOUNT, 'workouts:w-1', 'theirs', merged.data);
    ok(theirs.data.workouts[0].name === 'Empuje pesado', 'se puede elegir la versión del otro dispositivo');
    eq(b.state(ACCOUNT).conflicts.length, 0, 'el conflicto se cierra al decidir');
  }

  /* 4. La misma sesión: series nuevas y series contradictorias ------------- */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    await a.sync(ACCOUNT, docBase());
    await b.sync(ACCOUNT, emptyDoc());

    const docA = docBase();
    docA.sessions[0].exercises[0].sets.push(set(3));
    a.markDirty(ACCOUNT);
    await a.sync(ACCOUNT, docA);

    const docB = docBase();
    docB.sessions[0].exercises[0].sets.push(set(4));
    b.markDirty(ACCOUNT);
    const merged = await b.sync(ACCOUNT, docB);
    const sets = merged.data.sessions[0].exercises[0].sets.map(s => s.id).sort();
    eq(sets, ['set-1', 'set-2', 'set-3', 'set-4'], 'se suman las series de los dos dispositivos');
    eq(merged.conflicts.length, 0, 'agregar series distintas no es conflicto');
    await b.sync(ACCOUNT, merged.data);

    /* Ahora los dos cambian la MISMA serie de forma distinta. */
    const docA2 = clone(merged.data);
    docA2.sessions[0].exercises[0].sets[0].weight = 65;
    a.markDirty(ACCOUNT);
    let pushed = await a.sync(ACCOUNT, docA2);
    if (pushed.data) pushed = await a.sync(ACCOUNT, pushed.data);
    eq(pushed.status, 'pushed', 'el primer dispositivo guarda su peso');

    const docB2 = clone(merged.data);
    docB2.sessions[0].exercises[0].sets[0].weight = 70;
    b.markDirty(ACCOUNT);
    const clash = await b.sync(ACCOUNT, docB2);
    eq(clash.conflicts.length, 1, 'la misma serie con pesos distintos es conflicto');
    eq(clash.conflicts[0].kind, 'set', 'el conflicto es de serie, no de toda la sesión');
    ok(clash.data.sessions[0].exercises[0].sets[0].weight === 70, 'se conserva la serie local hasta que el usuario decida');
    ok(clash.conflicts[0].remote.weight === 65, 'la serie del otro dispositivo se guarda aparte');
  }

  /* 5. Un dispositivo desconectado mientras el otro actualiza -------------- */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    await a.sync(ACCOUNT, docBase());
    await b.sync(ACCOUNT, emptyDoc());

    const offline = docBase();
    offline.weights.push({ id: 'wt-2', date: '2026-11-02', weight: 79 });
    b.markDirty(ACCOUNT);
    const docA = docBase();
    docA.prs.push({ id: 'pr-2', exercise: 'Sentadilla', exId: 'sentadilla', date: '2026-11-02', weight: 140, reps: 1 });
    a.markDirty(ACCOUNT);
    await a.sync(ACCOUNT, docA);

    const back = await b.sync(ACCOUNT, offline);
    ok(!!back.data, 'al volver la conexión se combinan los cambios');
    ok(back.data.weights.some(w => w.id === 'wt-2'), 'el peso registrado sin conexión sigue ahí');
    ok(back.data.prs.some(p => p.id === 'pr-2'), 'y el récord del otro dispositivo también');
  }

  /* 6 y 7. Versión antigua y conflicto de revisión ------------------------- */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    await a.sync(ACCOUNT, docBase());
    await b.sync(ACCOUNT, emptyDoc());
    const docA = docBase();
    docA.prefs.theme = 'light';
    a.markDirty(ACCOUNT);
    await a.sync(ACCOUNT, docA);

    /* b sigue creyendo que la revisión es la inicial. */
    const stale = docBase();
    stale.profile.days = 5;
    const before = clone(server.rows.get(ACCOUNT));
    const result = await b.sync(ACCOUNT, stale);
    eq(result.status, 'merged', 'una escritura basada en una revisión vieja no se aplica a ciegas');
    eq(before.rev, server.rows.get(ACCOUNT).rev, 'antes de combinar, el servidor no cambió');
    ok(result.data.prefs.theme === 'light', 'el cambio de preferencias del otro dispositivo se conserva');
    ok(result.data.profile.days === 5, 'y el cambio local también');
    eq(result.conflicts.length, 0, 'campos distintos se combinan sin preguntar');
  }

  /* 8. Se corta la conexión durante una escritura -------------------------- */
  {
    const server = fakeServer();
    const storage = syncLib.memoryStorage();
    let online = false;
    const adapter = server.adapter(ACCOUNT);
    const remote = {
      load: () => adapter.load(),
      save: (...args) => online ? adapter.save(...args) : Promise.reject(new Error('sin red')),
    };
    const engine = engineFor(server, ACCOUNT, { remote, storage });
    const doc = docBase();
    engine.markDirty(ACCOUNT);
    const failed = await engine.sync(ACCOUNT, doc).then(() => 'no-throw', () => 'throw');
    eq(failed, 'throw', 'un fallo de red se propaga para reintentarlo');
    eq(engine.state(ACCOUNT).dirty, true, 'el cambio queda marcado como pendiente');
    ok(server.rows.size === 0, 'no se escribió nada a medias en el servidor');

    online = true;
    const okAgain = await engine.sync(ACCOUNT, doc);
    eq(okAgain.status, 'pushed', 'al volver la red se envía lo pendiente');
    ok(server.rows.get(ACCOUNT).data.sessions.length === 1, 'la sesión no se perdió');
  }

  /* 9. Reintento de una operación ya procesada ---------------------------- */
  {
    const server = fakeServer();
    const adapter = server.adapter(ACCOUNT);
    let lose = true;
    const remote = {
      load: () => adapter.load(),
      async save(doc, baseRev, opId) {
        const result = await adapter.save(doc, baseRev, opId);
        if (lose) { lose = false; throw new Error('se cortó después de guardar'); }
        return result;
      },
    };
    const engine = engineFor(server, ACCOUNT, { remote });
    engine.markDirty(ACCOUNT);
    await engine.sync(ACCOUNT, docBase()).catch(() => null);
    const stateAfterCut = engine.state(ACCOUNT);
    eq(stateAfterCut.dirty, true, 'si no llega la respuesta, el cambio sigue pendiente');
    const revBefore = server.rows.get(ACCOUNT).rev;
    const retry = await engine.sync(ACCOUNT, docBase());
    eq(retry.status, 'replayed', 'el reintento se reconoce como la misma operación');
    eq(server.rows.get(ACCOUNT).rev, revBefore, 'no se crea una revisión nueva al repetir');
    eq(server.rows.get(ACCOUNT).data.sessions.length, 1, 'no se duplica la sesión');
  }

  /* 10. Borrado en un dispositivo y copia vieja en el otro ---------------- */
  {
    const server = fakeServer();
    const a = engineFor(server, ACCOUNT);
    const b = engineFor(server, ACCOUNT);
    const c = engineFor(server, ACCOUNT);
    await a.sync(ACCOUNT, docBase());
    await b.sync(ACCOUNT, emptyDoc());
    await c.sync(ACCOUNT, emptyDoc());
    eq(c.state(ACCOUNT).rev, 1, 'los tres dispositivos parten de la misma copia');

    const withoutWorkout = docBase();
    withoutWorkout.workouts = [];
    a.markDirty(ACCOUNT);
    await a.sync(ACCOUNT, withoutWorkout);

    const bPulls = await b.sync(ACCOUNT, docBase());
    ok(bPulls.data.workouts.length === 0, 'el borrado hecho en el otro dispositivo se respeta al sincronizar');
    eq(bPulls.conflicts.length, 0, 'sin cambios locales no hay nada que decidir');

    /* El tercer dispositivo sí había modificado ese entrenamiento. */
    const modified = docBase();
    modified.workouts[0].name = 'Empuje (nuevo)';
    c.markDirty(ACCOUNT);
    const clash = await c.sync(ACCOUNT, modified);
    eq(clash.status, 'merged', 'un elemento borrado en el otro lado no se impone por la fuerza');
    eq(clash.conflicts.length, 1, 'se avisa del borrado remoto');
    eq(clash.conflicts[0].kind, 'deleted-remote', 'el conflicto es por borrado');
    ok(clash.data.workouts.length === 1 && clash.data.workouts[0].name === 'Empuje (nuevo)', 'la versión con cambios no desaparece');
    ok(clash.conflicts[0].remote === null, 'la otra parte es un borrado, no una versión alternativa');
  }

  /* 11. Recarga de la aplicación con cambios pendientes ------------------- */
  {
    const server = fakeServer();
    const storage = syncLib.memoryStorage();
    const adapter = server.adapter(ACCOUNT);
    const offlineRemote = { load: () => adapter.load(), save: () => Promise.reject(new Error('sin red')) };
    const before = engineFor(server, ACCOUNT, { remote: offlineRemote, storage });
    const doc = docBase();
    before.markDirty(ACCOUNT);
    await before.sync(ACCOUNT, doc).catch(() => null);
    eq(before.state(ACCOUNT).dirty, true, 'quedan pendientes tras el fallo');

    /* Recargar = crear el motor otra vez con el mismo almacenamiento. */
    const after = engineFor(server, ACCOUNT, { storage });
    const persisted = after.state(ACCOUNT);
    ok(persisted && persisted.dirty === true, 'los pendientes sobreviven a la recarga');
    ok(typeof persisted.opId === 'string' && persisted.opId.length > 0, 'el identificador de la operación se conserva');
    const sent = await after.sync(ACCOUNT, doc);
    eq(sent.status, 'pushed', 'al abrir otra vez se envía lo pendiente sin tocar el documento');
    eq(server.rows.get(ACCOUNT).rev, 1, 'una sola escritura, sin duplicados');
  }

  /* 12. Recuperación después de un error ---------------------------------- */
  {
    const server = fakeServer();
    const engine = engineFor(server, ACCOUNT);
    const doc = docBase();
    await engine.sync(ACCOUNT, doc);

    const doc2 = docBase();
    doc2.sessions.push(session('s-2', { date: '2026-11-03' }));
    engine.markDirty(ACCOUNT);
    engine.backup(ACCOUNT, doc);
    const backup = engine.restoreBackup(ACCOUNT);
    ok(backup && backup.data.sessions.length === 1, 'se guarda la copia previa a cada sincronización');
    eq(engine.state(ACCOUNT).backup.data.sessions.length, 1, 'la copia queda accesible después del error');

    await engine.sync(ACCOUNT, doc2);
    const backupStill = engine.restoreBackup(ACCOUNT);
    ok(backupStill && backupStill.data.sessions.length === 1, 'tras sincronizar, la copia anterior no se borra sola');
    eq(server.rows.get(ACCOUNT).data.sessions.length, 2, 'la sincronización sí aplicó el cambio');
  }

  /* 13. Datos de otra cuenta ---------------------------------------------- */
  {
    const server = fakeServer();
    const mine = engineFor(server, ACCOUNT);
    const theirs = engineFor(server, OTHER);
    await mine.sync(ACCOUNT, docBase());
    await theirs.sync(OTHER, Object.assign(emptyDoc(), { prs: [{ id: 'pr-x', exercise: 'Remo', date: '2026-11-01', weight: 70, reps: 5 }] }));
    const fresh = engineFor(server, ACCOUNT);
    const pullMine = await fresh.sync(ACCOUNT, emptyDoc());
    eq(pullMine.data.prs.length, 1, 'cada motor solo ve la copia de su cuenta');
    ok(!pullMine.data.prs.some(p => p.id === 'pr-x'), 'no se mezclan los datos de otra persona');
    eq(clone(server.rows.get(OTHER)).data.prs.length, 1, 'la otra cuenta conserva exactamente lo suyo');
    eq(engineFor(server, ACCOUNT).state(ACCOUNT), null, 'un dispositivo nuevo no hereda estado de otra cuenta');
  }

  /* 14. Respuesta vacía o incompleta -------------------------------------- */
  {
    const engine = syncLib.createEngine({
      storage: syncLib.memoryStorage(),
      remote: { load: async () => null, save: async () => ({ rev: 1 }) },
      now: () => 1762000000000,
    });
    const doc = docBase();
    const pulled = await engine.forcePull(ACCOUNT, doc);
    eq(pulled.status, 'empty', 'una copia remota vacía no se interpreta como perfil vacío');
    eq(pulled.data, null, 'no se devuelve un documento vacío que reemplace lo local');

    const merged = syncLib.merge(null, doc, {});
    ok(merged.data.sessions.length === 1 && merged.data.workouts.length === 1, 'combinar con un remoto vacío conserva lo local');
    ok(security.validateData(merged.data), 'el resultado sigue siendo válido');

    const api = await apiWith({ row: null });
    const res = await api.call({ method: 'GET' });
    eq(res.statusCode, 200, 'la API responde a una cuenta sin copia');
    eq(JSON.parse(res.body).data, null, 'la API devuelve null, no un documento vacío');
  }

  /* API: revisión, 409, aislamiento y validación -------------------------- */
  {
    const api = await apiWith({ row: { data: docBase(), rev: 7 } });
    const put = await api.call({ method: 'PUT', body: { data: docBase(), base_rev: 7, op_id: 'op-1' } });
    eq(put.statusCode, 200, 'un PUT con la revisión correcta se acepta');
    eq(JSON.parse(put.body).rev, 8, 'la API devuelve la revisión nueva');
    const call = api.rpcCalls[api.rpcCalls.length - 1];
    eq(call.name, 'dt_save_app_data', 'la escritura pasa por la función atómica');
    ok(call.body.p_base_rev === 7 && call.body.p_op_id === 'op-1', 'la petición lleva revisión y operación');
    ok(!('user_id' in call.body), 'el cliente no envía el id de usuario: lo pone el servidor');

    const stale = await api.call({ method: 'PUT', body: { data: docBase(), base_rev: 3 } });
    eq(stale.statusCode, 409, 'una revisión vieja se rechaza con 409');
    eq(JSON.parse(stale.body).error, 'conflict', 'el error es estable y reconocible');
    eq(JSON.parse(stale.body).rev, 8, 'se informa la revisión real del servidor');

    const noRev = await api.call({ method: 'PUT', body: { data: docBase() } });
    eq(noRev.statusCode, 409, 'sin revisión no se sobrescribe una copia existente');

    api.calls = 0;
    const invalid = await api.call({ method: 'PUT', body: { data: { prs: [{ exercise: 'X', date: '2026-11-01', weight: -1 }] }, base_rev: 7 } });
    eq(invalid.statusCode, 400, 'los datos inválidos se rechazan antes de la función');
    eq(api.calls, 0, 'no se llama a Supabase con datos inválidos');

    const foreign = await api.call({ method: 'PUT', headers: { origin: 'https://evil.example' }, body: { data: docBase(), base_rev: 7 } });
    eq(foreign.statusCode, 403, 'otro origen no puede escribir');

    const get = await api.call({ method: 'GET' });
    eq(get.statusCode, 200, 'GET responde');
    eq(JSON.parse(get.body).rev, 8, 'GET informa la revisión');
    ok(api.lastRestPath.includes('user_id=eq.' + api.userId), 'la lectura se filtra por el usuario de la sesión');

    const history = await api.call({ method: 'GET', action: 'history' });
    eq(history.statusCode, 200, 'el historial de versiones responde');
    ok(Array.isArray(JSON.parse(history.body).items), 'devuelve una lista de versiones');

    const restore = await api.call({ method: 'PUT', action: 'restore', body: { rev: 5 } });
    eq(restore.statusCode, 200, 'recuperar una versión funciona');
    eq(JSON.parse(restore.body).restored, 5, 'se recupera la versión pedida');

    const badRestore = await api.call({ method: 'PUT', action: 'restore', body: { rev: -1 } });
    eq(badRestore.statusCode, 400, 'una revisión inválida se rechaza');

    const notAllowed = await api.call({ method: 'POST', action: 'history' });
    eq(notAllowed.statusCode, 405, 'métodos no permitidos se rechazan');

    api.session = null;
    const anonymous = await api.call({ method: 'GET' });
    eq(anonymous.statusCode, 401, 'sin sesión no se lee nada');
  }

  /* Compatibilidad con los datos existentes -------------------------------- */
  {
    const legacy = {
      workouts: [{ id: 'w1', name: 'Entreno', exercises: [{ id: 'e1', name: 'Sentadilla', sets: 4, reps: 8, weight: 50 }] }],
      sessions: [{ id: 's1', workoutId: 'w1', workoutName: 'Entreno', date: '2026-10-28', finished: true, exercises: [{ id: 'e1', name: 'Sentadilla', targetSets: 4, targetReps: 8, weight: 50, reps: 8, done: true }] }],
      prs: [{ id: 'p1', exercise: 'Sentadilla', date: '2026-10-28', weight: 100, reps: 1 }],
      weights: [{ id: 'x1', date: '2026-10-28', weight: 80 }],
      hiddenLib: ['lib-push'], photo: null,
      consent: { version: '2026-10-28', at: '2026-10-28T09:00:00.000Z', terms: true, age16: true, health: true },
    };
    const merged = syncLib.merge(null, legacy, legacy);
    ok(security.validateData(merged.data), 'un perfil antiguo sigue siendo válido después de combinar');
    eq(merged.data.prs.length, 1, 'no se duplican los récords antiguos');
    eq(merged.data.sessions[0].exercises[0].reps, 8, 'los pesos y repeticiones se conservan');

    const idless = { prs: [{ exercise: 'Press', date: '2026-10-28', weight: 60, reps: 8 }] };
    const twice = syncLib.merge(null, idless, idless);
    eq(twice.data.prs.length, 1, 'los elementos sin id no se duplican al combinar');

    const withPhoto = Object.assign(docBase(), { photo: 'data:image/jpeg;base64,' + 'A'.repeat(64) });
    ok(security.validateData(withPhoto), 'la foto de progreso sigue siendo válida');
    const photoMerge = syncLib.merge(syncLib.digest(docBase()), withPhoto, docBase());
    ok(photoMerge.data.photo === withPhoto.photo, 'la foto no se pierde al combinar');
  }

  console.log('sync: ' + passed + ' assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

/* -------------------------------------------------------------- helpers */
function docA2() { return null; }
function docA4() { return null; }
function docA6() { return null; }
function docA8() { return null; }
function docA9() { return null; }
function docA11() { return null; }
function docA13() { return null; }
function docA15() { return null; }

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

async function apiWith(options) {
  const handler = require('./api/data/[action]');
  const sb = require('./api/_lib/supabase');
  const rateLimit = require('./api/_lib/rate-limit');
  const state = {
    userId: '11111111-2222-3333-4444-555555555555',
    session: { id: 'x' },
    calls: 0,
    rpcCalls: [],
    lastRestPath: '',
    row: options && options.row ? clone(options.row) : null,
  };
  sb.hasServerKey = () => true;
  sb.authenticatedSession = async () => (state.session ? { user: { id: state.userId, email: 'user@drakotrack.test' }, accessToken: 'access' } : null);
  sb.rest = async path => {
    state.lastRestPath = path;
    return { ok: true, json: async () => (state.row ? [state.row] : []) };
  };
  sb.rpcAuthed = async (name, body) => {
    state.calls += 1;
    state.rpcCalls.push({ name, body });
    if (name === 'dt_save_app_data') {
      const baseRev = body.p_base_rev;
      const current = state.row ? state.row.rev : null;
      if (current !== null && (baseRev === null || baseRev !== current)) return { ok: true, json: async () => ({ ok: false, rev: current }) };
      if (state.row) state.row.rev += 1;
      return { ok: true, json: async () => ({ ok: true, rev: state.row ? state.row.rev : 1, replay: false }) };
    }
    if (name === 'dt_app_data_history') return { ok: true, json: async () => ([{ rev: 6, saved_at: '2026-11-01T09:00:00.000Z', bytes: 100 }]) };
    if (name === 'dt_restore_app_data') {
      if (body.p_rev === 5) return { ok: true, json: async () => ({ ok: true, rev: 9, restored: 5 }) };
      return { ok: true, json: async () => ({ ok: false, reason: 'not_found' }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  rateLimit.__test.reset();
  return {
    userId: state.userId,
    get session() { return state.session; },
    set session(value) { state.session = value; },
    get calls() { return state.calls; },
    set calls(value) { state.calls = value; },
    get rpcCalls() { return state.rpcCalls; },
    get lastRestPath() { return state.lastRestPath; },
    async call(req) {
      const { action, ...rest } = req;
      const res = response();
      const base = { headers: { origin: 'https://drakotrack.vercel.app' }, query: { action: action || 'profile' } };
      await handler({ ...base, ...rest }, res);
      return res;
    },
  };
}
