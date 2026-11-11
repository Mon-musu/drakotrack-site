'use strict';
/* Pruebas del Prompt 7 — dashboard y analíticas.
   1. Lógica pura (AN) con documentos sintéticos y fechas fijas.
   2. Integración en jsdom: dashboard, ruta #/analytics, gráficos,
      personalización persistente y recarga. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const AN = require('./analytics.js');
const PG = require('./progress.js');
const PL = require('./planner.js');
const DrakoSync = require('./sync.js');
const { validateData } = require('./lib/security.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const NOW = '2026-11-03';
const ex = (name, key, sets) => ({ id: 'e' + name, name, exId: key, sets: sets.map(([w, r]) => ({ weight: w, reps: r, completed: true, type: 'working' })) });
const session = (id, date, exercises, dur) => ({ id, date, workoutName: 'Sesión ' + id, finished: true, status: 'completed', durationSec: dur == null ? 3600 : dur, exercises });
const d = {
  sessions: [
    session('s1', '2026-10-06', [ex('Press banca', 'bench', [[80, 8], [80, 8]])]),
    session('s2', '2026-10-13', [ex('Press banca', 'bench', [[85, 8], [85, 6]])]),
    session('s3', '2026-10-20', [ex('Press banca', 'bench', [[90, 5]]), ex('Dominadas', 'pull', [[0, 10]])]),
    session('s4', '2026-10-27', [ex('Press banca', 'bench', [[92, 5]])]),
    session('s5', '2026-11-02', [ex('Press banca', 'bench', [[95, 5], [95, 3]]), ex('Sentadilla', 'squat', [[100, 5]])]),
    session('s6', '2026-11-02', [ex('Curl', 'curl', [[20, 10]])], 1800),
    session('s7', '2026-11-03', [ex('Press banca', 'bench', [[100, 3]])]),
  ],
  weights: [
    { id: 'w1', date: '2026-10-01', weight: 80 }, { id: 'w2', date: '2026-10-01', weight: 80.4 },
    { id: 'w3', date: '2026-10-20', weight: 79.5 }, { id: 'w4', date: '2026-11-02', weight: 78.9 },
  ],
  records: [
    { id: 'r1', date: '2026-11-02', exId: 'bench', exercise: 'Press banca', weight: 95, reps: 5 },
    { id: 'r2', date: '2026-10-13', exId: 'squat', exercise: 'Sentadilla', weight: 120, reps: 5 },
  ],
  prs: [], exercises: [], workouts: [],
};
d.programs = [PL.newProgram({ id: 'p1', name: 'Bloque de fuerza', startDate: '2026-10-01', weeks: 8, goals: [{ id: 'g1', type: 'sessions', target: 10, period: 'program' }] })];
d.planner = [
  { id: 'pl1', date: '2026-10-05', programId: 'p1', kind: 'workout', workoutId: 'w', workoutName: 'Sesión', sessionId: 's1' },
  { id: 'pl2', date: '2026-10-06', programId: 'p1', kind: 'rest' },
  { id: 'pl3', date: '2026-10-07', programId: 'p1', kind: 'workout', workoutId: 'w', workoutName: 'Sesión' },
];
const groupOf = k => ({ bench: 'pecho', squat: 'piernas' }[k] || '');
const base = { now: NOW, PG, PL, resolve: n => n, groupOf };
const analyze = (preset, extra) => AN.analyze(d, Object.assign({}, base, { preset }, extra || {}));

console.log('\n=== Rangos y tarjetas ===');
const week = AN.rangeFor('week', { now: NOW });
check('la semana empieza el lunes y dura 7 días', week.from === '2026-11-02' && week.to === '2026-11-08' && week.days === 7);
check('la semana anterior es contigua', week.prevFrom === '2026-10-26' && week.prevTo === '2026-11-01');
const month = AN.rangeFor('month', { now: NOW });
check('el mes cubre el mes completo', month.from === '2026-11-01' && month.to === '2026-11-30');
check('el mes anterior es octubre', month.prevFrom === '2026-10-01' && month.prevTo === '2026-10-31');
const r30 = AN.rangeFor('30', { now: NOW });
check('30 días incluye hoy y 29 anteriores', r30.from === '2026-10-05' && r30.to === NOW && r30.days === 30);
const custom = AN.rangeFor('custom', { now: NOW, custom: { from: '2026-11-03', to: '2026-10-01' } });
check('el rango personalizado ordena las fechas', custom.from === '2026-10-01' && custom.to === '2026-11-03');
check('un rango personalizado calcula su período anterior', custom.prevFrom === '2026-08-28' && custom.prevTo === '2026-09-30');

const a = analyze('month');
const a90 = analyze('90');
const card = id => a.cards.find(c => c.id === id);
check('hay 10 tarjetas y todas tienen período', a.cards.length === 10 && a.cards.every(c => c.period && c.label));
check('sesiones de la semana = 3 frente a 1 anterior', card('sessionsWeek').value === 3 && card('sessionsWeek').previous === 1 && card('sessionsWeek').comparison.includes('+2'));
check('sesiones del mes = 3 frente a 4 de octubre', card('sessionsMonth').value === 3 && card('sessionsMonth').previous === 4 && card('sessionsMonth').delta === -1);
check('volumen semanal = 1760 kg', card('volumeWeek').value === 1760 && card('volumeWeek').display === '1760');
check('tiempo total = 6 h 30 min', card('totalTime').value === 23400 && card('totalTime').display === '6 h 30 min');
check('racha actual = 5 semanas', card('streak').value === 5 && /Mejor racha: 5/.test(card('streak').hint));
check('récords del mes = 1 frente a 1 de octubre', card('prs').value === 1 && card('prs').previous === 1 && card('prs').comparison === 'Igual que en el período anterior');
check('ejercicios registrados = 4', card('exercises').value === 4 && card('exercises').display === '4');
check('objetivos activos = 0/1', card('goals').value === '0/1' && /pendiente/.test(card('goals').hint));
check('peso más reciente = 78,9 kg', card('bodyweight').value === 78.9 && card('bodyweight').display === '78,9 kg');
check('el peso indica la fecha del último registro', /2026-11-02/.test(card('bodyweight').hint));

const empty = { sessions: [], weights: [], records: [], prs: [], programs: [], planner: [], exercises: [], workouts: [] };
const ae = AN.analyze(empty, Object.assign({}, base, { preset: 'month' }));
const ec = id => ae.cards.find(c => c.id === id);
check('sin datos no hay comparación de sesiones', ec('sessionsWeek').value === 0 && ec('sessionsWeek').comparable === false && ec('sessionsWeek').comparison === null);
check('sin datos el tiempo y el peso muestran «—»', ec('totalTime').display === '—' && ec('bodyweight').display === '—');
check('sin datos la racha y los objetivos lo dicen', ec('streak').display === 'Sin racha' && ec('goals').display === 'Sin objetivos');
check('sin datos el resumen no inventa conclusiones', ae.insights.length === 1 && /Todavía no hay sesiones/.test(ae.insights[0].text));
check('sin datos no hay división por cero', ae.comparison.rows.every(r => r.pct === null || isFinite(r.pct)));

console.log('\n=== Consistencia ===');
const r90 = AN.rangeFor('90', { now: NOW });
const c90 = AN.consistency(d, PG, n => n, Object.assign({}, base, { range: r90 }));
const c = a.consistency;
check('días entrenados del mes = 2 (no 3 sesiones)', c.daysTrained === 2 && c.sessions === 3);
check('el promedio semanal usa 4 semanas', c.avgWeekly === 1.5);
check('el plan se mide en el período largo y excluye descansos', c90.plan.compliance === 50 && c90.plan.planned === 2 && c90.plan.done === 1 && c90.plan.missed === 1 && c90.plan.rest === 1);
check('los descansos no cuentan como omitidos', c90.plan.missed === 1);
check('la racha coincide con la tarjeta', c.streaks.current === 5 && c.streaks.best === 5);
check('frecuencia por día de la semana suma las sesiones del mes', c.weekday.reduce((x, y) => x + y, 0) === 3);
check('las 12 semanas están completas', c.weeks.length === 12 && c.weeks.every(w => w.week && isFinite(w.days)));
check('el período largo también cumple el plan al 50 %', c90.plan.compliance === 50);
check('una sesión por día no se cuenta dos veces', AN.consistency(d, PG, n => n, Object.assign({}, base, { range: month })).daysTrained === 2);
const emptyC = AN.consistency(empty, PG, n => n, Object.assign({}, base, { range: month }));
check('sin planificación el cumplimiento es nulo, no 0 %', emptyC.plan.compliance === null && emptyC.plan.planned === 0);
check('sin sesiones la racha es 0', emptyC.streaks.current === 0 && emptyC.streaks.best === 0);

console.log('\n=== Volumen y unidades ===');
const v90 = AN.volumeAnalysis(d, PG, n => n, groupOf, { range: r90 });
check('volumen total del período = 5140 kg', v90.total === 5140);
check('el peso corporal no suma kilos de volumen', v90.bodyweightSets === 1 && v90.weightedSets === 11);
check('volumen por ejercicio ordenado', v90.byExercise[0].key === 'bench' && v90.byExercise[0].volume === 4440);
check('los ejercicios sin peso externo se informan aparte', v90.byExercise.find(x => x.key === 'pull').volume === 0);
check('la media por sesión usa sesiones reales', v90.avgPerSession === Math.round(5140 / 7));
check('los grupos no duplican volumen', v90.groups.reduce((n, g) => n + g.volume, 0) + v90.unclassified.volume === v90.total);
check('el porcentaje clasificado ignora los sin clasificar', v90.classifiedPct === 96.1);
check('la evolución semanal se puede graficar', v90.weekly.length > 1 && v90.weekly.every(w => w.volume >= 0));

console.log('\n=== Fuerza ===');
const st = a90.strength;
const bench = st.exercises.find(x => x.key === 'bench');
check('press banca acumula las sesiones del período', bench.sessions === 6);
check('la evolución del 1RM se calcula por sesión', bench.e1rm.length >= 2 && bench.e1rm.every(p => p.value > 0));
check('la progresión positiva se detecta con 3+ sesiones', st.positive.some(x => x.key === 'bench') && bench.status === 'up');
check('un ejercicio con una sola sesión queda sin evaluar', st.insufficient.some(x => x.key === 'squat'));
check('no se declara pérdida con una única sesión atípica', !st.declining.some(x => x.key === 'squat'));
check('los récords del período están listados', st.prs.some(p => p.key === 'bench'));
const sMonth = AN.strengthFor(d, PG, n => n, 'bench', month);
check('peso y 1RM tienen etiquetas de fecha', sMonth.weight.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.label)));
check('sin sesiones suficientes no se inventa tendencia', AN.strengthFor(d, PG, n => n, 'curl', month).enough === false);
check('el 1RM estimado no se confunde con el peso real', bench.bestWeight === 100 && bench.bestE1rm >= 110);

console.log('\n=== Grupos musculares ===');
const m = AN.muscleAnalysis(d, PG, n => n, groupOf, { range: r90 });
check('pecho y piernas reciben su volumen', m.groups.find(g => g.id === 'pecho').volume === 4440 && m.groups.find(g => g.id === 'piernas').volume === 500);
check('los ejercicios sin grupo quedan sin clasificar', m.unclassified.exercises.some(x => x.key === 'pull') && m.unclassified.volume === 200);
check('cada grupo tiene porcentaje válido', m.groups.every(g => g.pct == null || (g.pct >= 0 && g.pct <= 100)));
check('los grupos exponen sus ejercicios', m.groups.find(g => g.id === 'pecho').exercises.includes('bench'));
const mEmpty = AN.muscleAnalysis(empty, PG, n => n, groupOf, { range: month });
check('sin datos no hay grupos ni porcentaje', mEmpty.groups.length === 0 && mEmpty.classifiedPct === null);
const sharesOf = key => key === 'bench'
  ? [{ id: 'pecho', weight: 0.5 }, { id: 'triceps', weight: 0.5 }]
  : key === 'squat' ? [{ id: 'cuadriceps', weight: 0.5 }, { id: 'gluteos', weight: 0.5 }] : [];
const vw = AN.volumeAnalysis(d, PG, n => n, () => '', { range: r90, groupsOf: sharesOf });
check('el reparto ponderado no duplica el volumen',
  vw.groups.reduce((n, g) => n + g.volume, 0) + vw.unclassified.volume === vw.total
  && vw.weightedGroups === true && vw.classifiedPct === 96.1);
check('el reparto ponderado conserva los grupos publicados',
  vw.groups.find(g => g.id === 'pecho').volume === 2220
  && vw.groups.find(g => g.id === 'triceps').volume === 2220
  && vw.groups.find(g => g.id === 'cuadriceps').volume === 250);

console.log('\n=== Peso corporal ===');
const bw = AN.bodyweightAnalysis(d, PG, { range: r90, now: NOW });
check('un registro duplicado del día conserva el último', bw.list.length === 3 && bw.list[0].weight === 80.4);
check('peso inicial, último y cambio del período', bw.first.weight === 80.4 && bw.latest.weight === 78.9 && bw.change === -1.5);
check('promedios semanales y mensuales', bw.weekly.length >= 1 && bw.monthly.length >= 1 && bw.rangeAvg === 79.6);
check('la tendencia no se proyecta', ['up', 'down', 'flat', 'insufficient'].includes(bw.trend));
const bwEmpty = AN.bodyweightAnalysis(empty, PG, { range: month, now: NOW });
check('sin peso no hay último registro ni cambio', bwEmpty.latest === null && bwEmpty.change === null && bwEmpty.trend === 'insufficient');

console.log('\n=== Comparaciones y resumen ===');
const cmpWeek = AN.comparePeriods(d, PG, n => n, Object.assign({}, base, { range: week }));
const row = id => cmpWeek.rows.find(r => r.id === id);
check('semana actual frente a la anterior', row('sessions').current === 3 && row('sessions').previous === 1 && row('sessions').delta === 2);
check('la variación porcentual es válida', row('sessions').pct === 200 && row('volume').pct === 282.6);
check('la frecuencia usa días entrenados por semana', row('frequency').current === 2 && row('frequency').previous === 1);
check('el tiempo entrenado se compara en minutos', row('minutes').current === 150 && row('minutes').previous === 60);
const cmpMonth = AN.comparePeriods(d, PG, n => n, Object.assign({}, base, { range: month }));
check('el peso corporal se compara por media', cmpMonth.rows.find(r => r.id === 'bodyweight').current === 78.9 && cmpMonth.rows.find(r => r.id === 'bodyweight').previous === 80);
const cmpEx = AN.comparePeriods(d, PG, n => n, Object.assign({}, base, { range: week, exerciseKey: 'bench' }));
check('el 1RM del ejercicio se compara entre períodos', cmpEx.rows.find(r => r.id === 'exercise').current > cmpEx.rows.find(r => r.id === 'exercise').previous);
const cmpEmpty = AN.comparePeriods(empty, PG, n => n, Object.assign({}, base, { range: month }));
check('sin base no se calcula porcentaje', cmpEmpty.rows.every(r => r.pct === null));
const ins = a.insights;
check('el resumen cita el hecho de sesiones', ins.some(i => /sesión\(es\) más|mismas sesiones|menos/.test(i.text)));
check('el resumen cita el volumen sin interpretarlo como fuerza', ins.some(i => /volumen total/i.test(i.text) && /no fuerza/i.test(i.text)));
check('el resumen cita récords reales', ins.some(i => /récord/i.test(i.text)));
check('el resumen cita el peso como dato, no composición', ins.some(i => /no indica composición corporal/i.test(i.text)));
check('todas las conclusiones indican el período', ins.every(i => i.period && i.kind === 'hecho'));
check('sin datos el resumen lo admite', AN.insights(empty, PG, PL, n => n, { range: month, now: NOW }).length === 1);

console.log('\n=== Programas ===');
const pa = a90.programs;
check('el programa activo aparece con su progreso', pa.active && pa.active.program.id === 'p1' && pa.active.progress.weeks === 8);
check('cuenta planificados, hechos y omitidos', pa.active.planned === 2 && pa.active.done === 1 && pa.active.missed === 1 && pa.active.rest === 1);
check('el cumplimiento coincide con consistencia', pa.active.compliance === 50);
check('los objetivos se evalúan con datos reales', pa.active.goals[0].current === 7 && pa.active.goals[0].met === false);
const withPast = Object.assign({}, d, { programs: d.programs.concat([Object.assign(PL.duplicateProgram(d.programs[0]), { status: 'archived' })]) });
check('los programas pasados se conservan', AN.programAnalysis(withPast, PL, PG, n => n, month, { now: NOW }).past.length === 1);

console.log('\n=== Caché e invalidación ===');
AN.clearCache();
const sig1 = AN.signature(d, {});
const c1 = analyze('month');
check('la caché devuelve el mismo objeto sin recalcular', analyze('month') === c1);
const dEdit = Object.assign({}, d, { sessions: d.sessions.slice(0, -1) });
const c2 = AN.analyze(dEdit, Object.assign({}, base, { preset: 'month' }));
check('borrar una sesión cambia la huella', AN.signature(dEdit, {}) !== sig1);
check('borrar una sesión actualiza la tarjeta', c2.cards.find(x => x.id === 'sessionsWeek').value !== c1.cards.find(x => x.id === 'sessionsWeek').value);
const dMoved = Object.assign({}, d, { weights: d.weights.concat([{ id: 'w9', date: NOW, weight: 77.7 }]) });
check('un peso nuevo cambia la huella y el último peso', AN.signature(dMoved, {}) !== AN.signature(d, {}) && AN.bodyweightAnalysis(dMoved, PG, { range: month, now: NOW }).latest.weight === 77.7);
check('elegir ejercicio no contamina el análisis general', analyze('month', { exerciseKey: 'bench' }).strength.focus.key === 'bench');

console.log('\n=== Preferencias y contrato del servidor ===');
const cfg = AN.defaultConfig();
check('la configuración por defecto muestra todas las tarjetas', cfg.order.length === 10 && cfg.hidden.length === 0 && cfg.period === 'month');
const cfg2 = AN.normalizeConfig({ period: 'inventado', order: ['streak', 'streak', 'hack'], hidden: ['prs', 'hack', 'prs'] });
check('normalizar descarta períodos, ids y duplicados inválidos', cfg2.period === 'month' && cfg2.order.length === 10 && cfg2.order[0] === 'streak' && cfg2.hidden.join() === 'prs');
check('mover una tarjeta respeta los extremos', AN.moveCard(cfg, 'sessionsWeek', -1).order[0] === 'sessionsWeek' && AN.moveCard(cfg, 'bodyweight', 1).order[9] === 'bodyweight');
check('las tarjetas ocultas no se pintan', AN.visibleCards(a.cards, { hidden: ['prs', 'goals'] }).length === 8);
check('el servidor acepta la configuración del dashboard', validateData({ prefs: { dashboard: cfg2 } }) === true);
check('el servidor rechaza una tarjeta desconocida', validateData({ prefs: { dashboard: { order: ['hack'] } } }) === false);
check('el servidor rechaza un período inválido', validateData({ prefs: { dashboard: { period: 'ayer' } } }) === false);

console.log('\n=== Exportaciones ===');
const csv = AN.exportCSV(d, Object.assign({}, base, { preset: '90' }));
check('el CSV empieza con BOM y usa CRLF', csv.text.charCodeAt(0) === 0xFEFF && csv.text.includes('\r\n'));
check('el CSV incluye resumen, sesiones, volumen y peso', ['Resumen', 'Sesiones', 'Volumen por ejercicio', 'Peso corporal', 'Objetivos del programa activo'].every(s => csv.text.includes(s)));
check('el CSV conserva fechas y unidades', csv.text.includes('2026-11-02') && csv.text.includes('kg') && csv.text.includes('repeticiones'));
check('el CSV no contiene credenciales', !/token|secret|password|contraseña|bearer|apikey/i.test(csv.text));
check('el nombre del CSV incluye la fecha', /drakotrack-estadisticas-2026-11-03\.csv/.test(csv.filename));
const json = AN.exportJSON(d, Object.assign({}, base, { preset: '90' }));
let parsed = null;
try { parsed = JSON.parse(json.text); } catch (e) { parsed = null; }
check('el JSON es válido y estructurado', !!parsed && parsed.kind === 'statistics' && parsed.range.key === '90');
check('el JSON incluye notas y datos, sin credenciales', parsed.notes.length >= 3 && !/token|secret|password/i.test(json.text));
check('el JSON conserva las sesiones del período', parsed.sessions.some(s => s.date === '2026-11-02') && parsed.weights.length === 3);

console.log('\n=== Sincronización ===');
const localDoc = { sessions: d.sessions, weights: d.weights, records: d.records, prs: [], programs: d.programs, planner: d.planner, prefs: { dashboard: cfg2 } };
const remoteDoc = { sessions: d.sessions.slice(0, 4).concat([session('s8', '2026-10-30', [ex('Press banca', 'bench', [[93, 4]])])]), weights: d.weights.slice(0, 2), records: [], prs: [], programs: [], planner: [], prefs: { dashboard: cfg } };
const merged = DrakoSync.merge(null, localDoc, remoteDoc).data;
check('la fusión conserva las sesiones una sola vez', merged.sessions.length === 8 && new Set(merged.sessions.map(s => s.id)).size === 8);
check('la fusión conserva las preferencias del dashboard', !!merged.prefs.dashboard && AN.normalizeConfig(merged.prefs.dashboard).order.length === 10);
const beforeMerge = AN.analyze(localDoc, Object.assign({}, base, { preset: 'month' }));
const afterMerge = AN.analyze(merged, Object.assign({}, base, { preset: 'month' }));
check('la caché se invalida tras sincronizar', beforeMerge !== afterMerge && afterMerge.cards.find(x => x.id === 'sessionsWeek').value === 3);
check('un cambio offline no se pierde al fusionar', merged.weights.length === 4 && merged.records.length === 2);

/* ---------------- Integración en jsdom ---------------- */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const FILES = ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js', 'offline.js', 'analytics.js', 'activity.js', 'app.js'];
function bootDom(storedDB, user) {
  const dom = new JSDOM(html, {
    url: 'http://localhost:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
      if (storedDB) {
        w.localStorage.setItem('draktrack_v1', storedDB);
        w.localStorage.setItem('draktrack_session_v1', user || 'p7_tester');
      }
    },
  });
  const context = dom.getInternalVMContext();
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), context, { filename: f }));
  return context;
}
const ctx = bootDom(null);
const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

(async () => {
  g(`(function(){
    localStorage.clear(); db = { users:{}, data:{} }; currentUser = 'p7_tester';
    localStorage.setItem(SESSION_KEY, currentUser);
    const d = dataFor(currentUser); const t = todayISO();
    const mk = (id, date, exs, dur) => ({ id, date, workoutName:'Sesión ' + id, finished:true, status:'completed', durationSec:dur||3600, exercises:exs });
    const sx = (name, key, sets) => ({ id:'e'+name, name, exId:key, sets:sets.map(([w,r]) => ({ weight:w, reps:r, completed:true, type:'working' })) });
    d.sessions = [
      mk('s1', PL.addDays(t,-1), [sx('Press de banca','press-de-banca',[[80,8],[80,8]])]),
      mk('s2', PL.addDays(t,-2), [sx('Press de banca','press-de-banca',[[85,8]])]),
      mk('s3', PL.addDays(t,-9), [sx('Sentadilla trasera','sentadilla-trasera',[[100,5]])]),
      mk('s4', PL.addDays(t,-10), [sx('Sentadilla trasera','sentadilla-trasera',[[95,5]])])
    ];
    d.weights = [{ id:'w1', date:PL.addDays(t,-12), weight:80 }, { id:'w2', date:PL.addDays(t,-5), weight:79.5 }, { id:'w3', date:PL.addDays(t,-1), weight:79 }];
    d.records = [{ id:'r1', date:PL.addDays(t,-1), exId:'press-de-banca', exercise:'Press de banca', weight:80, reps:8 }];
    d.programs = [PL.newProgram({ id:'p1', name:'Programa test', startDate:PL.addDays(t,-20), weeks:8, goals:[{ id:'g1', type:'sessions', target:10, period:'program' }] })];
    d.planner = [
      { id:'pl1', date:PL.addDays(t,-1), programId:'p1', kind:'workout', workoutId:'w', workoutName:'Sesión', sessionId:'s1' },
      { id:'pl2', date:PL.addDays(t,-3), programId:'p1', kind:'workout', workoutId:'w', workoutName:'Sesión' }
    ];
    d.prefs = {}; saveDB();
  })()`);
  g("nav('#/workouts'); render();");
  check('el dashboard muestra el panel de rendimiento', /Panel de rendimiento/.test(g("$('#main').innerHTML")));
  check('el dashboard pinta las 10 tarjetas', g("document.querySelectorAll('.ana-kpi').length") === 10);
  check('las tarjetas muestran período y comparación', /Esta semana/.test(g("$('#main').innerHTML")) && /semana anterior/.test(g("$('#main').innerHTML")));
  g("document.querySelector('.ana-kpi[data-card=\"sessionsWeek\"]').click()");
  await tick();
  check('tocar una tarjeta abre el análisis completo', g("location.hash") === '#/analytics');
  check('el detalle de la tarjeta se muestra', /Entrenamientos de la semana/.test(g("$('#main').innerHTML")) && !!g("$('#ana-focus')"));
  check('las secciones de análisis están presentes', ['Consistencia', 'Volumen', 'Fuerza y rendimiento', 'Grupos musculares', 'Peso corporal', 'Programas', 'Comparaciones', 'Exportar'].every(s => g("$('#main').innerHTML").includes(s)));
  check('los gráficos se renderizan como SVG', g("document.querySelectorAll('#ana-weekdays svg, #ana-dow svg, #ana-volume-week svg, #ana-ex-weight svg').length") >= 3);
  check('el peso corporal tiene gráfico con datos', !!g("document.querySelector('#ana-bw svg, #ana-bw .chart-single')"));
  check('los botones de exportación existen', !!g("document.querySelector('[data-action=\"ana-export-csv\"]')") && !!g("document.querySelector('[data-action=\"ana-export-json\"]')"));

  g("(function(){ const s = $('#ana-period'); s.value='90'; s.dispatchEvent(new window.Event('change')); })()");
  await tick();
  check('cambiar el período recalcula la vista', g("$('#ana-period').value") === '90' && /Últimos 90 días/.test(g("$('#main').innerHTML")));
  g("document.querySelector('[data-action=\"ana-config-toggle\"]').click()");
  await tick();
  check('la personalización muestra una casilla por tarjeta', g("document.querySelectorAll('.ana-config input[data-action=\"ana-card\"]').length") === 10);
  g("document.querySelector('input[data-card=\"prs\"]').click()");
  await tick();
  check('ocultar una tarjeta la quita del panel', g("document.querySelectorAll('.ana-kpi').length") === 9 && g("dataFor(currentUser).prefs.dashboard.hidden.includes('prs')"));
  g("saveDB()");
  const stored = g("localStorage.getItem(DB_KEY)");
  const ctx2 = bootDom(stored, 'p7_tester');
  const g2 = e => vm.runInContext(e, ctx2, { filename: 'reload' });
  g2("nav('#/analytics'); render();");
  check('al recargar se mantiene la tarjeta oculta', g2("document.querySelectorAll('.ana-kpi').length") === 9);
  check('al recargar el análisis sigue disponible', /Consistencia/.test(g2("$('#main').innerHTML")));
  g2("document.querySelector('[data-action=\"ana-config-toggle\"]').click()");
  await tick();
  g2("document.querySelector('[data-action=\"ana-reset\"]').click()");
  await tick();
  check('restaurar devuelve todas las tarjetas', g2("document.querySelectorAll('.ana-kpi').length") === 10 && !g2("dataFor(currentUser).prefs.dashboard"));

  g2("(function(){ currentUser='p7_empty'; localStorage.setItem(SESSION_KEY,currentUser); dataFor(currentUser).prefs={}; saveDB(); nav('#/workouts'); render(); })()");
  check('un usuario nuevo ve el dashboard vacío sin errores', /Panel de rendimiento/.test(g2("$('#main').innerHTML")) && /Sin racha/.test(g2("$('#main').innerHTML")));
  g2("nav('#/analytics'); render();");
  check('el análisis vacío explica que faltan datos', /Todavía no hay sesiones terminadas/.test(g2("$('#main').innerHTML")));
  check('el análisis vacío no rompe los gráficos', /Aún no hay datos|Sin datos|Necesitas/.test(g2("$('#main').innerHTML")));

  console.log('\npassed: ' + pass + ' failed: ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR en pruebas de analíticas:', e); process.exit(1); });
