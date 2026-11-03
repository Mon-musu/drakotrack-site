'use strict';
/* ============================================================
   Etapa 5 — correcciones de la auditoría
   ------------------------------------------------------------
   1) Temporizador de descanso: iniciar, pausar, reanudar,
      reiniciar, recuperar tras recarga y nunca dos a la vez.
   2) Navegación entre ejercicios sin perder ni duplicar series.
   3) Controles rápidos de peso con incremento configurable.
   4) Carrera de sincronización: un guardado durante el envío
      no se pierde ni se marca como sincronizado.
   5) Borrado frente a modificación de la misma serie: se
      detecta el conflicto, se conservan ambas versiones y la
      serie borrada no resucita por una sincronización vieja.

   Usa el sistema de pruebas del proyecto (contador propio) y el
   mismo servidor falso que test-sync.js, que aplica la regla de
   revisión del servidor real.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const syncLib = require('./sync');
const security = require('./lib/security');

let pass = 0, fail = 0;
function ok(value, label) {
  if (value) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}
const eq = (actual, expected, label) => ok(JSON.stringify(actual) === JSON.stringify(expected), label);
const clone = value => JSON.parse(JSON.stringify(value));
const ACCOUNT = 'etapa5@drakotrack.test';

/* ------------------------------------------------------------ app real */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8765/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  beforeParse(w) {
    Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
  },
});
const { window } = dom;
const ctx = dom.getInternalVMContext();
for (const f of ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const g = code => vm.runInContext(code, ctx, { filename: 'test-session-fixes' });
const tick = ms => new Promise(r => setTimeout(r, ms));
const doc = window.document;
const click = sel => {
  const el = doc.querySelector(sel);
  if (!el) throw new Error('no existe ' + sel);
  el.click();
  return el;
};

/* ------------------------------------------------------------ documentos */
const mkSet = (n, weight = 60) => ({
  id: 'set-' + n, number: n, weight, reps: 8, completed: true, type: 'working',
  rir: null, rpe: null, restSeconds: null, notes: '',
});
const mkDoc = () => ({
  workouts: [{ id: 'w-1', name: 'Empuje', exercises: [{ id: 'we-1', name: 'Press de banca', sets: 3, reps: 8 }] }],
  sessions: [{
    id: 's-1', workoutId: 'w-1', workoutName: 'Empuje', date: '2026-11-01',
    startedAt: '2026-11-01T09:00:00.000Z', finished: false, status: 'in_progress', setModel: 2,
    exercises: [{
      id: 'ex-a', name: 'Press de banca', exId: 'press-de-banca', targetSets: 3, targetReps: 8,
      superset: false, setModel: 2, sets: [mkSet(1), mkSet(2)],
    }],
  }],
  prs: [], weights: [], records: [], exercises: [], hiddenLib: [], prefs: {},
});
const emptyDoc = () => ({ workouts: [], sessions: [], prs: [], weights: [], records: [], exercises: [], hiddenLib: [], prefs: {} });
const tombstoneFor = set => Object.assign({}, clone(set), { at: 1762000000000 });
const setIds = ex => (ex.sets || []).map(s => s.id).sort();

/* ------------------------------------------------------------ servidor falso */
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
        async save(docToSave, baseRev, opId) {
          const row = rows.get(userId);
          if (!row) {
            this.writes += 1;
            rows.set(userId, { rev: 1, data: clone(docToSave), lastOp: opId });
            return { rev: 1, replay: false };
          }
          if (opId && row.lastOp === opId && JSON.stringify(row.data) === JSON.stringify(docToSave)) {
            return { rev: row.rev, replay: true };
          }
          if (baseRev === null || baseRev !== row.rev) {
            const error = new Error('conflict');
            error.status = 409;
            throw error;
          }
          this.writes += 1;
          row.rev += 1;
          row.data = clone(docToSave);
          row.lastOp = opId;
          return { rev: row.rev, replay: false };
        },
      };
    },
  };
}
let engineSeq = 0;
const engineFor = (server, extra = {}) => {
  const device = ++engineSeq;
  return syncLib.createEngine({
    storage: extra.storage || syncLib.memoryStorage(),
    remote: extra.remote || server.adapter(ACCOUNT),
    now: () => 1762000000000,
    newId: (() => { let n = 0; return () => 'op-' + device + '-' + (++n); })(),
  });
};

/* ============================================================ 1. App */
async function appTests() {
  g("(function(){ closeModal(); currentUser = 'etapa5_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY, currentUser); saveDB(); })()");
  g('render()');
  const sid = g(`(function(){
    const d = dataFor(currentUser);
    if(!d.workouts.some(w => w.id === 'w-stage5')){
      d.workouts.push({ id:'w-stage5', name:'Rutina etapa 5', exercises:[
        { id:'w5x1', name:'Sentadilla', exId:'sentadilla-trasera', sets:3, reps:5, weight:60, rest:90 },
        { id:'w5x2', name:'Press banca', exId:'press-de-banca', sets:2, reps:5, weight:40, rest:60 },
        { id:'w5x3', name:'Remo con barra', exId:'remo-con-barra', sets:2, reps:8, weight:30, rest:60 }
      ] });
      saveDB();
    }
    return startOrGetSession('w-stage5').id;
  })()`);
  g(`nav('#/session/${sid}')`);
  await tick(30);
  const sess = () => JSON.parse(g(`JSON.stringify(getSession('${sid}'))`));

  /* ---------------- temporizador ---------------- */
  ok(!!doc.querySelector('[data-action="rest-start"]'), 'T1. Hay un botón para iniciar el descanso manualmente');
  click('[data-action="rest-start"]');
  await tick(30);
  let s = sess();
  ok(!!s.rest && s.rest.duration === 90, 'T1b. El descanso manual usa el descanso planificado del ejercicio');
  ok(!!doc.querySelector('#rest-time'), 'T1c. La barra muestra la cuenta atrás');
  ok(/En curso/.test(doc.querySelector('#rest-slot').textContent), 'T1d. El estado se muestra como «en curso»');

  click('[data-action="rest-pause"]');
  await tick(30);
  s = sess();
  ok(!!s.rest.pausedAt && s.rest.remainingMs > 80000, 'T2. Pausar conserva el tiempo restante');
  ok(s.rest.endsAt === null || s.rest.endsAt === undefined, 'T2b. En pausa no queda una hora de fin activa');
  ok(/En pausa/.test(doc.querySelector('#rest-slot').textContent), 'T2c. El estado se muestra como «en pausa»');
  ok(!g('_restClock'), 'T2d. Al pausar se detiene el intervalo de pintado');

  const frozenA = g(`restRemaining(getSession('${sid}'))`);
  await tick(300);
  const frozenB = g(`restRemaining(getSession('${sid}'))`);
  ok(frozenA === frozenB, 'T4. El tiempo no corre mientras está en pausa');

  click('[data-action="rest-resume"]');
  await tick(30);
  s = sess();
  const resumed = g(`restRemaining(getSession('${sid}'))`);
  ok(!s.rest.pausedAt && !!s.rest.endsAt, 'T3. Reanudar vuelve a poner el descanso en marcha');
  ok(Math.abs(resumed - frozenA) <= 1, 'T3b. Reanudar conserva el tiempo restante exacto');
  const endsIn = g(`Math.round((getSession('${sid}').rest.endsAt - Date.now()) / 1000)`);
  ok(endsIn >= frozenA - 1 && endsIn <= frozenA + 1, 'T3c. El nuevo fin se calcula desde ese resto');

  g('persistLocal(); db = loadDB(); render();');
  await tick(30);
  ok(!!doc.querySelector('#rest-time'), 'T5. El temporizador se recupera después de recargar');
  ok(g(`restRemaining(getSession('${sid}')) > 0`), 'T5b. Sigue corriendo con marcas de tiempo reales');

  g(`(function(){ const se = getSession('${sid}'); se.rest.remainingMs = 45000; se.rest.pausedAt = Date.now(); se.rest.endsAt = null; saveDB(); })()`);
  g('persistLocal(); db = loadDB(); render();');
  await tick(30);
  ok(g(`restState(getSession('${sid}')) === 'paused'`), 'T5c. Una pausa sobrevive a la recarga');
  ok(g(`restRemaining(getSession('${sid}')) === 45`), 'T5d. El resto guardado se respeta al recuperar');

  g(`startRestTimer(getSession('${sid}'), 60, null, null)`);
  const endsBeforeNav = g(`getSession('${sid}').rest.endsAt`);
  const chips = doc.querySelectorAll('[data-action="session-goto-ex"]');
  ok(chips.length === 3, 'T6. El navegador muestra los tres ejercicios');
  chips[1].click();
  await tick(30);
  ok(g(`getSession('${sid}').currentExerciseId`) === 'w5x2', 'T6b. Cambiar de ejercicio mientras el descanso corre es posible');
  ok(g(`getSession('${sid}').rest.endsAt`) === endsBeforeNav, 'T6c. Cambiar de ejercicio no reinicia ni detiene el descanso');

  const genBefore = g('_restGen');
  click('[data-action="rest-reset"]');
  await tick(30);
  ok(doc.querySelectorAll('#rest-time').length === 1, 'T7. Solo hay un temporizador activo a la vez');
  ok(g('_restGen') > genBefore, 'T7b. La barra anterior queda invalidada al reiniciar');
  ok(!!sess().rest, 'T7c. Reiniciar mantiene un único descanso en la sesión');

  /* ---------------- navegación ---------------- */
  g(`(function(){ const se = getSession('${sid}'); se.currentExerciseId = se.exercises[0].id; saveDB(); render(); })()`);
  await tick(20);
  click('[data-action="session-next-ex"]');
  await tick(30);
  ok(g(`getSession('${sid}').currentExerciseId`) === 'w5x2', 'N8. Siguiente ejercicio');
  click('[data-action="session-prev-ex"]');
  await tick(30);
  ok(g(`getSession('${sid}').currentExerciseId`) === 'w5x1', 'N9. Ejercicio anterior');

  const select = doc.querySelector('[data-action="session-jump-ex"]');
  select.value = 'w5x3';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(30);
  ok(g(`getSession('${sid}').currentExerciseId`) === 'w5x3', 'N10. Selección directa de un ejercicio');

  const beforeNav = sess();
  const beforeIds = beforeNav.exercises.flatMap(e => (e.sets || []).map(st => st.id)).sort();
  const beforeWeights = beforeNav.exercises.map(e => (e.sets || []).map(st => st.weight));
  g(`(function(){ const se = getSession('${sid}'); se.currentExerciseId = se.exercises[0].id; saveDB(); render(); })()`);
  click('[data-action="session-next-ex"]');
  await tick(20);
  click('[data-action="session-next-ex"]');
  await tick(20);
  click('[data-action="session-goto-ex"][data-ex="w5x1"]');
  await tick(30);
  const afterNav = sess();
  const afterIds = afterNav.exercises.flatMap(e => (e.sets || []).map(st => st.id)).sort();
  const afterWeights = afterNav.exercises.map(e => (e.sets || []).map(st => st.weight));
  ok(JSON.stringify(beforeIds) === JSON.stringify(afterIds), 'N11. Navegar con series pendientes no pierde ni duplica series');
  ok(JSON.stringify(beforeWeights) === JSON.stringify(afterWeights), 'N11b. Los valores registrados se conservan al navegar');
  ok(new Set(afterIds).size === afterIds.length, 'N13. Ningún identificador de serie repetido tras navegar');

  g(`(function(){ const se = getSession('${sid}'); se.exercises[0].superset = true; se.exercises[1].superset = true; saveDB(); render(); })()`);
  await tick(30);
  const chipText = [...doc.querySelectorAll('.ex-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
  ok(chipText.some(t => /A1/.test(t)) && chipText.some(t => /A2/.test(t)), 'N12. Las superseries se muestran como A1 y A2');
  click('[data-action="session-goto-ex"][data-ex="w5x2"]');
  await tick(30);
  ok(g(`getSession('${sid}').currentExerciseId`) === 'w5x2', 'N12b. Se puede navegar entre los miembros de una superserie');
  ok(g(`supersetGroups(getSession('${sid}')).length`) === 1, 'N12c. La superserie sigue intacta después de navegar');

  /* ---------------- peso ---------------- */
  g(`(function(){ const d = dataFor(currentUser); delete d.prefs.weightStep; const se = getSession('${sid}'); se.currentExerciseId = se.exercises[0].id; se.exercises[0].sets[0].weight = 60; se.exercises[0].sets[1].weight = 50; saveDB(); render(); })()`);
  await tick(20);
  g('setWeightStep(2.5); render();');
  await tick(20);
  click('[data-ex-block="w5x1"] [data-action="adj-set"][data-field="weight"][data-dir="1"]');
  await tick(20);
  ok(g(`getSession('${sid}').exercises[0].sets[0].weight`) === 62.5, 'P14. Aumentar peso con el incremento elegido');
  click('[data-ex-block="w5x1"] [data-action="adj-set"][data-field="weight"][data-dir="-1"]');
  await tick(20);
  ok(g(`getSession('${sid}').exercises[0].sets[0].weight`) === 60, 'P15. Reducir peso');

  g('setWeightStep(1.25); render();');
  await tick(20);
  click('[data-ex-block="w5x1"] [data-action="adj-set"][data-field="weight"][data-dir="1"]');
  await tick(20);
  click('[data-ex-block="w5x1"] [data-action="adj-set"][data-field="weight"][data-dir="1"]');
  await tick(20);
  ok(g(`getSession('${sid}').exercises[0].sets[0].weight`) === 62.5, 'P16. Los incrementos decimales son exactos');
  ok(g('roundKg(0.1 + 0.2)') === 0.3, 'P16b. Sin errores de precisión decimal');

  g(`(function(){ const se = getSession('${sid}'); se.exercises[0].sets[0].weight = 0; saveDB(); render(); })()`);
  await tick(20);
  click('[data-ex-block="w5x1"] [data-action="adj-set"][data-field="weight"][data-dir="-1"]');
  await tick(20);
  ok(g(`String(getSession('${sid}').exercises[0].sets[0].weight)`) === '', 'P17. Un peso nunca queda negativo');

  const wInput = doc.querySelector('[data-ex-block="w5x1"] .set-item input[data-field="weight"]');
  wInput.value = '-5';
  wInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(20);
  const negative = g(`String(getSession('${sid}').exercises[0].sets[0].weight)`);
  ok(negative === '' || Number(negative) >= 0, 'P17b. Un valor negativo escrito se rechaza');

  g(`(function(){ const se = getSession('${sid}'); se.exercises[0].sets[0].weight = 60; se.exercises[0].sets[1].weight = 50; se.exercises[1].sets[0].weight = 40; saveDB(); render(); })()`);
  await tick(20);
  const secondInput = doc.querySelectorAll('[data-ex-block="w5x1"] .set-item input[data-field="weight"]')[1];
  secondInput.value = '77';
  secondInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(20);
  ok(g(`getSession('${sid}').exercises[0].sets[0].weight`) === 60, 'P18. Modificar una serie no altera las demás del ejercicio');
  ok(g(`getSession('${sid}').exercises[1].sets[0].weight`) === 40, 'P18b. Ni las de otros ejercicios');

  /* ---------------- lápida al borrar desde la interfaz ---------------- */
  const doomed = g(`getSession('${sid}').exercises[0].sets[0].id`);
  click(`[data-ex-block="w5x1"] [data-action="delete-set"][data-set="${doomed}"]`);
  await tick(30);
  ok(g(`!getSession('${sid}').exercises[0].sets.some(st => st.id === '${doomed}')`), 'C26. Borrar una serie la quita de la lista');
  const tomb = g(`JSON.stringify((getSession('${sid}').exercises[0].setTombstones || {})['${doomed}'] || null)`);
  ok(tomb !== 'null' && tomb.indexOf(doomed) >= 0, 'C26b. La serie borrada deja una lápida con su copia');

  /* ---------------- la sesión sigue siendo válida para la API ---------------- */
  const liveDoc = JSON.parse(g('JSON.stringify(dataFor(currentUser))'));
  ok(security.validateData(liveDoc), 'C30b. La API acepta el documento con series, lápida y descanso');
}

/* ============================================================ 2. Sync */
async function syncTests() {
  /* --- 19-25. Guardado durante una sincronización en vuelo --- */
  {
    const rows = new Map();
    let release;
    let writes = 0;
    let signalSave;
    const gate = new Promise(resolve => { release = resolve; });
    const saveStarted = new Promise(resolve => { signalSave = resolve; });
    const adapter = {
      async load() {
        const row = rows.get(ACCOUNT);
        return row ? { rev: row.rev, data: clone(row.data) } : null;
      },
      async save(docToSave, baseRev) {
        signalSave();
        await gate;                       /* la petición tarda: el usuario sigue entrenando */
        const row = rows.get(ACCOUNT);
        writes += 1;
        if (!row) { rows.set(ACCOUNT, { rev: 1, data: clone(docToSave) }); return { rev: 1 }; }
        if (baseRev !== row.rev) { const error = new Error('conflict'); error.status = 409; throw error; }
        rows.set(ACCOUNT, { rev: row.rev + 1, data: clone(docToSave) });
        return { rev: row.rev + 1 };
      },
    };
    const engine = engineFor({ adapter: () => adapter }, { remote: adapter });
    const docNow = mkDoc();
    const firstRun = engine.sync(ACCOUNT, docNow);
    await saveStarted;                                /* la petición ya está en vuelo */

    /* El usuario registra otra serie mientras el envío está en vuelo. */
    docNow.sessions[0].exercises[0].sets.push(mkSet(3));
    docNow.sessions[0].exercises[0].sets[2].completed = true;
    engine.markDirty(ACCOUNT);
    const revisionDuringFlight = engine.state(ACCOUNT).revision;
    const docWithoutThird = clone(docNow);
    docWithoutThird.sessions[0].exercises[0].sets = docWithoutThird.sessions[0].exercises[0].sets.slice(0, 2);

    release();
    const first = await firstRun;
    eq(first.status, 'pushed', 'S19. La primera sincronización termina');
    eq(engine.state(ACCOUNT).dirty, true, 'S20. La serie registrada durante el envío sigue pendiente');
    eq(first.needsPush, true, 'S20b. El motor pide una sincronización más');
    ok(engine.state(ACCOUNT).revision > 0 && engine.state(ACCOUNT).revision === revisionDuringFlight, 'S25. La marca de cambios pendientes no se pierde');
    ok(JSON.stringify(engine.state(ACCOUNT).digest) === JSON.stringify(syncLib.digest(docWithoutThird)), 'S24. La respuesta antigua no se marca como la versión sincronizada');
    ok(rows.get(ACCOUNT).data.sessions[0].exercises[0].sets.length === 2, 'S24b. El servidor tiene la versión anterior, no la nueva');

    const second = await engine.sync(ACCOUNT, docNow);
    eq(second.status, 'pushed', 'S21. La modificación pendiente se envía después');
    eq(rows.get(ACCOUNT).data.sessions[0].exercises[0].sets.length, 3, 'S21b. El servidor recibe la serie nueva');
    eq(engine.state(ACCOUNT).dirty, false, 'S21c. Al terminar ya no quedan pendientes');
    eq(writes, 2, 'S21d. Dos escrituras, ninguna duplicada');
  }

  /* --- 22-23. Error de red y reintento --- */
  {
    const server = fakeServer();
    const real = server.adapter(ACCOUNT);
    let online = false;
    const remote = {
      load: () => real.load(),
      save: (...args) => online ? real.save(...args) : Promise.reject(new Error('sin red')),
    };
    const engine = engineFor(server, { remote });
    const docNow = mkDoc();
    engine.markDirty(ACCOUNT);
    const outcome = await engine.sync(ACCOUNT, docNow).then(() => 'ok', () => 'throw');
    eq(outcome, 'throw', 'S22. Un fallo de red se propaga');
    eq(engine.state(ACCOUNT).dirty, true, 'S22b. El cambio sigue pendiente tras el error');
    ok(typeof engine.state(ACCOUNT).opId === 'string' && engine.state(ACCOUNT).opId.length > 0, 'S25b. Se conserva el identificador de la operación');
    online = true;
    const retry = await engine.sync(ACCOUNT, docNow);
    eq(retry.status, 'pushed', 'S23. Al volver la conexión se reintenta y se guarda');
    eq(engine.state(ACCOUNT).dirty, false, 'S23b. El reintento cierra los pendientes');
  }

  /* --- 26-29. Borrar en un dispositivo y modificar en el otro --- */
  {
    const server = fakeServer();
    const mine = engineFor(server);
    const other = engineFor(server);
    await mine.sync(ACCOUNT, mkDoc());
    await other.sync(ACCOUNT, emptyDoc());

    /* El otro dispositivo cambia el peso de la serie 1. */
    const docOther = mkDoc();
    docOther.sessions[0].exercises[0].sets[0].weight = 70;
    other.markDirty(ACCOUNT);
    await other.sync(ACCOUNT, docOther);

    /* Aquí se borra esa misma serie: lápida + resto de series intactas. */
    const docMine = mkDoc();
    const exMine = docMine.sessions[0].exercises[0];
    exMine.setTombstones = { 'set-1': tombstoneFor(exMine.sets[0]) };
    exMine.sets = exMine.sets.filter(st => st.id !== 'set-1');
    mine.markDirty(ACCOUNT);
    const merged = await mine.sync(ACCOUNT, docMine);

    eq(merged.status, 'merged', 'C27. La sincronización detecta que los dos tocaron la misma serie');
    const clash = merged.conflicts.find(c => c.kind === 'set-deleted');
    ok(!!clash, 'C27b. El conflicto se registra como serie borrada frente a modificada');
    ok(clash && clash.remote && clash.remote.weight === 70, 'C28. La versión modificada no desaparece');
    const exMerged = merged.data.sessions[0].exercises[0];
    ok(!exMerged.sets.some(st => st.id === 'set-1'), 'C26. La serie borrada no se restaura sola');
    ok(!!exMerged.setTombstones && !!exMerged.setTombstones['set-1'], 'C31. La lápida se conserva para que no resucite');
    eq(setIds(exMerged), ['set-2'], 'C30. Las demás series quedan intactas');
    ok(security.validateData(merged.data), 'C28b. El documento combinado sigue siendo válido');

    const resolved = mine.resolveConflict(ACCOUNT, clash.key, 'theirs', merged.data);
    const exResolved = resolved.data.sessions[0].exercises[0];
    ok(exResolved.sets.some(st => st.id === 'set-1' && st.weight === 70), 'C29. Se puede recuperar la serie modificada');
    ok(!exResolved.setTombstones || !exResolved.setTombstones['set-1'], 'C29b. Recuperarla retira su lápida');
    eq(mine.state(ACCOUNT).conflicts.length, 0, 'C29c. El conflicto se cierra al decidir');
  }

  /* --- 26b-31b. El dispositivo que modifica recibe el aviso del borrado --- */
  {
    const server = fakeServer();
    const deleting = engineFor(server);
    const modifying = engineFor(server);
    await deleting.sync(ACCOUNT, mkDoc());
    await modifying.sync(ACCOUNT, emptyDoc());

    const docDel = mkDoc();
    const exDel = docDel.sessions[0].exercises[0];
    exDel.setTombstones = { 'set-2': tombstoneFor(exDel.sets[1]) };
    exDel.sets = exDel.sets.filter(st => st.id !== 'set-2');
    deleting.markDirty(ACCOUNT);
    await deleting.sync(ACCOUNT, docDel);

    const docMod = mkDoc();
    docMod.sessions[0].exercises[0].sets[1].weight = 80;
    modifying.markDirty(ACCOUNT);
    const merged = await modifying.sync(ACCOUNT, docMod);
    const clash = merged.conflicts.find(c => c.kind === 'set-deleted-remote');
    ok(!!clash, 'C26c. Se detecta el borrado hecho en el otro dispositivo');
    const exMerged = merged.data.sessions[0].exercises[0];
    ok(exMerged.sets.some(st => st.id === 'set-2' && st.weight === 80), 'C28c. La modificación no se descarta en silencio');
    ok(clash && clash.deleted && clash.deleted.id === 'set-2', 'C28d. Se conserva la información del borrado');

    const accepted = modifying.resolveConflict(ACCOUNT, clash.key, 'theirs', merged.data);
    const exAccepted = accepted.data.sessions[0].exercises[0];
    ok(!exAccepted.sets.some(st => st.id === 'set-2'), 'C29d. Se puede aceptar el borrado del otro dispositivo');
    ok(!!exAccepted.setTombstones && !!exAccepted.setTombstones['set-2'], 'C31b. Al aceptarlo queda registrada la lápida');

    const kept = modifying.resolveConflict(ACCOUNT, 'inexistente', 'mine', accepted.data);
    ok(!!kept, 'C29e. Resolver una clave que ya no existe no rompe nada');
  }

  /* --- 26c-31c. Una sincronización antigua no resucita la serie borrada --- */
  {
    const server = fakeServer();
    const deleter = engineFor(server);
    const stale = engineFor(server);
    await deleter.sync(ACCOUNT, mkDoc());
    await stale.sync(ACCOUNT, emptyDoc());     /* conoce la versión anterior */

    const docDel = mkDoc();
    const exDel = docDel.sessions[0].exercises[0];
    exDel.setTombstones = { 'set-1': tombstoneFor(exDel.sets[0]) };
    exDel.sets = exDel.sets.filter(st => st.id !== 'set-1');
    deleter.markDirty(ACCOUNT);
    await deleter.sync(ACCOUNT, docDel);

    /* Este dispositivo estuvo desconectado y sube su copia antigua. */
    const old = mkDoc();
    stale.markDirty(ACCOUNT);
    const merged = await stale.sync(ACCOUNT, old);
    const exMerged = merged.data.sessions[0].exercises[0];
    ok(!exMerged.sets.some(st => st.id === 'set-1'), 'C31c. Una sincronización antigua no resucita la serie borrada');
    eq(setIds(exMerged), ['set-2'], 'C30b. El resto de series sigue igual');
    eq(merged.conflicts.length, 0, 'C31d. Ningún conflicto si la copia antigua no cambiaba nada');

    await stale.sync(ACCOUNT, merged.data);
    ok(!server.rows.get(ACCOUNT).data.sessions[0].exercises[0].sets.some(st => st.id === 'set-1'), 'C31e. El servidor tampoco recupera la serie borrada');
  }
}

(async () => {
  try {
    await appTests();
  } catch (error) {
    fail++;
    console.log('  FAIL app tests: ' + error.message);
  }
  try {
    await syncTests();
  } catch (error) {
    fail++;
    console.log('  FAIL sync tests: ' + error.message);
  }
  console.log('\n=== ETAPA 5: descanso, navegación, peso y sincronización ===');
  console.log('passed:', pass, 'failed:', fail);
  process.exit(fail > 0 ? 1 : 0);
})();
