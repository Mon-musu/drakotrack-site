'use strict';
/* Pruebas del Prompt 8 — PWA, cola persistente, offline y actualizaciones. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const Offline = require('./offline.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function memoryStorage() {
  const map = {};
  return {
    get: key => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null,
    set: (key, value) => { map[key] = String(value); },
    remove: key => { delete map[key]; },
    raw: map,
  };
}

console.log('\n=== Cola persistente ===');
let clock = 1000, seq = 0;
const store = memoryStorage();
const q = Offline.createQueue({ storage: store, now: () => clock, newId: () => 'job-' + (++seq), baseDelay: 1000, maxDelay: 4000, maxAttempts: 3 });
const a = q.enqueue('cuenta-a', { kind: 'sync', target: 'doc', revision: 1 });
check('crear una operación la deja pendiente', a.state === 'pending' && a.attempts === 0 && !!a.id);
check('la operación tiene clave de idempotencia estable', a.idempotencyKey === a.id);
const a2 = q.enqueue('cuenta-a', { kind: 'sync', target: 'doc', revision: 2 });
check('guardar varias veces deduplica el mismo destino', a2.id === a.id && q.stats('cuenta-a').pending === 1);
check('la cola guarda la revisión más reciente', q.get(a.id).revision === 2);
const beg = q.begin(a.id);
check('begin marca enviando y cuenta un intento', beg.state === 'sending' && beg.attempts === 1);
const beg2 = q.begin(a.id);
check('begin es idempotente ante envíos concurrentes', beg2.attempts === 1 && q.stats('cuenta-a').sending === 1);
check('no se elige otra operación mientras hay una enviando', q.next('cuenta-a', clock) === null);
const retry = q.retry(a.id, 'network');
check('un fallo pasa a reintento con backoff', retry.state === 'retry' && retry.nextAt === 2000 && retry.lastError === 'network');
check('antes del backoff no se reintenta', q.next('cuenta-a', 1999) === null);
clock = 2000;
check('al cumplirse el backoff vuelve a estar disponible', q.next('cuenta-a', clock).id === a.id);
const dep = q.enqueue('cuenta-b', { kind: 'sync', target: 'other', dependsOn: [a.id] });
check('una dependencia pendiente bloquea la operación', q.next('cuenta-b', clock) === null);
q.confirm(a.id);
check('confirmar la dependencia libera la siguiente', q.next('cuenta-b', clock).id === dep.id);
check('confirmar no borra el registro de la operación', q.get(a.id).state === 'confirmed' && !!q.get(a.id).confirmedAt);

const q2store = memoryStorage();
const q2 = Offline.createQueue({ storage: q2store, now: () => clock, newId: () => 'per-' + (++seq), baseDelay: 1000, maxDelay: 2000, maxAttempts: 2 });
const p = q2.enqueue('cuenta-c', {});
q2.begin(p.id); q2.retry(p.id, 'fail');
clock += 5000;
q2.begin(p.id);
const perm = q2.retry(p.id, 'fail');
check('tras el máximo de intentos queda como error permanente', perm.state === 'permanent' && perm.attempts === 2);
check('un error permanente no se descarta solo', !!q2.get(p.id));
check('reabrir una operación permite reintentarla manualmente', q2.reopen(p.id).state === 'pending' && q2.get(p.id).attempts === 0);
q2.begin(p.id);
q2.retry(p.id, 'x');
clock += 5000;
q2.begin(p.id);
q2.retry(p.id, 'x');
check('no hay reintentos infinitos', q2.get(p.id).state === 'permanent');

/* Persistencia y recuperación tras reinicio */
const q3 = Offline.createQueue({ storage: store, now: () => clock, newId: () => 'new-' + (++seq) });
check('la cola sobrevive a recrear el objeto (recarga)', q3.stats('cuenta-a').confirmed >= 1 && q3.stats('cuenta-b').pending === 1);
const sending = q3.enqueue('cuenta-d', { kind: 'sync', target: 'doc' });
q3.begin(sending.id);
const q4 = Offline.createQueue({ storage: store, now: () => clock, newId: () => 'x-' + (++seq) });
const recovered = q4.recover('cuenta-d').find(j => j.id === sending.id);
check('un envío interrumpido vuelve a la cola al arrancar', recovered.state === 'retry' && recovered.lastError === 'interrupted');
check('la recuperación no pierde intentos', recovered.attempts === 1);

const bad = { get: () => null, set: () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
const q5 = Offline.createQueue({ storage: bad, now: () => clock, newId: () => 'bad-1' });
const badJob = q5.enqueue('cuenta-e', {});
check('si el almacenamiento falla la cola no rompe la app', !!badJob.id && q5.writeError() === 'QuotaExceededError');

q3.enqueue('otra-cuenta', {});
q3.removeAccount('cuenta-d');
check('eliminar una cuenta no toca las demás colas', q3.stats('cuenta-d').total === 0 && q3.stats('otra-cuenta').pending === 1);
q3.clearConfirmed('cuenta-a');
check('limpiar confirmadas no toca las pendientes', q3.stats('cuenta-a').confirmed === 0);

console.log('\n=== Conectividad y almacenamiento ===');
(async () => {
  let options = null;
  const okFetch = async (url, opts) => { options = opts; return { ok: true, status: 200 }; };
  check('la comprobación usa HEAD y evita la caché', await Offline.probe(okFetch) === true && options.method === 'HEAD' && options.cache === 'no-store');
  check('un fallo de red se trata como sin conexión', await Offline.probe(async () => { throw new Error('down'); }) === false);
  check('un 503 no se considera conexión válida', await Offline.probe(async () => ({ ok: false, status: 503 })) === false);

  const docStore = memoryStorage();
  check('una escritura normal se confirma', Offline.writeDocument(docStore, 'db', '{"a":1}').ok === true && docStore.get('db') === '{"a":1}');
  docStore.set('db', 'viejo');
  const quotaStore = { get: () => 'viejo', set: () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
  const quota = Offline.writeDocument(quotaStore, 'db', 'nuevo');
  check('una cuota llena se informa y conserva lo anterior', quota.ok === false && quota.quota === true && quota.previousPreserved === true);
  check('el almacenamiento disponible se detecta', Offline.storageAvailable(memoryStorage()) === true);
  check('un almacenamiento inaccesible se detecta', Offline.storageAvailable({ get: () => null, set: () => { throw new Error('no'); }, remove: () => {} }) === false);
  check('una actualización no interrumpe un entrenamiento activo', Offline.updateDecision({ hasActiveSession: true }).defer === true);
  check('una actualización espera si hay cambios pendientes', Offline.updateDecision({ pending: 2 }).defer === true);
  check('sin sesión ni pendientes la actualización puede aplicarse', Offline.updateDecision({ pending: 0 }).defer === false);

  console.log('\n=== Rollback seguro del Service Worker ===');
  check('el rollback no se permite sin conexión', Offline.rollbackDecision({ online: false }).allow === false && Offline.rollbackDecision({ online: false }).reason === 'offline');
  check('el rollback espera si hay un entrenamiento abierto', Offline.rollbackDecision({ online: true, hasActiveSession: true }).reason === 'active-session');
  check('el rollback espera si hay cambios pendientes', Offline.rollbackDecision({ online: true, pending: 1 }).reason === 'pending-changes');
  check('el rollback espera si hay conflictos', Offline.rollbackDecision({ online: true, conflicts: 1 }).reason === 'conflicts');
  check('el rollback se permite limpio y online', Offline.rollbackDecision({ online: true, pending: 0 }).allow === true);
  const cacheNames = new Set(['drakotrack-v13', 'drakotrack-previous', 'otra-app-cache']);
  const deletedCaches = [];
  const cacheApi = {
    keys: async () => [...cacheNames],
    delete: async name => { deletedCaches.push(name); cacheNames.delete(name); return true; },
  };
  const cleared = await Offline.clearOwnCaches(cacheApi, 'drakotrack-');
  check('el rollback borra solo las cachés de DrakoTrack', cleared.ok === true && cleared.total === 2 && deletedCaches.every(name => name.startsWith('drakotrack-')));
  check('el rollback no toca las cachés de otras apps', cacheNames.has('otra-app-cache') === true && !cacheNames.has('drakotrack-v13'));

  console.log('\n=== PWA, manifest y service worker ===');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
  check('el manifest declara DrakoTrack', manifest.name === 'DrakoTrack' && manifest.short_name === 'DrakoTrack');
  check('el manifest es instalable en standalone', manifest.display === 'standalone' && manifest.start_url === './' && manifest.scope === './');
  check('el manifest define colores, orientación e idioma', manifest.theme_color === '#0a0a0c' && manifest.background_color === '#0a0a0c' && manifest.orientation === 'portrait' && manifest.lang === 'es');
  check('hay iconos 192, 512 y maskable', ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].every(src => fs.existsSync(path.join(__dirname, src))));
  check('el icono maskable está declarado como tal', manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
  check('el icono de Apple existe', fs.existsSync(path.join(__dirname, 'icons/apple-touch-icon-180.png')));
  const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('index enlaza el manifest y el color de tema', index.includes('rel="manifest"') && index.includes('id="theme-color"'));
  check('index incluye la barra de estado offline', index.includes('id="offline-bar"') && index.includes('role="status"'));
  check('offline.js se carga antes de app.js', index.indexOf('offline.js?v=2') > 0 && index.indexOf('offline.js?v=2') < index.indexOf('app.js?v=47'));
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  check('el service worker tiene versión de caché', /const VERSION = 'drakotrack-v20'/.test(sw));
  check('el shell incluye offline y la app', sw.includes("'./offline.html'") && sw.includes("'./offline.js?v=2'") && sw.includes("'./app.js?v=47'"));
  check('una shell incompleta no reemplaza la versión anterior', /const ESSENTIAL/.test(sw) && /incomplete_shell/.test(sw) && /throw new Error/.test(sw));
  check('el service worker aplica network-first a navegación', /networkFirstNavigation/.test(sw) && /request\.mode === 'navigate'/.test(sw));
  check('el service worker aplica cache-first y SWR', /cacheFirst/.test(sw) && /staleWhileRevalidate/.test(sw));
  check('el service worker nunca cachea API ni APK', /isPrivatePath/.test(sw) && /'\/api\/'/.test(sw) && /'\/apk\/'/.test(sw));
  check('solo se cachean respuestas propias y cacheables', /isCacheable/.test(sw) && /no-store|private/.test(sw) && /type !== 'basic'/.test(sw));
  check('las actualizaciones no se aplican solas al instalar', (sw.match(/self\.skipWaiting\(\)/g) || []).length === 1 && /SKIP_WAITING/.test(sw));
  check('el service worker borra solo cachés propias', /CACHE_PREFIX/.test(sw) && /startsWith\(CACHE_PREFIX\)/.test(sw));
  check('hay un fallback offline para navegación', sw.includes('OFFLINE_URL') && fs.existsSync(path.join(__dirname, 'offline.html')));
  check('Background Sync está declarado sin depender de él', /addEventListener\('sync'/.test(sw) && /draktrack-sync/.test(sw));

  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check('app usa la cola y la comprobación real de red', /const opQueue = Offline\.createQueue/.test(app) && /Offline\.probe/.test(app));
  check('app guarda con detección de cuota', /Offline\.writeDocument/.test(app) && /markStorageError/.test(app));
  check('app muestra estado y ajustes offline', /function renderOfflineBar/.test(app) && /function offlineSettingsHTML/.test(app));
  check('app pide confirmación antes de actualizar', /function applyServiceWorkerUpdate/.test(app) && /hasUnfinishedSession/.test(app));
  check('app registra el service worker con versión de actualización', /serviceWorker\.register\('sw\.js'/.test(app) && /updateViaCache: 'none'/.test(app));
  check('app ofrece un rollback de emergencia del Service Worker', /data-action="sw-rollback"/.test(app) && /async function rollbackServiceWorker/.test(app));
  check('el rollback exige red y no interrumpe trabajo abierto', /Offline\.rollbackDecision/.test(app) && /hasUnfinishedSession\(\)/.test(app) && /offlinePendingTotal\(\)/.test(app));
  check('el rollback solo borra cachés propias y no datos', /SW_CACHE_PREFIX/.test(app) && /Offline\.clearOwnCaches/.test(app) && !/function rollbackServiceWorker[\s\S]{0,2600}localStorage\.clear/.test(app));
  check('la cola no guarda el documento ni credenciales', !/localStorage\.setItem\([^)]*JSON\.stringify\(doc\)/.test(app) && /idempotencyKey/.test(fs.readFileSync(path.join(__dirname, 'offline.js'), 'utf8')));

  /* ---------------- Integración jsdom ---------------- */
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const FILES = ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js', 'offline.js', 'analytics.js', 'app.js'];
  function bootDom(storedDB, user, offline, storedQueue) {
    const dom = new JSDOM(html, {
      url: 'http://localhost:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
      beforeParse(w) {
        Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
        if (offline) {
          try { Object.defineProperty(w.navigator, 'onLine', { value: false, configurable: true }); } catch (e) {}
        }
        if (storedDB) {
          w.localStorage.setItem('draktrack_v1', storedDB);
          w.localStorage.setItem('draktrack_session_v1', user || 'p8_local');
        }
        if (storedQueue) w.localStorage.setItem('draktrack_offline_v1', storedQueue);
      },
    });
    const context = dom.getInternalVMContext();
    FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), context, { filename: f }));
    return context;
  }
  const ctx = bootDom(null, null, true);
  const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });
  const tick = ms => new Promise(r => setTimeout(r, ms || 40));

  g(`(function(){
    localStorage.clear(); db = { users:{}, data:{} }; currentUser = 'p8_local';
    localStorage.setItem(SESSION_KEY, currentUser);
    const d = dataFor(currentUser);
    d.workouts = [{ id:'w1', name:'Rutina offline', exercises:[{ id:'e1', name:'Press de banca', exId:'press-de-banca', sets:2, reps:8 }] }];
    d.sessions = []; saveDB();
  })()`);
  g("nav('#/workouts'); render();");
  check('la app abre sin conexión con una sesión local', g("!!document.querySelector('#main')") && g("document.querySelector('#auth-screen').classList.contains('hidden')"));
  check('la barra avisa de que no hay conexión', /Sin conexión/.test(g("$('#offline-bar').textContent")));
  g("(function(){ const s = startOrGetSession('w1'); state.sessionId = s.id; s.exercises[0].sets[0].weight = 60; s.exercises[0].sets[0].reps = 8; s.exercises[0].sets[0].completed = true; saveDB(); })()");
  check('iniciar y registrar series funciona offline', g("dataFor(currentUser).sessions.length") === 1 && g("dataFor(currentUser).sessions[0].exercises[0].sets[0].weight") === 60);
  g("(function(){ const s = dataFor(currentUser).sessions[0]; s.finished = true; s.status='completed'; s.finishedAt = nowIso(); saveDB(); })()");
  check('finalizar la sesión se guarda en el dispositivo', g("dataFor(currentUser).sessions[0].finished") === true);
  const localDB = g("localStorage.getItem(DB_KEY)");
  g("nav('#/settings'); render();");
  check('los ajustes muestran conexión, cola y estado', /Conexión y sincronización/.test(g("$('#main').innerHTML")) && /Cola persistente/.test(g("$('#main').innerHTML")));
  check('la cola está visible y vacía para una cuenta local', g("opQueue.stats('p8_local').pending") === 0);

  const ctx2 = bootDom(localDB, 'p8_local', true);
  const g2 = e => vm.runInContext(e, ctx2, { filename: 'reload' });
  check('tras recargar sin red el entrenamiento sigue ahí', g2("dataFor('p8_local').sessions.length") === 1 && g2("dataFor('p8_local').sessions[0].exercises[0].sets[0].weight") === 60);
  g2("nav('#/workouts'); render();");
  check('la app recargada sin red vuelve a abrir', /Rutina offline/.test(g2("$('#main').innerHTML")));

  /* Simulación de cuenta nube con fallo y recuperación */
  const ctx3 = bootDom(null, null, false);
  const g3 = e => vm.runInContext(e, ctx3, { filename: 'cloud' });
  g3(`(function(){
    localStorage.clear(); db = { users:{}, data:{} }; currentUser = 'p8_cloud';
    localStorage.setItem(SESSION_KEY, currentUser);
    window.__saves = 0; window.__failSave = true;
    window.DrakoSB = {
      hasSession: () => true, email: () => currentUser,
      loadData: () => Promise.resolve({ data: null, rev: 0 }),
      saveData: () => { window.__saves++; return window.__failSave ? Promise.reject(new Error('network down')) : Promise.resolve({ rev: 1 }); },
      signOut: () => Promise.resolve(),
    };
    const d = dataFor(currentUser);
    d.sessions = [{ id:'cloud1', date: todayISO(), workoutName:'Nube', finished:true, status:'completed', exercises:[] }];
    saveDB();
  })()`);
  check('guardar crea una operación en la cola', g3("opQueue.stats('p8_cloud').pending") >= 1);
  await g3("runSync(true)");
  await tick(60);
  check('un fallo de red no borra la sesión local', g3("dataFor('p8_cloud').sessions.length") === 1);
  check('el fallo deja la operación en reintento, no confirmada', g3("opQueue.stats('p8_cloud').pending") >= 1 && g3("opQueue.list('p8_cloud').every(j => j.state !== 'confirmed')"));
  check('la barra muestra que hay cambios pendientes', /pendiente|Sin conexión|conexión/i.test(g3("$('#offline-bar').textContent")));
  const queueStored = g3("localStorage.getItem('draktrack_offline_v1')");
  check('la cola queda persistida en localStorage', /p8_cloud/.test(queueStored) && !/password|token/i.test(queueStored));
  g3("window.__failSave = false");
  g3("(function(){ const j = opQueue.list('p8_cloud').find(x => x.state !== 'confirmed'); if(j) opQueue.reopen(j.id); })()");
  await g3("runSync(true)");
  await tick(60);
  check('al volver la conexión la operación se confirma', g3("opQueue.stats('p8_cloud').pending") === 0 && g3("opQueue.stats('p8_cloud').confirmed") >= 1);
  check('no se duplican operaciones confirmadas', g3("new Set(opQueue.list('p8_cloud').map(j => j.id)).size") === g3("opQueue.list('p8_cloud').length"));
  check('la sesión sigue intacta tras sincronizar', g3("dataFor('p8_cloud').sessions[0].id") === 'cloud1');

  const ctx4 = bootDom(null, null, true, queueStored);
  const g4 = e => vm.runInContext(e, ctx4, { filename: 'queue-reload' });
  check('la cola se recupera tras cerrar y abrir', g4("opQueue.all().some(j => j.account === 'p8_cloud')") === true);

  g3("(function(){ const d = dataFor(currentUser); d.sessions.push({ id:'open', date: todayISO(), workoutName:'Abierta', finished:false, status:'in_progress', exercises:[] }); saveDB(); offlineState.updateReady = true; })()");
  g3("applyServiceWorkerUpdate()");
  check('una actualización espera si hay un entrenamiento abierto', g3("offlineState.deferredUpdate") === true);
  g3("(function(){ dataFor(currentUser).sessions.forEach(s => { s.finished = true; }); offlineState.deferredUpdate = false; opQueue.enqueue(currentUser, { kind:'sync', target:'doc', reason:'pending-update-test' }); })()");
  g3("applyServiceWorkerUpdate()");
  check('una actualización espera si hay cambios pendientes', g3("offlineState.deferredUpdate") === true);

  await g3("handleConnectivity('manual')");
  check('la comprobación real de red actualiza el estado', typeof g3("offlineState.lastCheck") === 'number');

  await g3("logout()");
  check('cerrar sesión limpia la sesión local y no borra la cola', g3("currentUser") === null && g3("localStorage.getItem(SESSION_KEY)") === null && g3("opQueue.all().length") >= 1);
  check('los datos de la cuenta no se mezclan al cerrar sesión', g3("!!db.data['p8_cloud']") === true);
  check('la cola no contiene contraseñas ni tokens', !/password|token|secret/i.test(g3("localStorage.getItem('draktrack_offline_v1') || ''")));

  /* ---------------- Rollback, restauración y cambio de cuenta ------------- */
  const ctx5 = bootDom(null, null, false);
  const g5 = e => vm.runInContext(e, ctx5, { filename: 'rollback' });
  g5(`(function(){
    localStorage.clear(); db = { users:{}, data:{} }; currentUser = 'rollback_user';
    localStorage.setItem(SESSION_KEY, currentUser);
    const d = dataFor(currentUser);
    d.workouts = [{ id:'w-rollback', name:'Rutina rollback', exercises:[] }];
    saveDB();
    window.__deletedCaches = [];
    window.__unregistered = false;
    Offline.probe = async () => true;
    const reg = {
      scope: location.origin + '/',
      unregister: async () => { window.__unregistered = true; return true; },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: async () => [reg], getRegistration: async () => reg },
      configurable: true,
    });
    window.caches = {
      keys: async () => ['drakotrack-v13', 'otra-app-cache'],
      delete: async name => { window.__deletedCaches.push(name); return true; },
    };
  })()`);
  const rolledBack = await g5("rollbackServiceWorker({ reload: false, silent: true })");
  check('el rollback desregistra el Service Worker y termina bien', rolledBack === true && g5('window.__unregistered') === true);
  check('el rollback borra solo la caché de DrakoTrack', JSON.stringify(g5('window.__deletedCaches')) === '["drakotrack-v13"]');
  check('el rollback conserva los datos del dispositivo', /Rutina rollback/.test(g5('localStorage.getItem(DB_KEY)')));
  g5("(function(){ dataFor(currentUser).sessions.push({ id:'open-rollback', date:todayISO(), workoutName:'Abierta', finished:false, status:'in_progress', exercises:[] }); saveDB(); window.__unregistered=false; })()");
  const blockedSession = await g5("rollbackServiceWorker({ reload:false, silent:true })");
  check('el rollback se bloquea con un entrenamiento abierto', blockedSession === false && g5('window.__unregistered') === false);
  g5("(function(){ dataFor(currentUser).sessions.forEach(s => { s.finished = true; s.status = 'completed'; }); saveDB(); opQueue.enqueue(currentUser, { kind:'sync', target:'doc' }); window.__unregistered=false; })()");
  const blockedPending = await g5("rollbackServiceWorker({ reload:false, silent:true })");
  check('el rollback se bloquea con cambios pendientes', blockedPending === false && g5('window.__unregistered') === false);

  /* La copia de antes de sincronizar solo se aplica a su cuenta. */
  const ctx6 = bootDom(null, null, false);
  const g6 = e => vm.runInContext(e, ctx6, { filename: 'restore' });
  g6(`(function(){
    localStorage.clear(); db = { users:{}, data:{} }; currentUser = 'restore_a';
    localStorage.setItem(SESSION_KEY, currentUser);
    const d = dataFor(currentUser);
    d.workouts = [{ id:'w-good', name:'Copia buena', exercises:[] }];
    saveDB();
    cloudSync.backup('restore_a', dataFor('restore_a'));
    db.data['restore_a'].workouts = [{ id:'w-bad', name:'Cambio malo', exercises:[] }];
    db.data['restore_b'] = { workouts:[{ id:'wb', name:'Cuenta B', exercises:[] }], sessions:[], prs:[], weights:[], exercises:[], records:[], prefs:{} };
    saveDB();
  })()`);
  g6("restoreLocalBackup()");
  g6("window.__confirmCb()");
  check('restaurar la copia local recupera el estado anterior', g6("db.data['restore_a'].workouts[0].name") === 'Copia buena');
  check('restaurar una cuenta no toca los datos de la otra', g6("db.data['restore_b'].workouts[0].name") === 'Cuenta B');
  g6("(function(){ currentUser = 'restore_b'; localStorage.setItem(SESSION_KEY, currentUser); })()");
  g6("restoreLocalBackup()");
  check('cambiar de cuenta no hereda la copia de la anterior', g6("db.data['restore_b'].workouts[0].name") === 'Cuenta B' && g6("db.data['restore_a'].workouts[0].name") === 'Copia buena');

  console.log('\npassed: ' + pass + ' failed: ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR en pruebas offline:', e); process.exit(1); });
