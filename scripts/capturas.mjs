/* Capturas de pantalla de las vistas actuales.
   Sirve el sitio en local y lo recorre con Chrome headless vía CDP.
   Uso: node scripts/capturas.mjs [carpeta-salida]   (por defecto artifacts/antes)
   Variables: CHROME_BIN (obligatoria), ANCHO/ALTO opcionales. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'artifacts/antes');
const PORT = 4455;
const CDP = 9334;
const CHROME = process.env.CHROME_BIN;
if(!CHROME){ console.error('Falta CHROME_BIN'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync('/tmp/dt-cap-');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if(!file.startsWith(ROOT)){ res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if(err){ res.writeHead(404, { 'content-type':'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitJson(url, tries = 120){
  for(let i = 0; i < tries; i++){
    try{ const r = await fetch(url); if(r.ok) return await r.json(); }catch(e){}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('CDP no disponible: ' + url);
}

let id = 0, ws; const pending = new Map();
function send(method, params = {}){
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

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
  if(r.exceptionDetails) throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n>> ' + expression.slice(0, 160));
  return r.result.value;
}
async function until(expr, label, tries = 120){
  for(let i = 0; i < tries; i++){
    if(await ev(expr)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('TIMEOUT: ' + label);
}
async function viewport(width, height){
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
}
async function shot(name){
  const m = await ev('({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, view: innerWidth })');
  const full = m.h <= 6000;
  if(!full) console.log('  aviso: ' + name + ' mide ' + m.h + ' px de alto; se captura sólo la ventana');
  if(m.w > m.view) console.log('  aviso: ' + name + ' desborda en horizontal (' + m.w + ' > ' + m.view + ')');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('captura  ' + name + '.png  ' + m.w + 'x' + (full ? m.h : 'ventana'));
}
async function load(){
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await until('typeof nav === "function" && typeof signup === "function"', 'app.js cargado');
  await new Promise(r => setTimeout(r, 300));
}
async function route(hash){
  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await new Promise(r => setTimeout(r, 450));
}

try {
  /* 1. Portada (sin sesión) */
  await viewport(375, 812);
  await load();
  await ev('localStorage.clear()');
  await load();
  await shot('portada-375');

  await viewport(1440, 900);
  await load();
  await shot('portada-1440');

  /* 2. Cuenta local con datos de ejemplo, sólo para ver las vistas */
  await viewport(375, 812);
  await load();
  const user = 'cap_' + Date.now().toString(36).slice(-6);
  await ev(`signup(${JSON.stringify(user)}, 'secret123')`);
  await until('!!currentUser', 'sesión local');

  await ev(`(() => {
    const d = dataFor(currentUser);
    d.workouts.push({ id: 'capw', name: 'Empuje A', exercises: [
      { id: 'capx1', name: 'Press banca', sets: 3, reps: 8, weight: 60 },
      { id: 'capx2', name: 'Press militar', sets: 3, reps: 10, weight: 30 }
    ] });
    d.weights.push({ date: '2026-11-01', kg: 78.4 }, { date: '2026-11-06', kg: 77.9 });
    saveDB();
    const s = newSessionFor(getWorkout('capw'));
    s.startedAt = Date.now() - 1800000;
    s.exercises.forEach((ex, i) => {
      (ex.sets || []).forEach((set, j) => {
        set.weight = 60 - i * 30; set.reps = 10 - j;
        set.completed = j < 2; set.type = 'working';
      });
    });
    window.__capsession = s.id;
    saveDB();
    const past = newSessionFor(getWorkout('capw'));
    past.date = '2026-11-04'; past.startedAt = Date.parse('2026-11-04T18:00:00');
    past.finished = true; past.finishedAt = past.startedAt + 3600000;
    past.exercises.forEach(ex => (ex.sets || []).forEach(set => {
      set.weight = 60; set.reps = 8; set.completed = true; set.type = 'working';
    }));
    past.exercises.forEach(ex => { ex.done = true; });
    d.sessions.push(past);
    saveDB(); render();
  })()`);
  await new Promise(r => setTimeout(r, 500));

  const rutas = [
    ["'#/workouts'", 'inicio'],
    ["'#/plan'", 'plan'],
    ["'#/program'", 'programas'],
    ["'#/library'", 'biblioteca'],
    ["'#/history'", 'historial'],
    ["'#/progress'", 'progreso'],
    ["'#/analytics'", 'analitica'],
    ["'#/weight'", 'peso'],
    ["'#/settings'", 'ajustes'],
    ["'#/session/' + window.__capsession", 'sesion'],
    ["'#/editor/capw'", 'editor'],
  ];
  for(const [hash, nombre] of rutas){
    await ev(`location.hash = ${hash}`);
    await new Promise(r => setTimeout(r, 600));
    const info = await ev(`(() => {
      const main = document.querySelector('#main');
      const auth = document.querySelector('#auth-screen');
      return {
        ruta: location.hash,
        vista: main.firstElementChild ? main.firstElementChild.className || main.firstElementChild.tagName : '(vacío)',
        nodos: main.children.length,
        auth: auth ? auth.className : 'sin auth-screen',
        altoDelDocumento: document.documentElement.scrollHeight
      };
    })()`);
    console.log('  ' + nombre + ': ' + JSON.stringify(info));
    await shot(nombre + '-375');
  }

  await viewport(1440, 900);
  for(const [ruta, nombre] of [['workouts','inicio'], ['progress','progreso'], ['history','historial']]){
    await ev(`location.hash = '#/${ruta}'`);
    await new Promise(r => setTimeout(r, 450));
    await shot(nombre + '-1440');
  }
  if(problemas.length) console.log('PROBLEMAS:\n' + [...new Set(problemas)].join('\n'));
  console.log('LISTO ' + OUT);
} finally {
  try { ws.close(); } catch(e){}
  chrome.kill('SIGKILL');
  server.close();
}
