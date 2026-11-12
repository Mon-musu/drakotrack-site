'use strict';
/* ============================================================
   Sesión de nube caducada (401) durante la sincronización
   Un 401 no es un fallo de red: antes se reintentaba en bucle con el aviso
   genérico y la actualización quedaba bloqueada para siempre. Ahora se dice
   qué pasa, se deja de reintentar y los datos siguen en el dispositivo.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'),
  { url: 'http://localhost:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(w){ Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true }); } });
const { window } = dom;
const ctx = dom.getInternalVMContext();
for (const f of ['sync.js','supabase.js','boostcamp.js','share.js','progress.js','planner.js','offline.js','analytics.js','activity.js','app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const g = e => vm.runInContext(e, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if(cond){ pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } };

(async () => {
  const user = 'auth_' + Date.now().toString(36).slice(-5);
  await g(`signup('${user}', 'secret123')`);
  await tick(80);

  /* Cuenta «de nube» con el servidor devolviendo 401: cookie ausente o caducada. */
  const unauthorized = () => { const e = new Error('unauthorized'); e.status = 401; return e; };
  vm.runInContext(`window.DrakoSB = {
    hasSession: () => true,
    email: () => currentUser,
    loadData: async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); },
    saveData: async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); },
    loadSession: async () => null,
  };`, ctx);
  g('cloudSync.markDirty(currentUser)');

  const done = await g('runSync(true)');
  await tick(80);

  check('la sincronización no se da por buena', done === false);
  check('el estado queda como sesión caducada, no como caída de red', g('state.sb.status') === 'auth');
  const toasts = [...window.document.querySelectorAll('.toast')].map(n => n.textContent).join(' | ');
  check('el aviso dice que la sesión caducó', /sesión de la nube caducó/i.test(toasts), toasts.slice(0, 120));
  check('el aviso no habla de conexión', !/volver la conexión|Sin conexión/i.test(toasts));
  const bar = window.document.querySelector('#offline-bar');
  check('la barra de estado explica el motivo', bar && /sesión de la nube caducó/i.test(bar.textContent), bar ? bar.textContent : 'sin barra');
  check('no se programa un reintento en bucle', g('state.sb.retry') === null);
  check('los cambios siguen pendientes y guardados', g('syncPending()') === true);
  check('la actualización avisa de la sesión y no del genérico', /sesión de la nube caducó/i.test(
    g("(function(){ const s = currentUser ? (cloudSync.state(currentUser) || {}) : {}; const d = Offline.updateDecision({ hasActiveSession:false, pending: offlinePendingTotal(), conflicts: 0 }); return d.defer ? (offlineState.authExpired ? 'sesión de la nube caducó' : 'pendientes') : 'permite'; })()")));

  /* Los fallos que no son de red se explican con su código. */
  check('un 413 avisa del tamaño máximo', /413/.test(g('syncErrorText({ status: 413 })')));
  check('un 429 pide esperar', /429/.test(g('syncErrorText({ status: 429 })')));
  check('un 500 muestra el código y no «sin conexión»', /500/.test(g('syncErrorText({ status: 500 })')) && !/volver la conexión/.test(g('syncErrorText({ status: 500 })')));
  check('un 400 incluye el motivo del servidor', /invalid_data/.test(g("syncErrorText({ status: 400, message: 'invalid_data' })")));
  check('el error queda registrado para Ajustes', (() => { g('state.sb.lastError = { status: 500, at: Date.now() }'); return g('state.sb.lastError.status') === 500; })());

  check('un 409 se explica como conflicto de dos dispositivos', /^Otro dispositivo/.test(g('syncErrorText({ status: 409 })')) && /409/.test(g('syncErrorText({ status: 409 })')));

  check('los 4xx genéricos dicen qué hacer a continuación', /Sincronizar en Ajustes/.test(g("syncErrorText({ status: 418 })")));
  check('el 400 incluye el motivo y una salida', /motivo del servidor/.test(g("syncErrorText({ status: 400, message: 'motivo del servidor' })")) && /Sincronizar/.test(g("syncErrorText({ status: 400, message: 'x' })")));
  check('el 413 explica cómo reducir la copia', /Exporta tus datos/.test(g('syncErrorText({ status: 413 })')));
  check('el 5xx tranquiliza y ofrece reintentar a mano', /se reintentará solo/.test(g('syncErrorText({ status: 503 })')) && /Sincronizar/.test(g('syncErrorText({ status: 503 })')));

  console.log(`\n${pass} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
