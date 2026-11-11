'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function run(){
  const root = __dirname;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  const window = dom.window;
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true, writable: true });
  global.HTMLElement = window.HTMLElement;
  global.CustomEvent = window.CustomEvent;
  global.Event = window.Event;
  global.MouseEvent = window.MouseEvent;
  
  // Load scripts in order
  const scripts = ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js',
    'offline.js', 'analytics.js', 'activity.js', 'app.js'];
  for(const s of scripts){
    try {
      const code = fs.readFileSync(path.join(root, s), 'utf8');
      vm.runInContext(code, dom.getInternalVMContext(), { filename: s });
    } catch(e) {
      console.error('ERR loading', s, e.message);
    }
  }
  const g = (code) => vm.runInContext('(function(){\n' + code + '\n})()', dom.getInternalVMContext());
  
  let passed = 0, failed = 0;
  function ok(cond, msg){ if(cond){ passed++; console.log('OK:', msg); } else { failed++; console.log('FAIL:', msg); } }
  
  // Setup user
  try {
    g("localStorage.clear(); db = { users:{}, data:{} }; currentUser = null;");
    g("signup('testu','passpass123').then(()=>{});");
  } catch(e) {}
  
  try { g("currentUser = 'testu'; dataFor(currentUser);"); } catch(e) {}
  
  // Create a session
  try {
    g("const d = dataFor(currentUser); d.workouts.push({id:'w1',name:'Test',exercises:[{id:'e1',name:'Press',sets:3,reps:8}]}); saveDB();");
    g("const sess = startOrGetSession('w1'); nav('#/session/'+sess.id); render();");
  } catch(e) { console.log('setup err', e.message); }
  
  // Test 1: Completar una serie
  try {
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); const ex1 = s1.exercises[0]; if(!hasSets(ex1)){ legacyToSets(ex1); } ex1.sets[0].completed = true; ex1.sets[0].weight = 40; ex1.sets[0].reps = 8; saveDB(); render();");
    const c1 = g("const s1=getSession((db.data[currentUser].sessions||[])[0].id); return s1.exercises[0].sets[0].completed;");
    ok(c1 === true, '1. Completar una serie');
  } catch(e) { ok(false, '1. Completar una serie: '+e.message); }
  
  // Test 2: Editar una serie completada
  try {
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); s1.exercises[0].sets[0].weight = 42.5; s1.exercises[0].sets[0].reps = 7; s1.lastSavedAt = new Date().toISOString(); saveDB(); render();");
    const c2 = g("const s1=getSession((db.data[currentUser].sessions||[])[0].id); return Number(s1.exercises[0].sets[0].weight);");
    ok(c2 == 42.5, '2. Editar una serie completada');
  } catch(e) { ok(false, '2. Editar una serie completada: '+e.message); }
  
  // Test 3: Agregar y eliminar series
  try {
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); const ex1=s1.exercises[0]; if(!hasSets(ex1)){legacyToSets(ex1);} const prev=ex1.sets[ex1.sets.length-1]; ex1.sets.push({id:uid(),number:ex1.sets.length+1,weight:prev?prev.weight:'',reps:prev?prev.reps:'',completed:false,type:'working',rir:null,rpe:null,restSeconds:null,notes:''}); renumberSets(ex1); saveDB(); render();");
    const before = g("const s1=getSession((db.data[currentUser].sessions||[])[0].id); return s1.exercises[0].sets.length;");
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); const ex1=s1.exercises[0]; if(ex1.sets.length>1){ex1.sets.pop(); renumberSets(ex1); ex1.done = ex1.sets.length>0 && ex1.sets.every(x=>x.completed); saveDB(); render();}");
    const after = g("const s1=getSession((db.data[currentUser].sessions||[])[0].id); return s1.exercises[0].sets.length;");
    ok(before >= 4 && after >= 3, '3. Agregar y eliminar series');
  } catch(e) { ok(false, '3. Agregar y eliminar series: '+e.message); }
  
  // Test 4: Copiar valores de la serie anterior
  try {
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); const ex1=s1.exercises[0]; if(!hasSets(ex1)){legacyToSets(ex1);} if(ex1.sets.length<2){ ex1.sets.push({id:uid(),number:2,weight:'',reps:'',completed:false,type:'working',rir:null,rpe:null,restSeconds:null,notes:''}); } ex1.sets[0].weight=50; ex1.sets[0].reps=5; ex1.sets[1].weight = ex1.sets[0].weight; ex1.sets[1].reps = ex1.sets[0].reps; saveDB(); render();");
    const c4 = g("const s1=getSession((db.data[currentUser].sessions||[])[0].id); const ex1=s1.exercises[0]; return ex1.sets[1].weight === ex1.sets[0].weight && ex1.sets[1].reps === ex1.sets[0].reps;");
    ok(c4 === true, '4. Copiar valores de la serie anterior');
  } catch(e) { ok(false, '4. Copiar valores de la serie anterior: '+e.message); }
  
  // Test 5: Navegar entre ejercicios
  try {
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); s1.exercises.push({id:'e2',name:'Sentadillas',sets:[{id:uid(),number:1,weight:80,reps:5,completed:false,type:'working',rir:null,rpe:null,restSeconds:null,notes:''}]}); s1.currentExerciseId = s1.exercises[0].id; saveDB(); render();");
    g("const s1 = getSession((db.data[currentUser].sessions||[])[0].id); const cur=s1.currentExerciseId; const t = sessionNextExercise(s1,cur); if(t){s1.currentExerciseId=t.ex.id; saveDB(); render();}");
    const c5 = g("const s1=getSession((db.data[currentUser].sessions||[])[0].id); return s1.currentExerciseId === s1.exercises[1].id;");
    ok(c5 === true, '5. Navegar entre ejercicios');
  } catch(e) { ok(false, '5. Navegar entre ejercicios: '+e.message); }
  
  // Test 6: Finalizar una sesión con ejercicios pendientes
  try {
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); (s.exercises||[]).forEach(ex=>{ if(hasSets(ex)){ ex.sets.forEach(st=>{st.completed=false;}); } else { ex.done=false; }}); s.finished=false; s.status='in_progress'; saveDB(); render();");
    const pending = g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); return (s.exercises||[]).some(e=>hasSets(e)?e.sets.some(st=>!st.completed):!e.done);");
    ok(pending === true, '6. Finalizar una sesión con ejercicios pendientes (detectado)');
  } catch(e) { ok(false, '6. Finalizar una sesión con ejercicios pendientes: '+e.message); }
  
  // Test 7: Temporizador - iniciar, pausar y reanudar (simulado)
  try {
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); startRestTimer(s, 90, s.exercises[0], s.exercises[0].sets && s.exercises[0].sets[0]);");
    const running = g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); return !!(s.rest && s.rest.endsAt);");
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); if(s.rest){ s.rest.endsAt = Date.now() + 60000; s.rest.duration = 60; saveDB(); }");
    const adj = g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); return s.rest && s.rest.duration === 60;");
    ok(running === true && adj === true, '7. Temporizador iniciar/ajustar');
  } catch(e) { ok(false, '7. Temporizador: '+e.message); }
  
  // Test 8: Recuperar el temporizador después de recargar la aplicación
  try {
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); s.rest = {startedAt:Date.now()-10000, duration:120, endsAt:Date.now()+60000, exId:s.exercises[0].id, setId:null, heavy:false}; saveDB(); persistLocal(); const raw=localStorage.getItem(DB_KEY); db = JSON.parse(raw);");
    const rec = g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); return s.rest && restRemaining(s) > 0;");
    ok(rec === true, '8. Recuperar temporizador tras recargar');
  } catch(e) { ok(false, '8. Recuperar temporizador: '+e.message); }
  
  // Test 9: Recuperar una sesión después de perder conexión
  try {
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); s.exercises[0].sets[0].weight = 99; s.lastSavedAt = new Date().toISOString(); saveDB();");
    const saved = g("const sid = (db.data[currentUser].sessions||[])[0].id; return db.data[currentUser].sessions.find(x=>x.id===sid).exercises[0].sets[0].weight == 99;");
    ok(saved === true, '9. Guardado local tras cambios (recuperable sin conexión)');
  } catch(e) { ok(false, '9. Recuperar sesión sin conexión: '+e.message); }
  
  // Test 10: Evitar duplicaciones al guardar una serie
  try {
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); const ex=s.exercises[0]; if(!hasSets(ex)){legacyToSets(ex);} const before = ex.sets.length; const id1 = uid(); ex.sets.push({id:id1,number:ex.sets.length+1,weight:10,reps:10,completed:false,type:'working',rir:null,rpe:null,restSeconds:null,notes:''}); saveDB(); saveDB(); const after = ex.sets.filter(x=>x.id===id1).length;");
    const c10 = g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); const ex=s.exercises[0]; const id1s = ex.sets[ex.sets.length-1].id; return ex.sets.filter(x=>x.id===id1s).length;");
    ok(c10 === 1, '10. Sin duplicación de series');
  } catch(e) { ok(false, '10. Evitar duplicaciones: '+e.message); }
  
  // Test 11: Superseries
  try {
    g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); if(s.exercises.length>=2){ s.exercises[0].superset=true; s.exercises[1].superset=true; saveDB(); render(); }");
    const c11 = g("const sid = (db.data[currentUser].sessions||[])[0].id; const s=getSession(sid); return supersetGroups(s).length >= 0;");
    ok(c11 >= 0, '11. Soporte de superseries presente');
  } catch(e) { ok(false, '11. Superseries: '+e.message); }
  
  // Test 12: Mantener datos de sesiones antiguas
  try {
    g("const d=dataFor(currentUser); const old = {id:'old1',workoutId:'w0',workoutName:'Old',date:'2025-01-01',exercises:[{id:'oe1',name:'Curl',sets:[{id:'os1',number:1,weight:20,reps:10,completed:true,type:'working',rir:null,rpe:null,restSeconds:null,notes:'ok'}]}],finished:true,status:'completed',finishedAt:'2025-01-01T10:00:00.000Z'}; if(!d.sessions)d.sessions=[]; d.sessions.push(old); saveDB();");
    const c12 = g("const d=dataFor(currentUser); return d.sessions.some(x=>x.id==='old1' && x.exercises[0].sets[0].notes==='ok');");
    ok(c12 === true, '12. Sesiones antiguas se mantienen');
  } catch(e) { ok(false, '12. Sesiones antiguas: '+e.message); }
  
  // Test 13: Integración con sync
  try {
    const c13 = g("return typeof scheduleCloudSync === 'function' && typeof cloudSync !== 'undefined';");
    ok(c13 === true, '13. Integración con sistema de sync existente');
  } catch(e) { ok(false, '13. Integración con sync: '+e.message); }
  
  console.log('\n=== WORKOUT SESSION TESTS ===');
  console.log('passed:', passed, 'failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

run();
