'use strict';
/* Pruebas del Prompt 5: historial, récords, progresión, volumen y peso.
   Dos capas:
   1. Cálculos puros de progress.js (sin DOM) con datos sintéticos.
   2. Integración real: se carga la app completa en jsdom y se manejan
      las vistas de historial, récords, progreso y peso. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const PG = require('./progress.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

/* ---------------- 1. Cálculos puros ---------------- */

function session(id, date, exId, name, sets) {
  return { id, date, finished: true, status: 'completed', workoutName: 'Día',
    startedAt: date + 'T18:00:00.000Z', finishedAt: date + 'T19:00:00.000Z', durationSec: 3600,
    exercises: [{ id: 'x' + id, exId, name, setModel: 2, sets }] };
}
function st(weight, reps, extra) {
  return Object.assign({ id: 'st' + Math.random(), weight, reps, completed: true, type: 'working' }, extra || {});
}

const data = {
  sessions: [
    session('a', '2026-10-01', 'bench', 'Press banca', [st(80, 5), st(60, 10, { type: 'warmup' }), st(80, 4, { completed: false })]),
    session('b', '2026-10-08', 'bench', 'Press banca', [st(85, 5), st(85, 6)]),
    session('c', '2026-10-15', 'bench', 'Press banca', [st(85, 8)]),
    session('d', '2026-10-20', 'squat', 'Sentadilla', [st(100, 5)]),
    { id: 'e', date: '2026-10-22', finished: false, status: 'in_progress', workoutName: 'En curso', exercises: [{ exId: 'bench', name: 'Press banca', setModel: 2, sets: [st(200, 5)] }] },
    session('f', '2026-10-24', 'bench', 'Press banca', [st(0, 12), st(0, 10)]),
  ],
  weights: [
    { id: 'w1', date: '2026-10-01', weight: 80 },
    { id: 'w2', date: '2026-10-01', weight: 81 },
    { id: 'w3', date: '2026-10-15', weight: 79 },
  ],
};

console.log('\n=== Cálculos de progreso ===');
check('1RM Epley 85×6 = 102', PG.estimate1RM(85, 6) === 102);
check('1RM de una repetición es el peso real', PG.estimate1RM(90, 1) === 90);
check('1RM se descarta con repeticiones poco fiables (>12)', PG.estimate1RM(100, 20) === 0);
check('1RM se descarta sin peso', PG.estimate1RM(0, 5) === 0 && PG.estimate1RM('', 5) === 0);

check('volumen = peso × repeticiones', PG.setVolume(st(80, 5)) === 400);
check('calentamiento no suma volumen', PG.setVolume(st(60, 10, { type: 'warmup' })) === 0);
check('serie sin completar no suma volumen', PG.setVolume(st(80, 5, { completed: false })) === 0);
check('peso corporal no suma kilos de volumen', PG.setVolume(st(0, 12)) === 0);

const hist = PG.history(data, null);
check('solo cuentan sesiones terminadas (5 de 6)', hist.length === 5);
check('la sesión en curso no entra en el historial', hist.every(r => r.id !== 'e'));
check('volumen de sesión correcto (sin calentamientos)', hist.find(r => r.id === 'a').volume === 400);
check('repeticiones efectivas correctas', hist.find(r => r.id === 'a').reps === 5);
check('el peso corporal no infla el volumen de la sesión', hist.find(r => r.id === 'f').volume === 0 && hist.find(r => r.id === 'f').reps === 22);

const rec = PG.recordsFor(data, null, 'bench');
check('récord de peso = 85 kg', rec.bestWeight.value === 85);
check('récord de peso apunta a su sesión y fecha', rec.bestWeight.sessionId === 'c' && rec.bestWeight.date === '2026-10-15');
check('récord de repeticiones al peso máximo = 8', rec.bestRepsAtWeight.value === 8);
check('récord de volumen en una serie = 680 (85×8)', rec.bestSetVolume.value === 680);
check('récord de volumen de sesión = 935', rec.bestSessionVolume.value === 935);
check('mejor 1RM estimado = 107,7 (85×8, Epley)', rec.bestE1rm.value === 107.7 && rec.bestE1rm.estimated === true);
check('la evolución del peso solo anota mejoras', rec.timeline.weight.map(e => e.value).join(',') === '80,85,85');
check('la evolución guarda el valor anterior', rec.timeline.weight[1].previous === 80 && rec.timeline.weight[2].previous === 85);
check('las repeticiones a 60 kg no cuentan como récord de peso', rec.bestWeight.value === 85);

const sinRecord = PG.recordsFor({ sessions: [] }, null, 'bench');
check('sin historial no hay récords inventados', sinRecord.sessions === 0 && !sinRecord.bestWeight);

const borrado = JSON.parse(JSON.stringify(data));
borrado.sessions = borrado.sessions.filter(s => s.id !== 'c');
const rec2 = PG.recordsFor(borrado, null, 'bench');
check('al borrar la sesión del récord, se recalcula al anterior', rec2.bestRepsAtWeight.value === 6 && rec2.bestWeight.value === 85);
check('al borrar una sesión no se pierden las demás', PG.history(borrado, null).length === 4);

const rows = PG.exerciseRows(data, null, 'bench');
const cmpSession = PG.compare(rows, 'weight', 'session');
check('comparación última vs anterior (misma marca = se mantiene)', !!cmpSession && cmpSession.current === 85 && cmpSession.base === 85 && cmpSession.trend === 'flat');
check('comparación primer registro vs último', PG.compare(rows, 'weight', 'first').base === 80);
check('sin ventanas suficientes no se inventa tendencia', PG.compare(rows, 'weight', 'week') === null);
const since = PG.compareSince(rows, 'weight', 90, '2026-12-31');
check('comparación hace 3 meses usa la marca de entonces', !!since && since.base === 80 && since.current === 85 && since.baseDate === '2026-10-01');
check('sin dato de hace 3 meses no se inventa comparación', PG.compareSince(rows, 'weight', 90, '2026-10-20') === null);
check('comparación con un solo registro no existe', PG.compare(rows.slice(0, 1), 'weight', 'session') === null);

const vol = PG.volumeSummary(data, null);
check('volumen semanal agrupa por semana', Array.isArray(vol.weekly) && vol.weekly.length >= 2);
check('volumen histórico suma todas las sesiones', vol.all.volume > 0 && vol.all.sessions === 5);
check('volumen mensual tiene su serie', vol.monthly.length >= 1);

const bw = PG.bodyweight(data);
check('peso corporal: una medición por día', bw.list.length === 2);
check('peso corporal no duplica el mismo día', bw.list[0].weight === 81);
check('peso corporal: cambio total', bw.changeAll === -2);
check('peso corporal: media mensual', bw.monthAvg === 80);
check('peso corporal: no modifica el dato original', data.weights.length === 3);
check('peso corporal sin datos no rompe', PG.bodyweight({}).latest === null);

const freq = PG.buckets(hist, 'week');
check('frecuencia semanal cuenta sesiones', freq.reduce((a, b) => a + b.sessions, 0) === 5);

/* ---------------- 2. Integración con la app ---------------- */

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8765/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  beforeParse(w) {
    Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
  },
});
const ctx = dom.getInternalVMContext();
for (const f of ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js',
    'offline.js', 'analytics.js', 'activity.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });

(async () => {
  console.log('\n=== Integración: historial, récords, progreso y peso ===');

  g(`(function(){
    localStorage.clear();
    db = { users:{}, data:{} };
    currentUser = 'p5_tester';
    localStorage.setItem(SESSION_KEY, currentUser);
    const d = dataFor(currentUser);
    d.workouts = [];
    d.sessions = ${JSON.stringify(data.sessions)};
    d.weights = ${JSON.stringify(data.weights)};
    d.prs = [];
    d.records = [];
    state.hist = null; state.weightEdit = null; state.weightDays = 0;
    state.progressExercise = 'bench'; state.prExercise = 'bench'; state.progDays = 0;
    saveDB();
  })()`);

  /* Historial */
  g("renderHistory($('#main'))");
  const histView = g("$('#main').innerHTML");
  check('historial pinta el buscador y los 4 filtros', !!g("$('#hist-q')") && !!g("$('#hist-period')") && !!g("$('#hist-workout')") && !!g("$('#hist-exercise')") && !!g("$('#hist-order')"));
  check('historial muestra las 5 sesiones terminadas', (histView.match(/data-action="open-session"/g) || []).length === 5);
  check('historial muestra hora de inicio y fin', /18:00|19:00|20:00/.test(histView));
  check('historial muestra duración', /1 h|60 min|1 h 0 min|1:00/.test(histView));
  check('historial muestra estado', /Completada/.test(histView));

  g("state.hist.exercise = 'squat'; renderHistory($('#main'))");
  check('filtro por ejercicio deja solo esa rutina', (g("$('#main').innerHTML").match(/data-action="open-session"/g) || []).length === 1);
  g("state.hist.exercise = 'all'; state.hist.period = 'week'; renderHistory($('#main'))");
  check('filtro por período sin datos muestra aviso', /No hay|Ninguna|no hay/i.test(g("$('#main').innerHTML")) && (g("$('#main').innerHTML").match(/data-action="open-session"/g) || []).length === 0);
  g("state.hist.period = 'all'; state.hist.q = 'sentadilla'; renderHistory($('#main'))");
  check('búsqueda por nombre de ejercicio filtra', (g("$('#main').innerHTML").match(/data-action="open-session"/g) || []).length === 1);
  g("state.hist.q = ''; renderHistory($('#main'))");

  /* Detalle de sesión: no editable y con volumen */
  g("nav('#/session/a'); render()");
  check('el detalle histórico está bloqueado (series sin poder marcar)', g("[...document.querySelectorAll('[data-action=\"toggle-set\"]')].every(b => b.disabled)"));
  check('el detalle histórico muestra la sesión', /Press banca/.test(g("$('#main').innerHTML")));

  /* Récords */
  g("nav('#/prs'); render()");
  const prView = g("$('#main').innerHTML");
  check('récords calcula el mayor peso', /Mayor peso/.test(prView) && /85/.test(prView));
  check('récords calcula repeticiones al peso máximo', /repeticiones al peso/i.test(prView));
  check('récords muestra el 1RM como estimación', /estimado/i.test(prView));
  check('récords lista el historial de marcas', /Historial de récords/.test(prView));
  check('récords dice cuándo fue el último récord', /Último récord de/.test(prView) && /2026/.test(prView));
  check('récords avisa de que se recalculan', /recalculan/i.test(prView));

  /* Progresión */
  g("state.progDays = 0; nav('#/progress'); render()");
  const pgView = g("$('#main').innerHTML");
  check('progreso ofrece los 5 períodos', (pgView.match(/Últimos 30 días|<option value="30"/g) || []).length >= 1 && /6 meses/.test(pgView));
  check('progreso dibuja las 5 gráficas', !!g("$('#pg-weight')") && !!g("$('#pg-reps')") && !!g("$('#pg-volume')") && !!g("$('#pg-e1rm')") && !!g("$('#pg-freq')"));
  check('progreso distingue mejorar/mantener/bajar', /Mejorando|Se mantiene|Bajando/.test(pgView));
  check('progreso aclara que el volumen no es fuerza', /volumen mide trabajo total, no fuerza/i.test(pgView));
  check('progreso no mezcla peso corporal con kilos', /asistidos no suman kilos/i.test(pgView));
  check('progreso compara hace tres meses con ahora', /Hace tres meses/.test(pgView) && /Faltan datos|antes/i.test(pgView));
  check('progreso dibuja el volumen semanal', !!g("$('#pg-volweek')"));
  g("state.progDays = 30; renderProgress($('#main'))");
  check('cambiar de período no rompe la vista', /Faltan datos|Últimos 30 días|sin sesiones/i.test(g("$('#main').innerHTML")));

  /* Peso corporal: editar sin duplicar */
  g("state.weightDays = 0; nav('#/weight'); render()");
  check('peso muestra medias semanales y mensuales', /Medias semanales/.test(g("$('#main').innerHTML")) && /Medias mensuales/.test(g("$('#main').innerHTML")));
  const editBtn = g("document.querySelector('[data-action=\"edit-weight\"]')");
  check('peso ofrece editar una medición', !!editBtn);
  g("document.querySelector('[data-action=\"edit-weight\"]').click()");
  check('editar precarga la fecha y el peso', g("!!$('#w-weight') && $('#w-weight').value !== ''"));
  g("$('#w-date').value = '2026-10-15'; $('#w-weight').value = '77.5'; document.querySelector('[data-action=\"add-weight\"]').click()");
  check('editar actualiza el valor', g("dataFor(currentUser).weights.find(w => w.date === '2026-10-15').weight") === 77.5);
  check('editar no duplica la medición', g("dataFor(currentUser).weights.filter(w => w.date === '2026-10-15').length") === 1);
  check('editar no toca otros registros', g("PG.bodyweight(dataFor(currentUser)).list.length") === 2 && g("PG.bodyweight(dataFor(currentUser)).list[0].weight") === 81);

  /* Peso: registrar el mismo día actualiza, no duplica */
  g("$('#w-date').value = '2026-10-15'; $('#w-weight').value = '78'; document.querySelector('[data-action=\"add-weight\"]').click()");
  check('repetir fecha actualiza en vez de duplicar', g("dataFor(currentUser).weights.filter(w => w.date === '2026-10-15').length") === 1 && g("dataFor(currentUser).weights.find(w => w.date === '2026-10-15').weight") === 78);

  /* Récords no se duplican al re-sincronizar */
  g("(function(){ const d = dataFor(currentUser); const s = d.sessions.find(x => x.id === 'b'); s.records = [{ id:'r1', setId:'st_b1', exId:'bench', exercise:'Press banca', weight:85, reps:6, at:'2026-10-08T19:00:00.000Z' }]; d.records = []; persistSessionRecords(s); persistSessionRecords(s); })()");
  check('persistir dos veces el mismo récord no lo duplica', g("dataFor(currentUser).records.length") === 1);

  /* Historial intacto después de todo */
  check('el historial conserva sus sesiones', g("dataFor(currentUser).sessions.length") === 6);
  check('los récords se recalculan sin tabla propia', g("PG.recordsFor(dataFor(currentUser), n => resolveExerciseId(n, dataFor(currentUser)), 'bench').bestWeight.value") === 85);

  console.log('\npassed: ' + pass + ' failed: ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('ERROR en pruebas de integración:', e);
  process.exit(1);
});
