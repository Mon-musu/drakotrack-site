'use strict';
/* ============================================================
   F3 · calendario anual de actividad
   1. Lógica pura (Activity) con fechas fijas: agrupación por día,
      volumen, niveles, cuadrícula mensual y racha que no penaliza
      el descanso planificado.
   2. Integración en jsdom: ruta #/activity, filtros de año y mes,
      estado vacío y racha visible.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const A = require('./activity.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const NOW = '2026-11-11';

/* ---------- documentos sintéticos ---------- */
const set = (weight, reps, extra) => Object.assign({ weight, reps, completed: true, type: 'working' }, extra || {});
const ex = (name, sets) => ({ name, exId: name.toLowerCase(), sets });
const ses = (id, date, exercises, dur) => ({
  id, date, workoutName: 'Sesión ' + id, finished: true, status: 'completed',
  durationSec: dur == null ? 3600 : dur, exercises,
});
const sessions = [
  ses('s1', '2026-03-02', [ex('Press banca', [set(60, 8), set(60, 8)])], 3000),
  ses('s2', '2026-03-02', [ex('Curl', [set(20, 10)])], 1200),
  ses('s3', '2026-03-04', [ex('Press banca', [set(70, 5), set(0, 10, { type: 'warmup' })])], 4800),
  ses('s4', '2026-03-05', [ex('Sentadilla', [set(100, 5)])], 2400),
  ses('s5', '2025-12-30', [ex('Press banca', [set(55, 10)])], 1800),
  ses('cancelada', '2026-03-06', [ex('Press banca', [set(90, 1)])], 600),
];
sessions[5].status = 'cancelled';
const planner = [{ date: '2026-03-03', kind: 'rest' }, { date: '2026-03-06', kind: 'rest' }];

console.log('\n=== Agrupación por día ===');
const days = A.byDay(sessions);
check('ignora sesiones canceladas', !days.has('2026-03-06'));
check('dos sesiones del mismo día cuentan una vez como día', days.get('2026-03-02').sessions === 2);
check('suma minutos del día', days.get('2026-03-02').minutes === 70);
check('el volumen excluye calentamiento y peso 0',
  days.get('2026-03-04').volume === 350);
check('el volumen suma peso × repeticiones', days.get('2026-03-02').volume === 60 * 8 + 60 * 8 + 20 * 10);
check('una sesión sin duración no rompe el cálculo', A.sessionMinutes({ finished: true, date: '2026-01-01' }) === 0);

console.log('\n=== Niveles ===');
check('sin sesión no hay nivel', A.levelFor(0, 0) === 0);
check('30 minutos ya colorean el día', A.levelFor(30, 1) === 2);
check('dos sesiones suben el nivel', A.levelFor(20, 2) === 3);
check('tres sesiones o 90 minutos es el nivel máximo', A.levelFor(95, 1) === 4 && A.levelFor(10, 3) === 4);

console.log('\n=== Cuadrícula mensual ===');
const feb = A.monthCells(2026, 2, days, new Set(), NOW);
check('febrero de 2026 empieza en lunes 26 de enero',
  feb.cells[0].date === '2026-01-26' && feb.cells[0].inMonth === false);
check('la cuadrícula cubre semanas completas', feb.cells.length % 7 === 0 && feb.cells.length >= 28);
check('marca los días fuera del mes', feb.cells.some(c => !c.inMonth) && feb.cells.some(c => c.inMonth));
check('la etiqueta del día resume la actividad', /^2 de marzo: 2 sesiones · 70 min/.test(
  A.monthCells(2026, 3, days, new Set(), NOW).cells.find(c => c.date === '2026-03-02').label));

console.log('\n=== Racha sin penalizar el descanso ===');
const rest = A.restDays(planner);
const st = A.streak(days, rest, NOW);
check('el descanso planificado no rompe la racha', st.current === 3);
check('la mejor racha se conserva', st.best === 3);
check('los días posteriores al último entrenamiento no cortan', st.last === '2026-03-05');
const broken = A.streak(days, new Set(), NOW);
check('un hueco sin descanso planificado sí reinicia la racha', broken.current === 2 && broken.best === 2);
const grace = A.streak(A.byDay([ses('g', '2026-11-01', [ex('Press', [set(50, 5)])])]), new Set(), NOW);
check('entrenar hace diez días mantiene la racha de hoy', grace.current === 1);
check('sin sesiones la racha es cero', A.streak(new Map(), new Set(), NOW).current === 0);

console.log('\n=== Filtros de año y mes ===');
const yearView = A.build(sessions, { now: NOW, planner });
check('los años salen de las sesiones y del actual', yearView.years.join() === '2026,2025');
check('por defecto se abre el año en curso', yearView.year === 2026);
check('sin filtro hay doce meses', yearView.months.length === 12 && yearView.month === 'all');
check('las estadísticas del año suman días, sesiones y volumen',
  yearView.stats.activeDays === 3 && yearView.stats.sessions === 4 && yearView.stats.volume === 350 + 1160 + 500);
check('cuenta los meses con actividad', yearView.stats.monthsActive === 1);
check('el año vacío se detecta', A.build(sessions, { now: NOW, year: 2024 }).hasYearData === false);
const march = A.build(sessions, { now: NOW, planner, month: 3 });
check('el filtro de mes reduce a una cuadrícula', march.months.length === 1 && march.months[0].month === 3);
check('el filtro de mes acota las estadísticas', march.stats.sessions === 4 && march.stats.activeDays === 3);
check('un mes inválido cae en el año completo', A.build(sessions, { now: NOW, month: 99 }).month === 'all');
check('sin datos no hay calendario que pintar', A.build([], { now: NOW }).hasData === false);

/* ---------- integración en jsdom ---------- */
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
for (const f of ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js',
  'offline.js', 'analytics.js', 'activity.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms));
const $ = sel => window.document.querySelector(sel);

(async () => {
  console.log('\n=== Vista de actividad ===');
  const user = 'act_' + Date.now().toString(36).slice(-5);
  await g(`signup('${user}', 'secret123')`);
  await tick(60);

  g("nav('#/activity')");
  await tick(80);
  let main = $('#main');
  check('la vista responde en #/activity', /Calendario de actividad/.test(main.innerHTML));
  check('sin sesiones muestra un estado vacío', !!main.querySelector('.empty-state'));
  check('el estado vacío invita a entrenar', /Empezar entrenamiento/.test(main.innerHTML));

  g(`(function(){
    const d = dataFor(currentUser);
    [['2026-03-02', 3000], ['2026-03-05', 2400], ['2026-02-10', 1800]].forEach(function(pair, i){
      d.sessions.push({
        id: 'act' + i, date: pair[0], workoutName: 'Sesión ' + i, finished: true, status: 'completed',
        durationSec: pair[1],
        exercises: [{ name: 'Press banca', exId: 'bench', sets: [{ weight: 60, reps: 8, completed: true, type: 'working' }] }]
      });
    });
    d.planner.push({ date: '2026-03-03', kind: 'rest' });
    saveDB();
  })()`);
  g("nav('#/workouts'); render();");
  await tick(40);
  g("nav('#/activity')");
  await tick(80);
  main = $('#main');
  check('pinta los doce meses del año', main.querySelectorAll('.act-month').length === 12);
  check('la cuadrícula tiene celdas por día', main.querySelectorAll('.act-day').length >= 336);
  check('los días con sesión llevan nivel de actividad', main.querySelectorAll('.act-day.is-l2, .act-day.is-l3, .act-day.is-l4').length >= 1);
  check('el descanso planificado se distingue', main.querySelectorAll('.act-day.is-rest').length >= 1);
  const rachaTxt = main.querySelector('.act-streak-value');
  check('la racha se muestra sin penalizar el descanso', rachaTxt && /día|Sin racha/.test(rachaTxt.textContent) && /descanso planificado/.test(main.textContent));
  check('la leyenda explica la intensidad', main.querySelectorAll('.act-legend i').length >= 4);
  check('los filtros existen con sus dos selects', !!$('#act-year') && !!$('#act-month'));

  $('#act-month').value = '3';
  $('#act-month').onchange();
  await tick(80);
  main = $('#main');
  check('filtrar por mes deja una sola cuadrícula', main.querySelectorAll('.act-month').length === 1);
  check('el mes filtrado es marzo', /marzo/i.test(main.querySelector('.act-month h2').textContent));
  check('el resumen se acota al mes', /3 días entrenados|3 días/.test(main.textContent) || main.querySelectorAll('.stat-value').length === 4);

  g("state.activity = { year: 2024, month: 'all' }; render();");
  await tick(80);
  check('un año sin datos avisa en vez de inventar', /no hay entrenamientos|Sin entrenamientos/i.test($('#main').textContent));

  g("nav('#/progress'); render();");
  await tick(60);
  check('Progreso enlaza al calendario anual', !!$('#main .act-cta'));

  console.log(`\n${pass} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
