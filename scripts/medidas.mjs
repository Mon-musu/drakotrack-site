/* Medidas de desbordamiento horizontal (F1).
   Sirve el sitio en local, siembra una cuenta de usar y tirar y mide
   document.documentElement.scrollWidth frente a innerWidth en 320, 375,
   768 y 1440 px, indicando qué cajas se salen de la ventana.
   Uso: node scripts/medidas.mjs
   Variables: CHROME_BIN (obligatoria).
   No toca datos reales: bloquea fuentes y Supabase. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4466;
const CDP = 9336;
const CHROME = process.env.CHROME_BIN;
if(!CHROME){ console.error('Falta CHROME_BIN'); process.exit(1); }

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2' };
const profile = fs.mkdtempSync('/tmp/dt-med-');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if(!file.startsWith(ROOT)){ res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if(err){ res.writeHead(404, { 'content-type':'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function waitJson(url, tries = 120){
  for(let i = 0; i < tries; i++){
    try{ const r = await fetch(url); if(r.ok) return await r.json(); }catch(e){}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('CDP no disponible: ' + url);
}
let id = 0, ws; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await waitJson(`http://127.0.0.1:${CDP}/json/version`);
const targets = await waitJson(`http://127.0.0.1:${CDP}/json/list`);
ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const problemas = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if(msg.id && pending.has(msg.id)){
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  } else if(msg.method === 'Runtime.exceptionThrown'){
    problemas.push('EXCEPCION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if(msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error'){
    problemas.push('CONSOLE: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*supabase.co*'] });

async function ev(expression){
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if(r.exceptionDetails) throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function until(expr, label, tries = 120){
  for(let i = 0; i < tries; i++){
    if(await ev(expr)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('TIMEOUT: ' + label);
}
const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
async function load(){
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await until('typeof nav === "function" && typeof signup === "function"', 'app.js cargado');
  await new Promise(r => setTimeout(r, 300));
}

const ANCHOS = [320, 375, 768, 1440];
const RUTAS = [
  ['#/workouts', 'inicio'], ['#/plan', 'plan'], ['#/library', 'biblioteca'],
  ['#/history', 'historial'], ['#/progress', 'progreso'], ['#/analytics', 'analitica'],
  ['#/weight', 'peso'], ['#/settings', 'ajustes'], ['#/session/' + 'SESION', 'sesion'],
  ['#/editor/capw', 'editor'],
];

try {
  const filas = [];
  for(const width of ANCHOS){
    await viewport(width, 900);
    await load();
    if(width === ANCHOS[0]){
      await ev('localStorage.clear()');
      await load();
    }
    /* portada */
    let m = await ev('({ w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, v: innerWidth })');
    filas.push({ ancho: width, vista: 'portada', scrollWidth: m.w, documento: m.cw, inner: m.v, culpables: await ev(`(() => {
      const vw = document.documentElement.clientWidth, out = [];
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if(r.width > 0 && r.right > vw + 1 && out.length < 6){
          const id = el.id ? '#' + el.id : '';
          const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
          out.push(el.tagName.toLowerCase() + id + cls + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']');
        }
      });
      return out;
    })()`) });
    /* cuenta local con datos */
    if(await ev('!currentUser')){
      const user = 'med_' + Date.now().toString(36).slice(-6);
      await ev(`signup(${JSON.stringify(user)}, 'secret123')`);
      await until('!!currentUser', 'sesión local');
      await ev(`(() => {
        const d = dataFor(currentUser);
        d.workouts.push({ id: 'capw', name: 'Empuje A', exercises: [
          { id: 'capx1', name: 'Press banca', sets: 3, reps: 8, weight: 60 },
          { id: 'capx2', name: 'Press militar', sets: 3, reps: 10, weight: 30 }] });
        d.weights.push({ date: '2026-11-01', kg: 78.4 }, { date: '2026-11-06', kg: 77.9 });
        saveDB();
        const s = newSessionFor(getWorkout('capw'));
        s.startedAt = Date.now() - 1800000;
        s.exercises.forEach((ex, i) => (ex.sets || []).forEach((set, j) => {
          set.weight = 60 - i * 30; set.reps = 10 - j; set.completed = j < 2; set.type = 'working';
        }));
        window.__medsession = s.id;
        saveDB();
        const past = newSessionFor(getWorkout('capw'));
        past.date = '2026-11-04'; past.startedAt = Date.parse('2026-11-04T18:00:00');
        past.finished = true; past.finishedAt = past.startedAt + 3600000;
        past.exercises.forEach(ex => (ex.sets || []).forEach(set => {
          set.weight = 60; set.reps = 8; set.completed = true; set.type = 'working';
        }));
        past.exercises.forEach(ex => { ex.done = true; });
        d.sessions.push(past); saveDB(); render();
      })()`);
      await new Promise(r => setTimeout(r, 400));
    }
    for(const [hash, nombre] of RUTAS){
      const real = hash.includes('SESION') ? `'#/session/' + window.__medsession` : JSON.stringify(hash);
      await ev(`location.hash = ${real}`);
      await new Promise(r => setTimeout(r, 450));
      m = await ev('({ w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, v: innerWidth })');
      const anchosCulpables = await ev(`(() => {
        const vw = document.documentElement.clientWidth, out = [];
        document.querySelectorAll('body *').forEach(el => {
          const r = el.getBoundingClientRect();
          if(r.width > 0 && r.right > vw + 1 && out.length < 6){
            const id = el.id ? '#' + el.id : '';
            const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
            out.push(el.tagName.toLowerCase() + id + cls + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']');
          }
        });
        return out;
      })()`);
      filas.push({ ancho: width, vista: nombre, scrollWidth: m.w, documento: m.cw, inner: m.v, culpables: anchosCulpables });
    }
  }
  const malas = filas.filter(f => f.scrollWidth > f.documento);
  for(const f of filas){
    const estado = f.scrollWidth > f.documento ? 'DESBORDA' : 'ok';
    console.log(`${String(f.ancho).padStart(4)} px  ${f.vista.padEnd(11)} ${String(f.scrollWidth).padStart(5)} / ${f.documento} (inner ${f.inner})  ${estado}${f.culpables && f.culpables.length ? '  → ' + f.culpables.join(' | ') : ''}`);
  }
  console.log(malas.length ? `\n${malas.length} vistas desbordan` : '\nNinguna vista desborda');
  if(problemas.length) console.log('PROBLEMAS:\n' + [...new Set(problemas)].join('\n'));
  process.exitCode = malas.length ? 1 : 0;
} finally {
  try { ws.close(); } catch(e){}
  chrome.kill('SIGKILL');
  server.close();
}
