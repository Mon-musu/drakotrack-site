'use strict';
/* Pruebas del Prompt 6. Dos capas:
   1. planner.js puro: plantilla semanal, descansos, copiar semana, calendario y objetivos.
   2. Integración real en jsdom: crear/editar/duplicar/archivar programas, aplicar la
      plantilla, iniciar una rutina planificada y otra distinta, comprobar objetivos,
      no tocar sesiones históricas, sincronizar dos dispositivos y recargar. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const PL = require('./planner.js');
const PG = require('./progress.js');
const DrakoSync = require('./sync.js');
const { validateData } = require('./lib/security.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

/* ---------------- 1. Lógica pura ---------------- */

const program = PL.newProgram({
  id: 'prog-1', name: 'Bloque de fuerza', startDate: '2026-11-02', weeks: 8, daysPerWeek: 3,
  workoutIds: ['w-a', 'w-b'], template: ['w-a', '', '', 'w-b', '', 'rest', ''],
  goals: [
    { id: 'g1', type: 'sessions', target: 2, period: 'program' },
    { id: 'g2', type: 'weight', exerciseId: 'bench', target: 90, period: 'program' },
    { id: 'g3', type: 'reps', exerciseId: 'bench', target: 8, targetWeight: 80, period: 'program' },
    { id: 'g4', type: 'volume', target: 1000, period: 'program' },
    { id: 'g5', type: 'weeklyFreq', target: 2, period: 'program' },
  ],
  phases: [{ id: 'ph1', name: 'Adaptación', weeks: 2, goal: 'Técnica', workoutIds: [], notes: '' }],
});

console.log('\n=== Programas y planificación (lógica) ===');
check('un programa nuevo tiene id, estado activo y plantilla de 7 días', !!program.id && program.status === 'active' && program.template.length === 7);
check('la semana empieza en lunes', PL.weekStart('2026-11-05') === '2026-11-02');
check('weekDates devuelve 7 días consecutivos', PL.weekDates('2026-11-02').join(',') === '2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-06,2026-11-07,2026-11-08');

const created = PL.applyTemplate(program, '2026-11-02', [], id => id === 'w-a' ? 'Rutina A' : 'Rutina B');
check('la plantilla crea 3 entradas (2 rutinas + descanso)', created.length === 3);
check('los días de descanso se guardan como descanso', created.filter(e => e.kind === 'rest').length === 1 && created.find(e => e.kind === 'rest').date === '2026-11-07');
check('la entrada guarda el nombre de la rutina', created.find(e => e.date === '2026-11-02').workoutName === 'Rutina A');

const again = PL.applyTemplate(program, '2026-11-02', created, () => '');
check('aplicar la plantilla dos veces no duplica', again.length === 0);

const nextWeek = PL.applyTemplate(program, '2026-11-09', created, () => '');
check('otra semana recibe su propia copia', nextWeek.length === 3 && nextWeek.every(e => e.date >= '2026-11-09'));
check('la semana anterior no cambia', created.every(e => e.date < '2026-11-09'));

const moved = PL.moveEntry(created.find(e => e.date === '2026-11-02'), '2026-11-03');
check('mover una rutina cambia solo esa fecha', moved.date === '2026-11-03' && moved.workoutId === 'w-a');

const copied = PL.copyWeek(created, '2026-11-02', '2026-11-16', 'prog-1');
check('copiar semana crea las entradas de la siguiente', copied.length === 3 && copied[0].date === '2026-11-17');
const copied2 = PL.copyWeek(created.concat(copied), '2026-11-02', '2026-11-16', 'prog-1');
check('copiar dos veces no duplica', copied2.length === 0);

const grid = PL.monthGrid(2026, 10); /* noviembre 2026 */
check('el calendario mensual tiene 6 semanas de 7 días', grid.length === 6 && grid.every(w => w.length === 7));
check('el calendario marca los días fuera del mes', grid[0].some(c => !c.inMonth) || grid[5].some(c => !c.inMonth));
check('el 2 de noviembre de 2026 es lunes', grid.flat().find(c => c.date === '2026-11-02').day === 2 && PL.dayOfWeek('2026-11-02') === 0);

const sessions = [
  { id: 's1', date: '2026-11-02', workoutName: 'Rutina A', finished: true, status: 'completed',
    exercises: [{ id: 'e1', exId: 'bench', name: 'Press banca', sets: [{ weight: 80, reps: 8, completed: true, type: 'working' }, { weight: 100, reps: 3, completed: true, type: 'working' }] }] },
  { id: 's2', date: '2026-11-05', workoutName: 'Rutina B', finished: true, status: 'completed',
    exercises: [{ id: 'e2', exId: 'squat', name: 'Sentadilla', sets: [{ weight: 120, reps: 5, completed: true, type: 'working' }] }] },
];
const doc = { sessions, planner: created, programs: [program], weights: [], records: [], exercises: [], workouts: [] };
const resolve = name => (/banca/i.test(name) ? 'bench' : /sentadilla/i.test(name) ? 'squat' : null);

const goals = PL.evaluateGoals(program, doc, PG, { today: '2026-11-10', resolve });
const goalOf = id => goals.find(x => x.id === id);
check('objetivo de sesiones: 2 hechas => cumplido', goalOf('g1').current === 2 && goalOf('g1').met === true && goalOf('g1').verifiable === true);
check('objetivo de peso: 100 kg supera la meta de 90', goalOf('g2').current === 100 && goalOf('g2').met === true);
check('objetivo de reps a 80 kg: 8 reps => cumplido', goalOf('g3').current === 8 && goalOf('g3').met === true);
check('objetivo de volumen se calcula con datos reales', goalOf('g4').verifiable === true && goalOf('g4').current > 0 && goalOf('g4').met === true);
check('objetivo de frecuencia semanal usa las semanas del programa', goalOf('g5').current > 0 && goalOf('g5').verifiable === true);

const emptyDoc = { sessions: [], planner: [], programs: [program], weights: [], records: [], workouts: [] };
const empty = PL.evaluateGoals(program, emptyDoc, PG, { today: '2026-11-10', resolve });
check('sin datos, el peso no se declara cumplido', empty.find(x => x.id === 'g2').verifiable === false && empty.find(x => x.id === 'g2').met === false);
check('sin datos, las reps no se declaran cumplidas', empty.find(x => x.id === 'g3').verifiable === false && empty.find(x => x.id === 'g3').met === false);
check('sin datos, la frecuencia no se declara cumplida', empty.find(x => x.id === 'g5').verifiable === false && empty.find(x => x.id === 'g5').met === false);
check('sin sesiones, el objetivo de sesiones es verificable y no cumplido', empty.find(x => x.id === 'g1').verifiable === true && empty.find(x => x.id === 'g1').met === false);

const dup = PL.duplicateProgram(program);
check('duplicar crea id nuevo y queda en pausa', dup.id !== program.id && dup.status === 'paused' && /copia/.test(dup.name));
check('duplicar no comparte fases ni objetivos', dup.phases[0].id !== program.phases[0].id && dup.goals[0].id !== program.goals[0].id);

check('el estado de una entrada hecha sale de la sesión', PL.entryStatus(Object.assign({}, created[0], { sessionId: 's1' }), new Map([['s1', sessions[0]]]), '2026-11-10') === 'done');
check('una entrada pasada sin sesión está omitida', PL.entryStatus({ id: 'x', date: '2026-11-02', kind: 'workout' }, new Map(), '2026-11-10') === 'missed');
check('una entrada futura está pendiente', PL.entryStatus({ id: 'y', date: '2026-11-20', kind: 'workout' }, new Map(), '2026-11-10') === 'pending');
check('un día de descanso se marca como descanso', PL.entryStatus({ id: 'z', date: '2026-11-07', kind: 'rest' }, new Map(), '2026-11-10') === 'rest');

const normalized = PL.ensurePlanData({ sessions: [] });
check('un documento antiguo recibe programs y planner vacíos', Array.isArray(normalized.programs) && Array.isArray(normalized.planner));
check('normalizar no rompe sesiones existentes', PL.ensurePlanData({ sessions: [{ id: 's' }] }).sessions.length === 1);

/* Contrato del servidor */
const serverDoc = { programs: [program], planner: created.map(e => Object.assign({}, e, { updatedAt: '2026-11-02T10:00:00.000Z' })) };
check('el validador del servidor acepta programas y planificación', validateData(serverDoc) === true);
check('el validador rechaza un campo desconocido en un programa', validateData({ programs: [Object.assign({}, program, { hack: 'x' })] }) === false);
check('el validador rechaza un estado inválido', validateData({ programs: [Object.assign({}, program, { status: 'inventado' })] }) === false);
check('el validador rechaza una fecha imposible en el plan', validateData({ planner: [{ id: 'p1', date: '2026-02-30' }] }) === false);

/* Sincronización entre dos dispositivos */
check('sync.js expone digest y merge', typeof DrakoSync.digest === 'function' && typeof DrakoSync.merge === 'function');
const local = { programs: [program], planner: created, sessions: [], workouts: [] };
const remote = {
  programs: [Object.assign({}, program, { name: 'Bloque de fuerza (editado)' })],
  planner: created.concat(PL.applyTemplate(program, '2026-11-09', created, () => '')),
  sessions: [], workouts: [],
};
const merged = DrakoSync.merge(null, local, remote).data;
check('al fusionar, cada programa aparece una sola vez', merged.programs.length === 1 && merged.programs[0].id === program.id);
check('el plan fusionado no duplica los días compartidos', new Set(merged.planner.map(e => e.id)).size === merged.planner.length);
check('las entradas de la otra semana llegan al fusionar', merged.planner.some(e => e.date >= '2026-11-09'));
check('dos dispositivos con la misma entrada no la duplican', DrakoSync.merge(null, { programs: [], planner: [created[0]] }, { programs: [], planner: [created[0]] }).data.planner.length === 1);

/* ---------------- 2. Integración con la app ---------------- */

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const FILES = ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js',
    'offline.js', 'analytics.js', 'app.js'];
function bootDom(storedDB) {
  const dom = new JSDOM(html, {
    url: 'http://localhost:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
      if (storedDB) {
        w.localStorage.setItem('draktrack_v1', storedDB);
        w.localStorage.setItem('draktrack_session_v1', 'p6_tester');
      }
    },
  });
  const context = dom.getInternalVMContext();
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), context, { filename: f }));
  return context;
}
const ctx = bootDom(null);
const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

(async () => {
  console.log('\n=== Integración: programas, calendario y sesiones ===');

  g(`(function(){
    localStorage.clear();
    db = { users:{}, data:{} };
    currentUser = 'p6_tester';
    localStorage.setItem(SESSION_KEY, currentUser);
    const d = dataFor(currentUser);
    d.workouts = [
      { id:'w-a', name:'Rutina A', exercises:[{ id:'a1', exId:'bench', name:'Press banca', sets:3, reps:8 }] },
      { id:'w-b', name:'Rutina B', exercises:[{ id:'b1', exId:'squat', name:'Sentadilla', sets:3, reps:5 }] },
      { id:'w-c', name:'Rutina C', exercises:[{ id:'c1', exId:'deadlift', name:'Peso muerto', sets:3, reps:5 }] }
    ];
    d.sessions = []; d.programs = []; d.planner = [];
    d.prefs = {};
    state.plan = null; state.hist = null;
    saveDB();
  })()`);

  /* Crear programa desde la UI */
  g("nav('#/plan'); render();");
  check('la pestaña Plan existe en la navegación', !!g("document.querySelector('.nav-btn[data-route=\"plan\"]')"));
  check('la vista semanal pinta 7 días', g("document.querySelectorAll('.plan-day').length") === 7);
  g("document.querySelector('[data-action=\"plan-tab\"][data-tab=\"programs\"]').click()");
  await tick();
  g("document.querySelector('[data-action=\"program-new\"]').click()");
  await tick();
  check('el editor de programa se abre', !!g("$('#pf-name')"));
  g(`(function(){
    $('#pf-name').value = 'Bloque de fuerza';
    $('#pf-desc').value = 'Ocho semanas';
    $('#pf-goal').value = 'fuerza';
    $('#pf-start').value = '2026-11-02';
    $('#pf-weeks').value = '8';
    $('#pf-days').value = '3';
    document.querySelector('[data-pf-tpl="0"]').value = 'w-a';
    document.querySelector('[data-pf-tpl="3"]').value = 'w-b';
    document.querySelector('[data-pf-tpl="5"]').value = 'rest';
    document.querySelector('[data-action="program-add-goal"]').click();
    const row = document.querySelector('#pf-goals .plan-goal-row');
    row.querySelector('.pg-type').value = 'sessions';
    row.querySelector('.pg-target').value = '2';
    document.querySelector('[data-action="program-save"]').click();
  })()`);
  await tick();
  check('el programa se guarda con su plantilla', g("dataFor(currentUser).programs.length") === 1
    && g("dataFor(currentUser).programs[0].template[0]") === 'w-a'
    && g("dataFor(currentUser).programs[0].template[5]") === 'rest');
  check('el programa queda activo', g("dataFor(currentUser).programs[0].status") === 'active');
  check('el objetivo se guarda con la meta', g("dataFor(currentUser).programs[0].goals[0].target") === 2);

  /* Aplicar plantilla a una semana concreta */
  g("state.plan = { tab:'week', week:PL.weekStart('2026-11-02'), month:'2026-11', selectedDay:'2026-11-02', programEdit:null }; nav('#/plan'); render();");
  g("document.querySelector('[data-action=\"plan-apply-template\"]').click()");
  await tick();
  check('aplicar la plantilla crea los 3 días de esa semana', g("dataFor(currentUser).planner.length") === 3);
  check('el sábado queda como descanso', g("dataFor(currentUser).planner.filter(e => e.kind === 'rest').length") === 1);
  check('los días se ven en la semana', g("document.querySelectorAll('.plan-entry').length") === 3);

  /* Mover un entrenamiento entre días */
  g(`(function(){
    const sel = document.querySelector('[data-plan-move]');
    sel.value = '2026-11-03';
    sel.dispatchEvent(new window.Event('change'));
  })()`);
  await tick();
  check('mover la rutina cambia su fecha sin crear otra', g("dataFor(currentUser).planner.length") === 3
    && g("dataFor(currentUser).planner.some(e => e.date === '2026-11-03' && e.workoutId === 'w-a')"));

  /* Otra semana con la misma plantilla: no altera la anterior */
  g("state.plan.week = '2026-11-09'; render();");
  g("document.querySelector('[data-action=\"plan-apply-template\"]').click()");
  await tick();
  check('la semana siguiente recibe su plantilla', g("dataFor(currentUser).planner.filter(e => e.date >= '2026-11-09').length") === 3);
  check('la semana anterior conserva sus fechas', g("dataFor(currentUser).planner.filter(e => e.date <= '2026-11-08').length") === 3);

  /* El estado depende de la fecha real: en una semana ya pasada, las entradas sin
     sesión salen como «Omitida». Por eso se comprueba la estructura (una etiqueta
     por entrada, el descanso identificado), no una etiqueta concreta, para que la
     prueba no se rompa según el día en que se ejecute. */
  g("state.plan.week = '2026-11-02'; render();");
  const weekHtml = g("$('#main').innerHTML");
  check('las entradas muestran su estado (pendiente y descanso)',
    g("document.querySelectorAll('.plan-entry .plan-chip').length") === 3
    && /Descanso/.test(weekHtml)
    && ['Pendiente', 'En curso', 'Hecha', 'Omitida'].some(label => weekHtml.includes(label)));

  /* Iniciar la rutina planificada */
  const plannedId = g("dataFor(currentUser).planner.find(e => e.workoutId === 'w-a').id");
  g(`document.querySelector('[data-action="plan-start"][data-id="${plannedId}"]').click()`);
  await tick(60);
  check('empezar desde el plan abre la sesión', /#\/session\//.test(g("location.hash")));
  check('la entrada del plan queda enlazada a la sesión', !!g(`dataFor(currentUser).planner.find(e => e.id === '${plannedId}').sessionId`));
  check('la entrada sigue existiendo (no se borra al entrenar)', g("dataFor(currentUser).planner.length") === 6);

  const sid = g(`dataFor(currentUser).planner.find(e => e.id === '${plannedId}').sessionId`);
  g(`(function(){ const s = dataFor(currentUser).sessions.find(x => x.id === '${sid}');
      s.finished = true; s.status = 'completed'; s.finishedAt = nowIso(); s.durationSec = 3600;
      s.exercises[0].sets[0].completed = true; s.exercises[0].sets[0].weight = 80; s.exercises[0].sets[0].reps = 8;
      s.exercises[0].sets[1].completed = true; s.exercises[0].sets[1].weight = 85; s.exercises[0].sets[1].reps = 6;
      s.exercises[0].sets[2].completed = true; s.exercises[0].sets[2].weight = 90; s.exercises[0].sets[2].reps = 3;
      persistSessionRecords(s); saveDB(); })()`);
  g("nav('#/plan'); state.plan.tab = 'week'; state.plan.week = '2026-11-02'; render();");
  check('la entrada planificada pasa a hecha al terminar la sesión', /Hecha/.test(g("$('#main').innerHTML")));

  /* Empezar una rutina distinta: no pisa la planificación */
  g("(function(){ const s = startOrGetSession('w-c'); nav('#/session/' + s.id); })()");
  await tick(40);
  g("(function(){ const s = dataFor(currentUser).sessions.find(x => x.workoutName === 'Rutina C'); s.finished = true; s.status='completed'; s.date = '2026-11-04'; s.finishedAt = nowIso(); saveDB(); })()");
  g("nav('#/plan'); state.plan.tab = 'week'; render();");
  check('la sesión distinta se conserva', g("dataFor(currentUser).sessions.some(s => s.workoutName === 'Rutina C')"));
  check('la planificación original no se sobrescribe', g("dataFor(currentUser).planner.filter(e => e.date === '2026-11-03' && e.workoutId === 'w-a').length") === 1);
  g("state.plan.tab = 'month'; state.plan.month = '2026-11'; state.plan.selectedDay = '2026-11-04'; render();");
  check('el calendario mensual muestra la sesión distinta del día', /Rutina C/.test(g("$('#main').innerHTML")));

  /* Calendario mensual y detalle del día */
  check('el calendario mensual pinta la cuadrícula', g("document.querySelectorAll('.cal-cell').length") === 42);
  g("document.querySelector('.cal-cell[data-date=\"2026-11-03\"]').click()");
  await tick();
  check('elegir un día actualiza el detalle', g("state.plan.selectedDay") === '2026-11-03' && /3 nov/i.test(g("$('#main').innerHTML")));

  /* Editar el programa no toca las sesiones */
  const beforeSessions = g("JSON.stringify(dataFor(currentUser).sessions.map(s => [s.id, s.workoutName, s.date, s.finished]))");
  g("state.plan.tab = 'programs'; render();");
  g("document.querySelector('[data-action=\"program-edit\"]').click()");
  await tick();
  g("$('#pf-name').value = 'Bloque de fuerza II'; document.querySelector('[data-action=\"program-save\"]').click()");
  await tick();
  check('editar el programa cambia su nombre', g("dataFor(currentUser).programs[0].name") === 'Bloque de fuerza II');
  check('editar el programa no modifica las sesiones', g("JSON.stringify(dataFor(currentUser).sessions.map(s => [s.id, s.workoutName, s.date, s.finished]))") === beforeSessions);

  /* Duplicar y archivar */
  g("document.querySelector('[data-action=\"program-duplicate\"]').click()");
  await tick();
  check('duplicar añade un segundo programa en pausa', g("dataFor(currentUser).programs.length") === 2 && g("dataFor(currentUser).programs.filter(p => p.status === 'paused').length") === 1);
  const originalId = g("dataFor(currentUser).programs.find(p => p.status === 'active').id");
  g(`document.querySelector('[data-action="program-status"][data-id="${originalId}"][data-status="archived"]').click()`);
  await tick();
  check('archivar conserva el programa y su plan', g("dataFor(currentUser).programs.length") === 2 && g("dataFor(currentUser).programs.find(p => p.id === '" + originalId + "').status") === 'archived' && g("dataFor(currentUser).planner.length") === 6);
  check('archivar no borra sesiones', g("dataFor(currentUser).sessions.length") === 2);

  /* Objetivos visibles en la tarjeta */
  g("state.plan.tab = 'programs'; render();");
  check('la tarjeta del programa muestra los objetivos', /plan-goals/.test(g("$('#main').innerHTML")) && /sesiones/.test(g("$('#main').innerHTML")));

  /* Persistencia: cerrar y volver a abrir con el mismo almacenamiento */
  g("saveDB()");
  const storedDB = g("localStorage.getItem(DB_KEY)");
  check('el programa y el plan quedan guardados en localStorage', typeof storedDB === 'string' && /prog-|"planner"/.test(storedDB));
  const ctx2 = bootDom(storedDB);
  const g2 = expr => vm.runInContext(expr, ctx2, { filename: 'reload' });
  check('al recargar, los dos programas siguen ahí', g2("dataFor('p6_tester').programs.length") === 2);
  check('al recargar, los 6 días del plan siguen ahí', g2("dataFor('p6_tester').planner.length") === 6);
  check('al recargar, las sesiones y el enlace se conservan', g2("dataFor('p6_tester').sessions.length") === 2
    && g2("dataFor('p6_tester').planner.some(e => e.sessionId && e.sessionId.length)") === true);
  g2("nav('#/plan'); render();");
  check('los recordatorios solo aparecen como acción explícita', /Recordatorios/.test(g2("$('#main').innerHTML")) && !/Notification.requestPermission\(\)/.test(g2("$('#main').innerHTML")));

  console.log('\npassed: ' + pass + ' failed: ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('ERROR en pruebas de integración del plan:', e);
  process.exit(1);
});
