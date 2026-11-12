'use strict';
/* ============================================================
   F4 · diccionario muscular en la interfaz
   Comprueba que cada ejercicio muestra sus músculos publicados o,
   si el diccionario no lo tiene, «Sin clasificar» sin inventar, y
   que la cobertura de la biblioteca dice la verdad.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
  beforeParse(w){ Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true }); } });
const { window } = dom;
const ctx = dom.getInternalVMContext();
for (const f of ['sync.js','supabase.js','boostcamp.js','share.js','progress.js','planner.js','offline.js','analytics.js','activity.js','app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const g = e => vm.runInContext(e, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms));
const $ = s => window.document.querySelector(s);

let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }

const dict = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'muscles.json'), 'utf8'));
ctx.__dict = dict;
vm.runInContext('MUSCLE_DICT = __dict; MUSCLE_DICT_STATE = "ready";', ctx);

console.log('=== Músculos por ejercicio ===');
const bench = g("muscleChipsHTML({ id:'press-de-banca', name:'Press de banca' })");
check('un ejercicio clasificado muestra su grupo primario', /Pecho/.test(bench));
check('no se marca como sin clasificar si hay entrada', !/Sin clasificar/.test(bench));
const squat = g("muscleChipsHTML({ id:'sentadilla-trasera', name:'Sentadilla trasera' })");
check('la sentadilla muestra cuádriceps y glúteos', /Cuádriceps/.test(squat) && /Glúteos/.test(squat));
const raro = g("muscleChipsHTML({ id:'custom:raro', name:'Ejercicio rarísimo XYZ' })");
check('un ejercicio desconocido se declara sin clasificar', /Sin clasificar/.test(raro));
check('el aviso de sin clasificar usa la insignia de aviso', /badge-warn/.test(raro));

console.log('\n=== Cobertura de la biblioteca ===');
const cov = g('libraryMuscleCoverage()');
check('la cobertura suma clasificados y sin clasificar', cov.classified + cov.unclassified.length === cov.total);
check('el catálogo tiene ejercicios', cov.total > 20);
check('la cobertura no inventa clasificaciones', cov.classified > 0 && cov.classified <= cov.total);
check('cada sin clasificar tiene nombre', cov.unclassified.every(x => x && typeof x.name === 'string' && x.name));
check('la biblioteca del catálogo queda entera clasificada', cov.unclassified.length === 0, cov.unclassified.map(x => x.name).join(', '));

(async () => {
  const user = 'mus_' + Date.now().toString(36).slice(-5);
  await g(`signup('${user}', 'secret123')`);
  await tick(60);
  g(`(function(){ const d = dataFor(currentUser);
    d.exercises.push({ id:'custom:raro', name:'Ejercicio rarísimo XYZ', group:'pecho' });
    saveDB(); })()`);

  console.log('\n=== Biblioteca ===');
  g("nav('#/library')"); await tick(90);
  check('la biblioteca muestra el panel de cobertura', !!$('#main .lib-coverage'));
  check('la cobertura dice cuántos ejercicios están clasificados', /ejercicios de tu biblioteca/.test($('#main .lib-coverage').textContent));
  check('el diccionario cargado indica versión y grupos', /v3/.test($('#main .lib-coverage').textContent));
  check('hay una lista de sin clasificar', !!$('#main .lib-unclassified'));
  check('el ejercicio propio sin clasificar aparece en la lista', /Ejercicio rarísimo XYZ/.test($('#main .lib-coverage').textContent));
  check('la fila del ejercicio propio lleva su insignia', /Sin clasificar/.test($('#main #lib-list').textContent));
  check('la fila de press de banca lleva su músculo', /Pecho/.test($('#main #lib-list').textContent));

  console.log('\n=== Mapa semanal y sin clasificar ===');
  const today = g('todayISO()');
  g(`(function(){ const d = dataFor(currentUser);
    d.sessions.push({ id:'mus1', date:'${today}', workoutName:'Sesión', finished:true, status:'completed', durationSec:1800,
      exercises:[{ name:'Ejercicio rarísimo XYZ', sets:[{ weight:20, reps:10, completed:true, type:'working' }] }] });
    saveDB(); nav('#/progress'); render(); })()`);
  await tick(90);
  check('el mapa semanal marca las series sin clasificar', /serie[s]? sin clasificar/.test($('#main').textContent));
  check('el mapa permite ver los nombres sin clasificar', /Ver los ejercicios sin clasificar/.test($('#main').textContent));
  check('el nombre concreto aparece en el desplegable', /Ejercicio rarísimo XYZ/.test($('#main').textContent));

  const meta = g("weekMuscleVolume(dataFor(currentUser), weekStartISO(todayISO())).meta");
  check('las series sin clasificar no se reparten pero sí se cuentan', meta.unclassified.length === 1 && meta.unclassified[0].name === 'Ejercicio rarísimo XYZ');

  console.log(`\n${pass} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
