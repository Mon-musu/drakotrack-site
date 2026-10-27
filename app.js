/* ============================================================
   DrakoTrack — seguimiento de entrenamiento
   SPA en JavaScript puro. Todos los datos se guardan en
   localStorage de cada dispositivo.
   ============================================================ */
'use strict';

/* ---------------- Constantes ---------------- */
const DB_KEY = 'draktrack_v1';
const SESSION_KEY = 'draktrack_session_v1';

/* Icono de mancuerna (SVG) para las tarjetas de entrenamiento */
const DUMBBELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7v10"/><path d="M17 7v10"/><path d="M4.5 9.5v5"/><path d="M19.5 9.5v5"/><path d="M7 12h10"/></svg>';

/* Biblioteca de sesiones del entrenador */
const LIBRARY = [
  { id:'lib-push', name:'Empuje', exercises:[
      { name:'Press de banca', sets:4, reps:8, weight:60 },
      { name:'Press militar', sets:3, reps:10, weight:40 },
      { name:'Press inclinado con mancuernas', sets:3, reps:10, weight:20 },
      { name:'Fondos en paralelas', sets:3, reps:12, weight:0 },
      { name:'Extensión de tríceps en polea', sets:3, reps:12, weight:25 },
      { name:'Elevaciones laterales', sets:4, reps:15, weight:8 },
  ]},
  { id:'lib-pull', name:'Tirón', exercises:[
      { name:'Peso muerto', sets:3, reps:5, weight:100 },
      { name:'Dominadas', sets:4, reps:8, weight:0 },
      { name:'Remo con barra', sets:4, reps:10, weight:50 },
      { name:'Jalón al pecho', sets:3, reps:10, weight:45 },
      { name:'Jalón facial', sets:3, reps:15, weight:20 },
      { name:'Curl de bíceps', sets:3, reps:12, weight:15 },
  ]},
  { id:'lib-legs', name:'Pierna', exercises:[
      { name:'Sentadilla trasera', sets:4, reps:8, weight:80 },
      { name:'Peso muerto rumano', sets:3, reps:10, weight:60 },
      { name:'Prensa de piernas', sets:4, reps:12, weight:120 },
      { name:'Zancadas caminando', sets:3, reps:12, weight:0 },
      { name:'Curl femoral', sets:3, reps:12, weight:35 },
      { name:'Elevaciones de gemelos', sets:4, reps:15, weight:40 },
  ]},
  { id:'lib-full', name:'Cuerpo completo', exercises:[
      { name:'Sentadilla', sets:4, reps:8, weight:70 },
      { name:'Press de banca', sets:4, reps:8, weight:55 },
      { name:'Remo con barra', sets:4, reps:10, weight:50 },
      { name:'Press militar', sets:3, reps:10, weight:35 },
      { name:'Plancha', sets:3, reps:60, weight:0 },
  ]},
  { id:'lib-core', name:'Core y abdominales', exercises:[
      { name:'Plancha', sets:3, reps:60, weight:0 },
      { name:'Abdominales', sets:3, reps:20, weight:0 },
      { name:'Elevaciones de piernas', sets:3, reps:15, weight:0 },
      { name:'Giro ruso', sets:3, reps:20, weight:5 },
      { name:'Escaladores', sets:3, reps:30, weight:0 },
  ]},
  { id:'lib-arms', name:'Hombros y brazos', exercises:[
      { name:'Press de hombros', sets:4, reps:8, weight:40 },
      { name:'Elevaciones laterales', sets:4, reps:15, weight:8 },
      { name:'Elevaciones frontales', sets:3, reps:12, weight:10 },
      { name:'Curl con barra Z', sets:3, reps:12, weight:25 },
      { name:'Curl martillo', sets:3, reps:12, weight:14 },
      { name:'Extensión de tríceps tumbado', sets:3, reps:12, weight:20 },
  ]},
];

/* ---------------- Tema claro/oscuro ---------------- */
const THEME_KEY = 'draktrack_theme_v1';
const UI_KEY = 'draktrack_ui_v1';
const ICON_SUN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
let theme = 'dark';
try{ theme = localStorage.getItem(THEME_KEY) || 'dark'; }catch(e){}

/* Estado de las secciones plegables de «Entrenamientos» (Biblioteca y Programas):
   guardado en localStorage para que lo oculto siga oculto al recargar. */
let uiState = {};
try{ uiState = JSON.parse(localStorage.getItem(UI_KEY)) || {}; }catch(e){ uiState = {}; }
function sectionCollapsed(k){ return !!(uiState[k] && uiState[k].collapsed); }
function setSectionCollapsed(k, v){
  if(!uiState[k]) uiState[k] = {};
  uiState[k].collapsed = !!v;
  try{ localStorage.setItem(UI_KEY, JSON.stringify(uiState)); }catch(e){}
}
function applyTheme(){
  const light = theme === 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#theme-btn');
  if(btn){
    btn.innerHTML = light ? ICON_MOON : ICON_SUN;
    btn.setAttribute('aria-label', light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    btn.setAttribute('title', light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  }
  const meta = $('#theme-color');
  if(meta) meta.setAttribute('content', light ? '#f4f5f7' : '#0a0a0c');
}

/* ---------------- Estado y almacenamiento ---------------- */
let db = loadDB();
let currentUser = localStorage.getItem(SESSION_KEY) || null;
const state = { sessionId:null, editor:null, prExercise:null, authMode:'login', cloudSignup:false, sb:{ status:'idle', last:null, timer:null } };

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return { users:{}, data:{} };
    return JSON.parse(raw);
  }catch(e){ return { users:{}, data:{} }; }
}
let _storageWarned = false;
function saveDB(){
  try{
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }catch(err){
    if(!_storageWarned){
      _storageWarned = true;
      toast('El almacenamiento está lleno o no disponible — los últimos cambios no se guardaron.', 'error');
    }
  }
  scheduleCloudSync();
}

/* ---------------- Cuenta en la nube (Supabase) ---------------- */
function isCloud(){
  return !!(window.DrakoSB && DrakoSB.hasSession() && DrakoSB.email() === currentUser);
}
function scheduleCloudSync(){
  if(!isCloud()) return;
  if(state.sb.timer) clearTimeout(state.sb.timer);
  state.sb.timer = setTimeout(() => pushNow(false), 1500);
}
async function pushNow(notify){
  if(!isCloud()){ if(notify) toast('No hay sesión de nube activa.', 'error'); return false; }
  if(state.sb.timer){ clearTimeout(state.sb.timer); state.sb.timer = null; }
  state.sb.status = 'syncing';
  renderHeader();
  try{
    await DrakoSB.saveData(db.data[currentUser]);
    state.sb.status = 'ok';
    state.sb.last = Date.now();
    if(notify) toast('Copia subida a la nube.');
    renderHeader();
    return true;
  }catch(err){
    state.sb.status = 'error';
    if(notify) toast('No se pudo subir la copia: ' + (err && err.message || 'sin conexión'), 'error');
    renderHeader();
    return false;
  }
}
async function pullRemote(notify){
  if(!isCloud()) return false;
  try{
    const row = await DrakoSB.loadData();
    if(row && row.data && typeof row.data === 'object' && Object.keys(row.data).length){
      if(!Array.isArray(row.data.hiddenLib)) row.data.hiddenLib = [];
      db.data[currentUser] = row.data;
      saveDB();
      state.sb.status = 'ok';
      state.sb.last = Date.now();
      if(notify){ toast('Copia restaurada desde la nube.'); render(); }
      return true;
    }
    if(notify) toast('Todavía no hay copia en la nube de esta cuenta.', 'info');
    return false;
  }catch(err){
    if(notify) toast('No se pudo restaurar: ' + (err && err.message || 'sin conexión'), 'error');
    return false;
  }
}
/* Descarga un JSON con toda la copia de la nube de la cuenta conectada.
   Si el servidor no responde, exporta la copia local de esa misma cuenta. */
async function exportCloudJSON(){
  if(!isCloud()){ toast('Inicia sesión con tu cuenta de la nube para exportar tus datos.', 'error'); return; }
  toast('Preparando el archivo…');
  let payload = null, fromCloud = false;
  try{
    const row = await DrakoSB.loadData();
    if(row && row.data && typeof row.data === 'object' && Object.keys(row.data).length){ payload = row.data; fromCloud = true; }
  }catch(e){ /* sin conexión: se usa la copia local de la misma cuenta */ }
  if(!payload) payload = db.data[currentUser] || dataFor(currentUser);
  if(!Array.isArray(payload.hiddenLib)) payload.hiddenLib = [];
  const out = {
    app: 'DrakoTrack',
    kind: 'full-export',
    version: 1,
    account: currentUser,
    exported_at: new Date().toISOString(),
    source: fromCloud ? 'cloud' : 'local',
    data: payload,
  };
  const json = JSON.stringify(out, null, 2);
  const slug = String(currentUser).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cuenta';
  const filename = 'drakotrack-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.json';
  try{
    if(window.DrakoShare && DrakoShare.shareFile){
      const res = await DrakoShare.shareFile(filename, json, 'application/json');
      if(res === 'shared') toast('Archivo compartido — elige dónde guardarlo.');
      else if(fromCloud) toast('Copia de la nube descargada.');
      else toast('Sin conexión con la nube — se descargó la copia local de esta cuenta.', 'info');
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a');
      aEl.href = url; aEl.download = filename;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if(fromCloud) toast('Copia de la nube descargada.');
      else toast('Sin conexión con la nube — se descargó la copia local de esta cuenta.', 'info');
    }
  }catch(e){ toast('No se pudo generar el archivo.', 'error'); }
}
function docHasContent(d){
  return !!(d && ((d.workouts && d.workouts.length) || (d.sessions && d.sessions.length) || (d.prs && d.prs.length) || (d.weights && d.weights.length) || d.photo));
}
async function enterCloud(mail){
  currentUser = mail;
  localStorage.setItem(SESSION_KEY, mail);
  dataFor(mail);
  /* ¿Hay datos locales sin respaldar de cuentas locales previas? */
  const candidates = Object.keys(db.data).filter(k => k !== mail && docHasContent(db.data[k]));
  let remote = null;
  try{ remote = await DrakoSB.loadData(); }catch(e){}
  const remoteEmpty = !remote || !remote.data || !Object.keys(remote.data).length;
  if(remote && remote.data && remote.data.workouts !== undefined){
    if(!Array.isArray(remote.data.hiddenLib)) remote.data.hiddenLib = [];
    db.data[mail] = remote.data;
    saveDB();
  }
  render();
  if(candidates.length && remoteEmpty){
    let best = candidates[0];
    for(const k of candidates){
      const sa = (db.data[k].sessions || []), sb2 = (db.data[best].sessions || []);
      if(sa.length && (sa[sa.length-1].date >= (sb2.length ? sb2[sb2.length-1].date : ''))) best = k;
    }
    confirmModal('¿Subir tus datos locales a la nube?',
      `Se encontraron datos guardados en este dispositivo con la cuenta «${esc(best)}». ¿Subirlos a tu cuenta de la nube para poder restaurarlos desde cualquier dispositivo o si pierdes el acceso?`,
      'Subir datos', () => {
        closeModal();
        db.data[mail] = db.data[best];
        saveDB();
        pushNow(false).then(() => toast('Datos subidos a la nube.'));
        render();
      });
  } else if(docHasContent(db.data[mail])){
    pushNow(false);
  }
}
async function saveRecoveredPassword(){
  const p1 = $('#rec-pass') ? $('#rec-pass').value : '';
  const p2 = $('#rec-pass2') ? $('#rec-pass2').value : '';
  const box = $('#rec-err');
  const fail = m => { if(box){ box.textContent = m; box.classList.remove('hidden'); } };
  if(p1.length < 6) return fail('La contraseña debe tener al menos 6 caracteres.');
  if(p1 !== p2) return fail('Las contraseñas no coinciden.');
  const err = await DrakoSB.updatePasswordFromToken(window.__recToken, p1);
  if(err) return fail(err);
  window.__recToken = null;
  closeModal();
  toast('Contraseña actualizada — ya puedes iniciar sesión con la nueva.');
  setAuthMode('cloud');
  render();
}  /* Cambio de contraseña de la cuenta actual (local o nube).
     Solo cambia la credencial: los datos del usuario no se tocan. */
  function openChangePass(){
    const cloud = isCloud();
    const intro = cloud
      ? 'Cambiarás la contraseña de tu cuenta en la nube (' + esc(currentUser) + ').'
      : 'Cambiarás la contraseña de tu cuenta local de este dispositivo.';
    openModal(`
      <h3>Cambiar la contraseña</h3>
      <p class="modal-body">${intro} Tus entrenamientos, récords e historial no se ven afectados.</p>
      <div class="form">
        <label class="field"><span>Contraseña actual</span><input type="password" id="cp-old" autocomplete="current-password"></label>
        <label class="field"><span>Nueva contraseña</span><input type="password" id="cp-new" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
        <label class="field"><span>Repite la contraseña nueva</span><input type="password" id="cp-new2" autocomplete="new-password"></label>
      </div>
      <div id="cp-err" class="auth-err hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
        <button class="btn btn-primary" data-action="save-change-pass" type="button">Guardar cambio</button>
      </div>`);
  }
  async function saveChangePass(){
    const box = $('#cp-err');
    const fail = m => { if(box){ box.textContent = m; box.classList.remove('hidden'); } };
    const btn = $('[data-action="save-change-pass"]');
    const cur = $('#cp-old') ? $('#cp-old').value : '';
    const p1 = $('#cp-new') ? $('#cp-new').value : '';
    const p2 = $('#cp-new2') ? $('#cp-new2').value : '';
    if(p1.length < 6) return fail('La contraseña nueva debe tener al menos 6 caracteres.');
    if(p1 !== p2) return fail('Las contraseñas nuevas no coinciden.');
    if(btn) btn.disabled = true;
    try{
      if(isCloud()){
        /* Verificar la contraseña actual con un arranque de sesión independiente */
        const verr = await DrakoSB.signIn(currentUser, cur);
        if(verr){ if(btn) btn.disabled = false; return fail(verr); }
        const err = await DrakoSB.changePassword(p1);
        if(err){ if(btn) btn.disabled = false; return fail(err); }
      } else {
        const usr = db.users[String(currentUser).trim().toLowerCase()];
        if(!usr){ if(btn) btn.disabled = false; return fail('No se encontró la cuenta local.'); }
        let ok = false;
        if(usr.salt){
          ok = ctEq(await pbkdf2(cur, usr.salt, usr.iter || PBKDF2_ITER), usr.h);
        } else {
          /* cuentas pre-PBKDF2 */
          ok = ctEq(await sha256(cur), usr.h);
        }
        if(!ok){ if(btn) btn.disabled = false; return fail('La contraseña actual no es correcta.'); }
        const salt = randomSalt();
        usr.salt = salt;
        usr.iter = PBKDF2_ITER;
        usr.h = await pbkdf2(p1, salt, PBKDF2_ITER);
        saveDB();
      }
      closeModal();
      toast('Contraseña actualizada — tus datos están intactos.');
    }catch(e){
      if(btn) btn.disabled = false;
      fail('No se pudo actualizar la contraseña: ' + (e && e.message || 'error inesperado'));
    }
  }
  function parseRecoveryHash(){
  const h = location.hash.replace(/^#/, '');
  if(!h || h.indexOf('access_token') < 0) return null;
  const params = {};
  h.split('&').forEach(kv => { const i = kv.indexOf('='); if(i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  return params.type === 'recovery' ? params : null;
}

function dataFor(user){
  if(!db.data[user]){
    db.data[user] = { workouts:[], sessions:[], prs:[], weights:[], photo:null, hiddenLib:[] };
  }
  if(!Array.isArray(db.data[user].hiddenLib)) db.data[user].hiddenLib = [];
  return db.data[user];
}

/* Límites para validar entradas del usuario (import, editor, sesiones, PR) */
const LIMITS = { name:120, exercises:100, workouts:300, sets:50, reps:2000, kg:1000 };
function clampInt(v, max, fallback){
  const n = Number(v);
  if(n === null || n === undefined || n === '' || Number.isNaN(n) || v === '') return fallback;
  if(!isFinite(n)) return fallback;
  return Math.min(Math.round(Math.abs(n)), max);
}

/* ---------------- Utilidades ---------------- */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const escapeHtmlNum = v => esc(String(v ?? ''));

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es', { day:'numeric', month:'short' });
}
function fmtDateLong(iso){
  if(!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}
async function sha256(text){
  const data = new TextEncoder().encode('drako::' + text);
  if(crypto && crypto.subtle){
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  return sha256JS(data); // respaldo para contextos sin crypto.subtle
}
/* SHA-256 en JS puro (respaldo cuando crypto.subtle no está disponible) */
function sha256JS(data){
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const l = data.length, m = l + 1;
  const n = Math.ceil((m + 8) / 64) * 64;
  const buf = new Uint8Array(n);
  buf.set(data);
  buf[l] = 0x80;
  const bits = BigInt(l) * 8n;
  for(let i = 0; i < 8; i++) buf[n - 1 - i] = Number((bits >> BigInt(i * 8)) & 0xffn);
  const w = new Uint32Array(64);
  const rotr = (x, c) => (x >>> c) | (x << (32 - c));
  for(let off = 0; off < n; off += 64){
    for(let i = 0; i < 16; i++){
      w[i] = (buf[off + i*4] << 24) | (buf[off + i*4 + 1] << 16) | (buf[off + i*4 + 2] << 8) | buf[off + i*4 + 3];
    }
    for(let i = 16; i < 64; i++){
      const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for(let i = 0; i < 64; i++){
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

/* ---------------- Cifrado de contraseñas (PBKDF2 + sal aleatoria) ---------------- */
const PBKDF2_ITER = 150000;
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
function randomSalt(){
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return toHex(a);
}
async function pbkdf2(pass, saltHex, iterations){
  const salt = new Uint8Array((saltHex.match(/.{2}/g) || []).map(h => parseInt(h, 16)));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations, hash:'SHA-256' }, material, 256);
  return toHex(bits);
}
/* Comparación de hashes en tiempo constante */
function ctEq(a, b){
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ---------------- Acceso (cuenta) ---------------- */
async function signup(user, pass){
  const u = user.trim().toLowerCase();
  if(!/^[a-z0-9_]{3,20}$/.test(u)) return 'Usa entre 3 y 20 letras, números o guiones bajos.';
  if(pass.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if(db.users[u]) return 'Ese usuario ya está en uso.';
  if(!(crypto && crypto.subtle)) return 'Esta app necesita un contexto seguro (HTTPS) para crear cuentas.';
  const salt = randomSalt();
  db.users[u] = { salt, h: await pbkdf2(pass, salt, PBKDF2_ITER), iter: PBKDF2_ITER, created: todayISO() };
  saveDB();
  currentUser = u;
  localStorage.setItem(SESSION_KEY, u);
  return null;
}
async function login(user, pass){
  /* Mensaje genérico: no revelamos si el usuario existe ni si falló la contraseña. */
  const GENERIC_ERR = 'Usuario o contraseña incorrectos.';
  if(!(crypto && crypto.subtle)) return 'Esta app necesita un contexto seguro (HTTPS) para verificar contraseñas.';
  const u = user.trim().toLowerCase();
  const usr = db.users[u];
  try{
    if(!usr){
      /* Igualamos el tiempo de respuesta con un PBKDF2 real para que la latencia
         no permita adivinar si el usuario existe en este dispositivo. */
      await pbkdf2(pass, '00112233445566778899aabbccddeeff', PBKDF2_ITER);
      return GENERIC_ERR;
    }
    if(usr.salt){
      /* cuentas nuevas: PBKDF2 con sal aleatoria por usuario */
      const h = await pbkdf2(pass, usr.salt, usr.iter || PBKDF2_ITER);
      if(!ctEq(h, usr.h)) return GENERIC_ERR;
    } else {
      /* cuentas creadas antes del cambio a PBKDF2: SHA-256 con sal estática.
         Si la contraseña es correcta, se migran a PBKDF2 automáticamente. */
      if(!ctEq(await sha256(pass), usr.h)) return GENERIC_ERR;
      const salt = randomSalt();
      usr.salt = salt;
      usr.iter = PBKDF2_ITER;
      usr.h = await pbkdf2(pass, salt, PBKDF2_ITER);
      saveDB();
    }
  }catch(err){
    return 'No se pudo verificar la contraseña en este contexto.';
  }
  currentUser = u;
  localStorage.setItem(SESSION_KEY, u);
  return null;
}
function logout(){
  if(window.DrakoSB && DrakoSB.hasSession()) DrakoSB.signOut();
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  state.sessionId = null;
  state.editor = null;
}

/* ---------------- Avisos y ventanas modales ---------------- */
function toast(msg, type='success'){
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 2800);
}
function openModal(html){
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal">${html}</div></div>`;
}
function closeModal(){ $('#modal-root').innerHTML = ''; }
function confirmModal(title, body, confirmLabel, cb){
  openModal(`
    <h3>${title}</h3>
    <p class="modal-body">${body}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
      <button class="btn btn-danger" data-action="confirm-do" type="button">${esc(confirmLabel)}</button>
    </div>`);
  window.__confirmCb = cb;
}

/* ---------------- Enrutador ---------------- */
function parseHash(){
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  return { route: parts[0] || 'workouts', rest: parts.slice(1) };
}
function nav(hash){
  if(location.hash === '#' + hash || location.hash === hash) render();
  else location.hash = hash;
}

/* ---------------- Render principal ---------------- */
function render(){
  const authScreen = $('#auth-screen');
  const app = $('#app');

  if(!currentUser){
    authScreen.classList.remove('hidden');
    app.classList.add('hidden');
    document.title = 'DrakoTrack — Iniciar sesión';
    return;
  }
  authScreen.classList.add('hidden');
  app.classList.remove('hidden');
  document.title = 'DrakoTrack — Seguimiento de entrenamiento';

  const { route, rest } = parseHash();
  renderHeader();
  setActiveTab(route);
  const main = $('#main');

  if(route === 'session')      renderSession(main, rest[0]);
  else if(route === 'editor')  renderEditor(main, rest[0]);
  else  if(route === 'prs')     renderPRs(main);
  else if(route === 'weight')  renderWeight(main);
  else if(route === 'history') renderHistory(main);
  else if(route === 'program') renderProgram(main, rest[0]);
  else                         renderWorkouts(main);
}

function renderHeader(){
  const initials = currentUser.split(/[\s._-]+/).map(w => w[0] || '').join('').slice(0,2).toUpperCase();
  $('#user-chip').innerHTML = `<span class="chip-avatar">${esc(initials)}</span><span class="chip-name">${esc(currentUser)}</span>`;
  const cloud = isCloud();
  $('#user-menu-head').textContent = 'Sesión iniciada como ' + currentUser + (cloud ? ' (nube)' : ' (solo este dispositivo)');
  const sbStatus = $('#sb-status'), sbPush = $('#sb-push'), sbRestore = $('#sb-restore'), sbExport = $('#sb-export');
  if(sbStatus){
    if(cloud){
      sbStatus.classList.remove('hidden');
      if(state.sb.status === 'syncing') sbStatus.textContent = '☁️ Sincronizando…';
      else if(state.sb.status === 'error') sbStatus.textContent = '⚠ Sin conexión — se reintentará al guardar';
      else if(state.sb.last) sbStatus.textContent = '☁️ Copia guardada · ' + new Date(state.sb.last).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
      else sbStatus.textContent = '☁️ Cuenta en la nube activa';
    } else sbStatus.classList.add('hidden');
  }
  if(sbPush) sbPush.classList.toggle('hidden', !cloud);
  if(sbRestore) sbRestore.classList.toggle('hidden', !cloud);
  if(sbExport) sbExport.classList.toggle('hidden', !cloud);
  $('#top-date').textContent = new Date().toLocaleDateString('es', { weekday:'long', month:'long', day:'numeric' });
}
function setActiveTab(route){
  $$('.nav-btn[data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === route));
}

/* ---------------- Inicio: entrenamientos ---------------- */
function workoutStats(){
  const d = dataFor(currentUser);
  const finished = d.sessions.filter(s => s.finished);
  const now = new Date(); now.setHours(0,0,0,0);
  const dow = (now.getDay() + 6) % 7;
  const startWeek = new Date(now); startWeek.setDate(now.getDate() - dow);
  const thisWeek = finished.filter(s => new Date(s.date + 'T00:00:00') >= startWeek).length;
  const sorted = [...d.weights].sort((a,b) => a.date.localeCompare(b.date));
  const curW = sorted.length ? sorted[sorted.length-1].weight : null;
  return { done: finished.length, week: thisWeek, prs: d.prs.length, curW };
}
function workoutCard(w){
  const mins = Math.max(10, Math.round(w.exercises.length * 4.5));
  return `
  <article class="wcard">
    <div class="wcard-top">
      <span class="wcard-emoji">${DUMBBELL}</span>
      <span class="wcard-badge">${w.exercises.length} ejercicios · ~${mins} min</span>
    </div>
    <h3>${esc(w.name)}</h3>
    <div class="wcard-ex">
      ${w.exercises.slice(0,3).map(e => `<span>${esc(e.name)}</span>`).join('')}
      ${w.exercises.length > 3 ? `<span class="more">+${w.exercises.length - 3} más</span>` : ''}
    </div>
    <div class="wcard-actions">
      <button class="btn btn-primary" data-action="start-session" data-id="${esc(w.id)}" type="button">Comenzar</button>
      <button class="btn btn-ghost" data-action="edit-workout" data-id="${esc(w.id)}" type="button">Editar</button>
      <button class="icon-btn danger" data-action="erase-lib" data-id="${esc(w.id)}" type="button" title="Borrar de la biblioteca (se conserva tu historial y puedes restaurarlo luego)">✕</button>
    </div>
  </article>`;
}
function customCard(w){
  return `
  <article class="wcard">
    <div class="wcard-top">
      <span class="wcard-emoji">${DUMBBELL}</span>
      <span class="wcard-badge">${w.exercises.length} ejercicios</span>
    </div>
    <h3>${esc(w.name)}</h3>
    <div class="wcard-ex">
      ${w.exercises.slice(0,3).map(e => `<span>${esc(e.name)}</span>`).join('')}
      ${w.exercises.length > 3 ? `<span class="more">+${w.exercises.length - 3} más</span>` : ''}
    </div>
    <div class="wcard-actions">
      <button class="btn btn-primary" data-action="start-session" data-id="${esc(w.id)}" type="button">Comenzar</button>
      <button class="btn btn-ghost" data-action="edit-workout" data-id="${esc(w.id)}" type="button">Editar</button>
      <button class="icon-btn danger" data-action="delete-workout" data-id="${esc(w.id)}" type="button" title="Eliminar">✕</button>
    </div>
    <div class="wcard-file">
      <button class="btn btn-ghost btn-sm" data-action="export-workout" data-id="${esc(w.id)}" type="button" title="Guardar este entrenamiento como archivo para compartirlo">Exportar</button>
      <button class="btn btn-ghost btn-sm" data-action="import-workout" data-id="${esc(w.id)}" type="button" title="Cargar un archivo de entrenamiento">Importar</button>
    </div>
  </article>`;
}
function renderWorkouts(main){
  const d = dataFor(currentUser);
  const st = workoutStats();
  const all = LIBRARY.filter(w => !d.hiddenLib.includes(w.id));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  main.innerHTML = `
    <section class="hero-card">
      <div>
        <p class="eyebrow">${greet}, ${esc(currentUser)}</p>
        <h1>A darlo todo hoy</h1>
        <p class="hero-sub">Carga una sesión de la biblioteca del entrenador o crea tu propio entrenamiento.</p>
      </div>
    </section>

    <section class="stats-grid">
      <div class="stat-card"><p class="stat-value">${st.done}</p><p class="stat-label">Entrenos completados</p></div>
      <div class="stat-card"><p class="stat-value">${st.week}</p><p class="stat-label">Esta semana</p></div>
      <div class="stat-card"><p class="stat-value">${st.prs}</p><p class="stat-label">Récords registrados</p></div>
      <div class="stat-card"><p class="stat-value">${st.curW != null ? st.curW + ' kg' : '—'}</p><p class="stat-label">Peso actual</p></div>
    </section>

    <section class="section">
      <div class="section-head">
        <button type="button" class="sec-toggle${sectionCollapsed('lib') ? ' collapsed' : ''}" data-action="toggle-section" data-section="lib"
          aria-expanded="${sectionCollapsed('lib') ? 'false' : 'true'}" aria-controls="lib-body"><span class="chev" aria-hidden="true">▸</span>Biblioteca del entrenador</button>
        <span class="muted">Sesiones listas — edítalas o bórralas; pliega la sección para ocultarlas todas de golpe.</span>
        ${d.hiddenLib.length ? `<button class="btn btn-ghost btn-sm" data-action="open-hidden" type="button">Ocultos (${d.hiddenLib.length})</button>` : ''}
      </div>
      <div id="lib-body"${sectionCollapsed('lib') ? ' class="hidden"' : ''}>
        ${all.length
          ? `<div class="workout-cards">${all.map(workoutCard).join('')}</div>`
          : `<div class="empty-state">Has borrado todos los entrenamientos predefinidos. Usa «Ocultos (${d.hiddenLib.length})» arriba para restaurarlos.</div>`}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <button type="button" class="sec-toggle${sectionCollapsed('bc') ? ' collapsed' : ''}" data-action="toggle-section" data-section="bc"
          aria-expanded="${sectionCollapsed('bc') ? 'false' : 'true'}" aria-controls="bc-body"><span class="chev" aria-hidden="true">▸</span>Programas</button>
        <span class="muted">Catálogo Boostcamp: elige un programa y carga cualquier día como sesión.</span>
      </div>
      <div id="bc-body"${sectionCollapsed('bc') ? ' class="hidden"' : ''}>
        <div class="field bc-search-field"><input id="bc-search" placeholder="Buscar por nombre, coach o enfoque… p. ej. 5/3/1, PHUL, Wendler" autocomplete="off"></div>
        <div id="bc-cats" class="bc-cats" hidden></div>
        <div id="bc-result" class="workout-cards"><div class="empty-state">Cargando el catálogo de programas…</div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Mis entrenamientos</h2>
        <div class="btn-group">
          <button class="btn btn-ghost btn-sm" data-action="import-workouts" type="button">Importar</button>
          <button class="btn btn-primary btn-sm" data-action="new-workout" type="button">+ Crear</button>
        </div>
      </div>
      ${d.workouts.length
        ? `<div class="workout-cards">${d.workouts.map(customCard).join('')}</div>`
        : `<div class="empty-state">Aún no tienes entrenamientos propios. Crea uno, o importa un archivo del entrenador (Exportar/Importar).</div>`}
      <input type="file" id="import-workouts-input" accept=".json,application/json" hidden>
    </section>`;

  /* Catálogo de programas Boostcamp: se carga en segundo plano */
  DrakoBC.catalog().then(cat => {
    bcCache = cat;
    if($('#bc-result')) renderBCList();
  }).catch(() => {
    const box = $('#bc-result');
    if(box) box.innerHTML = '<div class="empty-state">No se pudo cargar el catálogo de programas.</div>';
  });
}

/* ---------------- Sesión ---------------- */
function getWorkout(id){
  const d = dataFor(currentUser);
  return d.workouts.find(w => w.id === id) || LIBRARY.find(w => w.id === id);
}
function getSession(id){ return dataFor(currentUser).sessions.find(s => s.id === id); }
function newSessionFor(workout){
  const d = dataFor(currentUser);
  const s = {
    id: uid(), workoutId: workout.id, workoutName: workout.name, date: todayISO(), finished: false,
    exercises: workout.exercises.map(e => ({
      id: e.id || uid(), name: e.name,
      targetSets: clampInt(e.sets, LIMITS.sets, 1),
      targetReps: clampInt(e.reps, LIMITS.reps, 10),
      target: e.target || null,
      weight: '', reps: '', done: false,
    })),
  };
  d.sessions.push(s);
  saveDB();
  return s;
}
function startOrGetSession(workoutId){
  const d = dataFor(currentUser);
  const today = todayISO();
  let s = d.sessions.find(x => !x.finished && x.workoutId === workoutId && x.date === today);
  if(!s){
    const w = getWorkout(workoutId);
    if(!w) return null;
    s = newSessionFor(w);
  }
  state.sessionId = s.id;
  return s;
}
/* Reinicia una sesión a partir de la plantilla guardada en la propia sesión,
   sin depender de que el entrenamiento siga existiendo (válido p. ej.
   para sesiones de un programa Boostcamp ya oculto o cambiado). */
function startSessionFromPrevious(old){
  if(!old) return null;
  const w = {
    id: old.workoutId, name: old.workoutName,
    exercises: old.exercises.map(e => ({ id: uid(), name: e.name, sets: e.targetSets, reps: e.targetReps, target: e.target || null })),
  };
  const s = newSessionFor(w);
  state.sessionId = s.id;
  return s;
}
function sessionPct(s){
  if(!s.exercises.length) return 0;
  return Math.round(s.exercises.filter(e => e.done).length / s.exercises.length * 100);
}
function ringSVG(pct){
  const r = 26, c = 2 * Math.PI * r;
  return `
  <svg viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="${r}" fill="none" class="ring-track" stroke-width="6"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct/100)}" transform="rotate(-90 32 32)"/>
    <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffa040"/><stop offset="100%" stop-color="#f05100"/>
    </linearGradient></defs>
  </svg>`;
}
function exRow(s, e, i, last){
  const locked = s.finished ? 'disabled' : '';
  const lastTxt = last && (('weight' in last) || ('reps' in last))
    ? `${last.weight != null && last.weight !== '' ? escapeHtmlNum(last.weight) + ' kg' : ''}${last.reps ? ' × ' + escapeHtmlNum(last.reps) : ''}`
    : null;
  return `
  <div class="ex-row ${e.done ? 'done' : ''}">
    <label class="check">
      <input type="checkbox" data-action="toggle-ex" data-sid="${s.id}" data-ex="${e.id}" ${e.done ? 'checked' : ''} ${locked}>
      <span class="checkmark"></span>
    </label>
    <div class="ex-info">
      <p class="ex-name">${i + 1}. ${esc(e.name)}</p>
      <p class="ex-target ${e.target ? 'ex-target-row' : ''}">${e.target ? e.targetSets + ' × ' + esc(e.target) : e.targetSets + ' series × ' + e.targetReps + ' rep'}</p>
      ${lastTxt && !s.finished ? `<button class="last-used" data-action="fill-last" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" type="button" title="Rellenar con el último registro">↺ Anterior ${lastTxt} · ${fmtDate(last == null ? '' : last.date)}</button>` : ''}
      ${lastTxt && s.finished ? `<span class="last-used" style="cursor:default">Último: ${lastTxt}</span>` : ''}
    </div>
    <div class="ex-inputs">
      <label class="mini-field">
        <input type="number" inputmode="decimal" min="0" placeholder="0" value="${e.weight ?? ''}"
          data-session="${s.id}" data-ex="${e.id}" data-field="weight" ${locked}><span>kg</span>
      </label>
      <label class="mini-field">
        <input type="number" inputmode="numeric" min="0" placeholder="0" value="${e.reps ?? ''}"
          data-session="${s.id}" data-ex="${e.id}" data-field="reps" ${locked}><span>rep</span>
      </label>
    </div>
  </div>`;
}
function renderSession(main, sid){
  const s = getSession(sid);
  if(!s){ nav('#/workouts'); return; }
  const pct = sessionPct(s);
  const d = dataFor(currentUser);
  const histAll = d.sessions
    .filter(x => x.workoutId === s.workoutId && x.id !== s.id && x.finished)
    .sort((a,b) => b.date.localeCompare(a.date));
  /* Último peso/repeticiones por ejercicio (de sesiones completadas del mismo entrenamiento) */
  const lastBy = {};
  histAll.forEach(x => x.exercises.forEach(e => {
    if(!lastBy[e.name] && ((e.weight != null && e.weight !== '') || e.reps))
      lastBy[e.name] = { weight: e.weight, reps: e.reps, date: x.date };
  }));
  const hist = histAll.slice(0,5);

  main.innerHTML = `
    <div class="session-head">
      <button class="btn btn-ghost btn-sm" data-action="back" type="button">← Entrenamientos</button>
      <div class="session-title">
        <span class="wcard-emoji big">${DUMBBELL}</span>
        <div>
          <h1>${esc(s.workoutName)}</h1>
          <p class="muted">${fmtDateLong(s.date)} · ${s.exercises.length} ejercicios</p>
        </div>
      </div>
      <div class="ring-wrap">
        <div id="ring" style="width:100%;height:100%">${ringSVG(pct)}</div>
        <div class="ring-label"><span id="ring-pct">${pct}</span><small>%</small></div>
      </div>
    </div>

    <div class="progress-bar"><div class="progress-fill" id="pfill" style="width:${pct}%"></div></div>

    <section class="section">
      <div class="section-head">
        <h2>${s.finished ? 'Sesión completada' : 'Ejercicios'}</h2>
        <span class="muted">${s.finished ? '¡Gran trabajo! Registrada el ' + fmtDate(s.date) : 'Marca cada ejercicio al terminarlo y anota tu peso y repeticiones.'}</span>
      </div>
      <div class="ex-list">${s.exercises.map((e,i) => exRow(s, e, i, lastBy[e.name])).join('')}</div>
    </section>

    <div class="session-actions">
      ${s.finished
        ? `<button class="btn btn-primary" data-action="restart-session" data-id="${s.id}" type="button">Entrenar de nuevo</button>`
        : `<button class="btn btn-primary btn-lg" data-action="finish-session" data-id="${s.id}" type="button" ${pct === 100 ? '' : 'disabled'}>Terminar sesión</button>`}
    </div>

    ${hist.length ? `
    <section class="section">
      <div class="section-head"><h2>Sesiones recientes</h2><span class="muted">Mismo entrenamiento</span></div>
      <div class="hist-list">
        ${hist.map(h => `
          <div class="hist-item">
            <span>${esc(h.workoutName)}</span>
            <span class="muted">${fmtDate(h.date)}</span>
            <span class="hist-pct">${sessionPct(h)}%</span>
          </div>`).join('')}
      </div>
    </section>` : ''}`;
}
function refreshSessionProgress(sid){
  const s = getSession(sid);
  if(!s) return;
  const pct = sessionPct(s);
  const p = $('#ring-pct'); if(p) p.textContent = pct;
  const fill = $('#pfill'); if(fill) fill.style.width = pct + '%';
  const fin = $('[data-action="finish-session"]');
  if(fin) fin.disabled = pct !== 100;
}

/* ---------------- Editor de entrenamientos propios ---------------- */
function renderEditor(main, id){
  const d = dataFor(currentUser);
  const existing = id !== 'new' ? d.workouts.find(w => w.id === id) : null;
  state.editor = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: uid(), name: '', exercises: [{ id: uid(), name: '', sets: 3, reps: 10, weight: '' }] };
  main.innerHTML = `
    <div class="page-head">
      <h1>${existing ? 'Editar entrenamiento' : 'Crear entrenamiento'}</h1>
      <p class="muted">Ponle nombre, añade ejercicios y empieza una sesión cuando quieras.</p>
    </div>
    <div class="editor-card">
      <div class="field"><span>Nombre del entrenamiento</span><input id="ed-name" data-bind="name" value="${esc(state.editor.name)}" placeholder="p. ej. Pecho y tríceps"></div>
      <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:16px">Ejercicios</h2><button class="btn btn-ghost btn-sm" data-action="add-ex" type="button">+ Añadir ejercicio</button></div>
      <div id="editor-rows"></div>
      <div class="editor-actions">
        <button class="btn btn-ghost" data-action="back" type="button">Cancelar</button>
        <button class="btn btn-primary" data-action="save-workout" type="button">Guardar entrenamiento</button>
      </div>
    </div>`;
  renderEditorRows();
}
function renderEditorRows(){
  const wrap = $('#editor-rows');
  if(!wrap) return;
  const ex = state.editor.exercises;
  if(!ex.length){ wrap.innerHTML = '<div class="empty-state">Aún no hay ejercicios — añade el primero.</div>'; return; }
  wrap.innerHTML = ex.map((e, i) => `
    <div class="ex-row-edit">
      <textarea rows="1" spellcheck="false" data-bind="row" data-idx="${i}" data-field="name" placeholder="Nombre del ejercicio">${esc(e.name)}</textarea>
      <label class="mini-field"><input type="number" min="1" data-bind="row" data-idx="${i}" data-field="sets" value="${e.sets}"><span>series</span></label>
      <label class="mini-field"><input type="number" min="1" data-bind="row" data-idx="${i}" data-field="reps" value="${e.reps}"><span>rep</span></label>
      <button class="icon-btn danger" data-action="del-ex" data-idx="${i}" type="button" title="Eliminar">✕</button>
    </div>`).join('');
  $$('#editor-rows textarea').forEach(autoGrow);
}
function autoGrow(el){
  el.style.height = 'auto';
  el.style.height = Math.max(48, el.scrollHeight) + 'px';
}

/* ---------------- Récords personales (PR) ---------------- */
function allExerciseNames(d){
  const set = new Set();
  LIBRARY.forEach(w => w.exercises.forEach(e => set.add(e.name)));
  d.workouts.forEach(w => w.exercises.forEach(e => e.name && set.add(e.name)));
  d.prs.forEach(p => set.add(p.exercise));
  d.sessions.forEach(s => s.exercises.forEach(e => e.name && set.add(e.name)));
  return [...set].sort((a,b) => a.localeCompare(b));
}
function renderPRs(main){
  const d = dataFor(currentUser);
  const exercises = allExerciseNames(d);
  let sel = state.prExercise && exercises.includes(state.prExercise) ? state.prExercise : exercises[0];
  state.prExercise = sel || null;
  const entries = d.prs.filter(p => p.exercise === sel).sort((a,b) => a.date.localeCompare(b.date));
  const best = entries.length ? Math.max(...entries.map(e => e.weight)) : null;
  const lim = new Date(); lim.setDate(lim.getDate() - 30);
  const last30 = entries.filter(e => new Date(e.date + 'T00:00:00') >= lim);
  const chartData = last30.length ? last30 : entries.slice(-8);
  let delta = '—';
  if(last30.length >= 2){
    const diff = last30[last30.length-1].weight - last30[0].weight;
    delta = (diff > 0 ? '+' : '') + diff.toFixed(1) + ' kg';
  } else if(last30.length === 1){ delta = 'nuevo'; }

  main.innerHTML = `
    <div class="page-head">
      <h1>Récords personales</h1>
      <p class="muted">Registra tus récords y observa tu progreso mensual.</p>
    </div>

    <div class="pr-top">
      <div class="pr-select">
        <label>Ejercicio</label>
        <select id="pr-select">
          ${exercises.map(x => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" data-action="log-pr" type="button" ${sel ? '' : 'disabled'}>+ Registrar récord</button>
    </div>

    <section class="stats-grid small">
      <div class="stat-card"><p class="stat-value">${best != null ? best + ' kg' : '—'}</p><p class="stat-label">Máximo · ${sel ? esc(sel) : 'elige un ejercicio'}</p></div>
      <div class="stat-card"><p class="stat-value">${entries.length ? entries[entries.length-1].weight + ' kg' : '—'}</p><p class="stat-label">Último</p></div>
      <div class="stat-card"><p class="stat-value">${delta}</p><p class="stat-label">Cambio en 30 días</p></div>
      <div class="stat-card"><p class="stat-value">${entries.length}</p><p class="stat-label">Récords registrados</p></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Progreso mensual</h2><span class="muted">${sel ? esc(sel) : ''} · últimos 30 días</span>
        <button class="btn btn-primary btn-sm" data-action="share-pr" type="button" ${entries.length ? '' : 'disabled'}>Compartir en WhatsApp</button>
      </div>
      <div id="pr-chart" class="chart"></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Todos los récords ${sel ? '· ' + esc(sel) : ''}</h2></div>
      ${entries.length
        ? `<div class="pr-list">${[...entries].reverse().map(p => `
            <div class="pr-item">
              <span>${fmtDateLong(p.date)}</span>
              <span class="pr-val">${p.weight} kg${p.reps ? ` × ${p.reps} rep` : ''}</span>
              <button class="icon-btn danger" data-action="delete-pr" data-id="${p.id}" type="button" title="Eliminar">✕</button>
            </div>`).join('')}</div>`
        : `<div class="empty-state">Aún no hay récords para este ejercicio. ¡Registra el primero!</div>`}
    </section>`;

  if(chartData.length) lineChart($('#pr-chart'), chartData.map(p => ({ label:p.date, value:p.weight })), 'Registra un récord para ver aquí tu progreso mensual.');
}
function openPRModal(preselected){
  const d = dataFor(currentUser);
  const exercises = allExerciseNames(d);
  openModal(`
    <h3>Registrar nuevo récord</h3>
    <div class="form">
      <label>Ejercicio
        <select id="prf-exercise">${exercises.map(x => `<option value="${esc(x)}" ${x === preselected ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </label>
      <label>Fecha<input type="date" id="prf-date" value="${todayISO()}"></label>
      <label>Peso (kg)<input type="number" id="prf-weight" placeholder="p. ej. 100" inputmode="decimal"></label>
      <label>Repeticiones (opcional)<input type="number" id="prf-reps" placeholder="p. ej. 5" inputmode="numeric"></label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
      <button class="btn btn-primary" data-action="save-pr" type="button">Guardar récord</button>
    </div>`);
  setTimeout(() => $('#prf-weight') && $('#prf-weight').focus(), 60);
}

/* ---------------- Control de peso ---------------- */
function renderWeight(main){
  const d = dataFor(currentUser);
  const sorted = [...d.weights].sort((a,b) => a.date.localeCompare(b.date));
  const cur = sorted.length ? sorted[sorted.length-1].weight : null;
  const start = sorted.length ? sorted[0].weight : null;
  const change = cur != null && start != null ? cur - start : null;
  const last60 = sorted.slice(-60);

  main.innerHTML = `
    <div class="page-head">
      <h1>Control de peso</h1>
      <p class="muted">Registra tu peso corporal y guarda una foto de referencia de tu progreso.</p>
    </div>

    <section class="stats-grid small">
      <div class="stat-card"><p class="stat-value">${cur != null ? cur + ' kg' : '—'}</p><p class="stat-label">Peso actual</p></div>
      <div class="stat-card"><p class="stat-value">${change == null ? '—' : (change > 0 ? '+' : '') + change.toFixed(1) + ' kg'}</p><p class="stat-label">Cambio total</p></div>
      <div class="stat-card"><p class="stat-value">${sorted.length}</p><p class="stat-label">Registros</p></div>
      <div class="stat-card"><p class="stat-value">${d.photo ? 'sí' : '—'}</p><p class="stat-label">Foto de referencia</p></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Tendencia de peso</h2><span class="muted">${last60.length} últimos registros</span>
        <button class="btn btn-primary btn-sm" data-action="share-weight" type="button" ${sorted.length ? '' : 'disabled'}>Compartir en WhatsApp</button>
      </div>
      <div id="w-chart" class="chart"></div>
    </section>

    <div class="grid-2">
      <div class="card">
        <h3>Registrar el peso de hoy</h3>
        <div class="form-row">
          <input type="date" id="w-date" value="${todayISO()}">
          <input type="number" id="w-weight" placeholder="kg" inputmode="decimal" min="0">
          <button class="btn btn-primary" data-action="add-weight" type="button">Añadir</button>
        </div>
        <div class="weight-list">
          ${[...sorted].reverse().slice(0,10).map(w => `
            <div class="pr-item"><span>${fmtDateLong(w.date)}</span><span class="pr-val">${w.weight} kg</span>
              <button class="icon-btn danger" data-action="delete-weight" data-id="${w.id}" type="button" title="Eliminar registro">✕</button>
            </div>`).join('') || '<div class="empty-state">Aún no hay registros. Añade tu primer peso arriba.</div>'}
        </div>
      </div>

      <div class="card">
        <h3>Foto de referencia</h3>
        <p class="muted small" style="margin-bottom:14px">Sube una foto de progreso — solo se guarda en este dispositivo.</p>
        ${d.photo && String(d.photo).startsWith('data:image/')
          ? `<div class="photo-wrap"><img src="${d.photo}" alt="Foto de referencia de progreso"><div class="photo-actions">
              <button class="btn btn-ghost btn-sm" data-action="change-photo" type="button">Reemplazar</button>
              <button class="btn btn-ghost btn-sm danger-text" data-action="remove-photo" type="button">Eliminar</button>
            </div></div>`
          : `<div class="photo-empty"><button class="btn btn-primary" data-action="change-photo" type="button">Subir foto</button>
             <p class="muted small" style="margin-top:10px">JPG / PNG, se comprime automáticamente.</p></div>`}
        <input type="file" id="photo-input" accept="image/*" hidden>
      </div>
    </div>`;

  if(sorted.length) lineChart($('#w-chart'), last60.map(w => ({ label:w.date, value:w.weight })), 'Añade tu primer registro de peso para ver tu tendencia.');
}
function compressImage(file, maxDim = 720, quality = 0.72){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/* ---------------- Historial de entrenamientos ---------------- */
function renderHistory(main){
  const d = dataFor(currentUser);
  const finished = d.sessions.filter(s => s.finished).sort((a,b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  main.innerHTML = `
    <div class="page-head">
      <h1>Historial</h1>
      <p class="muted">Todas tus sesiones completadas: los pesos y repeticiones que usaste en cada ejercicio.</p>
    </div>
    ${!finished.length
      ? `<section class="empty-state">Cuando termines sesiones en «Entrenamientos» aparecerán aquí, con el peso que usaste en cada ejercicio.</section>`
      : `<section class="section">${finished.map(histCard).join('')}</section>`}`;
}
function histCard(s){
  const doneCount = s.exercises.filter(e => e.done).length;
  return `
  <article class="hist-card">
    <div class="hist-top">
      <span class="wcard-emoji">${DUMBBELL}</span>
      <div class="hist-head">
        <h3>${esc(s.workoutName)}</h3>
        <span class="muted small">${fmtDateLong(s.date)} · ${doneCount}/${s.exercises.length} ejercicios</span>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="open-session" data-id="${esc(s.id)}" type="button">Ver sesión</button>
    </div>
    <div class="hist-ex">
      ${s.exercises.map(e => `
        <div class="hist-exrow">
          <span class="hn">${e.done ? '✓' : '✗'} ${esc(e.name)}</span>
          <span class="hv">${e.weight != null && e.weight !== '' ? escapeHtmlNum(e.weight) + ' kg' : ''}${e.reps ? ' × ' + escapeHtmlNum(e.reps) : ''}</span>
          <span class="ht muted">${e.targetSets}${e.target ? ' × ' + esc(e.target) : ' × ' + e.targetReps + ' rep'}</span>
        </div>`).join('')}
    </div>
  </article>`;
}

/* ---------------- Programas Boostcamp ---------------- */
let bcCache = [], bcFilter = '', bcCat = 'all', bcCurrent = null, bcCurrentMeta = null;
/* Categorías por objetivo (p.c viene del catalogo programs/index.json) */
const BC_CATS = [
  { k: 'all', label: 'Todos' },
  { k: 'hyper', label: 'Hipertrofia' },
  { k: 'strength', label: 'Fuerza / Powerlifting' },
  { k: 'endurance', label: 'Resistencia' },
  { k: 'fitness', label: 'Fitness' },
];
function programCard(p){
  const chips = [p.equip].filter(Boolean).concat((p.diff || []).slice(0, 2));
  const badge = [p.weeks ? p.weeks + ' sem' : null, p.dpw ? p.dpw + ' d/sem' : null].filter(Boolean).join(' · ');
  return `
  <article class="wcard">
    <div class="wcard-top">
      <span class="wcard-emoji">${DUMBBELL}</span>
      <span class="wcard-badge">${badge}</span>
    </div>
    <h3>${esc(p.t)}</h3>
    ${p.a ? `<p class="muted small card-author">por ${esc(p.a)}</p>` : ''}
    ${chips.length ? `<div class="wcard-ex">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    <div class="wcard-actions">
      <button class="btn btn-primary" data-action="open-program" data-slug="${esc(p.slug)}" type="button">${p.ok === false ? 'Sin datos' : 'Ver programa'}</button>
    </div>
  </article>`;
}
function renderBCList(){
  const box = $('#bc-result');
  if(!box) return;
  const total = bcCache.filter(p => p.ok !== false).length;
  const counts = {};
  for(const p of bcCache) for(const c of (p.c || [])) counts[c] = (counts[c] || 0) + 1;
  const catBox = $('#bc-cats');
  if(catBox){
    catBox.hidden = !total;
    catBox.innerHTML = BC_CATS.filter(c => c.k === 'all' || counts[c.k]).map(c =>
      `<button type="button" class="bc-chip ${bcCat === c.k ? 'active' : ''}" data-action="bc-cat" data-cat="${c.k}">${esc(c.label)} <span class="chip-n">${c.k === 'all' ? total : counts[c.k]}</span></button>`
    ).join('');
  }
  const q = bcFilter.trim().toLowerCase();
  const list = bcCache.filter(p => p.ok !== false
    && (bcCat === 'all' || (Array.isArray(p.c) && p.c.includes(bcCat)))
    && (!q || ((p.t + ' ' + (p.a || '') + ' ' + (p.tag || '')) + ' ' + (p.equip || '')).toLowerCase().includes(q)));
  box.innerHTML = list.length
    ? list.map(programCard).join('')
    : `<div class="empty-state">${q ? 'No hay programas para «' + esc(q) + '» en esta categoría.' : 'El catálogo no está disponible en este despliegue.'}</div>`;
}
function renderProgram(main, slug){
  if(!slug){ nav('#/workouts'); return; }
  state.bc = { slug, vi: 0, wi: 0 };
  bcCurrent = null; bcCurrentMeta = null;
  main.innerHTML = `
    <div class="page-head">
      <button class="btn btn-ghost btn-sm" data-action="back" type="button">← Entrenamientos</button>
      <h1>Cargando programa…</h1>
    </div>
    <div id="program-body"><div class="empty-state">Descargando los datos del programa…</div></div>`;
  DrakoBC.catalog().then(cat => { bcCache = cat; }).catch(() => {});
  DrakoBC.program(slug).then(p => {
    if(state.bc && state.bc.slug === slug){
      bcCurrent = p;
      bcCurrentMeta = (bcCache && bcCache.find(x => x.slug === slug)) || { title: p.title, a: p.author, diff: p.diff || [], equip: p.equip, weeks: null, dpw: null };
      bcRenderBody(bcCurrentMeta, p);
    }
  }).catch(err => {
    const body = $('#program-body');
    if(body) body.innerHTML = `<div class="empty-state">No se pudo cargar el programa (${esc(String(err && err.message || err))}).</div>`;
  });
}
function bcRenderBody(meta, p){
  const body = $('#program-body');
  if(!body || !bcCurrent) return;
  const st = state.bc;
  const chips = [meta.equip].filter(Boolean).concat((meta.diff || []).slice(0, 3));
  const v = p.vars[st.vi];
  if(!v){ body.innerHTML = '<div class="empty-state">Este programa no tiene sesiones disponibles.</div>'; return; }
  const openWeek = Math.min(st.wi, v.weeks.length - 1);
  const days = v.weeks[openWeek].d;
  const totalW = v.weeks.reduce((n, w) => n + w.r, 0);
  body.innerHTML = `
    <div class="page-head paper-head">
      <button class="btn btn-ghost btn-sm" data-action="back" type="button">← Entrenamientos</button>
      <h1>${esc(p.title)}</h1>
      ${p.author ? `<p class="muted card-author">por ${esc(p.author)}</p>` : ''}
      ${chips.length ? `<div class="wcard-ex paper-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${p.tagline ? `<p class="muted">${esc(p.tagline)}</p>` : ''}
    </div>
    ${p.w1 ? `<div class="auth-err bc-note">Nota: solo se pudo extraer la plantilla de la Semana 1 de este programa (${meta.weeks || totalW || 'n'} semanas en el original). Úsala como referencia para las demás semanas.</div>` : ''}
    ${p.vars.length > 1 ? `
      <div class="section-head"><h2 style="font-size:16px">Variación</h2><span class="muted">El programa tiene varias versiones.</span></div>
      <div class="weektabs">${p.vars.map((x, i) => `<button class="weektab ${i === st.vi ? 'active' : ''}" data-action="bc-variation" data-i="${i}" type="button">${esc(x.v || 'Base')}</button>`).join('')}</div>` : ''}
    <div class="section-head"><h2 style="font-size:16px">Semanas</h2><span class="muted">${v.weeks[openWeek].r > 1 ? 'La semana elegida se repite ' + v.weeks[openWeek].r + ' semanas (progresión por porcentajes).' : 'Elige la semana a consultar.'}</span></div>
    <div class="weektabs">${v.weeks.map((w, i) => `<button class="weektab ${i === openWeek ? 'active' : ''}" data-action="bc-week" data-i="${i}" type="button">Semana ${i + 1}${w.r > 1 ? '–' + (i + w.r) : ''}</button>`).join('')}</div>
    <div class="workout-cards" style="margin-top:14px">
      ${days.map((day, di) => programDayCard(st.slug, st.vi, openWeek, di, day)).join('') || '<div class="empty-state">Esta semana no tiene días con ejercicios (descanso).</div>'}
    </div>
    <p class="muted small" style="margin-top:18px">Fuente: catálogo público de boostcamp.app${p.author ? ' — programa de ' + esc(p.author) : ''}. Los porcentajes se calculan sobre tu 1RM; anota el peso concreto que uses en cada sesión.</p>`;
}
function programDayCard(slug, vi, wi, di, day){
  const totalSets = day.ex.reduce((n, e) => n + DrakoBC.rowsCount(e[1]), 0);
  const mins = Math.max(10, Math.round(totalSets * 3));
  const preview = day.ex.slice(0, 3).map(e => e[0]);
  return `
  <article class="wcard">
    <div class="wcard-top"><span class="wcard-emoji">${DUMBBELL}</span><span class="wcard-badge">${day.ex.length} ejercicios · ~${mins} min</span></div>
    <h3>${esc(DrakoBC.dayTitle(day, di))}</h3>
    <div class="wcard-ex">${preview.map(n => `<span>${esc(n)}</span>`).join('')}${day.ex.length > 3 ? `<span class="more">+${day.ex.length - 3} más</span>` : ''}</div>
    <div class="wcard-actions">
      <button class="btn btn-primary" data-action="start-prog-session" data-id="bc:${esc(slug)}:${vi}:${wi}:${di}" type="button">Comenzar</button>
    </div>
  </article>`;
}

/* ---------------- Compartir gráficas (JPG a WhatsApp) ---------------- */
function shareFeedback(res){
  if(res === 'shared') toast('Imagen compartida.');
  else if(res === 'downloaded') toast('Imagen descargada — compártela desde tu galería.', 'info');
  else if(res === 'cancelled') toast('Compartición cancelada.', 'info');
}
async function shareWeightChart(){
  const d = dataFor(currentUser);
  const sorted = [...d.weights].sort((x,y) => x.date.localeCompare(y.date)).slice(-60);
  if(!sorted.length){ toast('Añade primero un registro de peso.', 'error'); return; }
  if(!window.DrakoShare){ toast('La compartición no está disponible aquí.', 'error'); return; }
  toast('Generando la imagen…');
  try{
    const res = await DrakoShare.shareJPG({
      title: 'Control de peso',
      subtitle: `${sorted.length} registros · ${fmtDate(sorted[0].date)} – ${fmtDate(sorted[sorted.length-1].date)}`,
      data: sorted.map(w => ({ label: w.date, value: w.weight })),
      unit: 'kg',
      filename: 'drakotrack-peso.jpg',
      text: 'Mi progreso de peso con DrakoTrack',
    });
    shareFeedback(res);
  }catch(err){
    if(err && err.name === 'AbortError'){ toast('Compartición cancelada.', 'info'); return; }
    console.error(err);
    toast('No se pudo compartir la imagen.', 'error');
  }
}
async function sharePRChart(){
  const d = dataFor(currentUser);
  const sel = state.prExercise;
  const entries = d.prs.filter(p => p.exercise === sel).sort((a,b) => a.date.localeCompare(b.date));
  if(!entries.length){ toast('Registra primero un récord.', 'error'); return; }
  if(!window.DrakoShare){ toast('La compartición no está disponible aquí.', 'error'); return; }
  const lim = new Date(); lim.setDate(lim.getDate() - 30);
  const last30 = entries.filter(e => new Date(e.date + 'T00:00:00') >= lim);
  const chartData = last30.length ? last30 : entries.slice(-8);
  toast('Generando la imagen…');
  try{
    const res = await DrakoShare.shareJPG({
      title: 'Récord: ' + sel,
      subtitle: `${chartData.length} registros · ${fmtDate(chartData[0].date)} – ${fmtDate(chartData[chartData.length-1].date)}`,
      data: chartData.map(p => ({ label: p.date, value: p.weight })),
      unit: 'kg',
      filename: 'drakotrack-record.jpg',
      text: 'Mi récord en ' + sel + ' con DrakoTrack',
    });
    shareFeedback(res);
  }catch(err){
    if(err && err.name === 'AbortError'){ toast('Compartición cancelada.', 'info'); return; }
    console.error(err);
    toast('No se pudo compartir la imagen.', 'error');
  }
}

/* ---------------- Gráfica de líneas en SVG ---------------- */
function lineChart(el, data, emptyMsg){
  if(!el) return;
  if(data.length < 2){
    el.innerHTML = data.length === 1
      ? `<div class="chart-single">${data[0].value} kg<small>${fmtDate(data[0].label)}</small></div>`
      : `<div class="chart-empty">${esc(emptyMsg || 'Aún no hay datos suficientes.')}</div>`;
    return;
  }
  const W = 560, H = 210, P = 18;
  const vals = data.map(d => d.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if(min === max){ min -= 1; max += 1; }
  const pad = (max - min) * 0.18; min -= pad; max += pad;
  const X = i => P + (W - 2*P) * (data.length === 1 ? 0.5 : i / (data.length - 1));
  const Y = v => H - P - (v - min) / (max - min) * (H - 2*P);

  let path = '';
  data.forEach((d, i) => {
    if(i === 0){ path = `M ${X(0)} ${Y(d.value)}`; }
    else{
      const mx = (X(i-1) + X(i)) / 2;
      path += ` Q ${mx} ${Y(data[i-1].value)} ${X(i)} ${Y(d.value)}`;
    }
  });
  const area = `${path} L ${X(data.length-1)} ${H-P} L ${X(0)} ${H-P} Z`;
  const grid = [0, 0.5, 1].map(g => {
    const gy = P + (H - 2*P) * (1 - g);
    const val = min + g * (max - min);
    return `<line x1="${P}" y1="${gy}" x2="${W-P}" y2="${gy}" class="grid"/><text x="${P-6}" y="${gy+3}" class="axis" text-anchor="end">${Math.round(val)}</text>`;
  }).join('');
  const dots = data.map((d, i) =>
    `<circle cx="${X(i)}" cy="${Y(d.value)}" r="3.6" class="dot"><title>${fmtDate(d.label)} — ${d.value} kg</title></circle>`).join('');

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" class="linechart" role="img" aria-label="Gráfica de progreso">
    <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff7a00" stop-opacity=".32"/><stop offset="100%" stop-color="#ff7a00" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#chartFill)"/>
    <path d="${path}" fill="none" stroke="#ff7a00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="#ffb36b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".15"/>
    <g>${dots}</g>
    <text x="${P}" y="${H-2}" class="axis">${fmtDate(data[0].label)}</text>
    <text x="${W-P}" y="${H-2}" class="axis" text-anchor="end">${fmtDate(data[data.length-1].label)}</text>
  </svg>`;
}

/* ============================================================
   MANEJO DE EVENTOS
   ============================================================ */
document.addEventListener('click', e => {
  /* cerrar el menú de usuario al hacer clic fuera de él */
  const menu = $('#user-menu');
  if(menu && menu.classList.contains('open') && !e.target.closest('.user-menu-wrap')){
    menu.classList.remove('open');
  }

  const el = e.target.closest('[data-action]');
  if(!el) return;
  const a = el.dataset.action;

  if(a === 'close-modal'){
    /* Cerrar solo si el toque fue directamente sobre el fondo oscuro o sobre
       un botón "Cancelar" dentro del modal. Los toques en los campos del
       formulario burbujean hasta el backdrop y no deben cerrar el modal. */
    if(el !== e.target && e.target.closest('.modal')) return;
    closeModal();
    return;
  }
  if(a === 'confirm-do'){
    if(window.__confirmCb){ const cb = window.__confirmCb; window.__confirmCb = null; cb(); }
    return;
  }
  if(a === 'tab'){ nav('#/' + el.dataset.route); return; }
  if(a === 'back'){ nav('#/workouts'); return; }
  if(a === 'toggle-section'){
    /* Plegar/desplegar una sección completa (oculta todos sus elementos de golpe) */
    const key = el.dataset.section;
    const body = $('#' + key + '-body');
    if(!body) return;
    const collapsed = !sectionCollapsed(key);
    setSectionCollapsed(key, collapsed);
    body.classList.toggle('hidden', collapsed);
    el.classList.toggle('collapsed', collapsed);
    el.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    return;
  }

  if(a === 'toggle-menu'){
    $('#user-menu').classList.toggle('open');
    return;
  }
  if(a === 'toggle-theme'){
    theme = theme === 'light' ? 'dark' : 'light';
    try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
    applyTheme();
    return;
  }
  if(a === 'logout'){ logout(); render(); return; }
  if(a === 'reset-data'){
    confirmModal('¿Borrar todos mis datos?', 'Esto elimina todos los entrenamientos, sesiones, récords y registros de peso de esta cuenta, en este dispositivo. No se puede deshacer.', 'Borrar todo', () => {
      dataFor(currentUser); // asegura que exista
      db.data[currentUser] = { workouts:[], sessions:[], prs:[], weights:[], photo:null };
      saveDB(); closeModal(); toast('Todos tus datos fueron borrados.', 'info'); render();
    });
    return;
  }

  if(a === 'start-session'){
    const s = startOrGetSession(el.dataset.id);
    if(s) nav('#/session/' + s.id);
    return;
  }
  if(a === 'new-workout'){ nav('#/editor/new'); return; }
  if(a === 'edit-workout'){
    /* Editar: los entrenamientos propios se editan directamente; los de la
       biblioteca del entrenador se copian a "Mis entrenamientos" (con sus
       series y repeticiones) para que el cliente pueda ajustarlas. */
    const id = el.dataset.id;
    const d = dataFor(currentUser);
    let w = d.workouts.find(x => x.id === id);
    if(!w){
      const lib = LIBRARY.find(x => x.id === id);
      if(lib){
        w = { ...lib, id: uid(), exercises: lib.exercises.map(e => ({ ...e, id: uid() })) };
        d.workouts.push(w);
        saveDB();
        toast('Copiado a "Mis entrenamientos" — ajusta las series y repeticiones.', 'info');
      }
    }
    if(w) nav('#/editor/' + w.id);
    return;
  }
  if(a === 'export-workout'){
    /* Exporta SOLO este entrenamiento (no todos): descarga el JSON en la web
       y, dentro de la APK, lo comparte con la hoja de Android (WhatsApp,
       Archivos, Drive…), porque el WebView de Capacitor no descarga <a download>. */
    const d = dataFor(currentUser);
    const w = d.workouts.find(x => x.id === el.dataset.id);
    if(!w){ toast('No se encontró el entrenamiento.', 'error'); return; }
    const payload = {
      app: 'drakotrack', type: 'workouts', version: 1, exported: todayISO(),
      workouts: [{
        name: w.name,
        exercises: w.exercises.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight ?? 0 })),
      }],
    };
    const json = JSON.stringify(payload, null, 2);
    const slug = w.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'entrenamiento';
    const filename = 'drakotrack-' + slug + '.json';
    if(window.DrakoShare && DrakoShare.shareFile){
      toast('Generando el archivo…');
      DrakoShare.shareFile(filename, json, 'application/json').then(res => {
        if(res === 'shared') toast('Archivo compartido — elige WhatsApp, Archivos o Drive.');
        else if(res === 'downloaded') toast('Archivo descargado — envíalo al entrenador.', 'info');
        else if(res === 'cancelled') toast('Compartición cancelada.', 'info');
      }).catch(() => toast('No se pudo exportar el archivo.', 'error'));
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Entrenamiento exportado — envía el archivo al entrenador.');
    return;
  }
  if(a === 'import-workouts' || a === 'import-workout'){ $('#import-workouts-input').click(); return; }
  if(a === 'delete-workout'){
    const id = el.dataset.id;
    confirmModal('¿Eliminar este entrenamiento?', 'Se conservan tus sesiones anteriores, pero este entrenamiento se eliminará.', 'Eliminar entrenamiento', () => {
      const d = dataFor(currentUser);
      d.workouts = d.workouts.filter(w => w.id !== id);
      saveDB(); closeModal(); toast('Entrenamiento eliminado.', 'info'); render();
    });
    return;
  }
  if(a === 'erase-lib'){
    const id = el.dataset.id;
    const w = LIBRARY.find(x => x.id === id);
    if(!w) return;
    confirmModal('¿Borrar «' + w.name + '» de la biblioteca?', 'Desaparece de la biblioteca. Tus sesiones anteriores de este entrenamiento se conservan. Podrás restaurarlo desde el botón «Ocultos» cuando quieras.', 'Borrar', () => {
      const d = dataFor(currentUser);
      if(!d.hiddenLib.includes(id)){ d.hiddenLib.push(id); saveDB(); }
      closeModal(); toast('Borrado de la biblioteca — restaurable en «Ocultos».', 'info'); render();
    });
    return;
  }
  if(a === 'open-hidden'){
    const d = dataFor(currentUser);
    const items = d.hiddenLib.map(id => LIBRARY.find(x => x.id === id)).filter(Boolean);
    openModal(`
      <h3>Entrenamientos ocultos (${items.length})</h3>
      <p class="modal-body">Aquí están los entrenamientos predefinidos que borraste. Restaura los que vuelvas a querer.</p>
      ${items.length ? `<div class="hist-list">${items.map(w => `
        <div class="hist-item">
          <span>${esc(w.name)}</span>
          <button class="btn btn-ghost btn-sm" data-action="restore-lib" data-id="${esc(w.id)}" type="button">Restaurar</button>
        </div>`).join('')}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" type="button">Cerrar</button>
        <button class="btn btn-primary" data-action="restore-all-lib" type="button">Restaurar todo</button>
      </div>` : '<div class="empty-state">Nada oculto por ahora.</div>'}`);
    return;
  }
  if(a === 'restore-lib'){
    const id = el.dataset.id;
    const d = dataFor(currentUser);
    d.hiddenLib = d.hiddenLib.filter(x => x !== id);
    saveDB(); closeModal(); toast('Entrenamiento restaurado.', 'info'); render();
    return;
  }
  if(a === 'restore-all-lib'){
    const d = dataFor(currentUser);
    d.hiddenLib = [];
    saveDB(); closeModal(); toast('Biblioteca restaurada.'); render();
    return;
  }
  if(a === 'sb-push'){ pushNow(true); return; }
  if(a === 'sb-export'){ exportCloudJSON(); return; }
  if(a === 'sb-pull'){
    confirmModal('¿Restaurar copia de la nube?', 'Se reemplazarán los datos actuales de este dispositivo por la última copia guardada en la nube. Esta acción no se puede deshacer.', 'Restaurar', () => {
      closeModal();
      pullRemote(true);
    });
    return;
  }
  if(a === 'save-rec-pass'){ saveRecoveredPassword(); return; }
  if(a === 'open-change-pass'){ openChangePass(); return; }
  if(a === 'save-change-pass'){ saveChangePass(); return; }
  if(a === 'open-program'){ nav('#/program/' + el.dataset.slug); return; }
  if(a === 'bc-cat'){
    bcCat = BC_CATS.some(c => c.k === el.dataset.cat) ? el.dataset.cat : 'all';
    renderBCList();
    return;
  }
  if(a === 'start-prog-session'){
    toast('Cargando el programa…');
    const parts = String(el.dataset.id).split(':'); /* bc:slug:vi:wi:di */
    DrakoBC.program(parts[1]).then(p => {
      const w = DrakoBC.buildWorkout(p, parts[1], Number(parts[2]), Number(parts[3]), Number(parts[4]));
      const d = dataFor(currentUser);
      const today = todayISO();
      let s = d.sessions.find(x => !x.finished && x.workoutId === w.id && x.date === today);
      if(!s) s = newSessionFor(w);
      state.sessionId = s.id;
      nav('#/session/' + s.id);
    }).catch(() => toast('No se pudo cargar el programa desde el catálogo.', 'error'));
    return;
  }

  if(a === 'toggle-ex'){
    const s = getSession(el.dataset.sid);
    if(!s) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex) return;
    ex.done = !ex.done;
    saveDB(); render();
    return;
  }
  if(a === 'finish-session'){
    const s = getSession(el.dataset.id);
    if(!s || sessionPct(s) !== 100) return;
    s.finished = true;
    saveDB();
    toast('¡Sesión registrada! Sigue con esa energía.');
    render();
    return;
  }
  if(a === 'restart-session'){
    const s = getSession(el.dataset.id);
    if(!s) return;
    const ns = startSessionFromPrevious(s);
    if(ns) nav('#/session/' + ns.id);
    else toast('No se pudo reiniciar la sesión.', 'error');
    return;
  }
  if(a === 'fill-last'){
    const sid = el.dataset.sid;
    const s = sid ? getSession(sid) : null;
    if(!s){ render(); return; }
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex){ return; }
    if('w' in el.dataset) ex.weight = el.dataset.w === '' ? '' : Number(el.dataset.w);
    if('r' in el.dataset) ex.reps = el.dataset.r === '' ? '' : Number(el.dataset.r);
    saveDB(); render();
    return;
  }
  if(a === 'open-session'){ nav('#/session/' + el.dataset.id); return; }
  if(a === 'bc-variation'){
    if(bcCurrent){ state.bc.vi = Number(el.dataset.i) || 0; state.bc.wi = 0; bcRenderBody(bcCurrentMeta, bcCurrent); }
    return;
  }
  if(a === 'bc-week'){
    if(bcCurrent && bcCurrent.vars[state.bc.vi]){
      const weeks = bcCurrent.vars[state.bc.vi].weeks;
      state.bc.wi = Math.min(Number(el.dataset.i) || 0, weeks.length - 1);
      bcRenderBody(bcCurrentMeta, bcCurrent);
    }
    return;
  }

  if(a === 'add-ex'){
    state.editor.exercises.push({ id: uid(), name:'', sets:3, reps:10, weight:'' });
    renderEditorRows();
    return;
  }
  if(a === 'del-ex'){
    state.editor.exercises.splice(Number(el.dataset.idx), 1);
    renderEditorRows();
    return;
  }
  if(a === 'save-workout'){
    const d = dataFor(currentUser);
    state.editor.name = ($('#ed-name') ? $('#ed-name').value : state.editor.name).trim().slice(0, LIMITS.name);
    const exercises = state.editor.exercises
      .slice(0, LIMITS.exercises)
      .filter(ex => (ex.name || '').trim())
      .map(ex => ({ ...ex, name: ex.name.trim().slice(0, LIMITS.name), sets: clampInt(ex.sets, LIMITS.sets, 3), reps: clampInt(ex.reps, LIMITS.reps, 10), weight: clampInt(ex.weight, LIMITS.kg, 0) }));
    if(!state.editor.name){ toast('Primero ponle nombre a tu entrenamiento.', 'error'); return; }
    if(!exercises.length){ toast('Añade al menos un ejercicio.', 'error'); return; }
    const existing = d.workouts.find(w => w.id === state.editor.id);
    const saved = { ...state.editor, name: state.editor.name, exercises };
    if(existing) Object.assign(existing, saved);
    else d.workouts.push(saved);
    saveDB();
    toast('Entrenamiento guardado.');
    nav('#/workouts');
    return;
  }

  if(a === 'log-pr'){ openPRModal(state.prExercise); return; }
  if(a === 'save-pr'){
    const exercise = $('#prf-exercise').value;
    const date = $('#prf-date').value;
    const weight = Number($('#prf-weight').value);
    const repsRaw = $('#prf-reps').value;
    if(!exercise){ toast('Elige un ejercicio.', 'error'); return; }
    if(!date){ toast('Elige una fecha.', 'error'); return; }
    if(!(weight > 0 && weight <= LIMITS.kg)){ toast('Introduce un peso válido entre 0 y ' + LIMITS.kg + ' kg.', 'error'); return; }
    const reps = repsRaw ? clampInt(repsRaw, LIMITS.reps, null) : null;
    if(repsRaw && reps === null){ toast('Introduce repeticiones válidas.', 'error'); return; }
    const d = dataFor(currentUser);
    d.prs.push({ id: uid(), exercise, date, weight, reps: repsRaw ? reps : null });
    saveDB();
    state.prExercise = exercise;
    closeModal();
    toast(`¡Nuevo récord! ${weight} kg`);
    render();
    return;
  }
  if(a === 'delete-pr'){
    const d = dataFor(currentUser);
    d.prs = d.prs.filter(p => p.id !== el.dataset.id);
    saveDB(); toast('Récord eliminado.', 'info'); render();
    return;
  }

  if(a === 'share-weight'){ shareWeightChart(); return; }
  if(a === 'share-pr'){ sharePRChart(); return; }
  if(a === 'add-weight'){
    const date = $('#w-date').value;
    const weight = Number($('#w-weight').value);
    if(!date){ toast('Elige una fecha.', 'error'); return; }
    if(!(weight > 0 && weight <= LIMITS.kg)){ toast('Introduce un peso válido entre 0 y ' + LIMITS.kg + ' kg.', 'error'); return; }
    const d = dataFor(currentUser);
    const existing = d.weights.find(w => w.date === date);
    const isUpdate = !!existing;
    if(existing) existing.weight = weight;
    else d.weights.push({ id: uid(), date, weight });
    d.weights.sort((x,y) => x.date.localeCompare(y.date));
    saveDB(); toast(isUpdate ? `Actualizado: ${weight} kg para ese día` : `Registrado: ${weight} kg`);
    render();
    return;
  }
  if(a === 'delete-weight'){
    const id = el.dataset.id;
    const d = dataFor(currentUser);
    const w = d.weights.find(x => x.id === id);
    if(!w) return;
    confirmModal('¿Eliminar este registro de peso?', `Se borrará el peso del ${fmtDateLong(w.date)} (${w.weight} kg) de este dispositivo.`, 'Eliminar registro', () => {
      d.weights = d.weights.filter(x => x.id !== id);
      saveDB(); closeModal(); toast('Registro de peso eliminado.', 'info'); render();
    });
    return;
  }
  if(a === 'change-photo'){ $('#photo-input').click(); return; }
  if(a === 'remove-photo'){
    dataFor(currentUser).photo = null;
    saveDB(); toast('Foto eliminada.', 'info'); render();
    return;
  }
});document.addEventListener('input', e => {
  const t = e.target;
  if(t.id === 'bc-search'){
    bcFilter = t.value;
    renderBCList();
    return;
  }
  if(t.dataset.session){
    const s = getSession(t.dataset.session);
    if(!s) return;
    const ex = s.exercises.find(x => x.id === t.dataset.ex);
    if(!ex) return;
    if(t.value === ''){
      ex[t.dataset.field] = '';
    } else {
      const n = Number(t.value);
      const cap = t.dataset.field === 'weight' ? LIMITS.kg : LIMITS.reps;
      ex[t.dataset.field] = isFinite(n) && n >= 0 ? Math.min(cap, n) : '';
    }
    saveDB();
    refreshSessionProgress(s.id);
    return;
  }
  if(t.dataset.bind){
    if(t.tagName === 'TEXTAREA') autoGrow(t);
    const idx = t.dataset.idx;
    if(idx !== undefined){
      const ex = state.editor.exercises[Number(idx)];
      if(!ex) return;
      const f = t.dataset.field;
      ex[f] = (f === 'sets' || f === 'reps' || f === 'weight') ? (t.value === '' ? '' : Number(t.value)) : t.value;
    } else if(t.dataset.bind === 'name'){
      state.editor.name = t.value;
    }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if(t.id === 'pr-select'){
    state.prExercise = t.value;
    render();
  }
  if(t.id === 'import-workouts-input' && t.files && t.files[0]){
    const file = t.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(String(reader.result));
        let list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.workouts) ? parsed.workouts : null);
        if(!list) throw new Error('formato');
        if(list.length > LIMITS.workouts){ list = list.slice(0, LIMITS.workouts); toast('El archivo tenía demasiados entrenamientos — se importaron los primeros ' + LIMITS.workouts + '.', 'info'); }
        const d = dataFor(currentUser);
        if(d.workouts.length >= LIMITS.workouts){ toast('Ya tienes demasiados entrenamientos guardados.', 'error'); return; }
        let added = 0, updated = 0;
        list.forEach(w => {
          if(!w || typeof w.name !== 'string' || !w.name.trim()) return;
          const name = w.name.trim().slice(0, LIMITS.name);
          const exs = (Array.isArray(w.exercises) ? w.exercises : [])
            .filter(e => e && typeof e.name === 'string' && e.name.trim())
            .map(e => ({ id: uid(), name: e.name.trim().slice(0, LIMITS.name), sets: clampInt(e.sets, LIMITS.sets, 1), reps: clampInt(e.reps, LIMITS.reps, 1), weight: clampInt(e.weight, LIMITS.kg, 0) }));
          if(!exs.length) return;
          const existing = d.workouts.find(x => x.name.toLowerCase() === name.toLowerCase());
          if(existing){ existing.exercises = exs; updated++; }
          else{ d.workouts.push({ id: uid(), name, exercises: exs }); added++; }
        });
        if(added || updated){
          saveDB();
          toast(added && updated ? `${added} importados · ${updated} actualizados.` : added ? `${added} entrenamiento(s) importados.` : `${updated} entrenamiento(s) actualizados.`);
          render();
        }else{
          toast('No se encontraron entrenamientos válidos en el archivo.', 'error');
        }
      }catch(err){
        toast('Ese archivo no es válido — exporta desde DrakoTrack y vuelve a intentarlo.', 'error');
      }
    };
    reader.onerror = () => toast('No se pudo leer el archivo.', 'error');
    reader.readAsText(file);
    t.value = '';
    return;
  }
  if(t.id === 'photo-input' && t.files && t.files[0]){
    const file = t.files[0];
    if(!file.type.startsWith('image/')){ toast('Elige un archivo de imagen.', 'error'); return; }
    compressImage(file).then(dataUrl => {
      dataFor(currentUser).photo = dataUrl;
      saveDB();
      toast('Foto de referencia guardada.');
      render();
    }).catch(() => toast('No se pudo leer esa imagen.', 'error'));
    t.value = '';
  }
});

document.addEventListener('submit', async e => {
  const form = e.target;
  if(form.id === 'auth-form'){
    e.preventDefault();
    const mode = state.authMode;
    const u = $('#auth-user').value;
    const p = $('#auth-pass').value;

    if(mode === 'cloud'){
      const mail = u.trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ showAuthError('Introduce un correo válido.'); return; }
      if(p.length < 6){ showAuthError('La contraseña debe tener al menos 6 caracteres.'); return; }
      const btn = $('#auth-submit'); btn.disabled = true;
      const err = state.cloudSignup ? await DrakoSB.signUp(mail, p) : await DrakoSB.signIn(mail, p);
      btn.disabled = false;
      if(typeof err === 'string' && err){ showAuthError(err); return; }
      if(state.cloudSignup && err && err.needsConfirm){
        state.cloudSignup = false;
        setAuthMode('cloud');
        form.reset();
        toast('Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión.', 'info');
        return;
      }
      if(err !== null && typeof err !== 'object'){ showAuthError('No se pudo iniciar sesión.'); return; }
      $('#auth-err').classList.add('hidden');
      form.reset();
      if(state.cloudSignup){ state.cloudSignup = false; setAuthMode('cloud'); toast('¡Cuenta en la nube creada!'); }
      else toast('¡Hola de nuevo, ' + mail + '!');
      await enterCloud(mail);
      return;
    }

    if(mode === 'forgot'){
      const mail = u.trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ showAuthError('Introduce un correo válido.'); return; }
      const btn = $('#auth-submit'); btn.disabled = true;
      const err = await DrakoSB.recover(mail);
      btn.disabled = false;
      if(err){ showAuthError(err); return; }
      $('#auth-err').classList.add('hidden');
      form.reset();
      toast('Si ese correo existe, recibirás un enlace para restablecer tu contraseña.', 'info');
      state.cloudSignup = false;
      setAuthMode('cloud');
      return;
    }

    const err = mode === 'signup' ? await signup(u, p) : await login(u, p);
    if(err){ showAuthError(err); return; }
    $('#auth-err').classList.add('hidden');
    form.reset();
    toast(mode === 'signup' ? '¡Cuenta creada! Bienvenido, ' + currentUser + '.' : '¡Hola de nuevo, ' + currentUser + '!');
    render();
  }
});

/* Pestañas y modos de la pantalla de acceso (local / nube / recuperación) */
function setAuthMode(mode){
  state.authMode = mode;
  $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.auth === mode));
  const errBox = $('#auth-err'); if(errBox) errBox.classList.add('hidden');
  const submit = $('#auth-submit'); if(!submit) return;
  const userLabel = $('#auth-user-label'), userInput = $('#auth-user');
  const passField = $('#auth-pass-field'), passInput = $('#auth-pass');
  const cloudExtra = $('#cloud-extra');
  const forgotBtn = cloudExtra ? cloudExtra.querySelector('[data-auth-alt="forgot"]') : null;
  if(forgotBtn) forgotBtn.classList.remove('hidden');
  if(mode === 'signup'){
    submit.textContent = 'Crear cuenta';
    userLabel.textContent = 'Usuario'; userInput.placeholder = 'p. ej. entrenador_marco'; userInput.autocomplete = 'username';
    passInput.autocomplete = 'new-password';
    passField.classList.remove('hidden'); cloudExtra.classList.add('hidden');
  } else if(mode === 'login'){
    submit.textContent = 'Iniciar sesión';
    userLabel.textContent = 'Usuario'; userInput.placeholder = 'p. ej. entrenador_marco'; userInput.autocomplete = 'username';
    passInput.autocomplete = 'current-password';
    passField.classList.remove('hidden'); cloudExtra.classList.add('hidden');
  } else if(mode === 'cloud'){
    submit.textContent = state.cloudSignup ? 'Crear cuenta en la nube' : 'Entrar con la nube';
    userLabel.textContent = 'Correo'; userInput.placeholder = 'tu@correo.com'; userInput.autocomplete = 'email';
    passInput.autocomplete = state.cloudSignup ? 'new-password' : 'current-password';
    passField.classList.remove('hidden');
    cloudExtra.classList.remove('hidden');
    const toggle = $('#cloud-toggle');
    if(toggle) toggle.textContent = state.cloudSignup ? 'Ya tengo cuenta en la nube' : '¿No tienes cuenta en la nube? Crear cuenta';
  } else if(mode === 'forgot'){
    submit.textContent = 'Enviar enlace de recuperación';
    userLabel.textContent = 'Correo'; userInput.placeholder = 'tu@correo.com'; userInput.autocomplete = 'email';
    passField.classList.add('hidden');
    cloudExtra.classList.remove('hidden');
    if(forgotBtn) forgotBtn.classList.add('hidden');
  }
}
document.addEventListener('click', e => {
  const alt = e.target.closest('[data-auth-alt]');
  if(alt){
    const kind = alt.dataset.authAlt;
    if(kind === 'cloud-signup'){ state.cloudSignup = !state.cloudSignup; setAuthMode('cloud'); }
    else if(kind === 'forgot'){ state.cloudSignup = false; setAuthMode('forgot'); }
    return;
  }
  const tab = e.target.closest('.auth-tab');
  if(tab){ state.cloudSignup = false; setAuthMode(tab.dataset.auth); }
});
function showAuthError(msg){
  const box = $('#auth-err');
  box.textContent = msg;
  box.classList.remove('hidden');
}

/* ---------------- Inicialización ---------------- */
applyTheme();
window.addEventListener('hashchange', render);
(async function boot(){
  /* ¿Volvió de un enlace de recuperación de contraseña? */
  const rec = parseRecoveryHash();
  if(rec){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    window.__recToken = rec.access_token;
    openModal(`
      <h3>Elige una contraseña nueva</h3>
      <div class="form">
        <label class="field"><span>Nueva contraseña</span><input type="password" id="rec-pass" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
        <label class="field"><span>Repite la contraseña</span><input type="password" id="rec-pass2" autocomplete="new-password"></label>
      </div>
      <div id="rec-err" class="auth-err hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
        <button class="btn btn-primary" data-action="save-rec-pass" type="button">Guardar contraseña</button>
      </div>`);
    render();
    return;
  }
  /* ¿Hay una sesión de nube guardada? Restaurarla automáticamente */
  const s = DrakoSB.loadSession();
  if(s && DrakoSB.hasSession() && DrakoSB.email()){
    currentUser = DrakoSB.email();
    localStorage.setItem(SESSION_KEY, currentUser);
    dataFor(currentUser);
    render();
    DrakoSB.refresh().then(ok => {
      if(!ok) return;
      pullRemote(false).then(() => { if(currentUser) render(); });
    });
  } else {
    render();
  }
})();
