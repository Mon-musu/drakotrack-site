/* Pruebas de humo del registro por series.
   Sirve el sitio en local y lo maneja con Chrome headless vía CDP. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4321;
const CDP = 9333;
const CHROME = process.env.CHROME_BIN;
const profile = fs.mkdtempSync('/tmp/dt-test-');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if(!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if(err){ res.writeHead(404, {'content-type':'text/plain'}).end('not found'); return; }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store'});
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitJson(url, tries = 100){
  for(let i = 0; i < tries; i++){
    try{ const r = await fetch(url); if(r.ok) return await r.json(); }catch(e){}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('CDP no disponible: ' + url);
}

let id = 0, ws, pending = new Map(), errors = [];
function send(method, params = {}){
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

await waitJson(`http://127.0.0.1:${CDP}/json/version`);
const targets = await waitJson(`http://127.0.0.1:${CDP}/json/list`);
const page = targets.find(t => t.type === 'page');
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if(msg.id && pending.has(msg.id)){
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.method + ': ' + msg.error.message)) : p.resolve(msg.result);
  } else if(msg.method === 'Runtime.exceptionThrown'){
    errors.push('EXCEPCIÓN: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if(msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error'){
    errors.push('CONSOLE: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*supabase.co*'] });

async function ev(expression){
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if(r.exceptionDetails) throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n>> ' + expression.slice(0, 200));
  return r.result.value;
}
async function until(expr, label, tries = 120){
  for(let i = 0; i < tries; i++){
    if(await ev(expr)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('TIMEOUT: ' + label);
}
async function load(){
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await until('typeof signup === "function" && typeof nav === "function"', 'app.js cargado');
  await new Promise(r => setTimeout(r, 200));
}

let pass = 0, fail = 0;
function ok(cond, label, extra){
  if(cond){ pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, label){ ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

try {
  await load();
  await ev('localStorage.clear()');
  await load();

  /* 1. Cuenta local y arranque de sesión */
  const user = 'qa_' + Date.now().toString(36).slice(-6);
  await ev(`signup(${JSON.stringify(user)}, 'secret123')`);
  await until('!!currentUser || !!localStorage.getItem("draktrack_session_v1")', 'sesión iniciada').catch(() => {});
  const logged = await ev('!!dataFor(currentUser)');
  ok(logged, 'cuenta local creada y con datos');

  await ev(`(() => {
    const d = dataFor(currentUser);
    d.workouts.push({ id: 'wqa', name: 'Sesión QA', exercises: [{ id: 'xqa', name: 'Press banca', sets: 3, reps: 10, weight: 60 }] });
    d.sessions.push({ id: 'legacy1', workoutId: 'wqa', workoutName: 'Sesión antigua', date: '2026-10-01', finished: true,
      exercises: [{ id: 'l1', name: 'Press banca', weight: 60, reps: 10, done: true, targetSets: 3, targetReps: 10 }] });
    saveDB();
    const s = newSessionFor(getWorkout('wqa'));
    window.__qa = s.id;
    nav('#/session/' + s.id);
    return s.id;
  })()`);
  await until('document.querySelectorAll(".set-item").length > 0', 'series pintadas');

  /* 2. Series individuales por defecto */
  eq(await ev('document.querySelectorAll(".set-item").length'), 3, 'la sesión crea 3 series planificadas');
  eq(await ev('document.querySelector(".set-count").textContent.trim()'), '0/3', 'contador de series 0/3');
  eq(await ev('document.querySelector(".set-n").textContent.trim()'), '1', 'las series se numeran');

  /* 3. Editar peso/reps y completar */
  await ev(`(() => {
    const fill = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    fill(document.querySelector('.set-item input[data-field="weight"]'), '62.5');
    fill(document.querySelector('.set-item input[data-field="reps"]'), '10');
    document.querySelector('.set-item .set-check').click();
  })()`);
  const st1 = await ev(`(() => {
    const s = getSession(window.__qa); const st = s.exercises[0].sets[0];
    return { weight: st.weight, reps: st.reps, completed: st.completed, type: st.type, id: !!st.id, done: s.exercises[0].done };
  })()`);
  eq(st1, { weight: 62.5, reps: 10, completed: true, type: 'working', id: true, done: false }, 'peso y reps guardados por serie; no se completa el ejercicio con 1 de 3');

  /* 4. RIR/RPE y tipo */
  await ev(`(() => {
    const sel = (f, v) => { const el = document.querySelector('.set-item [data-field="' + f + '"]'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    sel('rir', '2'); sel('rpe', '8'); sel('type', 'drop');
  })()`);
  const st1b = await ev(`(() => { const st = getSession(window.__qa).exercises[0].sets[0]; return [st.rir, st.rpe, st.type]; })()`);
  eq(st1b, [2, 8, 'drop'], 'RIR, RPE y tipo de serie persistidos');

  /* 5. Añadir, duplicar y eliminar series */
  await ev('document.querySelector(\'[data-action="add-set"]\').click()');
  eq(await ev('document.querySelectorAll(".set-item").length'), 4, 'añadir serie');
  await ev('document.querySelector(\'[data-action="duplicate-set"]\').click()');
  eq(await ev('document.querySelectorAll(".set-item").length'), 5, 'duplicar serie');
  await ev('document.querySelectorAll(\'.set-item [data-action="delete-set"]\')[4].click()');
  eq(await ev('document.querySelectorAll(".set-item").length'), 4, 'eliminar serie');
  eq(await ev('Array.from(document.querySelectorAll(".set-n")).map(n => n.textContent.trim())'), ['1','2','3','4'], 'renumeración tras cambios');

  /* 6. Calentamiento excluido de totales */
  await ev(`(() => {
    const s = getSession(window.__qa);
    s.exercises[0].sets[1].type = 'warmup'; s.exercises[0].sets[1].weight = 40; s.exercises[0].sets[1].reps = 10; s.exercises[0].sets[1].completed = true;
    s.exercises[0].sets[2].weight = 70; s.exercises[0].sets[2].reps = 8; s.exercises[0].sets[2].completed = true;
    saveDB(); render();
  })()`);
  eq(await ev('(() => { const t = sessionTotals(getSession(window.__qa)); return [t.setsDone, t.warmupDone, t.reps, t.volume]; })()'),
     [3, 1, 18, 1185], 'calentamiento fuera de reps/volumen');

  /* 7. Terminar sesión y resumen */
  await ev('document.querySelector(\'[data-action="finish-session"]\').click()');
  await until('!!document.querySelector(\'[data-action="confirm-do"], [data-action="summary-close"]\')', 'confirmación o resumen');
  if(await ev('!!document.querySelector(\'[data-action="confirm-do"]\')')) await ev('document.querySelector(\'[data-action="confirm-do"]\').click()');
  await until('!!document.querySelector("#modal-root .summary-grid")', 'resumen mostrado');
  const sum = await ev('document.querySelector("#modal-root .summary-grid").innerText.replace(/\\s+/g, " ").trim()');
  ok(/series efectivas/i.test(sum) && /repet/i.test(sum), 'el resumen final muestra series efectivas y reps', sum);
  await ev('document.querySelector(\'[data-action="summary-close"]\').click()');
  await until('!document.querySelector("#modal-root .summary-grid")', 'resumen cerrado');

  const done = await ev(`(() => { const s = getSession(window.__qa); return [s.status, s.finished, !!s.finishedAt, s.durationSec != null, s.summary.setsEffective, document.querySelectorAll('.set-item input:not([disabled])').length]; })()`);
  eq(done, ['completed', true, true, true, 2, 0], 'sesión completada, resumen guardado y campos bloqueados');

  /* 8. Persistencia tras recargar */
  await load();
  const persisted = await ev(`(() => {
    const s = dataFor(currentUser).sessions.find(x => x.workoutId === 'wqa' && x.status === 'completed' && x.id !== 'legacy1');
    window.__qa = s.id;
    return [s.exercises[0].sets.length, s.exercises[0].sets[0].weight, s.status];
  })()`);
  eq(persisted, [4, 62.5, 'completed'], 'las series sobreviven a la recarga');

  /* 9. Historial con series y registro heredado */
  await ev('nav("#/history")');
  await until('document.querySelectorAll(".hist-card").length >= 2', 'historial pintado');
  eq(await ev('document.querySelectorAll(".hist-card .hist-set").length > 0'), true, 'el historial desglosa series');
  eq(await ev('document.querySelectorAll(".hist-card .badge-legacy").length'), 1, 'el registro heredado se etiqueta como heredado');
  const legacy = await ev(`(() => { const s = getSession('legacy1'); const e = s.exercises[0]; return [e.setModel, 'sets' in e, e.weight, e.reps]; })()`);
  eq(legacy, [1, false, 60, 10], 'migración conserva el registro antiguo sin inventar series');

  /* 10. Reanudar sesión interrumpida */
  await ev(`(() => {
    const s2 = newSessionFor(getWorkout('wqa'));
    window.__qa2 = s2.id;
    nav('#/workouts');
    return s2.id;
  })()`);
  await until('!!document.querySelector(".resume-card")', 'tarjeta de reanudación');
  ok(/Sesión sin terminar/.test(await ev('document.querySelector(".resume-card").innerText')), 'aviso de sesión sin terminar');
  await ev('document.querySelector(\'[data-action="resume-session"]\').click()');
  await until('location.hash.startsWith("#/session/")', 'vuelta a la sesión');
  eq(await ev('location.hash'), '#/session/' + await ev('window.__qa2'), 'continuar abre la sesión guardada');

  /* 11. Pausar y reanudar el estado */
  await ev('document.querySelector(\'[data-action="pause-session"]\').click()');
  eq(await ev('getSession(window.__qa2).status'), 'paused', 'pausar sesión');
  ok((await ev('document.querySelector(".session-clock").textContent')).includes('Pausada'), 'el reloj indica pausa');
  await ev('document.querySelector(\'[data-action="resume-session-status"]\').click()');
  eq(await ev('getSession(window.__qa2).status'), 'in_progress', 'reanudar sesión');

  /* 12. Errores de consola */
  const real = errors.filter(e => !/Failed to load resource|ERR_BLOCKED_BY_CLIENT|net::/i.test(e));
  ok(real.length === 0, 'sin errores de JavaScript en consola', real.slice(0, 5));
} catch(err){
  fail++;
  console.log('FAIL  ejecución de pruebas: ' + err.message);
} finally {
  try { ws.close(); } catch(e){}
  chrome.kill('SIGKILL');
  server.close();
  console.log(`\n${pass} PASS · ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
