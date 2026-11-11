/* ============================================================
   DrakoTrack — seguimiento de entrenamiento
   SPA en JavaScript puro. Todos los datos se guardan en
   localStorage de cada dispositivo.
   ============================================================ */
'use strict';

/* ---------------- Constantes ---------------- */
const DB_KEY = 'draktrack_v1';
const SESSION_KEY = 'draktrack_session_v1';

/* Información legal: versión del consentimiento que se registra en la cuenta */
const LEGAL_VERSION = '2026-11-01';
const LEGAL_PAGE = 'legal.html';

/* Icono de mancuerna (SVG) para las tarjetas de entrenamiento */
const DUMBBELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M7 7v10"/><path d="M17 7v10"/><path d="M4.5 9.5v5"/><path d="M19.5 9.5v5"/><path d="M7 12h10"/></svg>';

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

/* ============================================================
   BIBLIOTECA DE EJERCICIOS (v2)
   Cada ejercicio tiene un `id` estable que NUNCA cambia: renombrar
   el nombre visible no rompe el historial, los récords ni las
   plantillas. Los `aliases` permiten reconocer el mismo ejercicio
   escrito de otra forma (RDL, bench press, OHP…).
   ============================================================ */
const MUSCLE_GROUPS = [
  { id:'pecho', label:'Pecho' },
  { id:'espalda', label:'Espalda' },
  { id:'piernas', label:'Piernas' },
  { id:'hombros', label:'Hombros' },
  { id:'biceps', label:'Bíceps' },
  { id:'triceps', label:'Tríceps' },
  { id:'core', label:'Core' },
  { id:'cuerpo-completo', label:'Cuerpo completo' },
];
const EQUIPMENT = [
  { id:'barra', label:'Barra' },
  { id:'mancuernas', label:'Mancuernas' },
  { id:'maquina', label:'Máquina' },
  { id:'polea', label:'Polea' },
  { id:'peso-corporal', label:'Peso corporal' },
  { id:'kettlebell', label:'Kettlebell' },
  { id:'banda', label:'Banda' },
];
const EXERCISE_CATALOG = [
  { id:'press-de-banca', name:'Press de banca', group:'pecho', equip:'barra', aliases:['press banca','bench press','banca plana','press de banca con barra'] },
  { id:'press-inclinado-mancuernas', name:'Press inclinado con mancuernas', group:'pecho', equip:'mancuernas', aliases:['press inclinado','incline press','press inclinado con mancuerna'] },
  { id:'press-declinado', name:'Press declinado', group:'pecho', equip:'barra', aliases:['press declinado','decline press'] },
  { id:'fondos-paralelas', name:'Fondos en paralelas', group:'pecho', equip:'peso-corporal', aliases:['dips','fondos','paralelas','fondos en paralela'] },
  { id:'aperturas-mancuernas', name:'Aperturas con mancuernas', group:'pecho', equip:'mancuernas', aliases:['aperturas','flyes','aperturas planas'] },
  { id:'press-en-maquina', name:'Press en máquina', group:'pecho', equip:'maquina', aliases:['chest press','press pecho maquina'] },
  { id:'flexiones', name:'Flexiones', group:'pecho', equip:'peso-corporal', aliases:['push ups','pushups','lagartijas'] },
  { id:'peso-muerto', name:'Peso muerto', group:'espalda', equip:'barra', aliases:['deadlift','pm','peso muerto convencional'] },
  { id:'dominadas', name:'Dominadas', group:'espalda', equip:'peso-corporal', aliases:['pull ups','pullups','dominada','dominadas pronas'] },
  { id:'remo-con-barra', name:'Remo con barra', group:'espalda', equip:'barra', aliases:['barbell row','remo','remo barbell'] },
  { id:'remo-con-mancuerna', name:'Remo con mancuerna', group:'espalda', equip:'mancuernas', aliases:['dumbbell row','remo unilateral','remo a una mano'] },
  { id:'jalon-al-pecho', name:'Jalón al pecho', group:'espalda', equip:'polea', aliases:['lat pulldown','jalon','jalón','jalon al pecho'] },
  { id:'jalon-facial', name:'Jalón facial', group:'espalda', equip:'polea', aliases:['face pull','facepull','face pulls'] },
  { id:'remo-en-polea', name:'Remo en polea baja', group:'espalda', equip:'polea', aliases:['seated row','remo sentado','remo polea'] },
  { id:'pull-over', name:'Pull-over', group:'espalda', equip:'polea', aliases:['pullover','pull over'] },
  { id:'sentadilla-trasera', name:'Sentadilla trasera', group:'piernas', equip:'barra', aliases:['back squat','sentadilla','squat','sentadilla con barra'] },
  { id:'sentadilla-frontal', name:'Sentadilla frontal', group:'piernas', equip:'barra', aliases:['front squat','sentadilla con barra al frente'] },
  { id:'prensa-de-piernas', name:'Prensa de piernas', group:'piernas', equip:'maquina', aliases:['leg press','prensa','prensa 45'] },
  { id:'peso-muerto-rumano', name:'Peso muerto rumano', group:'piernas', equip:'barra', aliases:['rdl','pm rumano','rumano','peso muerto rumano con barra'] },
  { id:'curl-femoral', name:'Curl femoral', group:'piernas', equip:'maquina', aliases:['leg curl','femoral','curl femoral tumbado'] },
  { id:'extension-cuadriceps', name:'Extensión de cuádriceps', group:'piernas', equip:'maquina', aliases:['leg extension','cuadriceps','extension de cuadriceps'] },
  { id:'zancadas-caminando', name:'Zancadas caminando', group:'piernas', equip:'mancuernas', aliases:['lunges','zancadas','paso de zancada'] },
  { id:'hip-thrust', name:'Hip thrust', group:'piernas', equip:'barra', aliases:['empuje de cadera','glute bridge con barra','puente de gluteo'] },
  { id:'elevaciones-gemelos', name:'Elevaciones de gemelos', group:'piernas', equip:'maquina', aliases:['calf raise','gemelos','pantorrillas'] },
  { id:'sentadilla-bulgara', name:'Sentadilla búlgara', group:'piernas', equip:'mancuernas', aliases:['bulgarian split squat','bulgara'] },
  { id:'press-militar', name:'Press militar', group:'hombros', equip:'barra', aliases:['ohp','military press','press de hombros','press hombros'] },
  { id:'press-hombro-mancuernas', name:'Press de hombros con mancuernas', group:'hombros', equip:'mancuernas', aliases:['dumbbell shoulder press','press mancuernas hombro','press sentado con mancuernas'] },
  { id:'elevaciones-laterales', name:'Elevaciones laterales', group:'hombros', equip:'mancuernas', aliases:['laterales','lateral raise','elevaciones laterales con mancuernas'] },
  { id:'elevaciones-frontales', name:'Elevaciones frontales', group:'hombros', equip:'mancuernas', aliases:['front raise','frontales'] },
  { id:'pajaros', name:'Pájaros', group:'hombros', equip:'mancuernas', aliases:['rear delt fly','deltoide posterior','pajaros'] },
  { id:'curl-biceps', name:'Curl de bíceps', group:'biceps', equip:'barra', aliases:['curl','bicep curl','curl barra','curl de biceps con barra'] },
  { id:'curl-barra-z', name:'Curl con barra Z', group:'biceps', equip:'barra', aliases:['curl z','curl ez','curl con barra z'] },
  { id:'curl-martillo', name:'Curl martillo', group:'biceps', equip:'mancuernas', aliases:['hammer curl','martillo','curl martillo con mancuernas'] },
  { id:'curl-inclinado', name:'Curl inclinado', group:'biceps', equip:'mancuernas', aliases:['incline curl','curl banco inclinado'] },
  { id:'curl-en-polea', name:'Curl en polea', group:'biceps', equip:'polea', aliases:['cable curl','curl polea baja'] },
  { id:'extension-triceps-polea', name:'Extensión de tríceps en polea', group:'triceps', equip:'polea', aliases:['pushdown','triceps pushdown','extension triceps polea alta','triceps polea'] },
  { id:'extension-triceps-tumbado', name:'Extensión de tríceps tumbado', group:'triceps', equip:'barra', aliases:['skull crusher','press frances','extension triceps tumbado'] },
  { id:'fondos-en-banco', name:'Fondos en banco', group:'triceps', equip:'peso-corporal', aliases:['bench dips','fondos banco'] },
  { id:'patada-triceps', name:'Patada de tríceps', group:'triceps', equip:'mancuernas', aliases:['kickback','patadas de triceps'] },
  { id:'plancha', name:'Plancha', group:'core', equip:'peso-corporal', aliases:['plank','plancha abdominal'] },
  { id:'abdominales', name:'Abdominales', group:'core', equip:'peso-corporal', aliases:['crunch','crunches','abdominales'] },
  { id:'elevaciones-de-piernas', name:'Elevaciones de piernas', group:'core', equip:'peso-corporal', aliases:['leg raise','leg raises','elevacion de piernas'] },
  { id:'giro-ruso', name:'Giro ruso', group:'core', equip:'mancuernas', aliases:['russian twist','giros rusos'] },
  { id:'escaladores', name:'Escaladores', group:'core', equip:'peso-corporal', aliases:['mountain climbers','escalador'] },
  { id:'cargada-de-potencia', name:'Cargada de potencia', group:'cuerpo-completo', equip:'barra', aliases:['power clean','cargada'] },
  { id:'thruster', name:'Thruster', group:'cuerpo-completo', equip:'mancuernas', aliases:['thrusters','sentadilla con press'] },
  { id:'swing-kettlebell', name:'Swing con kettlebell', group:'cuerpo-completo', equip:'kettlebell', aliases:['kb swing','swing','swing con pesa rusa'] },
  { id:'burpee', name:'Burpee', group:'cuerpo-completo', equip:'peso-corporal', aliases:['burpees'] },
];
const CUSTOM_PREFIX = 'custom:';

/* Diccionario muscular publicado. Es la fuente única para el mapa: no se
   deduce el músculo desde el grupo antiguo de la biblioteca. */
const MUSCLE_DICT_URL = 'data/muscles.json?v=2';
const MUSCLE_PRIMARY_WEIGHT = 1;
const MUSCLE_SECONDARY_WEIGHT = 0.5;
let MUSCLE_DICT = null;
let MUSCLE_DICT_STATE = 'idle';
let MUSCLE_DICT_PROMISE = null;

/* Normaliza texto para comparar: sin acentos, sin mayúsculas, sin signos.
   «Press de banca» y «press  de BANCA» deben encontrar lo mismo. */
function foldText(s){
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function slugify(s){
  return foldText(s).replace(/ /g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function groupLabel(id){
  const g = MUSCLE_GROUPS.find(x => x.id === id);
  if(g) return g.label;
  return MUSCLE_DICT && MUSCLE_DICT.groups && MUSCLE_DICT.groups[id] ? MUSCLE_DICT.groups[id] : '';
}
function equipLabel(id){ const e = EQUIPMENT.find(x => x.id === id); return e ? e.label : ''; }
function groupOptions(sel, allLabel){
  const head = allLabel === false
    ? '<option value="">Sin grupo</option>'
    : '<option value="">Todos los grupos</option>';
  return head + MUSCLE_GROUPS.map(g => `<option value="${g.id}"${g.id === sel ? ' selected' : ''}>${esc(g.label)}</option>`).join('');
}
function equipOptions(sel, allLabel){
  const head = allLabel === false
    ? '<option value="">Sin material</option>'
    : '<option value="">Todo el material</option>';
  return head + EQUIPMENT.map(e => `<option value="${e.id}"${e.id === sel ? ' selected' : ''}>${esc(e.label)}</option>`).join('');
}
/* Ejercicios propios del usuario (se guardan junto a sus datos). */
function userExercises(d){ return (d && Array.isArray(d.exercises)) ? d.exercises : []; }
function customExerciseEntry(x){
  return {
    id: x.id, name: x.name, group: x.group || '', equip: x.equip || '',
    aliases: Array.isArray(x.aliases) ? x.aliases : [], custom: true,
  };
}
function allExerciseEntries(d){
  return EXERCISE_CATALOG.concat(userExercises(d).map(customExerciseEntry));
}
function findExercise(id, d){
  if(!id) return null;
  if(id.indexOf(CUSTOM_PREFIX) === 0){
    const own = userExercises(d).find(x => x.id === id);
    return own ? customExerciseEntry(own) : null;
  }
  return EXERCISE_CATALOG.find(x => x.id === id) || null;
}
/* Índice nombre→id (incluye alias). Se reconstruye solo si cambia la biblioteca. */
let _exIndex = null, _exIndexSig = '';
function exerciseIndex(d){
  const entries = allExerciseEntries(d);
  const sig = entries.length + '|' + entries.map(x => x.id + '~' + x.name + '~' + (x.aliases || []).join(',')).join(';');
  if(_exIndex && _exIndexSig === sig) return _exIndex;
  const map = new Map();
  entries.forEach(x => {
    [x.name].concat(x.aliases || []).forEach(n => {
      const k = foldText(n);
      if(k && !map.has(k)) map.set(k, x.id);
    });
  });
  _exIndex = map; _exIndexSig = sig;
  return map;
}
/* Identificador estable a partir de un nombre. Si el nombre no está en la
   biblioteca se deriva del propio texto (determinista): el mismo nombre
   resuelve siempre al mismo id, aunque se recargue la página. */
function resolveExerciseId(name, d){
  const key = foldText(name);
  if(!key) return '';
  const found = exerciseIndex(d).get(key);
  if(found) return found;
  return CUSTOM_PREFIX + (slugify(name) || 'ejercicio');
}
/* Clave estable de un ejercicio: su id si lo tiene y, si no, el que le
   corresponde por nombre o alias. Agrupa récords e historial aunque el
   nombre visible cambie o se escriba de otra forma. */
function exKeyOf(ex, d){
  if(!ex) return '';
  if(ex.exId) return ex.exId;
  return resolveExerciseId(ex.name, d);
}
function prKey(p, d){
  if(!p) return '';
  if(p.exId) return p.exId;
  return resolveExerciseId(p.exercise, d);
}
/* Ejercicios con identidad estable presentes en los datos del usuario.
   Se usa en el selector de récords: cada opción vale el id, no el nombre. */
function exerciseOptions(d){
  const map = new Map();
  const add = (name, exId) => {
    if(!name && !exId) return;
    const key = exId || resolveExerciseId(name, d);
    if(!key || map.has(key)) return;
    const entry = findExercise(key, d);
    map.set(key, { id: key, name: entry ? entry.name : String(name || key).trim() });
  };
  LIBRARY.forEach(w => (w.exercises || []).forEach(e => add(e.name)));
  ((d && d.workouts) || []).forEach(w => (w.exercises || []).forEach(e => add(e.name, e.exId)));
  ((d && d.prs) || []).forEach(p => add(p.exercise, p.exId));
  ((d && d.sessions) || []).forEach(s => (s.exercises || []).forEach(e => add(e.name, e.exId)));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
function exerciseEntryFor(ex, d){
  const byId = ex && ex.exId ? findExercise(ex.exId, d) : null;
  return byId || findExercise(resolveExerciseId(ex && ex.name, d), d) || null;
}
/* Filtros combinables: texto (nombre o alias, sin acentos), grupo y material. */
function filterExercises(d, query, group, equip){
  const q = foldText(query);
  return allExerciseEntries(d).filter(x => {
    if(group && x.group !== group) return false;
    if(equip && x.equip !== equip) return false;
    if(!q) return true;
    return [x.name].concat(x.aliases || []).some(n => foldText(n).indexOf(q) >= 0);
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/* ---------------- Diccionario muscular publicado ---------------- */
/* La normalización es la misma que usa scripts/muscle-coverage.mjs:
   minúsculas, sin acentos, sin paréntesis de equipamiento, sin material y
   con los signos convertidos en espacios. */
function normalizeMuscleName(name){
  let s = String(name == null ? '' : name);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\b(barbell|dumbbells?|cable|machine|ez[-\s]?bar|smith machine|kettlebells?|bands?|bodyweight|landmine|trap bar|hex bar)\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
function muscleDictEntry(names){
  if(!MUSCLE_DICT) return null;
  for(const name of names || []){
    const key = normalizeMuscleName(name);
    if(key && MUSCLE_DICT.exercises[key]) return MUSCLE_DICT.exercises[key];
  }
  return null;
}
function muscleEntryForExercise(ex, d){
  if(!MUSCLE_DICT || !ex) return null;
  const entry = exerciseEntryFor(ex, d);
  const names = [ex.name, entry && entry.name].concat((entry && entry.aliases) || []);
  return muscleDictEntry(names);
}
/* Reparte una unidad (una serie, un kilo de volumen) entre los músculos que
   publica el diccionario. Primario pesa 1 y secundario 0,5; después se
   normaliza para que la suma sea exactamente 1 y no se duplique volumen. */
function muscleShares(entry){
  if(!MUSCLE_DICT || !entry) return [];
  const raw = [];
  (entry.primary || []).forEach(id => {
    if(MUSCLE_DICT.groups[id]) raw.push({ id, weight: MUSCLE_PRIMARY_WEIGHT, role: 'primary' });
  });
  (entry.secondary || []).forEach(id => {
    if(MUSCLE_DICT.groups[id] && !raw.some(x => x.id === id)) raw.push({ id, weight: MUSCLE_SECONDARY_WEIGHT, role: 'secondary' });
  });
  const total = raw.reduce((n, x) => n + x.weight, 0);
  return total ? raw.map(x => ({ id: x.id, weight: x.weight / total, role: x.role })) : [];
}
function muscleBreakdownForExercise(ex, d){
  return muscleShares(muscleEntryForExercise(ex, d));
}
function muscleBreakdownForKey(key, d){
  if(!MUSCLE_DICT || !key) return [];
  const entry = findExercise(key, d);
  if(entry) return muscleShares(muscleDictEntry([entry.name].concat(entry.aliases || [])));
  const raw = String(key).replace(/^custom:/, '').replace(/-/g, ' ');
  return muscleShares(muscleDictEntry([raw]));
}
function refreshMuscleViews(){
  if(!currentUser) return;
  const route = parseHash().route;
  if(route === 'progress' || route === 'analytics') render();
}
function loadMuscleDictionary(){
  if(MUSCLE_DICT_STATE === 'ready') return Promise.resolve(true);
  if(MUSCLE_DICT_PROMISE) return MUSCLE_DICT_PROMISE;
  if(typeof fetch !== 'function'){
    MUSCLE_DICT_STATE = 'error';
    return Promise.resolve(false);
  }
  MUSCLE_DICT_STATE = 'loading';
  MUSCLE_DICT_PROMISE = fetch(MUSCLE_DICT_URL, { credentials: 'same-origin' })
    .then(res => {
      if(!res || !res.ok) throw new Error('muscle_dictionary_unavailable');
      return res.json();
    })
    .then(raw => {
      if(!raw || !raw.groups || !raw.exercises) throw new Error('muscle_dictionary_invalid');
      MUSCLE_DICT = {
        version: raw.version,
        updated: raw.updated,
        groups: raw.groups,
        patterns: raw.patterns || {},
        exercises: raw.exercises,
      };
      MUSCLE_DICT_STATE = 'ready';
      try{ if(window.AN && window.AN.clearCache) window.AN.clearCache(); }catch(e){}
      refreshMuscleViews();
      return true;
    })
    .catch(() => {
      MUSCLE_DICT_STATE = 'error';
      MUSCLE_DICT_PROMISE = null;
      refreshMuscleViews();
      return false;
    });
  return MUSCLE_DICT_PROMISE;
}
/* Un fallo de red no debe dejar el mapa bloqueado hasta recargar. */
function retryMuscleDictionary(){
  if(MUSCLE_DICT_STATE === 'loading') return false;
  MUSCLE_DICT = null;
  MUSCLE_DICT_STATE = 'idle';
  MUSCLE_DICT_PROMISE = null;
  refreshMuscleViews();
  loadMuscleDictionary();
  return true;
}

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
/* Programa Boostcamp elegido por última vez: se recuerda por cuenta y se ancla
   arriba en «Entrenamientos» para no tener que buscarlo cada vez. */
function uiUserKey(){ return currentUser || ''; }
function getLastProgram(){
  const m = (uiState.bcLast && typeof uiState.bcLast === 'object') ? uiState.bcLast : {};
  const v = m[uiUserKey()];
  return v && v.slug ? v : null;
}
function setLastProgram(v){
  if(!uiState.bcLast || typeof uiState.bcLast !== 'object') uiState.bcLast = {};
  uiState.bcLast[uiUserKey()] = v;
  try{ localStorage.setItem(UI_KEY, JSON.stringify(uiState)); }catch(e){}
}
function clearLastProgram(){
  if(uiState.bcLast && uiState.bcLast[uiUserKey()]){
    delete uiState.bcLast[uiUserKey()];
    try{ localStorage.setItem(UI_KEY, JSON.stringify(uiState)); }catch(e){}
  }
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

/* El tema vive en localStorage para pintar antes de iniciar sesión y en
   d.prefs para que siga a la cuenta en otros dispositivos. */
function syncAccountTheme(){
  if(!currentUser) return;
  const d = dataFor(currentUser);
  const t = d && d.prefs ? d.prefs.theme : null;
  if((t === 'light' || t === 'dark') && t !== theme){ theme = t; applyTheme(); }
}
function setTheme(v){
  theme = v === 'light' ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
  if(currentUser){
    const d = dataFor(currentUser);
    if(d){
      if(!d.prefs || typeof d.prefs !== 'object') d.prefs = {};
      d.prefs.theme = theme;
      saveDB();
    }
  }
  applyTheme();
  render();
}

/* ---------------- Estado y almacenamiento ---------------- */
let db = loadDB();
let currentUser = localStorage.getItem(SESSION_KEY) || null;
const state = { sessionId:null, editor:null, prExercise:null, onb:null, authMode:'login', sb:{ status:'idle', last:null, timer:null, retry:null, attempts:0, applying:false } };

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return { users:{}, data:{} };
    return JSON.parse(raw);
  }catch(e){ return { users:{}, data:{} }; }
}
let _storageWarned = false;
/* Escribe el documento sin tocar la nube. Se usa también al aplicar una
   combinación remota, para no reenviar lo que acaba de llegar. */
function persistLocal(){
  const result = Offline.writeDocument(localStorage, DB_KEY, JSON.stringify(db));
  if(!result.ok){ markStorageError(result); return false; }
  clearStorageError();
  return true;
}
function saveDB(){
  persistLocal();
  scheduleCloudSync();
}

/* ---------------- Cuenta en la nube (Supabase) ----------------
   Cada guardado viaja con la revisión del servidor sobre la que se construyó.
   Si otro dispositivo guardó antes, el servidor responde 409 y aquí se combinan
   los cambios por identificador estable en vez de reemplazar el perfil entero.
   Los pendientes viven en localStorage: sobreviven a cerrar la aplicación. */
function isCloud(){
  return !!(window.DrakoSB && DrakoSB.hasSession() && DrakoSB.email() === currentUser);
}
const syncStore = {
  get(key){ try{ return localStorage.getItem(key); }catch(e){ return null; } },
  set(key, value){ try{ localStorage.setItem(key, value); }catch(e){ throw e; } },
  remove(key){ try{ localStorage.removeItem(key); }catch(e){} },
};
/* Prompt 8: cola persistente y estado de conexión. El motor de sync sigue
   siendo la fuente de verdad; la cola programa y audita los intentos. */
const opQueue = Offline.createQueue({ storage: syncStore });
const offlineState = {
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  checking: null, lastCheck: 0, installPrompt: null, updateReady: false,
  deferredUpdate: false, storageError: false, sw: null, refreshing: false,
};
const SW_ROLLBACK_KEY = 'draktrack_sw_rollback_done_v1';
const SW_CACHE_PREFIX = 'drakotrack-';
const cloudSync = window.DrakoSync.createEngine({
  storage: syncStore,
  remote: {
    load: () => DrakoSB.loadData(),
    save: (doc, baseRev, opId) => DrakoSB.saveData(doc, baseRev, opId),
  },
});
function syncState(){ return currentUser ? cloudSync.state(currentUser) : null; }
function syncConflicts(){ const st = syncState(); return st && Array.isArray(st.conflicts) ? st.conflicts : []; }
function syncPending(){ const st = syncState(); return !!(st && st.dirty); }

/* Aplica un documento que viene del servidor. Guarda antes la copia local en
   el espacio de seguridad del motor (una sola, se reemplaza). */
function applyRemoteDoc(doc){
  if(!currentUser || !doc || typeof doc !== 'object') return false;
  const account = currentUser;
  cloudSync.backup(account, db.data[account] || {});
  state.sb.applying = true;
  db.data[account] = doc;
  try{ migrateAllData(); }finally{ state.sb.applying = false; }
  persistLocal();
  render();
  return true;
}

/* Encola una sincronización sin marcar cambios: sirve para reintentar lo que
   quedó pendiente cuando una petición en vuelo terminó después de un guardado. */
function queueSync(delay){
  if(!isCloud() || state.sb.applying) return;
  if(state.sb.timer) clearTimeout(state.sb.timer);
  state.sb.timer = setTimeout(() => { state.sb.timer = null; runSync(false); }, delay == null ? 1500 : delay);
}
function scheduleCloudSync(){
  if(!isCloud() || state.sb.applying) return;
  const st = cloudSync.markDirty(currentUser);
  enqueueSyncJob(currentUser, st, 'local-change');
  queueSync();
  renderHeader();
}
function syncFailed(notify, jobId){
  state.sb.status = 'offline';
  state.sb.attempts = (state.sb.attempts || 0) + 1;
  let delay = Math.min(30000, Math.pow(2, state.sb.attempts) * 2000);
  try{ if(jobId){ const queued = opQueue.retry(jobId, 'network'); if(queued && queued.nextAt) delay = Math.max(1000, queued.nextAt - Date.now()); } }catch(e){}
  if(state.sb.retry) clearTimeout(state.sb.retry);
  state.sb.retry = setTimeout(() => { state.sb.retry = null; if(isCloud()) runSync(false); }, delay);
  if(notify) toast('No se pudo sincronizar ahora. Tus cambios están guardados en este dispositivo y se enviarán solos al volver la conexión.', 'error');
  renderHeader();
  renderOfflineBar();
  return false;
}
function notifySyncResult(result){
  const conflicts = syncConflicts().length;
  if(conflicts) toast('Se combinaron tus datos. Hay ' + conflicts + ' cambio(s) en los que dos dispositivos no coinciden: revísalos cuando puedas.', 'info');
  else if(result.status === 'merged') toast('Se combinaron los cambios de tus dispositivos.');
  else if(result.status === 'pulled') toast('Datos actualizados desde tus otros dispositivos.');
  else if(result.status === 'kept-local') toast('El servidor no devolvió la copia; tus datos locales siguen intactos. Se reintentará.', 'info');
  else if(result.status === 'pushed' || result.status === 'replayed') toast('Copia guardada en la nube.');
  else if(result.status === 'offline') toast('Sin conexión: tus cambios quedan guardados aquí.', 'info');
  else if(syncPending()) toast('Quedan cambios pendientes de sincronizar.', 'info');
  else toast('Todo sincronizado.');
}
async function runSync(notify){
  if(!isCloud()){ if(notify) toast('No hay sesión de nube activa.', 'error'); return false; }
  if(state.sb.timer){ clearTimeout(state.sb.timer); state.sb.timer = null; }
  if(state.sb.retry){ clearTimeout(state.sb.retry); state.sb.retry = null; }
  const account = currentUser;
  const job = beginSyncJob(account);
  state.sb.status = 'syncing';
  renderHeader();
  let result;
  try{
    result = await cloudSync.sync(account, dataFor(account));
  }catch(err){
    return syncFailed(notify, job ? job.id : null);
  }
  if(currentUser !== account){
    /* La cuenta cambió mientras la petición estaba en vuelo: cerrar su trabajo
       evita dejarlo en «sending» para siempre. */
    try{ finishSyncJob(job, cloudSync.state(account) || {}); }catch(e){}
    return false;
  }
  if(result.data) applyRemoteDoc(result.data);
  /* Si hubo que combinar, se intenta subir el resultado una vez más para no
     dejar pendiente lo que ya está resuelto. Un segundo choque se muestra. */
  if(result.needsPush && currentUser === account){
    try{
      result = await cloudSync.sync(account, dataFor(account));
    }catch(err){
      return syncFailed(notify, job ? job.id : null);
    }
    if(currentUser !== account){
      try{ finishSyncJob(job, cloudSync.state(account) || {}); }catch(e){}
      return false;
    }
    if(result.data) applyRemoteDoc(result.data);
  }
  const st = cloudSync.state(account) || {};
  finishSyncJob(job, st);
  if((st.conflicts || []).length) state.sb.status = 'conflict';
  else { state.sb.status = 'ok'; state.sb.last = Date.now(); state.sb.attempts = 0; }
  /* Si se guardó algo mientras la petición estaba en vuelo, el estado no puede
     decir «todo sincronizado»: se marca pendiente y se envía en el próximo tick. */
  if(!st.dirty && st.digest && currentUser === account){
    try{
      if(JSON.stringify(cloudSync.digest(dataFor(account))) !== JSON.stringify(st.digest)){
        cloudSync.markDirty(account);
        state.sb.status = 'ok';
        scheduleCloudSync();
      }
    }catch(e){ /* nunca romper la sincronización por una comprobación extra */ }
  }
  if(result.status === 'pushed' || result.status === 'replayed') noteBackupDone();
  /* Si tras la respuesta siguen habiendo cambios pendientes (se registró una
     serie mientras la petición viajaba), se reintenta con la versión nueva.
     Acotado para que no se convierta en un bucle de sincronizaciones. */
  if(currentUser === account && syncPending()){
    state.sb.follow = (state.sb.follow || 0) + 1;
    if(state.sb.follow <= 4) queueSync(1200);
  } else {
    state.sb.follow = 0;
  }
  if(notify) notifySyncResult(result);
  renderHeader();
  return state.sb.status !== 'offline';
}
function pushNow(notify){ return runSync(notify); }

/* Restauración manual: es destructiva, así que deja siempre una copia local
   antes de reemplazar y no hace nada si el servidor no devuelve datos. */
async function pullRemote(notify){
  if(!isCloud()) return false;
  const account = currentUser;
  state.sb.status = 'syncing';
  renderHeader();
  try{
    const result = await cloudSync.forcePull(account, dataFor(account));
    if(currentUser !== account) return false;
    if(result.status === 'empty'){
      state.sb.status = 'ok';
      if(notify) toast('Todavía no hay copia en la nube de esta cuenta.', 'info');
      renderHeader();
      return false;
    }
    applyRemoteDoc(result.data);
    state.sb.status = 'ok';
    state.sb.last = Date.now();
    if(notify) toast('Copia restaurada desde la nube. La versión anterior quedó guardada en este dispositivo.', 'info');
    renderHeader();
    return true;
  }catch(err){
    /* pullRemote no inicia un trabajo de cola: no existe `job` aquí. */
    return syncFailed(notify, null);
  }
}
async function restoreLocalBackup(){
  if(!currentUser) return;
  const backup = cloudSync.restoreBackup(currentUser);
  if(!backup || !backup.data){ toast('No hay ninguna copia local anterior guardada.', 'info'); return; }
  const when = new Date(backup.at).toLocaleString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  confirmModal('¿Recuperar la copia anterior?',
    'Se restaurará en este dispositivo la copia que había antes de la última sincronización (guardada el ' + when + '). Después se combinará con lo que haya en la nube, sin borrar nada del otro lado.',
    'Recuperar', () => {
      closeModal();
      cloudSync.backup(currentUser, dataFor(currentUser));
      db.data[currentUser] = backup.data;
      persistLocal();
      cloudSync.markDirty(currentUser);
      render();
      runSync(true).then(() => { if(currentUser) render(); });
    });
}
/* ------- Recordatorio quincenal de copia de seguridad ------- */
const BACKUP_REMINDER_KEY = 'draktrack_backup_due';
const BACKUP_REMINDER_DAYS = 14;
function noteBackupDone(){
  try{ localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now() + BACKUP_REMINDER_DAYS * 864e5)); }catch(e){}
}
function maybeBackupReminder(){
  if(!currentUser) return;
  let due = 0;
  try{ due = parseInt(localStorage.getItem(BACKUP_REMINDER_KEY) || '0', 10) || 0; }catch(e){}
  if(!due){ noteBackupDone(); return; }          /* primera visita: fecha base, sin avisar */
  if(Date.now() < due) return;
  noteBackupDone();                                /* se pospone 14 días, no en cada render */
  toast(isCloud()
    ? 'Recordatorio: haz copia de tu perfil — «Subir copia a la nube» o descarga tu JSON desde el menú de usuario.'
    : 'Recordatorio: tu cuenta es local (solo este dispositivo). Descarga tu JSON desde el menú de usuario como respaldo.', 'info');
}

/* Descarga un JSON con toda la copia de la nube de la cuenta conectada.
   Si el servidor no responde, exporta la copia local de esa misma cuenta. */
async function exportCloudJSON(){
  if(!currentUser){ toast('Inicia sesión para exportar tus datos.', 'error'); return; }
  toast('Preparando el archivo…');
  let payload = null, fromCloud = false;
  if(isCloud()){
    try{
      const row = await DrakoSB.loadData();
      if(row && row.data && typeof row.data === 'object' && Object.keys(row.data).length){ payload = row.data; fromCloud = true; }
    }catch(e){ /* sin conexión: se usa la copia local de la misma cuenta */ }
  }
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
      noteBackupDone();
      if(res === 'shared') toast('Archivo compartido — elige dónde guardarlo.');
      else if(fromCloud) toast('Copia de la nube descargada.');
      else toast(isCloud() ? 'Sin conexión con la nube — se descargó la copia local de esta cuenta.' : 'Copia local descargada.', 'info');
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a');
      aEl.href = url; aEl.download = filename;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      noteBackupDone();
      if(fromCloud) toast('Copia de la nube descargada.');
      else toast(isCloud() ? 'Sin conexión con la nube — se descargó la copia local de esta cuenta.' : 'Copia local descargada.', 'info');
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
  let remote = null;    try{ remote = await DrakoSB.loadData(); }catch(e){}
  const remoteEmpty = !remote || !remote.data || !Object.keys(remote.data).length;
  render();
  if(candidates.length && remoteEmpty){
    let best = candidates[0];
    for(const k of candidates){
      const sa = (db.data[k].sessions || []), sb2 = (db.data[best].sessions || []);
      if(sa.length && (sa[sa.length-1].date >= (sb2.length ? sb2[sb2.length-1].date : ''))) best = k;
    }
    confirmModal('¿Subir tus datos locales a la nube?',
      `Se encontraron datos guardados en este dispositivo con la cuenta «${esc(maskAccount(best))}». ¿Subirlos a tu cuenta de la nube para poder restaurarlos desde cualquier dispositivo o si pierdes el acceso?`,
      'Subir datos', () => {
        closeModal();
        db.data[mail] = db.data[best];
        persistLocal();
        cloudSync.markDirty(mail);
        runSync(false).then(() => { if(currentUser) render(); });
        render();
      });
  } else {
    /* Nunca se reemplaza lo local a ciegas: si la nube ya tiene datos y este
       dispositivo también, el motor los combina por identificador estable. */
    await runSync(false);
  }
  render();
}
/* ---- Cambios en conflicto y versiones anteriores (controles del menú) ---- */
const SYNC_LABELS = { workouts:'entrenamiento', sessions:'sesión', records:'registro', prs:'récord', weights:'peso corporal', exercises:'ejercicio' };
function describeSyncConflict(c){
  if(!c) return '';
  const label = c.label ? '«' + c.label + '»' : 'un elemento';
  if(c.kind === 'set') return 'Una serie de ' + label + ' cambió en los dos dispositivos.';
  if(c.kind === 'deleted-remote') return 'El ' + (SYNC_LABELS[c.collection] || 'elemento') + ' ' + label + ' se borró en el otro dispositivo, pero aquí tiene cambios.';
  if(c.kind === 'deleted-local') return 'El ' + (SYNC_LABELS[c.collection] || 'elemento') + ' ' + label + ' se borró en este dispositivo, pero el otro lo modificó.';
  if(c.collection === 'photo') return 'La foto de progreso cambió en los dos dispositivos.';
  if(c.collection === 'consent') return 'El consentimiento cambió en los dos dispositivos.';
  if(c.collection === 'prefs') return 'Una preferencia cambió en los dos dispositivos.';
  if(c.collection === 'profile') return 'Un dato de tu perfil cambió en los dos dispositivos.';
  return 'El ' + (SYNC_LABELS[c.collection] || 'elemento') + ' ' + label + ' cambió en los dos dispositivos.';
}
function openSyncConflicts(){
  const list = syncConflicts();
  if(!list.length){ toast('No hay cambios en conflicto.', 'info'); return; }
  openModal(`
    <h3>Cambios en dos dispositivos</h3>
    <p class="modal-body">Estos elementos se cambiaron a la vez aquí y en otro dispositivo. Se conservaron las dos versiones: elige con cuál quedarte. Nada se borra hasta que decidas.</p>
    <div class="modal-body">${list.map(c => `
      <div class="consent-note" style="margin-bottom:12px">
        <p><b>${esc(describeSyncConflict(c))}</b></p>
        <div class="modal-actions" style="margin-top:8px">
          <button type="button" class="btn btn-ghost" data-action="conflict-keep" data-key="${esc(c.key)}">Conservar la mía</button>
          ${c.remote !== null && c.remote !== undefined
            ? `<button type="button" class="btn btn-primary" data-action="conflict-theirs" data-key="${esc(c.key)}">Usar la del otro dispositivo</button>`
            : '<span class="muted">La otra versión quedó en el historial de la nube.</span>'}
        </div>
      </div>`).join('')}</div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cerrar</button></div>`);
}
function resolveSyncConflict(key, choice){
  if(!currentUser || !key) return;
  const result = cloudSync.resolveConflict(currentUser, key, choice, dataFor(currentUser));
  if(result && result.data) db.data[currentUser] = result.data;
  persistLocal();
  render();
  if(result && result.remaining) openSyncConflicts();
  else closeModal();
  toast('Listo. El cambio se enviará al otro dispositivo.', 'info');
  runSync(false).then(() => {
    if(!currentUser) return;
    render();
    if(syncConflicts().length && !(result && result.remaining)) openSyncConflicts();
  });
}
function formatSyncStamp(iso){
  try{ return new Date(iso).toLocaleString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return 'fecha desconocida'; }
}
async function openVersionHistory(){
  if(!isCloud()){ toast('Necesitas una cuenta en la nube para ver versiones anteriores.', 'info'); return; }
  toast('Buscando versiones anteriores…');
  let items = [];
  try{ items = await DrakoSB.dataHistory(); }
  catch(e){ toast('No se pudieron leer las versiones anteriores. Revisa tu conexión.', 'error'); return; }
  if(!items.length){ toast('Todavía no hay versiones anteriores de esta cuenta.', 'info'); return; }
  openModal(`
    <h3>Versiones anteriores</h3>
    <p class="modal-body">La nube guarda las últimas 10 copias de tu cuenta. Recuperar una crea una versión nueva: tus otros dispositivos la reciben y nada se borra de golpe.</p>
    <div class="modal-body">${items.map(item => `
      <div class="consent-note" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px">
        <span>${esc(formatSyncStamp(item.saved_at))}${item.bytes ? ' · ' + Math.round(item.bytes / 1024) + ' KB' : ''}</span>
        <button type="button" class="btn btn-ghost" data-action="restore-version" data-rev="${item.rev}">Recuperar</button>
      </div>`).join('')}</div>
    <div class="modal-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cerrar</button></div>`);
}
async function restoreServerVersion(rev){
  if(!isCloud() || !Number.isInteger(rev)) return;
  confirmModal('¿Recuperar esta versión?',
    'Se guardará como una versión nueva de tu cuenta. La copia de este dispositivo se conserva y se combinará con la recuperada.',
    'Recuperar', async () => {
      closeModal();
      const err = await DrakoSB.restoreVersion(rev);
      if(err){ toast(err, 'error'); return; }
      await runSync(false);
      toast('Versión recuperada. Revisa tus datos y sincroniza los otros dispositivos.', 'info');
      if(currentUser) render();
    });
}
async function saveRecoveredPassword(){
  const p1 = $('#rec-pass') ? $('#rec-pass').value : '';
  const p2 = $('#rec-pass2') ? $('#rec-pass2').value : '';
  const box = $('#rec-err');
  const fail = m => { if(box){ box.textContent = m; box.classList.remove('hidden'); } };
  if(p1.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');
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
      ? 'Cambiarás la contraseña de tu cuenta en la nube (' + esc(maskAccount(currentUser)) + ').'
      : 'Cambiarás la contraseña de tu cuenta local de este dispositivo.';
    openModal(`
      <h3>Cambiar la contraseña</h3>
      <p class="modal-body">${intro} Tus entrenamientos, récords e historial no se ven afectados.</p>
      <div class="form">
        <label class="field"><span>Contraseña actual</span><input type="password" id="cp-old" autocomplete="current-password"></label>
        <label class="field"><span>Nueva contraseña</span><input type="password" id="cp-new" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
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
    if(p1.length < 8) return fail('La contraseña nueva debe tener al menos 8 caracteres.');
    if(p1 !== p2) return fail('Las contraseñas nuevas no coinciden.');
    if(btn) btn.disabled = true;
    try{
      if(isCloud()){
        /* Verificar la contraseña actual con un arranque de sesión independiente */
        const err = await DrakoSB.changePassword(p1, cur);
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
    db.data[user] = { workouts:[], sessions:[], prs:[], weights:[], photo:null, hiddenLib:[], consent:null, exercises:[], records:[], prefs:{} };
  }
  if(!Array.isArray(db.data[user].hiddenLib)) db.data[user].hiddenLib = [];
  if(!Array.isArray(db.data[user].exercises)) db.data[user].exercises = [];
  if(!Array.isArray(db.data[user].records)) db.data[user].records = [];
  if(!Array.isArray(db.data[user].programs)) db.data[user].programs = [];
  if(!Array.isArray(db.data[user].planner)) db.data[user].planner = [];
  if(!db.data[user].prefs || typeof db.data[user].prefs !== 'object') db.data[user].prefs = {};
  if(!('consent' in db.data[user])) db.data[user].consent = null;
  return db.data[user];
}

/* ---- Eliminación de cuenta y datos (derecho de supresión) ---- */
function openDeleteAccount(){
  if(!currentUser) return;
  const cloud = isCloud();
  openModal(`
    <h3>Eliminar mi cuenta y todos mis datos</h3>
    <p class="modal-body">Cuenta: <b>${esc(maskAccount(currentUser))}</b> · ${cloud ? 'cuenta en la nube' : 'cuenta local de este dispositivo'}.</p>
    <ul class="modal-body danger-list">
      <li>${cloud ? 'Se borran tu registro de acceso (correo y contraseña) y tu copia en la nube.' : 'Se borran tu usuario, tu contraseña cifrada y todos tus datos de este dispositivo.'}</li>
      <li>Se borran entrenamientos, historial, récords, pesos y la foto de progreso.</li>
      <li>Es inmediato e irreversible: no hay papelera ni forma de recuperar la cuenta.</li>
    </ul>
    <p class="modal-body">Si quieres conservar una copia, descárgala antes:</p>
    <button type="button" class="btn btn-ghost btn-block" data-action="sb-export">Descargar mis datos (JSON)</button>
    <label class="field" style="margin-top:16px"><span>Escribe ELIMINAR para confirmar</span>
      <input id="del-confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="del-help">
    </label>
    <p id="del-help" class="consent-note">El botón se activa solo al escribir la palabra completa.</p>
    <div id="del-err" class="auth-err hidden" role="alert"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
      <button class="btn btn-danger" id="del-go" data-action="confirm-delete-account" type="button" disabled>Eliminar definitivamente</button>
    </div>`);
}
async function confirmDeleteAccount(){
  const box = $('#del-err');
  const fail = m => { if(box){ box.textContent = m; box.classList.remove('hidden'); } };
  const typed = $('#del-confirm') ? $('#del-confirm').value.trim().toUpperCase() : '';
  if(typed !== 'ELIMINAR') return fail('Escribe ELIMINAR para confirmar.');
  const btn = $('#del-go');
  if(btn) btn.disabled = true;
  const cloud = isCloud();
  const account = currentUser;
  if(cloud){
    const err = await DrakoSB.deleteAccount();
    if(err){ if(btn) btn.disabled = false; return fail(err); }
  } else {
    delete db.users[String(account).trim().toLowerCase()];
  }
  delete db.data[account];
  try{ opQueue.removeAccount(account); }catch(e){}
  try{ localStorage.removeItem(BACKUP_REMINDER_KEY); }catch(e){}
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  if(window.DrakoSB && DrakoSB.hasSession && DrakoSB.hasSession()) DrakoSB.signOut();
  currentUser = null;
  state.sessionId = null;
  state.editor = null;
  saveDB();  /* persiste el borrado local; sin sesión de nube no se re-sube nada */
  closeModal();
  toast(cloud ? 'Cuenta y datos eliminados de la nube.' : 'Cuenta local y datos eliminados de este dispositivo.', 'info');
  render();
}

/* Límites para validar entradas del usuario (import, editor, sesiones, PR) */
const LIMITS = { name:120, exercises:100, workouts:300, sets:50, reps:2000, kg:1000, setNotes:300, sessionNotes:600 };
/* Tipos de serie del modelo v2: el calentamiento no cuenta como serie
   efectiva en volumen, repeticiones ni récords. */
const SET_TYPES = ['working','warmup','failure','drop','rest-pause','descending','technique'];
const SET_TYPE_LABELS = {
  working:'Efectiva', warmup:'Calentamiento', failure:'Fallo',
  drop:'Drop set', 'rest-pause':'Rest-pause', descending:'Descendente', technique:'Técnica',
};
const SESSION_STATUS_LABELS = { in_progress:'En curso', paused:'Pausada', completed:'Completada', cancelled:'Cancelada' };
function clampInt(v, max, fallback){
  const n = Number(v);
  if(n === null || n === undefined || n === '' || Number.isNaN(n) || v === '') return fallback;
  if(!isFinite(n)) return fallback;
  return Math.min(Math.round(Math.abs(n)), max);
}
/* Números con decimales (kg): 62,5 debe seguir siendo 62,5. */
function clampNum(v, max, fallback){
  if(v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  if(!isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), max);
}
/* Incrementos de peso habituales en el gimnasio. El preferido se guarda en
   d.prefs.weightStep y solo se usa al pulsar + o −, nunca al escribir. */
const WEIGHT_STEPS = [0.5, 1, 1.25, 2.5, 5];
const DEFAULT_WEIGHT_STEP = 0.5;
function weightStep(){
  const d = currentUser ? dataFor(currentUser) : null;
  const raw = d && d.prefs ? Number(d.prefs.weightStep) : NaN;
  return WEIGHT_STEPS.includes(raw) ? raw : DEFAULT_WEIGHT_STEP;
}
function setWeightStep(v){
  const n = Number(v);
  if(!WEIGHT_STEPS.includes(n)) return weightStep();
  const d = currentUser ? dataFor(currentUser) : null;
  if(!d) return n;
  if(!d.prefs || typeof d.prefs !== 'object') d.prefs = {};
  d.prefs.weightStep = n;
  saveDB();
  return n;
}
/* Dos decimales sobre centésimas enteras: 60 + 1,25 = 61,25 y no 61.250000001. */
function roundKg(v){
  const n = Number(v);
  if(v === '' || v === null || v === undefined || !isFinite(n)) return '';
  return Math.round(Math.min(Math.max(n, 0), LIMITS.kg) * 100) / 100;
}
function adjustWeight(current, dir, step){
  const base = current === '' || current === null || current === undefined ? 0 : Number(current);
  const delta = Number(step) > 0 ? Number(step) : weightStep();
  const next = roundKg((isFinite(base) ? base : 0) + (dir < 0 ? -delta : delta));
  /* Un peso nunca queda negativo: al bajar desde 0 el campo queda vacío. */
  return next === 0 ? '' : next;
}

/* ============================================================
   MODELO DE SERIES INDIVIDUALES (v2)
   Cada ejercicio de una sesión guarda sus series. Las sesiones
   anteriores conservan su peso/repeticiones globales (setModel 1)
   y NO se les inventan series.
   ============================================================ */
function nowIso(){ return new Date().toISOString(); }
function fmtDuration(sec){
  if(sec == null || !isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + r + ' s';
}
function hasSets(e){ return !!(e && Array.isArray(e.sets)); }
function makeSet(number, seed){
  const src = seed || {};
  return {
    id: uid(), number,
    weight: src.weight === '' || src.weight == null ? '' : clampNum(src.weight, LIMITS.kg, ''),
    reps: src.reps === '' || src.reps == null ? '' : clampInt(src.reps, LIMITS.reps, ''),
    completed: false,
    type: SET_TYPES.includes(src.type) ? src.type : 'working',
    rir: null, rpe: null, restSeconds: null, notes: '',
  };
}
/* Series planificadas de una plantilla: peso de referencia del entrenamiento
   (nunca repeticiones inventadas) y todas sin completar. */
function plannedSetsFor(ex){
  const count = clampInt(ex && ex.sets, LIMITS.sets, 3);
  const w = ex && Number(ex.weight) > 0 ? clampNum(ex.weight, LIMITS.kg, '') : '';
  return Array.from({ length: count }, (_, i) => makeSet(i + 1, { weight: w }));
}
function normalizeSet(st, i){
  if(!st || typeof st !== 'object') st = {};
  if(!st.id) st.id = uid();
  st.number = clampInt(st.number, LIMITS.sets, i + 1) || (i + 1);
  st.type = SET_TYPES.includes(st.type) ? st.type : 'working';
  st.weight = st.weight === '' || st.weight == null ? '' : clampNum(st.weight, LIMITS.kg, '');
  st.reps = st.reps === '' || st.reps == null ? '' : clampInt(st.reps, LIMITS.reps, '');
  st.completed = !!st.completed;
  st.rir = st.rir === '' || st.rir == null ? null : clampInt(st.rir, 5, null);
  st.rpe = st.rpe === '' || st.rpe == null ? null : clampInt(st.rpe, 10, null);
  st.restSeconds = st.restSeconds === '' || st.restSeconds == null ? null : clampInt(st.restSeconds, 600, null);
  st.notes = typeof st.notes === 'string' ? st.notes.slice(0, LIMITS.setNotes) : '';
  return st;
}
function renumberSets(ex){
  if(!hasSets(ex)) return;
  ex.sets.forEach((st, i) => { st.number = i + 1; });
}
/* Lápida de una serie borrada: se guarda una copia con su hora para que una
   sincronización antigua no la resucite y para poder recuperarla si el otro
   dispositivo la había modificado. Campo opcional: las sesiones antiguas
   siguen funcionando igual. */
const MAX_SET_TOMBSTONES = 30;
function recordSetTombstone(ex, set){
  if(!ex || !set || !set.id) return;
  if(!ex.setTombstones || typeof ex.setTombstones !== 'object') ex.setTombstones = {};
  ex.setTombstones[set.id] = Object.assign({}, set, { at: Date.now() });
  const keys = Object.keys(ex.setTombstones);
  if(keys.length > MAX_SET_TOMBSTONES){
    keys.sort((a,b) => (Number(ex.setTombstones[a].at) || 0) - (Number(ex.setTombstones[b].at) || 0));
    keys.slice(0, keys.length - MAX_SET_TOMBSTONES).forEach(k => { delete ex.setTombstones[k]; });
  }
}
function forgetSetTombstone(ex, setId){
  if(!ex || !ex.setTombstones || !setId) return;
  delete ex.setTombstones[setId];
  if(!Object.keys(ex.setTombstones).length) delete ex.setTombstones;
}
/* Migración compatible: no reescribe los resultados antiguos. */
function migrateSessionData(s){
  if(!s || typeof s !== 'object') return false;
  let changed = false;
  if(typeof s.date !== 'string'){ s.date = todayISO(); changed = true; }
  if(!s.status){ s.status = s.finished ? 'completed' : 'in_progress'; changed = true; }
  if(s.status === 'completed' && !s.finished){ s.finished = true; changed = true; }
  if(s.status !== 'completed' && s.status !== 'cancelled' && s.finished){ s.finished = false; changed = true; }
  if(typeof s.notes !== 'string'){ s.notes = ''; changed = true; }
  if(!Array.isArray(s.exercises)){ s.exercises = []; changed = true; }
  s.exercises.forEach(e => {
    if(!e || typeof e !== 'object') return;
    if(!e.id){ e.id = uid(); changed = true; }
    if(hasSets(e)){
      e.sets.forEach((st, i) => { normalizeSet(st, i); });
      e.setModel = 2;
      e.done = e.sets.length > 0 && e.sets.every(st => st.completed);
    } else if(e.setModel !== 1){
      /* Registro heredado: se conserva el valor global, sin desglose. */
      e.setModel = 1;
      changed = true;
    }
  });
  return changed;
}
/* Añade `exId` (identificador estable) a entrenamientos, sesiones y récords
   que no lo tengan. No cambia nombres, series ni resultados: solo etiqueta
   cada ejercicio con el id que le corresponde. */
function migrateExerciseIds(d){
  let changed = false;
  if(!Array.isArray(d.exercises)){ d.exercises = []; changed = true; }
  if(!Array.isArray(d.records)){ d.records = []; changed = true; }
  if(!d.prefs || typeof d.prefs !== 'object'){ d.prefs = {}; changed = true; }
  const tag = list => (list || []).forEach(w => {
    if(!w || !Array.isArray(w.exercises)) return;
    w.exercises.forEach(e => {
      if(!e || typeof e !== 'object') return;
      if(!e.exId){
        const id = resolveExerciseId(e.name, d);
        if(id){ e.exId = id; changed = true; }
      }
    });
  });
  tag(d.workouts);
  (d.sessions || []).forEach(s => tag([s]));
  (d.prs || []).forEach(p => {
    if(p && typeof p === 'object' && !p.exId && p.exercise){
      const id = resolveExerciseId(p.exercise, d);
      if(id){ p.exId = id; changed = true; }
    }
  });
  return changed;
}
function migrateAllData(){
  let changed = false;
  Object.keys(db.data || {}).forEach(u => {
    const d = db.data[u];
    if(!d || !Array.isArray(d.sessions)) return;
    d.sessions.forEach(s => { if(migrateSessionData(s)) changed = true; });
    if(migrateExerciseIds(d)) changed = true;
  });
  if(changed) saveDB();
  return changed;
}
/* Totales reales de una sesión. Las series de calentamiento se cuentan
   aparte y nunca suman volumen, repeticiones efectivas ni récords. */
function sessionTotals(s){
  let setsTotal = 0, setsDone = 0, warmupDone = 0, reps = 0, volume = 0;
  let exercisesDone = 0, exercisesTotal = 0, legacy = 0;
  const exercises = (s && Array.isArray(s.exercises)) ? s.exercises : [];
  exercises.forEach(e => {
    if(!hasSets(e)){
      legacy++;
      if(e && e.done) exercisesDone++;
      return;
    }
    exercisesTotal++;
    let all = e.sets.length > 0, any = false;
    e.sets.forEach(st => {
      setsTotal++;
      if(st.completed){
        setsDone++; any = true;
        if(st.type === 'warmup'){ warmupDone++; return; }
        const r = Number(st.reps) || 0;
        reps += r;
        const w = Number(st.weight);
        if(st.weight !== '' && isFinite(w)) volume += w * r;
      }
      if(!st.completed) all = false;
    });
    if(any && all) exercisesDone++;
  });
  return { setsTotal, setsDone, warmupDone, reps, volume: Math.round(volume * 10) / 10, exercisesDone, exercisesTotal, legacy };
}
function elapsedSec(s, now){
  if(!s || !s.startedAt) return null;
  const start = Date.parse(s.startedAt);
  if(!isFinite(start)) return null;
  const ref = now || Date.now();
  const end = s.finishedAt ? Date.parse(s.finishedAt) : ref;
  if(!isFinite(end)) return null;
  const paused = (Number(s.pausedMs) || 0) + (s.pausedAt ? Math.max(0, ref - Date.parse(s.pausedAt)) : 0);
  return Math.max(0, Math.round((end - start - paused) / 1000));
}
/* Mejor serie efectiva de un ejercicio (peso y repeticiones reales). */
function bestSetOfExercise(ex){
  if(!hasSets(ex)) return null;
  let best = null;
  ex.sets.forEach(st => {
    if(!st.completed || st.type === 'warmup') return;
    const w = Number(st.weight), r = Number(st.reps) || 0;
    if(!(w > 0)) return;
    if(!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  });
  return best;
}
/* Récords nuevos comparando con sesiones anteriores CON series. Los
   registros heredados no se usan como marca previa (no hay desglose real). */
function detectNewRecords(s){
  const d = dataFor(currentUser);
  if(!d) return [];
  const prev = {};
  d.sessions.forEach(x => {
    if(!x || x.id === s.id || !x.finished || x.status === 'cancelled') return;
    (x.exercises || []).forEach(e => {
      const b = bestSetOfExercise(e);
      if(!b) return;
      const key = exKeyOf(e, d);
      if(!key) return;
      const cur = prev[key];
      if(!cur || b.weight > cur.weight || (b.weight === cur.weight && b.reps > cur.reps)) prev[key] = b;
    });
  });
  const out = [];
  (s.exercises || []).forEach(e => {
    const b = bestSetOfExercise(e);
    const key = exKeyOf(e, d);
    const old = key ? prev[key] : null;
    if(!b || !old) return;
    if(b.weight > old.weight || (b.weight === old.weight && b.reps > old.reps)){
      out.push({ exercise: e.name, exId: key, weight: b.weight, reps: b.reps, previous: old });
    }
  });
  return out;
}
/* ============================================================
   RÉCORDS AUTOMÁTICOS
   Al marcar una serie se compara su peso × repeticiones con la
   mejor serie histórica del MISMO ejercicio (por id estable) en
   sesiones ya terminadas. Solo se marca si la supera: sin marca
   anterior no hay récord que anunciar, y el calentamiento nunca
   cuenta como serie efectiva.
   ============================================================ */
function bestHistoricalSet(s, ex){
  const d = dataFor(currentUser);
  const key = exKeyOf(ex, d);
  let best = null;
  (d.sessions || []).forEach(x => {
    if(!x || x.id === s.id || !x.finished || x.status === 'cancelled') return;
    (x.exercises || []).forEach(y => {
      if(exKeyOf(y, d) !== key) return;
      const b = bestSetOfExercise(y);
      if(!b) return;
      if(!best || b.weight > best.weight || (b.weight === best.weight && b.reps > best.reps)) best = b;
    });
  });
  return best;
}
function recordBeats(best, weight, reps){
  if(!best) return false;
  return weight > best.weight || (weight === best.weight && reps > best.reps);
}
function maybeMarkRecord(s, ex, st){
  if(!st || !st.completed || st.type === 'warmup') return false;
  const weight = Number(st.weight), reps = Number(st.reps) || 0;
  if(!(weight > 0)) return false;
  const best = bestHistoricalSet(s, ex);
  if(!recordBeats(best, weight, reps)) return false;
  st.pr = true;
  if(!Array.isArray(s.records)) s.records = [];
  if(!s.records.some(x => x.setId === st.id)){
    s.records.push({ id: uid(), setId: st.id, exId: exKeyOf(ex, dataFor(currentUser)), exercise: ex.name, weight, reps, previous: best, at: nowIso() });
  }
  if(prefEnabled('notifyRecords')) toast('¡Nuevo récord en «' + ex.name + '»: ' + weight + ' kg × ' + reps + '!');
  return true;
}
function clearSetRecord(s, st){
  if(!st) return;
  st.pr = false;
  if(Array.isArray(s.records)) s.records = s.records.filter(x => x.setId !== st.id);
}
/* Al terminar, los récords detectados pasan al historial de la cuenta. Además
   se deriva la mejor serie efectiva de cada ejercicio: así una sesión diaria
   registra su récord aunque la marca se haya calculado en otro orden o la
   sesión venga de una versión anterior. Nunca duplica el mismo ejercicio en
   la misma sesión. */
function persistSessionRecords(s){
  if(!s) return;
  const d = dataFor(currentUser);
  if(!Array.isArray(d.records)) d.records = [];
  (s.records || []).forEach(r => {
    if(d.records.some(x => x.sessionId === s.id && x.setId === r.setId)) return;
    d.records.push({ ...r, id: r.id || uid(), sessionId: s.id, date: s.date, sessionName: s.workoutName });
  });
  (s.exercises || []).forEach(ex => {
    const key = exKeyOf(ex, d);
    const best = bestSetOfExercise(ex);
    if(!key || !best) return;
    const previous = bestHistoricalSet(s, ex);
    if(!recordBeats(previous, best.weight, best.reps)) return;
    if(d.records.some(x => x.sessionId === s.id && prKey({ exId: x.exId, exercise: x.exercise }, d) === key)) return;
    d.records.push({
      id: uid(),
      exId: key,
      exercise: ex.name,
      weight: best.weight,
      reps: best.reps,
      previous,
      at: nowIso(),
      sessionId: s.id,
      date: s.date,
      sessionName: s.workoutName,
    });
  });
}
function buildSummary(s){
  const t = sessionTotals(s);
  return {
    durationSec: elapsedSec(s),
    exercisesDone: t.exercisesDone,
    exercisesTotal: t.exercisesTotal + t.legacy,
    setsDone: t.setsDone,
    setsEffective: Math.max(0, t.setsDone - t.warmupDone),
    warmupSets: t.warmupDone,
    setsTotal: t.setsTotal,
    reps: t.reps,
    volume: t.volume,
    records: detectNewRecords(s),
    at: nowIso(),
  };
}
function summaryHTML(s){
  const m = s.summary || buildSummary(s);
  const recs = m.records || [];
  return `
    <div class="summary-grid">
      <div class="summary-cell"><span class="summary-value">${fmtDuration(m.durationSec)}</span><span class="summary-label">Duración</span></div>
      <div class="summary-cell"><span class="summary-value">${m.exercisesDone}/${m.exercisesTotal}</span><span class="summary-label">Ejercicios</span></div>
      <div class="summary-cell"><span class="summary-value">${m.setsEffective}</span><span class="summary-label">Series efectivas${m.warmupSets ? ' (+' + m.warmupSets + ' calent.)' : ''}</span></div>
      <div class="summary-cell"><span class="summary-value">${m.reps}</span><span class="summary-label">Repeticiones</span></div>
      <div class="summary-cell"><span class="summary-value">${m.volume ? m.volume + ' kg' : '—'}</span><span class="summary-label">Volumen</span></div>
    </div>
    ${recs.length ? `<div class="summary-records"><p class="summary-records-title">¡Nuevos récords!</p>
      ${recs.map(r => `<p>${esc(r.exercise)}: <b>${esc(r.weight)} kg × ${esc(r.reps)}</b> <span class="muted">(antes ${esc(r.previous.weight)} kg × ${esc(r.previous.reps)})</span></p>`).join('')}
    </div>` : ''}`;
}
function showSummaryModal(s){
  openModal(`
    <h3>Entrenamiento completado</h3>
    <p class="modal-body">${esc(s.workoutName)} · ${fmtDateLong(s.date)}</p>
    ${summaryHTML(s)}
    <p class="muted small" style="margin-top:14px">El resumen queda guardado en el historial. Los récords comparan solo sesiones con series registradas.</p>
    <div class="modal-actions">
      <button class="btn btn-primary" data-action="summary-close" type="button">Ver sesión</button>
    </div>`);
}
function finalizeSession(s){
  if(!s) return;
  if(s.pausedAt){
    s.pausedMs = (Number(s.pausedMs) || 0) + Math.max(0, Date.now() - Date.parse(s.pausedAt));
    s.pausedAt = null;
  }
  s.finishedAt = nowIso();
  s.status = 'completed';
  s.finished = true;
  s.durationSec = elapsedSec(s);
  s.lastSavedAt = s.finishedAt;
  s.summary = buildSummary(s);
  persistSessionRecords(s);
  unlockAchievements(dataFor(currentUser), true);
  s.rest = null;
  saveDB();
  showSummaryModal(s);
}
/* Series realizadas en la última sesión completada del mismo entrenamiento
   y ejercicio, para usarlas como referencia (nunca como completadas). */
function lastSetsFor(s, ex){
  const d = dataFor(currentUser);
  const prev = d.sessions
    .filter(x => x.id !== s.id && x.finished && x.status !== 'cancelled' && x.workoutId === s.workoutId)
    .sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const key = exKeyOf(ex, d);
  for(const x of prev){
    const e = (x.exercises || []).find(y => exKeyOf(y, d) === key);
    if(!e) continue;
    if(hasSets(e)){
      const done = e.sets.filter(st => st.completed && st.type !== 'warmup' && (st.weight !== '' || st.reps !== ''));
      if(done.length) return done.map(st => ({ weight: st.weight, reps: st.reps }));
    } else if((e.weight != null && e.weight !== '') || e.reps){
      return [{ weight: e.weight, reps: e.reps }];
    }
  }
  return [];
}
function seedFromSession(old){
  const d = dataFor(currentUser);
  const out = {};
  if(!old || !Array.isArray(old.exercises)) return out;
  old.exercises.forEach(e => {
    if(!hasSets(e)) return;
    const done = e.sets.filter(st => st.completed && st.type !== 'warmup')
      .map(st => ({ weight: st.weight, reps: st.reps }));
    if(done.length) out[exKeyOf(e, d)] = done;
  });
  return out;
}
/* Reloj de sesión: se calcula con marcas de tiempo reales, no restando
   segundos, para sobrevivir a pestañas suspendidas. */
let _clockTimer = null;
function stopSessionClock(){ if(_clockTimer){ clearInterval(_clockTimer); _clockTimer = null; } }
function startSessionClock(s){
  stopSessionClock();
  const tick = () => {
    const el = $('#session-clock');
    if(!el || !s) return;
    el.textContent = (s.status === 'paused' ? 'Pausada · ' : '') + fmtDuration(elapsedSec(s));
  };
  tick();
  if(s && s.status === 'in_progress') _clockTimer = setInterval(tick, 1000);
}

/* ---------------- Repeticiones: 1–15 + AMRAP ---------------- */
/* Las repeticiones se eligen de una lista plegable (1 a 15) o «AMRAP»
   (al fallo). Un AMRAP se guarda como la cadena 'AMRAP', nunca como número. */
const REPS_CHOICES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,'AMRAP'];
function isAmrap(v){ return String(v == null ? '' : v).trim().toUpperCase() === 'AMRAP'; }
function repLabel(v){ return isAmrap(v) ? 'AMRAP' : (v === '' || v == null ? '' : String(v)); }
function normReps(v, fallback){
  if(v === '' || v == null) return fallback;
  if(isAmrap(v)) return 'AMRAP';
  const n = clampInt(v, LIMITS.reps, null);
  return n === null ? fallback : n;
}
function repsText(sets, reps){
  return sets + ' series × ' + (isAmrap(reps) ? 'AMRAP' : repLabel(reps) + ' rep');
}
/* Selector plegable reutilizable (editor y sesión). `attrs` inyecta
   data-idx (editor) o data-session/data-ex (sesión) para saber dónde guardar. */
function repsPickerHtml(value, attrs, ariaLabel){
  const cur = repLabel(value) || '···';
  const sel = String(value);
  const accessible = ariaLabel + ': ' + (cur === '···' ? 'sin valor' : cur);
  return `<div class="reps-picker"${attrs || ''}>
        <button type="button" class="reps-toggle" data-action="reps-toggle" data-label="${esc(ariaLabel)}" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(accessible)}">${esc(cur)} <span class="reps-arrow" aria-hidden="true">▾</span></button>
        <div class="reps-menu hidden" role="listbox" aria-label="Repeticiones de 1 a 15 o AMRAP">
          ${REPS_CHOICES.map(v => `<button type="button" class="reps-opt${sel === String(v) ? ' active' : ''}" role="option" tabindex="-1" aria-selected="${sel === String(v) ? 'true' : 'false'}" data-action="reps-choose" data-value="${v}">${v}</button>`).join('')}
        </div>
      </div>`;
}
function repsToggleName(toggle, value){
  if(!toggle || !toggle.dataset) return;
  const base = toggle.dataset.label || 'Repeticiones';
  toggle.setAttribute('aria-label', base + ': ' + (repLabel(value) || 'sin valor'));
}
function closeRepsMenus(){
  $$('.reps-menu').forEach(menu => menu.classList.add('hidden'));
  $$('.reps-toggle').forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
}
function openRepsMenu(toggle, menu){
  closeRepsMenus();
  menu.classList.remove('hidden');
  toggle.setAttribute('aria-expanded', 'true');
  const selected = menu.querySelector('[role="option"][aria-selected="true"]') || menu.querySelector('[role="option"]');
  if(selected) selected.focus({ preventScroll: true });
}

/* ---------------- Utilidades ---------------- */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];  const uid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
/* Solo se aceptan las imágenes que produce compressImage. Además de evitar
   recursos externos, impide que un valor local manipulado cierre el atributo
   src e inyecte HTML. */
const safePhotoSrc = value => {
  if(typeof value !== 'string' || value.length > 1500000) return '';
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : '';
};
const escapeHtmlNum = v => esc(String(v ?? ''));

/* ---- Privacidad: identidad enmascarada y consentimiento ---- */
/* La app no necesita el identificador completo de la cuenta para funcionar:
   en la cabecera y en el menú se muestra enmascarado (minimización de datos). */
function maskAccount(u){
  const s = String(u ?? '');
  const at = s.indexOf('@');
  if(at > 0){
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    return local.slice(0, Math.min(2, local.length)) + '•••@' + domain;
  }
  return s.length > 2 ? s.slice(0, 2) + '•••' : s;
}
/* Nombre visible del perfil de nube; el correo solo es el identificador de
   acceso. Si la cuenta no tiene nombre, se conserva el comportamiento anterior. */
function accountDisplayName(){
  const cloudName = window.DrakoSB && typeof DrakoSB.name === 'function' ? DrakoSB.name() : null;
  return cloudName || currentUser || '';
}
function readConsent(){
  const terms = $('#consent-terms');
  const age = $('#consent-age');
  return { terms: !!(terms && terms.checked), age: !!(age && age.checked) };
}
/* Casillas vacías por defecto: el consentimiento siempre es una acción positiva. */
function requireConsent(){
  const c = readConsent();
  if(!c.terms){
    showAuthError('Para crear la cuenta debes aceptar los Términos del Servicio y la Política de Privacidad.', 'consent-terms');
    return null;
  }
  if(!c.age){
    showAuthError('Debes confirmar que tienes 16 años o más para crear una cuenta.', 'consent-age');
    return null;
  }
  return { version: LEGAL_VERSION, at: new Date().toISOString(), terms: true, age16: true, health: true };
}
function saveConsent(rec){
  if(!currentUser || !rec) return;
  const d = dataFor(currentUser);
  d.consent = rec;
  if(!isCloud()){
    const u = db.users[String(currentUser).trim().toLowerCase()];
    if(u) u.consent = rec;
  }
  saveDB();
}

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
  if(!u) return 'Escribe un nombre de usuario.';
  if(pass.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
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
async function logout(){
  if(window.DrakoSB) await DrakoSB.signOut();
  if(state.sb.timer){ clearTimeout(state.sb.timer); state.sb.timer = null; }
  if(state.sb.retry){ clearTimeout(state.sb.retry); state.sb.retry = null; }
  state.sb.status = 'idle'; state.sb.running = false;
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  state.sessionId = null;
  state.editor = null;
}

/* ---------------- Avisos y ventanas modales ---------------- */
function toastDuration(msg, type='success'){
  const base = type === 'error' ? 6000 : type === 'info' ? 4200 : 2800;
  const reading = 900 + String(msg || '').length * 45;
  return Math.min(10000, Math.max(base, reading));
}
function toast(msg, type='success'){
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, toastDuration(msg, type));
}
/* Accesibilidad: el diálogo se anuncia, atrapa el foco y lo devuelve al cerrar. */
let _lastFocus = null;
function openModal(html){
  _lastFocus = document.activeElement;
  const labelled = String(html).replace('<h3>', '<h3 id="modal-title">');
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${labelled}</div></div>`;
  const modal = $('.modal');
  const first = modal && modal.querySelector('input:not([type=hidden]), select, textarea, button, a[href]');
  setTimeout(() => { if(first && document.contains(first)) first.focus(); else if(modal) modal.focus(); }, 40);
}
function closeModal(){
  $('#modal-root').innerHTML = '';
  if(_lastFocus && document.contains(_lastFocus)){ try{ _lastFocus.focus(); }catch(e){} }
  _lastFocus = null;
}
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
/* Nombre de cada vista para el título del documento y para el `main`. */
const VIEW_TITLES = {
  workouts: 'Entrenamientos',
  plan: 'Plan',
  history: 'Historial',
  progress: 'Progreso',
  analytics: 'Análisis',
  weight: 'Peso',
  settings: 'Ajustes',
  session: 'Entrenamiento',
  editor: 'Editar entrenamiento',
  start: 'Empezar entrenamiento',
  program: 'Programa',
  library: 'Biblioteca'
};
function nav(hash){
  if(location.hash === '#' + hash || location.hash === hash) render();
  else location.hash = hash;
}

/* ---------------- Render principal ---------------- */
let _renderedHash = null;
function render(){
  stopSessionClock();
  stopRestClock();
  const authScreen = $('#auth-screen');
  const app = $('#app');

  if(!currentUser){
    authScreen.classList.remove('hidden');
    app.classList.add('hidden');
    document.title = 'DrakoTrack — Iniciar sesión';
    syncSkipLink();
    _renderedHash = location.hash;
    return;
  }
  authScreen.classList.add('hidden');
  app.classList.remove('hidden');
  syncSkipLink();
  if(!window.__dtMigrated){ window.__dtMigrated = true; try{ migrateAllData(); }catch(err){} }
  document.title = 'DrakoTrack — Seguimiento de entrenamiento';
  syncAccountTheme();

  const parsedHash = parseHash();
  const route = parsedHash.route === 'prs' ? 'progress' : parsedHash.route;
  const rest = parsedHash.rest;
  renderHeader();
  setActiveTab(route);
  const main = $('#main');

  if(route === 'session')      renderSession(main, rest[0]);
  else if(route === 'editor')  renderEditor(main, rest[0]);
  else if(route === 'start')   renderStart(main);
  else if(route === 'progress') renderProgress(main);
  else if(route === 'analytics') renderAnalytics(main);
  else if(route === 'settings') renderSettings(main);
  else if(route === 'weight')  renderWeight(main);
  else if(route === 'history') renderHistory(main);
  else if(route === 'plan')    renderPlan(main);
  else if(route === 'program') renderProgram(main, rest[0]);
  else if(route === 'library') renderLibrary(main);
  else                         renderWorkouts(main);
  const viewName = VIEW_TITLES[route] || ((main.querySelector('h1') || {}).textContent || '').trim() || 'Entrenamientos';
  document.title = 'DrakoTrack — ' + viewName;
  main.setAttribute('aria-label', viewName);
  maybeBackupReminder();
  maybePlanReminder();
  maybeNotifySwRollback();
  _renderedHash = location.hash;
}
/* Al entrar o salir de la sesión el foco no debe quedarse en un control que
   acaba de desaparecer. El título del documento ya cambia en render(). */
function focusMain(){
  const main = $('#main');
  if(!main || !document.contains(main) || main.closest('.hidden')) return;
  try{ main.focus({ preventScroll: true }); }catch(e){ try{ main.focus(); }catch(_){} }
}
function focusAuthTitle(){
  const title = $('#auth-title');
  if(!title || !document.contains(title) || title.closest('.hidden')) return;
  try{ title.focus({ preventScroll: true }); }catch(e){ try{ title.focus(); }catch(_){} }
}
function focusAfterAuth(){
  if($('.modal')) return;   /* una confirmación o el onboarding manda el foco */
  focusMain();
}

function renderHeader(){
  const cloud = isCloud();
  const display = accountDisplayName();
  const initials = display.split(/[\s._-]+/).map(w => w[0] || '').join('').slice(0,2).toUpperCase();
  const shown = cloud && display !== currentUser ? display : maskAccount(currentUser);
  $('#user-chip').innerHTML = `<span class="chip-avatar" aria-hidden="true">${esc(initials)}</span><span class="chip-name">${esc(shown)}</span>`;
  $('#user-chip').setAttribute('aria-label', 'Tu cuenta: ' + shown);
  const menuHead = cloud && display !== currentUser
    ? display + ' · ' + maskAccount(currentUser) + ' (nube)'
    : shown + (cloud ? ' (nube)' : ' (solo este dispositivo)');
  $('#user-menu-head').textContent = 'Cuenta: ' + menuHead;
  const sbStatus = $('#sb-status'), sbPush = $('#sb-push'), sbRestore = $('#sb-restore'), sbExport = $('#sb-export');
  const sbConflicts = $('#sb-conflicts'), sbHistory = $('#sb-history'), sbLocal = $('#sb-local-backup');
  const st = cloud ? (cloudSync.state(currentUser) || {}) : null;
  const conflicts = st && Array.isArray(st.conflicts) ? st.conflicts.length : 0;
  const pending = !!(st && st.dirty);
  const hasBackup = !!(st && st.backup && st.backup.data);
  if(sbStatus){
    if(cloud){
      sbStatus.classList.remove('hidden');
      if(state.sb.status === 'syncing') sbStatus.textContent = '☁️ Sincronizando…';
      else if(state.sb.status === 'offline') sbStatus.textContent = '⚠ Sin conexión — tus cambios están guardados aquí.';
      else if(conflicts) sbStatus.textContent = '⚠ ' + conflicts + ' cambio(s) en dos dispositivos: necesitan tu decisión.';
      else if(pending) sbStatus.textContent = '☁️ Cambios pendientes de subir';
      else if(st && st.rev !== null && state.sb.last) sbStatus.textContent = '☁️ Todo sincronizado · ' + new Date(state.sb.last).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
      else sbStatus.textContent = '☁️ Cuenta en la nube activa';
    } else sbStatus.classList.add('hidden');
  }
  if(sbPush) sbPush.classList.toggle('hidden', !cloud);
  if(sbRestore) sbRestore.classList.toggle('hidden', !cloud);
  if(sbHistory) sbHistory.classList.toggle('hidden', !cloud);
  if(sbConflicts) sbConflicts.classList.toggle('hidden', !conflicts);
  if(sbLocal) sbLocal.classList.toggle('hidden', !hasBackup);
  if(sbExport) sbExport.classList.remove('hidden');
  $('#top-date').textContent = new Date().toLocaleDateString('es', { weekday:'long', month:'long', day:'numeric' });
  renderOfflineBar();
}
function setActiveTab(route){
  $$('.nav-btn[data-route]').forEach(b => {
    const on = b.dataset.route === route;
    b.classList.toggle('active', on);
    if(on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

/* ---------------- Inicio: entrenamientos ---------------- */
function workoutStats(){
  const d = dataFor(currentUser);
  const resolve = name => resolveExerciseId(name, d);
  const finished = d.sessions.filter(s => s.finished && s.status !== 'cancelled');
  const vol = PG.volumeSummary(d, resolve);
  const bw = PG.bodyweight(d);
  const recs = PG.recordSummary(d, resolve);
  const recordsNow = recs.reduce((n, r) => n + PG.RECORD_METRICS.filter(m => r[m.key]).length, 0);
  const improving = PG.improvingExercises(d, resolve);
  return {
    done: finished.length,
    week: vol.week.sessions, month: vol.month.sessions,
    weekVol: vol.week.volume, monthVol: vol.month.volume,
    weekSets: vol.week.sets, seconds: vol.all.seconds,
    prs: (d.prs || []).length + ((d.records || []).length),
    recordsNow,
    up: improving.filter(x => x.trend === 'up').length,
    down: improving.filter(x => x.trend === 'down').length,
    improving,
    curW: bw.latest ? bw.latest.weight : null,
    wChange: bw.change30,
    hasVolume: vol.week.sets > 0,
  };
}
function dashboardProgressHTML(st){
  const bits = [];
  if(st.up) bits.push(st.up + ' ejercicio' + (st.up === 1 ? '' : 's') + ' con progresión positiva');
  if(st.down) bits.push(st.down + ' a la baja');
  const wTxt = st.curW != null
    ? 'Peso actual: ' + fmtKg(st.curW) + ' kg' + (st.wChange == null ? '' : ' (' + (st.wChange > 0 ? '+' : '') + fmtKg(st.wChange) + ' kg en 30 días)')
    : 'Aún no registras tu peso corporal.';
  return `
    <section class="dash-card">
      <div class="section-head"><h2>Tu progreso</h2><span class="muted">Calculado con tus sesiones terminadas</span></div>
      ${bits.length
        ? `<ul class="dash-list">${st.improving.slice(0, 5).map(x => `
            <li><span>${esc(x.name)}</span><span class="trend-chip ${x.trend}">${x.trend === 'up' ? '↑' : '↓'} ${fmtKg(Math.abs(x.delta))} kg</span></li>`).join('')}</ul>`
        : '<p class="muted small">Todavía no hay suficientes sesiones repetidas para medir una tendencia. Con dos sesiones del mismo ejercicio empezarás a verla.</p>'}
      <p class="muted small">${esc(wTxt)}</p>
      <p class="muted small">Tiempo total entrenado: ${st.seconds ? esc(fmtDuration(st.seconds)) : '—'} · ${st.weekSets} series esta semana.</p>
      <div class="dash-actions">
        <button class="btn btn-ghost btn-sm" data-action="tab" data-route="progress" type="button">Ver progreso y récords</button>
        <button class="btn btn-ghost btn-sm" data-action="tab" data-route="history" type="button">Ver historial</button>
      </div>
    </section>`;
}
/* ============================================================
   MEJOR MARCA VISIBLE
   Para cada ejercicio (por id estable) se muestra su mejor serie
   histórica y cuántos récords automáticos acumula. Los datos salen
   del historial terminado (sin canceladas ni calentamientos) y de
   los récords manuales; nunca de cifras inventadas.
   ============================================================ */
function bestMarkFor(d, id){
  if(!d || !id) return null;
  let best = null;
  const consider = (w, r, extra) => {
    const weight = Number(w) || 0, reps = Number(r) || 0;
    if(!(weight > 0)) return;
    if(!best || weight > best.weight || (weight === best.weight && reps > best.reps)) best = Object.assign({ weight, reps }, extra || {});
  };
  (d.sessions || []).forEach(s => {
    if(!s || !s.finished || s.status === 'cancelled') return;
    (s.exercises || []).forEach(e => {
      if(exKeyOf(e, d) !== id) return;
      if(hasSets(e)) e.sets.forEach(st => {
        if(st.completed && st.type !== 'warmup') consider(st.weight, st.reps, { date: s.date, sessionId: s.id });
      });
      else consider(e.weight, e.reps, { date: s.date, sessionId: s.id });
    });
  });
  (d.prs || []).forEach(p => { if(prKey(p, d) === id) consider(p.weight, p.reps, { date: p.date, manual: true }); });
  return best;
}
function autoRecordsFor(d, id){
  if(!d || !id) return [];
  return (d.records || []).filter(r => prKey({ exId: r.exId, exercise: r.exercise }, d) === id)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
function markText(mark){
  return mark ? '🏆 ' + fmtKg(mark.weight) + ' kg × ' + mark.reps : '';
}
/* Chips de ejercicios de una rutina con su mejor marca al lado. */
function wcardExChips(w, d){
  const list = (w && w.exercises) || [];
  const chips = list.slice(0, 3).map(e => {
    const id = exKeyOf(e, d);
    const mark = id ? bestMarkFor(d, id) : null;
    const tip = mark ? ' title="Mejor marca: ' + esc(fmtKg(mark.weight)) + ' kg × ' + mark.reps + '"' : '';
    return '<span' + tip + '>' + esc(e.name) + (mark ? ' · ' + markText(mark) : '') + '</span>';
  }).join('');
  return chips + (list.length > 3 ? '<span class="more">+' + (list.length - 3) + ' más</span>' : '');
}
function wcardRecordsLine(w, d){
  const total = ((w && w.exercises) || []).reduce((n, e) => {
    const id = exKeyOf(e, d);
    return n + (id ? autoRecordsFor(d, id).length : 0);
  }, 0);
  if(!total) return '';
  return '<p class="wcard-recs">' + total + ' récord' + (total === 1 ? '' : 's') + ' automático' + (total === 1 ? '' : 's') + ' en esta rutina</p>';
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
    <div class="wcard-ex">${wcardExChips(w, dataFor(currentUser))}</div>
    ${wcardRecordsLine(w, dataFor(currentUser))}
    <div class="wcard-actions">
      <button class="btn btn-primary" data-action="start-session" data-id="${esc(w.id)}" type="button">Comenzar</button>
      <button class="btn btn-ghost" data-action="edit-workout" data-id="${esc(w.id)}" type="button">Editar</button>
      <button class="icon-btn danger" data-action="erase-lib" data-id="${esc(w.id)}" type="button" aria-label="Quitar «${esc(w.name)}» de la biblioteca" title="Borrar de la biblioteca (se conserva tu historial y puedes restaurarlo luego)">✕</button>
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
    <div class="wcard-ex">${wcardExChips(w, dataFor(currentUser))}</div>
    ${wcardRecordsLine(w, dataFor(currentUser))}
    <div class="wcard-actions">
      <button class="btn btn-primary" data-action="start-session" data-id="${esc(w.id)}" type="button">Comenzar</button>
      <button class="btn btn-ghost" data-action="edit-workout" data-id="${esc(w.id)}" type="button">Editar</button>
      <button class="icon-btn danger" data-action="delete-workout" data-id="${esc(w.id)}" type="button" aria-label="Eliminar el entrenamiento «${esc(w.name)}»" title="Eliminar">✕</button>
    </div>
    <div class="wcard-file">
      <button class="btn btn-ghost btn-sm" data-action="export-workout" data-id="${esc(w.id)}" type="button" title="Guardar este entrenamiento como archivo para compartirlo">Exportar</button>
      <button class="btn btn-ghost btn-sm" data-action="import-workout" data-id="${esc(w.id)}" type="button" title="Cargar un archivo de entrenamiento">Importar</button>
    </div>
  </article>`;
}
/* Una sola tarjeta para continuar: la sesión abierta y el programa elegido.
   El botón del programa calcula el día siguiente al último realizado, sin
   obligar a buscarlo a mano en la ficha del programa. */
function openSessionsFor(d){
  return ((d && d.sessions) || [])
    .filter(s => !s.finished && s.status !== 'cancelled' && s.status !== 'completed')
    .sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
}
function continueSection(d){
  const open = openSessionsFor(d);
  const last = getLastProgram();
  if(!open.length && !last) return '';
  let sessionRow = '';
  if(open.length){
    const s = open[0];
    const t = sessionTotals(s);
    const more = open.length > 1 ? ` · ${open.length - 1} más sin terminar` : '';
    sessionRow = `
      <div class="continue-row">
        <div class="continue-copy">
          <span class="continue-kicker">${s.status === 'paused' ? 'Sesión pausada' : 'Sesión sin terminar'}</span>
          <h3>${esc(s.workoutName)}</h3>
          <p class="muted small">${t.setsDone}/${t.setsTotal || 0} series · ${fmtDuration(elapsedSec(s))}${more}</p>
        </div>
        <div class="continue-actions">
          <button class="btn btn-primary" data-action="resume-session" data-id="${esc(s.id)}" type="button">Continuar</button>
        </div>
      </div>`;
  }
  let programRow = '';
  if(last){
    const bits = [last.weekLabel, last.day].filter(Boolean);
    const detail = bits.length ? bits.map(esc).join(' · ') : 'Elige el día siguiente sin buscar la semana';
    programRow = `
      <div class="continue-row">
        <div class="continue-copy">
          <span class="continue-kicker">${last.di != null ? 'Programa en curso' : 'Programa elegido'}</span>
          <h3>${esc(last.title || last.slug)}</h3>
          <p class="muted small">${detail}${last.author ? ' · por ' + esc(last.author) : ''}</p>
        </div>
        <div class="continue-actions">
          <button class="btn btn-primary" data-action="continue-program" type="button">Siguiente día</button>
          <button class="btn btn-ghost btn-sm" data-action="last-prog-open" type="button">Ver programa</button>
          <button class="icon-btn danger" data-action="last-prog-clear" type="button" aria-label="Quitar el programa del inicio" title="Quitar de aquí (el programa sigue en el catálogo)">✕</button>
        </div>
      </div>`;
  }
  return `
    <section class="section continue-section" aria-label="Continuar entrenamiento">
      <div class="section-head"><h2>Continuar</h2><span class="muted">Sesión y programa</span></div>
      <div class="continue-card">${sessionRow}${programRow}</div>
    </section>`;
}
/* Convierte un ejercicio heredado en su primera serie real usando solo los
   valores ya guardados: nunca inventa series adicionales. */
function legacyToSets(ex){
  if(!ex || hasSets(ex)) return;
  const w = ex.weight === '' || ex.weight == null ? '' : Number(ex.weight);
  const r = ex.reps === '' || ex.reps == null ? '' : Number(ex.reps);
  const hasData = w !== '' || r !== '';
  ex.sets = [{
    id: uid(), number: 1,
    weight: isFinite(w) ? w : '',
    reps: isFinite(r) ? r : 0,
    completed: !!ex.done && hasData,
    type: 'working', rir: null, rpe: null, restSeconds: null, notes: ''
  }];
  ex.targetSets = clampInt(ex.targetSets, LIMITS.sets, 1);
  ex.targetReps = clampInt(ex.targetReps, LIMITS.reps, isFinite(r) && r > 0 ? r : 10);
  ex.setModel = 2;
  ex.legacyNote = 'Convertido desde un registro anterior: una sola serie con los valores guardados.';
  ex.done = ex.sets[0].completed;
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
        <p class="eyebrow">${greet}, ${esc(accountDisplayName())}</p>
        <h1>A darlo todo hoy</h1>
        <p class="hero-sub">Carga una sesión de la biblioteca del entrenador o crea tu propio entrenamiento.</p>
      </div>
    </section>

    ${dashboardAnalyticsHTML(d)}

    ${continueSection(d)}

    ${planCardHTML(d)}

    ${dashboardProgressHTML(st)}

    <section class="stats-grid five small">
      <div class="stat-card"><p class="stat-value">${st.week}</p><p class="stat-label">Entrenos esta semana</p></div>
      <div class="stat-card"><p class="stat-value">${st.month}</p><p class="stat-label">Este mes</p></div>
      <div class="stat-card"><p class="stat-value">${st.hasVolume ? fmtKg(st.weekVol) + ' kg' : '—'}</p><p class="stat-label">Volumen semanal</p></div>
      <div class="stat-card"><p class="stat-value">${st.recordsNow}</p><p class="stat-label">Récords vigentes</p></div>
      <div class="stat-card"><p class="stat-value">${st.curW != null ? fmtKg(st.curW) + ' kg' : '—'}</p><p class="stat-label">Peso actual</p></div>
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
        <span class="muted">Catálogo de programas (Boostcamp y Muscle &amp; Strength): elige uno y carga cualquier día como sesión.</span>
      </div>
      <div id="bc-body"${sectionCollapsed('bc') ? ' class="hidden"' : ''}>
        <div class="field bc-search-field"><input id="bc-search" placeholder="Buscar por nombre, coach o enfoque… p. ej. 5/3/1, PHUL, Wendler" autocomplete="off" aria-label="Buscar programas de entrenamiento"></div>
        <div id="bc-cats" class="bc-cats" hidden></div>
        <div id="bc-result" class="workout-cards"><div class="empty-state">Cargando el catálogo de programas…</div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Mis entrenamientos</h2>
        <div class="btn-group">
          <button class="btn btn-ghost btn-sm" data-action="open-library" type="button">Biblioteca</button>
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

/* ---------------- Biblioteca de ejercicios ---------------- */
function exerciseMeta(ex, d){
  const entry = exerciseEntryFor(ex, d);
  if(!entry) return '';
  return [groupLabel(entry.group), equipLabel(entry.equip)].filter(Boolean).join(' · ');
}
function exerciseListHtml(list){
  if(!list.length) return '<div class="empty-state">Ningún ejercicio coincide. Cambia los filtros o crea uno propio.</div>';
  const d = currentUser ? dataFor(currentUser) : null;
  return list.map(x => {
    const mark = bestMarkFor(d, x.id);
    const recs = autoRecordsFor(d, x.id).length;
    return `
    <div class="ex-pick" role="listitem">
      <button class="ex-pick-main" data-action="pick-ex" data-id="${esc(x.id)}" type="button">
        <span class="ex-pick-name">${esc(x.name)}${x.custom ? ' <span class="tag-custom">propio</span>' : ''}</span>
        <span class="ex-pick-meta">${esc(groupLabel(x.group) || 'Sin grupo')}${equipLabel(x.equip) ? ' · ' + esc(equipLabel(x.equip)) : ''}${(x.aliases || []).length ? ' · alias: ' + esc((x.aliases || []).join(', ')) : ''}</span>
        ${mark ? `<span class="ex-pick-pr">${markText(mark)}<span class="ex-pick-recs">${recs ? recs + ' récord' + (recs === 1 ? '' : 's') + ' automático' + (recs === 1 ? '' : 's') : 'sin récords automáticos'}</span></span>`
          : (recs ? `<span class="ex-pick-pr"><span class="ex-pick-recs">${recs} récord${recs === 1 ? '' : 's'} automático${recs === 1 ? '' : 's'}</span></span>` : '')}
      </button>
      ${x.custom ? `<span class="ex-pick-tools">
        <button class="icon-btn" data-action="custom-ex-edit" data-id="${esc(x.id)}" type="button" aria-label="Editar «${esc(x.name)}»" title="Editar">✎</button>
        <button class="icon-btn danger" data-action="custom-ex-del" data-id="${esc(x.id)}" type="button" aria-label="Eliminar «${esc(x.name)}»" title="Eliminar">✕</button>
      </span>` : ''}
    </div>`;
  }).join('');
}
function fieldValue(id){ const el = $('#' + id); return el ? String(el.value || '') : ''; }
/* kind: 'modal' (selector del editor) o 'lib' (página de biblioteca). */
function refreshExerciseList(kind){
  const pre = kind === 'modal' ? 'exp' : 'lib';
  const box = $('#' + pre + '-list');
  if(!box) return;
  const d = dataFor(currentUser);
  const q = fieldValue(pre + '-search');
  const g = fieldValue(pre + '-group');
  const eq = fieldValue(pre + '-equip');
  const list = filterExercises(d, q, g, eq);
  const count = $('#' + pre + '-count');
  if(count){
    count.textContent = list.length + (list.length === 1 ? ' ejercicio' : ' ejercicios')
      + (q.trim() ? ' para «' + q.trim() + '»' : '')
      + (g ? ' · ' + groupLabel(g) : '') + (eq ? ' · ' + equipLabel(eq) : '');
  }
  box.innerHTML = exerciseListHtml(list);
}
function renderLibrary(main){
  main.innerHTML = `
    <div class="page-head">
      <h1>Biblioteca de ejercicios</h1>
      <p class="muted">${EXERCISE_CATALOG.length} ejercicios con identificador estable y alias. Busca por nombre o alias y filtra por grupo muscular y material.</p>
    </div>
    <div class="editor-card lib-card">
      <div class="field"><input id="lib-search" placeholder="Buscar por nombre o alias… p. ej. banca, RDL, dominadas" autocomplete="off" aria-label="Buscar ejercicio"></div>
      <div class="picker-filters">
        <label class="field"><span>Grupo muscular</span><select id="lib-group">${groupOptions('')}</select></label>
        <label class="field"><span>Material</span><select id="lib-equip">${equipOptions('')}</select></label>
      </div>
      <p id="lib-count" class="muted small"></p>
      <div id="lib-list" class="ex-pick-list"></div>
      <div class="editor-actions">
        <button class="btn btn-ghost" data-action="back" type="button">Volver</button>
        <button class="btn btn-primary" data-action="custom-ex-new" type="button">+ Ejercicio propio</button>
      </div>
    </div>`;
  refreshExerciseList('lib');
}
function openExercisePicker(){
  openModal(`
    <h3>Biblioteca de ejercicios</h3>
    <p class="modal-body">Busca por nombre o alias, filtra por grupo y material, y pulsa un ejercicio para añadirlo.</p>
    <div class="field"><input id="exp-search" placeholder="Buscar… p. ej. banca, RDL, dominadas" autocomplete="off" aria-label="Buscar ejercicio"></div>
    <div class="picker-filters">
      <label class="field"><span>Grupo</span><select id="exp-group">${groupOptions('')}</select></label>
      <label class="field"><span>Material</span><select id="exp-equip">${equipOptions('')}</select></label>
    </div>
    <p id="exp-count" class="muted small"></p>
    <div id="exp-list" class="ex-pick-list" role="list"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
      <button class="btn btn-primary" data-action="custom-ex-new" type="button">+ Crear ejercicio</button>
    </div>`);
  refreshExerciseList('modal');
  setTimeout(() => { const i = $('#exp-search'); if(i) i.focus(); }, 60);
}
function openCustomExercise(id){
  const d = dataFor(currentUser);
  const own = id ? userExercises(d).find(x => x.id === id) : null;
  openModal(`
    <h3>${own ? 'Editar ejercicio propio' : 'Nuevo ejercicio propio'}</h3>
    <label class="field"><span>Nombre</span>
      <input id="cex-name" maxlength="${LIMITS.name}" value="${esc(own ? own.name : '')}" placeholder="p. ej. Press banca con pausa"></label>
    <div class="picker-filters">
      <label class="field"><span>Grupo muscular</span><select id="cex-group">${groupOptions(own ? own.group : '', false)}</select></label>
      <label class="field"><span>Material</span><select id="cex-equip">${equipOptions(own ? own.equip : '', false)}</select></label>
    </div>
    <label class="field"><span>Alias (separados por comas)</span>
      <input id="cex-aliases" value="${esc(((own && own.aliases) || []).join(', '))}" placeholder="p. ej. banca pausa, pause bench"></label>
    <p class="muted small">El identificador no cambia al renombrarlo: el historial y los récords siguen apuntando al mismo ejercicio.</p>
    ${own ? `<p class="muted small">Identificador: <code>${esc(own.id)}</code></p>` : ''}
    <div id="cex-err" class="auth-err hidden" role="alert"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
      <button class="btn btn-primary" data-action="custom-ex-save" data-id="${esc(own ? own.id : '')}" type="button">Guardar</button>
    </div>`);
  setTimeout(() => { const i = $('#cex-name'); if(i && !own) i.focus(); }, 60);
}
/* Refresca lo visible tras cambiar la biblioteca propia. */
function refreshExerciseViews(){
  if($('#lib-list')) refreshExerciseList('lib');
  if($('#exp-list')) refreshExerciseList('modal');
  if($('#editor-rows') && state.editor) renderEditorRows();
}

/* ---------------- Sesión ---------------- */
function getWorkout(id){
  const d = dataFor(currentUser);
  return d.workouts.find(w => w.id === id) || LIBRARY.find(w => w.id === id);
}
function getSession(id){ return dataFor(currentUser).sessions.find(s => s.id === id); }
function newSessionFor(workout, seedByName){
  const d = dataFor(currentUser);
  const s = {
    id: uid(), workoutId: workout.id, workoutName: workout.name, date: todayISO(),
    startedAt: nowIso(), lastSavedAt: nowIso(), finishedAt: null, durationSec: null,
    finished: false, status: 'in_progress', pausedMs: 0, pausedAt: null,
    notes: '', setModel: 2,
    exercises: workout.exercises.map(e => {
      const sets = plannedSetsFor(e);
      const seed = seedByName && seedByName[exKeyOf(e, d)];
      if(seed && seed.length){
        sets.forEach((st, i) => {
          const p = seed[i];
          if(p){ st.weight = p.weight; st.reps = p.reps; }
        });
      }
      return {
        id: e.id || uid(), name: e.name, exId: e.exId || resolveExerciseId(e.name, d),
        targetSets: clampInt(e.sets, LIMITS.sets, sets.length || 1),
        targetReps: normReps(e.reps, 10),
        target: e.target || null,
        superset: !!e.superset,
        rest: e.rest == null || e.rest === '' ? null : clampInt(e.rest, 600, null),
        done: false,
        setModel: 2,
        sets,
      };
    }),
  };
  s.currentExerciseId = s.exercises[0] ? s.exercises[0].id : null;
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
    exercises: old.exercises.map(e => ({ id: uid(), name: e.name, exId: exKeyOf(e, dataFor(currentUser)), sets: hasSets(e) ? e.sets.length : e.targetSets, reps: e.targetReps, target: e.target || null, rest: e.rest == null || e.rest === '' ? null : clampInt(e.rest, 600, null), superset: !!e.superset })),
  };
  const s = newSessionFor(w, seedFromSession(old));
  state.sessionId = s.id;
  return s;
}
function sessionPct(s){
  const t = sessionTotals(s);
  if(t.setsTotal) return Math.round(t.setsDone / t.setsTotal * 100);
  if(!s || !s.exercises || !s.exercises.length) return 0;
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
/* ============================================================
   DESCANSO ENTRE SERIES (persistente) Y SUPERSERIES
   El temporizador se guarda en la propia sesión con su hora de fin
   absoluta: al recargar se retoma donde iba, y si el tiempo ya pasó
   se muestra como terminado en vez de contar hacia atrás.
   ============================================================ */
const DEFAULT_REST_SECONDS = 90;
let _restClock = null;
/* Cada barra de descanso recibe una generación: un intervalo antiguo que
   sobreviva a un cambio de pantalla no puede tocar el temporizador nuevo ni
   sobrescribir su estado. */
let _restGen = 0;
function stopRestClock(){
  _restGen++;
  if(_restClock){ clearInterval(_restClock); _restClock = null; }
}
/* El reloj no es una región viva: si lo fuera, leería cada segundo. Los
   cambios importantes (inicio, pausa, reanudación, ajuste y fin) se anuncian
   aquí una sola vez. */
function announceRest(message){
  const region = $('#rest-status');
  if(!region || !message) return;
  region.textContent = '';
  setTimeout(() => { const live = $('#rest-status'); if(live) live.textContent = message; }, 40);
}
function fmtClock(sec){
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
function restSecondsFor(s, ex, st){
  if(st && st.restSeconds != null && st.restSeconds !== ''){
    const own = clampInt(st.restSeconds, 600, null);
    if(own) return Math.max(5, own);
  }
  if(ex && ex.rest != null && ex.rest !== ''){
    const planned = clampInt(ex.rest, 600, null);
    if(planned) return Math.max(5, planned);
  }
  return DEFAULT_REST_SECONDS;
}
/* El tiempo restante se calcula siempre con marcas de tiempo reales; el
   intervalo solo repinta la pantalla. En pausa se cuenta desde el resto
   guardado en milisegundos. */
function restPaused(s){ return !!(s && s.rest && s.rest.pausedAt && isFinite(s.rest.remainingMs)); }
function restState(s){
  if(!s || !s.rest) return 'stopped';
  if(restPaused(s)) return 'paused';
  if(restRemaining(s) > 0) return 'running';
  return 'done';
}
function restRemaining(s){
  if(!s || !s.rest) return 0;
  if(restPaused(s)) return Math.max(0, Math.ceil(Number(s.rest.remainingMs) / 1000));
  if(!isFinite(s.rest.endsAt)) return 0;
  return Math.max(0, Math.ceil((s.rest.endsAt - Date.now()) / 1000));
}
/* ============================================================
   AVISO DE FIN DE DESCANSO
   Pitido corto (Web Audio, sin archivos) y vibración en móvil.
   Se dispara una sola vez por descanso y se puede silenciar con
   la campana de la barra de descanso; la preferencia se guarda
   por cuenta. Cualquier fallo del audio no debe romper el reloj.
   ============================================================ */
let _restAudioCtx = null;
const REST_ALERT_MIN_SECONDS = 1;
const REST_ALERT_MAX_SECONDS = 4;
const REST_ALERT_DEFAULT_SECONDS = 2;
const HEAVY_SET_RATIO = 0.85;
/* Sonidos de la alarma. «classic» no descarga nada: usa Web Audio. Los otros
   tres son las vistas previas de Freesound, con su atribución en Ajustes. */
const REST_SOUNDS = [
  { id: 'classic', label: 'Clásico (tres notas)', src: null },
  { id: 'alarm', label: 'Reloj de mesa', src: 'sounds/rest-alarm.mp3' },
  { id: 'digital', label: 'Reloj digital', src: 'sounds/rest-digital.mp3' },
  { id: 'timer', label: 'Temporizador de cocina', src: 'sounds/rest-timer.mp3' },
];
let _restAudioCache = {};
let _restAudioTimer = null;
function restSoundChoice(){
  const d = currentUser ? dataFor(currentUser) : null;
  const raw = d && d.prefs ? d.prefs.restSoundChoice : null;
  return REST_SOUNDS.some(x => x.id === raw) ? raw : 'classic';
}
function setRestSoundChoice(value){
  const d = currentUser ? dataFor(currentUser) : null;
  if(!d) return 'classic';
  if(!d.prefs || typeof d.prefs !== 'object') d.prefs = {};
  d.prefs.restSoundChoice = REST_SOUNDS.some(x => x.id === value) ? value : 'classic';
  saveDB();
  return d.prefs.restSoundChoice;
}
function stopRestSoundPreview(){
  if(_restAudioTimer){ clearTimeout(_restAudioTimer); _restAudioTimer = null; }
  Object.keys(_restAudioCache).forEach(k => {
    try{ _restAudioCache[k].pause(); _restAudioCache[k].currentTime = 0; }catch(e){}
  });
}
/* Preferencias por cuenta: por defecto todo activado, y solo un false
   explícito desactiva (así las cuentas antiguas no cambian de golpe). */
function prefEnabled(name, d){
  const data = d || (currentUser ? dataFor(currentUser) : null);
  return !data || !data.prefs || data.prefs[name] !== false;
}
function setPref(name, value){
  const d = currentUser ? dataFor(currentUser) : null;
  if(!d) return null;
  if(!d.prefs || typeof d.prefs !== 'object') d.prefs = {};
  d.prefs[name] = value;
  saveDB();
  return value;
}
function restAlertsEnabled(){ return prefEnabled('restAlerts'); }
function restSoundEnabled(){ return prefEnabled('restSound'); }
function restVibrateEnabled(){ return prefEnabled('restVibrate'); }
function restAlertSeconds(){
  const d = currentUser ? dataFor(currentUser) : null;
  const raw = d && d.prefs ? Number(d.prefs.restAlertSeconds) : NaN;
  if(!isFinite(raw) || !raw) return REST_ALERT_DEFAULT_SECONDS;
  return Math.max(REST_ALERT_MIN_SECONDS, Math.min(REST_ALERT_MAX_SECONDS, Math.round(raw)));
}
function setRestAlertSeconds(v){
  const d = currentUser ? dataFor(currentUser) : null;
  if(!d) return REST_ALERT_DEFAULT_SECONDS;
  if(!d.prefs || typeof d.prefs !== 'object') d.prefs = {};
  const n = Number(v);
  d.prefs.restAlertSeconds = Math.max(REST_ALERT_MIN_SECONDS, Math.min(REST_ALERT_MAX_SECONDS, Math.round(isFinite(n) && n ? n : REST_ALERT_DEFAULT_SECONDS)));
  saveDB();
  return d.prefs.restAlertSeconds;
}
/* Mejor peso conocido del ejercicio (histórico + sesión en curso, sin
   calentamientos ni series sin completar ni sesiones canceladas). */
function bestWeightFor(d, id){
  let best = 0;
  ((d && d.sessions) || []).forEach(sn => {
    if(sn.status === 'cancelled') return;
    (sn.exercises || []).forEach(e => {
      if(exKeyOf(e, d) !== id) return;
      if(hasSets(e)) e.sets.forEach(st => {
        if(st.completed && st.type !== 'warmup' && Number(st.weight) > best) best = Number(st.weight);
      });
      else if(Number(e.weight) > best) best = Number(e.weight);
    });
  });
  return best;
}
/* Serie pesada = serie efectiva con al menos el 85 % del mejor peso del
   ejercicio. Es una medida relativa a tu propio historial, así que sirve
   tanto para 30 kg como para 150 kg. */
function isHeavySet(d, ex, st){
  if(!d || !ex || !st) return false;
  if(!st.completed || st.type === 'warmup') return false;
  const w = Number(st.weight);
  if(!(w > 0)) return false;
  const best = bestWeightFor(d, exKeyOf(ex, d));
  if(!(best > 0)) return false;
  return w >= best * HEAVY_SET_RATIO;
}
/* Plan del aviso: las notas del tono normal duran menos que las del tono
   pesado y suenan más juntas; la duración elegida reparte el aviso. */
function restAlertPlan(heavy, seconds){
  const span = Math.max(REST_ALERT_MIN_SECONDS, Math.min(REST_ALERT_MAX_SECONDS, Math.round(Number(seconds) || restAlertSeconds())));
  const freqs = heavy ? [660, 880, 660, 1046] : [880, 880, 1046];
  const dur = heavy ? 0.32 : 0.18;
  const step = freqs.length > 1 ? Math.max(dur + 0.08, (span - dur) / (freqs.length - 1)) : 0;
  const beeps = freqs.map((freq, i) => ({ freq, offset: Math.round(i * step * 1000) / 1000, dur }));
  return { seconds: span, heavy: !!heavy, beeps, vibration: heavy ? [220, 120, 220, 120, 320] : [140, 90, 140] };
}
function beepRestClassic(heavy){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    if(!_restAudioCtx) _restAudioCtx = new Ctx();
    const ctx = _restAudioCtx;
    if(ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    restAlertPlan(heavy).beeps.forEach(b => {
      const t0 = ctx.currentTime + b.offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(b.freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(heavy ? 0.32 : 0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + b.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + b.dur + 0.02);
    });
  }catch(err){ /* sin audio disponible: se sigue sin sonido */ }
}
/* Reproduce el sonido elegido. Si el archivo no está cacheado, falla la red o
   el navegador bloquea la reproducción, vuelve al tono sintetizado: el aviso
   de descanso nunca se queda mudo por un MP3. */
function beepRestEnd(heavy){
  const pick = REST_SOUNDS.find(x => x.id === restSoundChoice()) || REST_SOUNDS[0];
  if(!pick.src){ beepRestClassic(heavy); return; }
  try{
    stopRestSoundPreview();
    let audio = _restAudioCache[pick.id];
    if(!audio){
      audio = new Audio(pick.src);
      audio.preload = 'auto';
      _restAudioCache[pick.id] = audio;
    }
    audio.volume = heavy ? 0.95 : 0.85;
    try{ audio.currentTime = 0; }catch(e){}
    const played = audio.play();
    if(played && typeof played.catch === 'function') played.catch(() => beepRestClassic(heavy));
    _restAudioTimer = setTimeout(() => {
      try{ audio.pause(); }catch(e){}
      _restAudioTimer = null;
    }, Math.max(1000, restAlertSeconds() * 1000));
  }catch(err){ beepRestClassic(heavy); }
}
function vibrateRestEnd(heavy){
  try{
    if(typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(restAlertPlan(heavy).vibration);
  }catch(err){}
}
function notifyRestEnd(s){
  if(!s || !s.rest || s.rest.notifiedAt) return false;
  s.rest.notifiedAt = Date.now();
  saveDB();
  if(!restAlertsEnabled()) return false;
  const heavy = !!(s.rest && s.rest.heavy);
  if(restSoundEnabled()) beepRestEnd(heavy);
  if(restVibrateEnabled()) vibrateRestEnd(heavy);
  return true;
}
function restAlertsBtn(){
  const on = restAlertsEnabled();
  return '<button class="btn btn-ghost btn-sm rest-alerts" data-action="rest-alerts" type="button"'
    + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
    + ' aria-label="' + (on ? 'Silenciar el aviso al terminar el descanso' : 'Activar el aviso al terminar el descanso') + '"'
    + ' title="' + (on ? 'Silenciar aviso' : 'Activar aviso') + '">' + (on ? '🔔' : '🔕') + '</button>';
}
function restAlertLengthSelect(){
  const cur = restAlertSeconds();
  return '<select class="rest-alert-len" data-action="rest-alert-len" aria-label="Duración del aviso de descanso" title="Duración del aviso">'
    + [REST_ALERT_MIN_SECONDS, 2, 3, REST_ALERT_MAX_SECONDS].map(n => '<option value="' + n + '"' + (n === cur ? ' selected' : '') + '>' + n + ' s</option>').join('')
    + '</select>';
}
function toggleRestAlerts(){
  const d = dataFor(currentUser);
  if(!d.prefs || typeof d.prefs !== 'object') d.prefs = {};
  d.prefs.restAlerts = !restAlertsEnabled();
  saveDB();
  toast(d.prefs.restAlerts ? 'Aviso de descanso activado.' : 'Aviso de descanso silenciado.', 'info');
  render();
}
function startRestTimer(s, seconds, ex, st, focusAction){
  if(!s || s.finished) return null;
  const duration = Math.max(5, Math.min(600, Math.round(Number(seconds) || DEFAULT_REST_SECONDS)));
  const startedAt = Date.now();
  /* Un solo descanso por sesión: al empezar otro se reemplaza el anterior, así
     que nunca conviven dos temporizadores. */
  s.rest = {
    startedAt, duration,
    endsAt: startedAt + duration * 1000,
    remainingMs: null, pausedAt: null, notifiedAt: null,
    exId: ex ? ex.id : null, setId: st ? st.id : null,
    heavy: isHeavySet(currentUser ? dataFor(currentUser) : null, ex, st),
  };
  s.lastSavedAt = nowIso();
  saveDB();
  renderRestBar(s, focusAction ? { restoreFocus: true, focusAction } : {});
  announceRest('Descanso iniciado: ' + fmtClock(s.rest.duration) + '.');
  return s.rest;
}
/* Pausar guarda el tiempo restante exacto en milisegundos; reanudar calcula un
   fin nuevo a partir de ese resto. Ni bloquear el móvil ni cambiar de pantalla
   regalan ni roban segundos. */
function pauseRestTimer(s, focusAction){
  if(!s || !s.rest || restPaused(s)) return false;
  const end = isFinite(s.rest.endsAt) ? s.rest.endsAt : Date.now();
  s.rest.remainingMs = Math.max(0, end - Date.now());
  s.rest.pausedAt = Date.now();
  s.rest.endsAt = null;
  s.rest.notifiedAt = null;
  s.lastSavedAt = nowIso();
  saveDB();
  renderRestBar(s, focusAction ? { restoreFocus: true, focusAction } : {});
  announceRest('Descanso en pausa. Quedan ' + fmtClock(restRemaining(s)) + '.');
  return true;
}
function resumeRestTimer(s, focusAction){
  if(!s || !s.rest || !restPaused(s)) return false;
  const leftMs = Math.max(1000, Number(s.rest.remainingMs) || 0);
  const totalMs = Math.max(leftMs, (Number(s.rest.duration) || 0) * 1000);
  s.rest.startedAt = Date.now() - (totalMs - leftMs);
  s.rest.duration = Math.max(5, Math.round(totalMs / 1000));
  s.rest.endsAt = Date.now() + leftMs;
  s.rest.remainingMs = null;
  s.rest.pausedAt = null;
  s.rest.notifiedAt = null;
  s.lastSavedAt = nowIso();
  saveDB();
  renderRestBar(s, focusAction ? { restoreFocus: true, focusAction } : {});
  announceRest('Descanso reanudado. Quedan ' + fmtClock(restRemaining(s)) + '.');
  return true;
}
function resetRestTimer(s, seconds){
  if(!s) return null;
  const duration = Math.max(5, Math.min(600, Math.round(Number(seconds) || (s.rest && s.rest.duration) || DEFAULT_REST_SECONDS)));
  return startRestTimer(s, duration, null, null);
}
function startRestForCurrent(s, seconds, focusAction){
  if(!s || s.finished) return null;
  const ex = (s.exercises || []).find(e => e && e.id === s.currentExerciseId) || (s.exercises || [])[0] || null;
  return startRestTimer(s, seconds || restSecondsFor(s, ex, null), ex, null, focusAction);
}
/* Grupos de superserie: ejercicios CONSECUTIVOS marcados como superset.
   Cada grupo recibe una letra (A, B, C…) y sus miembros se numeran A1, A2… */
function supersetGroups(s){
  const list = (s && s.exercises) || [];
  const out = [];
  for(let i = 0; i < list.length; i++){
    if(!list[i].superset) continue;
    let j = i;
    while(j + 1 < list.length && list[j + 1].superset) j++;
    if(j > i) out.push({ from: i, to: j, letter: String.fromCharCode(65 + out.length), members: list.slice(i, j + 1) });
    i = j;
  }
  return out;
}
function supersetGroupOf(s, exId){
  return supersetGroups(s).find(g => g.members.some(m => m.id === exId)) || null;
}
function sessionExerciseIndex(s, exId){
  if(!s || !Array.isArray(s.exercises)) return -1;
  return s.exercises.findIndex(e => e && e.id === exId);
}
function sessionNextExercise(s, exId){
  if(!s || !Array.isArray(s.exercises)) return null;
  const idx = sessionExerciseIndex(s, exId);
  if(idx < 0 || idx >= s.exercises.length - 1) return null;
  return { ex: s.exercises[idx + 1], idx: idx + 1 };
}
function sessionPrevExercise(s, exId){
  if(!s || !Array.isArray(s.exercises)) return null;
  const idx = sessionExerciseIndex(s, exId);
  if(idx <= 0) return null;
  return { ex: s.exercises[idx - 1], idx: idx - 1 };
}
/* Progreso de un ejercicio para el navegador compacto: series hechas y
   pendientes, sin tocar nada de lo ya registrado. */
function sessionExerciseStats(ex){
  if(!ex) return { done: 0, pending: 0, total: 0, doneAll: false };
  if(!hasSets(ex)) return { done: ex.done ? 1 : 0, pending: ex.done ? 0 : 1, total: 1, doneAll: !!ex.done };
  const done = ex.sets.filter(st => st.completed).length;
  return { done, pending: ex.sets.length - done, total: ex.sets.length, doneAll: ex.sets.length > 0 && done === ex.sets.length };
}
function sessionExerciseStatus(ex){
  const st = sessionExerciseStats(ex);
  if(st.doneAll) return { key: 'done', label: 'Terminado' };
  if(st.done > 0) return { key: 'partial', label: st.done + '/' + st.total + ' hechas' };
  return { key: 'pending', label: 'Pendiente' };
}
/* Al completar una serie: dentro de una superserie solo se descansa al
   terminar el último ejercicio del grupo; en el resto, descanso inmediato. */
function maybeStartRest(s, ex, st){
  const g = supersetGroupOf(s, ex.id);
  if(g){
    const idx = s.exercises.findIndex(x => x.id === ex.id);
    if(idx < g.to){
      const next = s.exercises[idx + 1];
      toast('Superserie sin descanso: sigue con «' + (next ? next.name : '') + '».', 'info');
      return;
    }
  }
  startRestTimer(s, restSecondsFor(s, ex, st), ex, st);
}
/* Barra de descanso: estado siempre visible (detenido, en curso, en pausa o
   completado) y controles para iniciar, pausar, reanudar, ajustar, reiniciar y
   saltar. Todo se calcula con restRemaining(), nunca con el intervalo. */
function restMenuOpen(){
  if(typeof state.restMenuOpen === 'boolean') return state.restMenuOpen;
  return typeof window !== 'undefined' && Number(window.innerWidth) >= 640;
}
function bindRestMenu(slot, s){
  const menu = slot.querySelector('.rest-menu');
  if(!menu) return;
  menu.open = restMenuOpen();
  menu.addEventListener('toggle', () => { state.restMenuOpen = menu.open; });
  const lenSel = slot.querySelector('[data-action="rest-alert-len"]');
  if(lenSel) lenSel.addEventListener('change', () => {
    setRestAlertSeconds(lenSel.value);
    toast('Duración del aviso: ' + restAlertSeconds() + ' s.', 'info');
    renderRestBar(s);
  });
}
function restMenuHTML(s, paused, done){
  const sid = esc(s.id);
  const buttons = [];
  if(!done){
    buttons.push(paused
      ? '<button class="btn btn-primary btn-sm" data-action="rest-resume" data-sid="' + sid + '" type="button">Reanudar</button>'
      : '<button class="btn btn-ghost btn-sm" data-action="rest-pause" data-sid="' + sid + '" type="button">Pausar</button>');
    buttons.push('<button class="btn btn-ghost btn-sm" data-action="rest-minus" data-sid="' + sid + '" type="button" aria-label="Quitar 15 segundos de descanso">−15 s</button>');
    buttons.push('<button class="btn btn-ghost btn-sm" data-action="rest-plus" data-sid="' + sid + '" type="button" aria-label="Añadir 15 segundos de descanso">+15 s</button>');
  }
  buttons.push('<button class="btn btn-ghost btn-sm" data-action="rest-reset" data-sid="' + sid + '" type="button">Reiniciar</button>');
  buttons.push('<button class="btn btn-ghost btn-sm" data-action="rest-skip" data-sid="' + sid + '" type="button">' + (done ? 'Cerrar' : 'Saltar') + '</button>');
  return '<details class="rest-menu">'
    + '<summary aria-label="Opciones de descanso">⚙ Opciones</summary>'
    + '<div class="rest-menu-panel">'
    + '<div class="rest-menu-list">' + buttons.join('') + '</div>'
    + '<div class="rest-menu-extra">' + restAlertsBtn() + restAlertLengthSelect() + '</div>'
    + '</div></details>';
}
function restoreRestFocus(slot, action){
  if(!slot || !action) return;
  const map = { 'rest-start': 'rest-pause', 'rest-pause': 'rest-resume', 'rest-resume': 'rest-pause' };
  const target = slot.querySelector('[data-action="' + (map[action] || action) + '"]');
  if(!target) return;
  try{ target.focus({ preventScroll: true }); }catch(e){ try{ target.focus(); }catch(_){} }
}
function renderRestBar(s, opts){
  stopRestClock();
  const slot = $('#rest-slot');
  if(!slot || !s) return;
  const restore = !!(opts && opts.restoreFocus);
  const active = restore && slot.contains(document.activeElement) ? document.activeElement : null;
  const activeAction = (active && active.getAttribute('data-action')) || (opts && opts.focusAction) || null;
  const sid = esc(s.id);
  const locked = !!s.finished || s.status === 'completed' || s.status === 'cancelled';
  if(!s.rest){
    if(locked){ slot.innerHTML = ''; return; }
    slot.innerHTML = '<div class="rest-bar idle" role="group" aria-label="Descanso">'
      + '<div class="rest-main"><span class="rest-label">Descanso</span>'
      + '<span class="rest-state">Detenido</span>'
      + '<span class="rest-actions"><button class="btn btn-ghost btn-sm" data-action="rest-start" data-sid="' + sid + '" type="button">Iniciar descanso</button></span></div>'
      + '</div>';
    return;
  }
  const left = restRemaining(s);
  const status = restState(s);
  if(status === 'done'){
    const firstEnd = !s.rest.notifiedAt;
    notifyRestEnd(s);
    if(firstEnd) announceRest('Descanso completado.');
    slot.innerHTML = '<div class="rest-bar done" role="group" aria-label="Descanso completado">'
      + '<div class="rest-main"><span class="rest-label">Descanso completado</span>'
      + (s.rest.heavy ? '<span class="rest-heavy">Serie pesada</span>' : '')
      + restMenuHTML(s, false, true)
      + '</div></div>';
    bindRestMenu(slot, s);
    return;
  }
  const paused = status === 'paused';
  const pct = Math.min(100, Math.max(0, Math.round((1 - left / Math.max(1, s.rest.duration)) * 100)));
  slot.innerHTML = '<div class="rest-bar' + (paused ? ' paused' : '') + '" role="timer">'
    + '<div class="rest-main"><span class="rest-label">Descanso</span>'
    + '<span class="rest-state">' + (paused ? 'En pausa' : 'En curso') + '</span>'
    + (s.rest.heavy ? '<span class="rest-heavy">Serie pesada</span>' : '')
    + '<span class="rest-time" id="rest-time">' + fmtClock(left) + '</span>'
    + '<div class="rest-progress"><div class="rest-fill" id="rest-fill" style="width:' + pct + '%"></div></div>'
    + restMenuHTML(s, paused, false)
    + '</div></div>';
  bindRestMenu(slot, s);
  if(restore) restoreRestFocus(slot, activeAction);
  if(paused) return;   /* en pausa no hay nada que repintar cada segundo */
  const gen = _restGen;
  _restClock = setInterval(() => {
    /* Un intervalo de otra pantalla o de otro descanso no pinta nada aquí. */
    if(gen !== _restGen || !s.rest){ stopRestClock(); return; }
    const rem = restRemaining(s);
    const t = $('#rest-time');
    const fill = $('#rest-fill');
    const dur = s.rest ? s.rest.duration : 1;
    if(t) t.textContent = fmtClock(rem);
    if(fill) fill.style.width = Math.min(100, Math.max(0, Math.round((1 - rem / Math.max(1, dur)) * 100))) + '%';
    if(rem <= 0){ stopRestClock(); renderRestBar(s); }
  }, 1000);
}
function prevSetText(p){
  if(!p) return '';
  const w = p.weight === '' || p.weight == null ? '' : p.weight + ' kg';
  const r = p.reps === '' || p.reps == null ? '' : p.reps + ' rep';
  return [w, r].filter(Boolean).join(' × ');
}

function setRow(s, e, st, locked, prev){
  const dis = locked ? 'disabled' : '';
  const prevText = prevSetText(prev);
  return `
  <div class="set-item ${st.completed ? 'done' : ''}" data-set-item="${esc(st.id)}">
    <div class="set-row">
      <span class="set-n">${st.number}</span>
      <div class="set-field-wrap">
        <button type="button" class="set-adj" data-action="adj-set" data-dir="-1" data-field="weight" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Bajar peso serie ${st.number}" ${dis}>−</button>
        <label class="set-field"><span class="sr-only">Peso de la serie ${st.number}</span>
          <input type="number" inputmode="decimal" min="0" step="0.25" placeholder="kg" value="${esc(st.weight)}"
            data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="weight" ${dis}></label>
        <button type="button" class="set-adj" data-action="adj-set" data-dir="1" data-field="weight" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Subir peso serie ${st.number}" ${dis}>+</button>
      </div>
      <div class="set-field-wrap">
        <button type="button" class="set-adj" data-action="adj-set" data-dir="-1" data-field="reps" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Bajar repeticiones serie ${st.number}" ${dis}>−</button>
        <label class="set-field"><span class="sr-only">Repeticiones de la serie ${st.number}</span>
          <input type="number" inputmode="numeric" min="0" placeholder="rep" value="${esc(st.reps)}"
            data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="reps" ${dis}></label>
        <button type="button" class="set-adj" data-action="adj-set" data-dir="1" data-field="reps" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Subir repeticiones serie ${st.number}" ${dis}>+</button>
      </div>
      <button type="button" class="set-check ${st.completed ? 'on' : ''}" data-action="toggle-set"
        data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}"
        aria-pressed="${st.completed ? 'true' : 'false'}" aria-label="Serie ${st.number}: ${st.completed ? 'completada' : 'pendiente'}" ${dis}>${st.completed ? '✓' : '✓'}</button>
      <span class="set-tools">
        <button type="button" class="icon-btn" data-action="copy-prev-set" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Copiar valores de la serie anterior" title="Copiar anterior" ${dis}>⎘</button>
        <button type="button" class="icon-btn" data-action="duplicate-set" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Duplicar serie ${st.number}" title="Duplicar" ${dis}>⧉</button>
        <button type="button" class="icon-btn danger" data-action="delete-set" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" aria-label="Eliminar serie ${st.number}" title="Eliminar" ${dis}>✕</button>
      </span>
    </div>
    ${prevText ? `<p class="set-prev">Anterior: ${esc(prevText)}</p>` : ''}
    ${st.pr ? '<p class="set-pr">🏆 Récord personal</p>' : ''}
    <details class="set-extra">
      <summary>Tipo, RIR/RPE y nota${st.type !== 'working' ? ' · ' + SET_TYPE_LABELS[st.type] : ''}</summary>
      <div class="set-extra-grid">
        <label class="mini-select"><span>Tipo</span>
          <select data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="type" ${dis}>
            ${SET_TYPES.map(t => `<option value="${t}" ${st.type === t ? 'selected' : ''}>${SET_TYPE_LABELS[t]}</option>`).join('')}
          </select></label>
        <label class="mini-select"><span>RIR</span>
          <select data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="rir" ${dis}>
            <option value="">—</option>${[0,1,2,3,4,5].map(n => `<option value="${n}" ${st.rir === n ? 'selected' : ''}>${n}${n === 5 ? '+' : ''}</option>`).join('')}
          </select></label>
        <label class="mini-select"><span>RPE</span>
          <select data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="rpe" ${dis}>
            <option value="">—</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${st.rpe === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select></label>
        <label class="mini-select"><span>Descanso (s)</span>
          <input type="number" min="0" max="600" placeholder="—" value="${st.restSeconds == null ? '' : esc(st.restSeconds)}"
            data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="restSeconds" ${dis}></label>
      </div>
      <label class="set-note"><span>Nota de la serie</span>
        <input type="text" maxlength="300" placeholder="p. ej. mejor técnica, bajar más…" value="${esc(st.notes)}"
          data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-set="${esc(st.id)}" data-field="notes" ${dis}></label>
    </details>
  </div>`;
}
function exRow(s, e, i, last){
  const locked = !!s.finished || s.status === 'completed' || s.status === 'cancelled';
  const sup = !!e.superset;
  const grp = supersetGroupOf(s, e.id);
  const badge = grp ? `<span class="sup-badge">${grp.letter}${grp.members.findIndex(m => m.id === e.id) + 1}</span> ` : '';
  if(!hasSets(e)){
    return `
  <article class="set-block legacy ${e.done ? 'done' : ''}${sup ? ' is-superset' : ''}">
    <div class="set-head">
      <div class="set-title"><span class="set-order">${i + 1}.</span><h3>${badge}${esc(e.name)}${sup ? ' <span class="sup-chip">SUPERSET</span>' : ''}</h3>
        <span class="set-target">${e.targetSets}${e.target ? ' × ' + esc(e.target) : ' × ' + e.targetReps + ' rep'}</span></div>
      <span class="badge-legacy">Sin desglose</span>
    </div>
    <p class="legacy-note">Registro anterior al sistema de series: se conserva el valor global, sin inventar series.</p>
    <div class="legacy-row">
      <label class="check"><input type="checkbox" data-action="toggle-ex" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" ${e.done ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="Marcar «${esc(e.name)}» como completado"><span class="checkmark" aria-hidden="true"></span></label>
      <label class="mini-field"><input type="number" inputmode="decimal" min="0" placeholder="0" value="${e.weight ?? ''}" aria-label="Peso de «${esc(e.name)}»" data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-field="weight" ${locked ? 'disabled' : ''}><span>kg</span></label>
      <label class="mini-field"><input type="number" inputmode="numeric" min="0" placeholder="0" value="${e.reps ?? ''}" aria-label="Repeticiones de «${esc(e.name)}»" data-session="${esc(s.id)}" data-ex="${esc(e.id)}" data-field="reps" ${locked ? 'disabled' : ''}><span>rep</span></label>
    </div>
    ${locked ? '' : `<button class="btn btn-ghost btn-sm" data-action="convert-legacy" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" type="button">Convertir a series</button>`}
  </article>`;
  }
  const doneSets = e.sets.filter(st => st.completed && st.type !== 'warmup').length;
  const dNow = dataFor(currentUser);
  const prog = locked ? null : progressionSuggestion(dNow, exKeyOf(e, dNow));
  const lastTxt = last && last.length
    ? last.map(x => (x.weight !== '' && x.weight != null ? x.weight + ' kg' : '') + (x.reps ? ' × ' + x.reps : '')).join(' · ')
    : '';
  return `
  <article class="set-block ${e.done ? 'done' : ''}${sup ? ' is-superset' : ''}" data-ex-block="${esc(e.id)}">
    <div class="set-head">
      <div class="set-title"><span class="set-order">${i + 1}.</span><h3>${badge}${esc(e.name)}${sup ? ' <span class="sup-chip">SUPERSET</span>' : ''}</h3>
        <span class="set-target">${e.targetSets}${e.target ? ' × ' + esc(e.target) : ' × ' + e.targetReps + ' rep'}</span></div>
      <span class="set-count">${doneSets}/${e.sets.length}</span>
    </div>
    ${e.legacyNote ? `<p class="legacy-note">${esc(e.legacyNote)}</p>` : ''}
    ${grp ? `<p class="sup-line">Superserie ${grp.letter}: ${esc(grp.members.map(m => m.name).join(' → '))}</p>` : ''}
    ${lastTxt && !locked ? `<button class="last-used" data-action="fill-last-sets" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" type="button" title="Copiar los valores de la última sesión (no marca las series)">↺ Anterior ${esc(lastTxt)}</button>` : ''}
    ${prog && prog.kind !== 'none' ? `<p class="prog-line prog-${prog.kind}"><b>Sugerencia:</b> ${esc(prog.text)}${prog.weight > 0 ? ` <button class="btn btn-ghost btn-sm" data-action="apply-prog" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" type="button">Aplicar ${fmtKg(prog.weight)} kg × ${prog.reps}</button>` : ''}</p>` : ''}
    <div class="set-legend"><span>Serie</span><span>kg</span><span>rep</span><span>Hecha</span><span></span></div>
    <div class="set-list">${e.sets.map((st, idx) => setRow(s, e, st, locked, last && last[idx] ? last[idx] : null)).join('')}</div>
    ${locked ? '' : `<div class="btn-group set-actions">
      <button class="btn btn-ghost btn-sm${sup ? ' active' : ''}" data-action="toggle-superset" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" aria-pressed="${sup ? 'true' : 'false'}" type="button">${sup ? 'Quitar superset' : 'Marcar superset'}</button>
      <button class="btn btn-ghost btn-sm" data-action="link-superset" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" type="button" title="Encadenar con el ejercicio siguiente">+ Superserie</button>
      <button class="btn btn-ghost btn-sm set-add" data-action="add-set" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}" type="button">+ Añadir serie</button>
    </div>`}
  </article>`;
}
function renderSession(main, sid){
  const s = getSession(sid);
  if(!s){ nav('#/workouts'); return; }
  const pct = sessionPct(s);
  const d = dataFor(currentUser);
  const locked = !!s.finished || s.status === 'completed' || s.status === 'cancelled';
  const statusLabel = SESSION_STATUS_LABELS[s.status] || 'En curso';
  const histAll = d.sessions
    .filter(x => x.workoutId === s.workoutId && x.id !== s.id && x.finished && x.status !== 'cancelled')
    .sort((a,b) => String(b.date).localeCompare(String(a.date)));
  /* Series de la última sesión por ejercicio: solo como referencia (nunca marcadas) */
  const lastBy = {};
  histAll.forEach(x => (x.exercises || []).forEach(e => {
    const key = exKeyOf(e, d);
    if(!key || lastBy[key]) return;
    if(hasSets(e)){
      const done = e.sets.filter(st => st.completed && st.type !== 'warmup' && (st.weight !== '' || st.reps !== ''));
      if(done.length) lastBy[key] = done.map(st => ({ weight: st.weight, reps: st.reps }));
    } else if((e.weight != null && e.weight !== '') || e.reps){
      lastBy[key] = [{ weight: e.weight, reps: e.reps }];
    }
  }));
  const hist = histAll.slice(0,5);

  // Calcular estadísticas generales
  let totalSets = 0, doneSetsTotal = 0;
  (s.exercises || []).forEach(ex => {
    if(hasSets(ex)){
      totalSets += ex.sets.length;
      doneSetsTotal += ex.sets.filter(st => st.completed).length;
    } else {
      totalSets += 1;
      if(ex.done) doneSetsTotal += 1;
    }
  });
  const currentExId = s.currentExerciseId || ((s.exercises && s.exercises[0]) ? s.exercises[0].id : null);
  const currentEx = currentExId ? s.exercises.find(e => e.id === currentExId) : (s.exercises && s.exercises[0]);

  main.innerHTML = `
    <div class="session-head">
      <button class="btn btn-ghost btn-sm" data-action="back" type="button">← Entrenamientos</button>
      <div class="session-title">
        <span class="wcard-emoji big">${DUMBBELL}</span>
        <div>
          <h1>${esc(s.workoutName)}</h1>
          <p class="muted">${fmtDateLong(s.date)} · ${s.exercises.length} ejercicios<span class="status-pill">${esc(statusLabel)}</span></p>
          <p class="session-clock" id="session-clock">—</p>
        </div>
      </div>
      <div class="ring-wrap">
        <div id="ring" style="width:100%;height:100%">${ringSVG(pct)}</div>
        <div class="ring-label"><span id="ring-pct">${pct}</span><small>%</small></div>
      </div>
    </div>

    <div class="progress-bar"><div class="progress-fill" id="pfill" style="width:${pct}%"></div></div>
    <div class="session-summary-bar">
      <span>Series: ${doneSetsTotal}/${totalSets}</span>
      <span>Ejercicios: ${s.exercises.filter((e,i)=>{ if(hasSets(e)) return e.sets.every(st=>st.completed); return e.done; }).length}/${s.exercises.length}</span>
      ${locked ? '' : `<label class="weight-step-pick"><span>Incremento</span>
        <select data-action="weight-step" aria-label="Incremento de peso en kg">
          ${WEIGHT_STEPS.map(n => `<option value="${n}" ${n === weightStep() ? 'selected' : ''}>${n} kg</option>`).join('')}
        </select></label>`}
    </div>

    <div id="rest-slot" class="rest-slot"></div>

    ${!locked && s.exercises && s.exercises.length ? `
    <section class="session-nav" aria-label="Navegación entre ejercicios">
      <div class="session-nav-row">
        <button class="btn btn-ghost btn-sm" data-action="session-prev-ex" data-sid="${esc(s.id)}" type="button" aria-label="Ejercicio anterior" ${sessionPrevExercise(s, currentExId) ? '' : 'disabled'}>←</button>
        <select class="session-ex-select" data-action="session-jump-ex" data-sid="${esc(s.id)}" aria-label="Elegir ejercicio">
          ${(s.exercises||[]).map((e,idx)=>{
            const st = sessionExerciseStats(e);
            return `<option value="${esc(e.id)}" ${e.id===currentExId?'selected':''}>${idx+1}. ${esc(e.name)} · ${st.done}/${st.total} hechas${st.doneAll?' ✓':''}</option>`;
          }).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" data-action="session-next-ex" data-sid="${esc(s.id)}" type="button" aria-label="Ejercicio siguiente" ${sessionNextExercise(s, currentExId) ? '' : 'disabled'}>→</button>
      </div>
      <div class="session-nav-chips" role="list" aria-label="Estado de cada ejercicio">
        ${(s.exercises||[]).map((e,idx)=>{
          const st = sessionExerciseStats(e);
          const status = sessionExerciseStatus(e);
          const grp = supersetGroupOf(s, e.id);
          const badge = grp ? grp.letter + (grp.members.findIndex(m => m.id === e.id) + 1) : String(idx + 1);
          return `<button type="button" class="ex-chip is-${status.key}${e.id===currentExId?' is-current':''}" role="listitem"
            data-action="session-goto-ex" data-sid="${esc(s.id)}" data-ex="${esc(e.id)}"
            ${e.id===currentExId?'aria-current="step"':''}
            aria-label="${esc((idx + 1) + '. ' + e.name + ': ' + status.label)}">
            <span class="ex-chip-badge">${esc(badge)}</span>
            <span class="ex-chip-name">${esc(e.name)}</span>
            <span class="ex-chip-count">${st.done}/${st.total}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="session-nav-foot">
        <button class="btn btn-ghost btn-sm" data-action="session-focus-current" data-sid="${esc(s.id)}" type="button">Ir al ejercicio actual</button>
      </div>
      ${currentEx ? `<div class="current-ex-info"><strong>${esc(currentEx.name)}</strong> ${hasSets(currentEx) ? `· Serie ${(currentEx.sets.findIndex(st=>!st.completed)+1>0?currentEx.sets.findIndex(st=>!st.completed)+1:currentEx.sets.length)}/${currentEx.sets.length}` : ''} ${currentEx.target ? `· Objetivo: ${esc(currentEx.target)}` : (currentEx.targetReps ? `· Objetivo: ${currentEx.targetSets||''}×${currentEx.targetReps} rep` : '')}</div>` : ''}
    </section>
    ` : ''}

    ${locked && s.summary ? `<section class="summary-card">${summaryHTML(s)}</section>` : ''}

    <section class="section">
      <div class="section-head">
        <h2>${locked ? 'Sesión registrada' : 'Ejercicios'}</h2>
        <span class="muted">${locked ? 'Registro histórico: no cambia aunque edites la rutina.' : 'Anota cada serie, márcala al terminarla y ajusta RIR/RPE si quieres.'}</span>
      </div>
      <div class="ex-list">${s.exercises.map((e,i) => exRow(s, e, i, lastBy[exKeyOf(e, d)])).join('')}</div>
      ${locked ? '' : `<div class="session-add-ex"><button class="btn btn-ghost" data-action="add-session-ex" data-sid="${esc(s.id)}" type="button">+ Añadir ejercicio a esta sesión</button></div>`}
    </section>

    ${(() => {
      const lite = PG.sessionLite(s, name => resolveExerciseId(name, d));
      if(!lite.sets) return '';
      return `<section class="section">
        <div class="section-head"><h2>Volumen de la sesión</h2><span class="muted">Peso × repeticiones, sin calentamientos</span></div>
        <div class="pr-list">
          ${lite.exercises.map(ex => `<div class="pr-item">
            <span>${esc(ex.name)} <span class="muted small">· ${ex.sets} serie${ex.sets === 1 ? '' : 's'} · ${ex.reps} rep</span></span>
            <span class="pr-val">${ex.volume ? fmtKg(ex.volume) + ' kg' : '<span class="muted small">peso corporal</span>'}</span>
          </div>`).join('')}
          <div class="pr-item"><span><b>Total de la sesión</b> <span class="muted small">· ${lite.sets} series · ${lite.reps} rep · ${fmtKg(lite.volume)} kg</span></span></div>
        </div>
        ${lite.bodyweightSets ? '<p class="muted small">Las series a peso corporal o asistidas cuentan repeticiones, no kilos de volumen.</p>' : ''}
      </section>`;
    })()}

    <div class="session-notes-wrap">
      <label class="field"><span>Notas de la sesión</span>
        <textarea id="session-notes" data-session-note="${esc(s.id)}" rows="2" maxlength="${LIMITS.sessionNotes}" ${locked ? 'disabled' : ''} placeholder="Sensaciones, incidencias, técnica…">${esc(s.notes || '')}</textarea>
      </label>
    </div>

    <div class="session-actions">
      ${locked
        ? `<button class="btn btn-primary" data-action="restart-session" data-id="${esc(s.id)}" type="button">Entrenar de nuevo</button>`
        : `<button class="btn btn-ghost" data-action="${s.status === 'paused' ? 'resume-session-status' : 'pause-session'}" data-id="${esc(s.id)}" type="button">${s.status === 'paused' ? 'Reanudar' : 'Pausar'}</button>
           <button class="btn btn-primary btn-lg" data-action="finish-session" data-id="${esc(s.id)}" type="button">Terminar</button>
           <button class="btn btn-ghost" data-action="cancel-session" data-id="${esc(s.id)}" type="button">Cancelar</button>`}
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
  startSessionClock(s);
  renderRestBar(s);
}

function refreshSessionProgress(sid){
  const s = getSession(sid);
  if(!s) return;
  const pct = sessionPct(s);
  const p = $('#ring-pct'); if(p) p.textContent = pct;
  const fill = $('#pfill'); if(fill) fill.style.width = pct + '%';
  const ring = $('#ring'); if(ring) ring.innerHTML = ringSVG(pct);
}

/* ---------------- Editor de entrenamientos propios ---------------- */
function renderEditor(main, id){
  const d = dataFor(currentUser);
  const existing = id !== 'new' ? d.workouts.find(w => w.id === id) : null;
  state.editor = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: uid(), name: '', exercises: [{ id: uid(), name: '', sets: (planDefaults(d) || {}).sets || 3, reps: (planDefaults(d) || {}).reps || 10, weight: '', superset: false }] };
  main.innerHTML = `
    <div class="page-head">
      <h1>${existing ? 'Editar entrenamiento' : 'Crear entrenamiento'}</h1>
      <p class="muted">Ponle nombre, añade ejercicios y empieza una sesión cuando quieras.</p>
    </div>
    <div class="editor-card">
      <div class="field"><span>Nombre del entrenamiento</span><input id="ed-name" data-bind="name" value="${esc(state.editor.name)}" placeholder="p. ej. Pecho y tríceps"></div>
      <div class="section-head" style="margin-bottom:10px"><h2 style="font-size:16px">Ejercicios</h2>
        <div class="btn-group">
          <button class="btn btn-ghost btn-sm" data-action="add-ex-blank" type="button">+ Fila en blanco</button>
          <button class="btn btn-primary btn-sm" data-action="add-ex" type="button">+ Añadir de la biblioteca</button>
        </div>
      </div>
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
  const d = dataFor(currentUser);
  const ex = state.editor.exercises;
  if(!ex.length){ wrap.innerHTML = '<div class="empty-state">Aún no hay ejercicios — añade el primero desde la biblioteca.</div>'; return; }
  wrap.innerHTML = ex.map((e, i) => {
    const meta = exerciseMeta(e, d);
    return `
    <div class="ex-row-edit${e.superset ? ' is-superset' : ''}" data-ex-idx="${i}">
      <div class="ex-row-name">
        <span class="ex-order" aria-hidden="true">${i + 1}</span>
        <textarea rows="1" spellcheck="false" data-bind="row" data-idx="${i}" data-field="name" placeholder="Nombre del ejercicio" aria-label="Nombre del ejercicio ${i + 1}">${esc(e.name)}</textarea>
        ${meta ? `<span class="ex-meta">${esc(meta)}</span>` : ''}
      </div>
      <div class="ex-row-fields">
        <label class="mini-field"><input type="number" min="1" data-bind="row" data-idx="${i}" data-field="sets" value="${esc(String(e.sets == null ? '' : e.sets))}" aria-label="Series del ejercicio ${i + 1}"><span aria-hidden="true">series</span></label>
        ${repsPickerHtml(e.reps, ' data-idx="' + i + '"', 'Repeticiones del ejercicio ' + (i + 1))}
        <label class="mini-field" title="Descanso objetivo entre series"><input type="number" min="0" max="600" data-bind="row" data-idx="${i}" data-field="rest" value="${esc(e.rest == null ? '' : String(e.rest))}" aria-label="Descanso en segundos del ejercicio ${i + 1}"><span aria-hidden="true">s</span></label>
        <label class="sup-toggle" title="Marcar este ejercicio como superset">
          <input type="checkbox" data-bind="row" data-idx="${i}" data-field="superset" ${e.superset ? 'checked' : ''} aria-label="El ejercicio ${i + 1} es un superset">
          <span aria-hidden="true">Superset</span>
        </label>
        <span class="ex-tools">
          <button class="icon-btn" data-action="ex-up" data-idx="${i}" type="button" aria-label="Subir el ejercicio ${i + 1}" title="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
          <button class="icon-btn" data-action="ex-down" data-idx="${i}" type="button" aria-label="Bajar el ejercicio ${i + 1}" title="Bajar"${i === ex.length - 1 ? ' disabled' : ''}>↓</button>
          <button class="icon-btn" data-action="dup-ex" data-idx="${i}" type="button" aria-label="Duplicar el ejercicio ${i + 1}" title="Duplicar">⧉</button>
          <button class="icon-btn danger" data-action="del-ex" data-idx="${i}" type="button" aria-label="Eliminar el ejercicio ${i + 1}" title="Eliminar">✕</button>
        </span>
      </div>
    </div>`;
  }).join('');
  $$('#editor-rows textarea').forEach(autoGrow);
}
function autoGrow(el){
  el.style.height = 'auto';
  el.style.height = Math.max(48, el.scrollHeight) + 'px';
}

/* ---------------- Récords personales (PR) ---------------- */
/* ---------------- Récords personales ---------------- */
function prMetricText(metric, entry){
  if(!entry || entry.value == null) return '—';
  if(metric === 'repsAtWeight') return entry.value + ' rep';
  return fmtKg(entry.value) + ' kg';
}
function prMetricDetail(metric, entry){
  if(!entry) return '';
  if(metric === 'weight') return entry.reps ? '× ' + entry.reps + ' rep' : '';
  if(metric === 'repsAtWeight') return entry.weight ? 'con ' + fmtKg(entry.weight) + ' kg' : '';
  if(metric === 'setVolume') return entry.weight ? fmtKg(entry.weight) + ' kg × ' + entry.reps : '';
  if(metric === 'sessionVolume') return 'suma del día';
  if(metric === 'e1rm') return 'estimado, no levantado';
  return '';
}
function prMetricDate(entry){ return entry && entry.date ? fmtDateLong(entry.date) : ''; }
/* Bloque de récords dentro de Progreso. Usa las mismas fuentes que la
   pantalla anterior, pero sin una pestaña aparte: los récords se recalculan
   de las sesiones terminadas y de los registros manuales. */
function recordsInlineHTML(d){
  const resolve = name => resolveExerciseId(name, d);
  const options = exerciseOptions(d);
  const summaries = PG.recordSummary(d, resolve);
  const byKey = new Map(summaries.map(r => [r.key, r]));
  const pickable = [...summaries.map(r => ({ id: r.key, name: r.name })),
                    ...options.filter(o => !byKey.has(o.id))];
  pickable.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  let sel = state.prExercise;
  if(!sel || !pickable.some(o => o.id === sel)) sel = pickable[0] ? pickable[0].id : null;
  state.prExercise = sel || null;
  const rec = sel ? PG.recordsFor(d, resolve, sel) : null;
  const selName = rec ? rec.name : '';
  const manual = ((d && d.prs) || []).filter(p => prKey(p, d) === sel)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const autoRecords = ((d && d.records) || [])
    .filter(r => prKey({ exId: r.exId, exercise: r.exercise }, d) === sel)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const evolution = rec ? [...rec.timeline.weight].reverse() : [];
  const hasData = !!(rec && rec.sessions);

  return `
    <section class="records-block" id="records-block" aria-labelledby="records-title">
      <div class="section-head">
        <h2 id="records-title">Récords personales</h2>
        <span class="muted">${summaries.length} ejercicio${summaries.length === 1 ? '' : 's'} con historial</span>
      </div>
      <p class="muted small records-intro">Calculados automáticamente con tus sesiones terminadas: peso, repeticiones, volumen y 1RM estimado. Si borras o editas una sesión, se recalculan solos. El historial diario se completa al terminar cada entrenamiento.</p>
      ${rec && rec.bestWeight ? `<p class="muted small">Último récord de «${esc(rec.name)}»: <b>${fmtKg(rec.bestWeight.value)} kg${rec.bestWeight.reps ? ' × ' + rec.bestWeight.reps : ''}</b> el ${fmtDateLong(rec.bestWeight.date)}${rec.bestWeight.sessionName ? ' en «' + esc(rec.bestWeight.sessionName) + '»' : ''}.</p>` : ''}

      <div class="pr-top">
        <div class="pr-select">
          <label>Ejercicio</label>
          <select id="pr-select">
            ${pickable.length
              ? pickable.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('')
              : '<option value="">Sin ejercicios todavía</option>'}
          </select>
        </div>
        <button class="btn btn-ghost" data-action="pr-progress" type="button" ${sel ? '' : 'disabled'}>Ver progreso</button>
        <button class="btn btn-primary" data-action="log-pr" type="button" ${sel ? '' : 'disabled'}>+ Registrar récord manual</button>
      </div>

      ${!sel
        ? `<section class="empty-state">Todavía no hay ejercicios. Completa una sesión y aquí aparecerán sus récords.</section>`
        : !hasData
          ? `<section class="empty-state">Aún no hay series terminadas de «${esc(selName)}». En cuanto completes una sesión con este ejercicio verás aquí su primer récord.</section>`
          : `<section class="stats-grid small five">
          ${PG.RECORD_METRICS.map(m => {
            const entry = rec[m.key];
            return `<div class="stat-card">
              <p class="stat-val">${esc(prMetricText(m.key, entry))}</p>
              <p class="stat-label">${esc(m.label)}</p>
              <p class="stat-sub">${esc(prMetricDetail(m.key, entry))}${entry && entry.date ? ' · ' + esc(fmtDate(entry.date)) : ''}</p>
            </div>`;
          }).join('')}
        </section>

        <section class="chart-card">
          <div class="section-head"><h2>Evolución del récord de peso</h2><span class="muted">${esc(selName)} · ${rec.sessions} sesión${rec.sessions === 1 ? '' : 'es'}</span></div>
          <div id="pr-chart" class="chart"></div>
          <p class="muted small">Solo aparecen las veces que superaste tu marca anterior. El 1RM es una estimación de Epley (peso × (1 + rep/30)), no un levantamiento real.</p>
        </section>

        <section class="section">
          <div class="section-head"><h2>Historial de récords</h2><span class="muted">Actual vs. anterior</span></div>
          ${evolution.length
            ? `<div class="pr-list">${evolution.map(e => `
                <div class="pr-row pr-rec-row">
                  <span class="pr-row-main"><b>${fmtDateLong(e.date)}</b><span class="muted small">${e.sessionName ? esc(e.sessionName) : 'Sesión'} · ${e.previous == null ? 'primer registro' : 'antes ' + fmtKg(e.previous) + ' kg'}</span></span>
                  <span class="pr-val">${fmtKg(e.value)} kg${e.reps ? ' × ' + e.reps : ''}</span>
                  ${e.sessionId ? `<button class="btn btn-ghost btn-sm" type="button" data-action="open-session" data-id="${esc(e.sessionId)}">Ver sesión</button>` : ''}
                </div>`).join('')}</div>`
            : '<div class="empty-state">Sin récords de peso todavía.</div>'}
        </section>`}

      ${summaries.length ? `<section class="section">
        <div class="section-head"><h2>Récords por ejercicio</h2><span class="muted">${summaries.length} ejercicio${summaries.length === 1 ? '' : 's'} con historial</span></div>
        <div class="pr-list">${summaries.slice(0, 15).map(r => `
          <div class="pr-row">
            <span class="pr-row-main">${esc(r.name)} <span class="muted small">· ${r.sessions} sesión${r.sessions === 1 ? '' : 'es'}${r.last ? ' · último ' + fmtDate(r.last) : ''}</span></span>
            <span class="pr-val">${r.bestWeight ? fmtKg(r.bestWeight.value) + ' kg' : '—'}${r.bestE1rm ? ' <span class="muted small">· 1RM ' + fmtKg(r.bestE1rm.value) + ' kg</span>' : ''}</span>
            <button class="btn btn-ghost btn-sm" type="button" data-action="pr-pick" data-ex="${esc(r.key)}">Ver</button>
          </div>`).join('')}</div>
      </section>` : ''}

      ${sel ? `<section class="section">
        <div class="section-head"><h2>Récords manuales</h2><span class="muted">Los que anotas a mano</span></div>
        ${manual.length
          ? `<div class="pr-list">${[...manual].reverse().map(p => `
              <div class="pr-item">
                <span>${fmtDateLong(p.date)}</span>
                <span class="pr-val">${p.weight} kg${p.reps ? ' × ' + p.reps + ' rep' : ''}</span>
                <button class="icon-btn danger" data-action="delete-pr" data-id="${p.id}" type="button" aria-label="Eliminar el récord del ${fmtDateLong(p.date)}" title="Eliminar">✕</button>
              </div>`).join('')}</div>`
          : '<div class="empty-state">Aún no hay récords manuales para este ejercicio.</div>'}
      </section>

      ${autoRecords.length ? `<section class="section">
        <div class="section-head"><h2>Récords automáticos</h2><span class="muted">Solo de este ejercicio</span></div>
        <div class="pr-list">${autoRecords.map(r => `
          <div class="pr-item">
            <span>${fmtDateLong(r.date)}</span>
            <span class="pr-val">${r.weight} kg × ${r.reps} rep</span>
            <button class="icon-btn danger" data-action="delete-auto-record" data-id="${esc(r.id)}" type="button" aria-label="Eliminar este récord automático" title="Eliminar">✕</button>
          </div>`).join('')}</div>
      </section>` : ''}` : ''}
    </section>`;
}
function bindRecordsInline(){
  const d = dataFor(currentUser);
  const sel = state.prExercise;
  if(!sel) return;
  const rec = PG.recordsFor(d, name => resolveExerciseId(name, d), sel);
  if(!rec || !rec.sessions) return;
  const evolution = [...rec.timeline.weight].reverse();
  lineChart($('#pr-chart'), evolution.slice().reverse().map(e => ({ label: e.date, value: e.value })), evolution.length > 1 ? 'Necesitas dos récords para ver la evolución.' : 'Con un segundo récord verás aquí la evolución.');
}
/* La ruta antigua #/prs sigue funcionando: ahora abre Progreso, donde vive
   la sección de récords. */
function renderPRs(main){ renderProgress(main); }
function openPRModal(preselected){
  const d = dataFor(currentUser);
  const exercises = exerciseOptions(d);
  openModal(`
    <h3>Registrar nuevo récord</h3>
    <div class="form">
      <label>Ejercicio
        <select id="prf-exercise">${exercises.map(o => `<option value="${esc(o.id)}" ${o.id === preselected ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
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
/* ============================================================
   PROGRESO POR EJERCICIO
   Agrupa por id estable (exKeyOf) todas las sesiones terminadas
   y devuelve, por sesión: mejor serie, repeticiones y volumen
   (peso × reps). Solo series efectivas: ni calentamiento ni
   series sin completar. Las sesiones canceladas no cuentan.
   ============================================================ */
function exerciseProgress(d, id){
  const rows = [];
  (d.sessions || []).slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)))
    .forEach(s => {
      if(!s || !s.finished || s.status === 'cancelled') return;
      let volume = 0, reps = 0, sets = 0, best = null, name = '';
      (s.exercises || []).forEach(e => {
        if(exKeyOf(e, d) !== id) return;
        if(!name) name = e.name;
        const usable = hasSets(e)
          ? e.sets.filter(st => st.completed && st.type !== 'warmup' && Number(st.weight) > 0)
          : (Number(e.weight) > 0 ? [{ weight: e.weight, reps: e.reps }] : []);
        usable.forEach(st => {
          const w = Number(st.weight), r = Number(st.reps) || 0;
          volume += w * r; reps += r; sets += 1;
          if(!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
        });
      });
      if(sets) rows.push({ sessionId: s.id, date: s.date, name, volume: Math.round(volume), reps, sets, best });
    });
  return rows;
}
/* ============================================================
   PROGRESIÓN DE CARGA (doble progresión)
   Con el último registro del ejercicio, por id estable:
   - todos los sets efectivos llegan al tope de repeticiones → subir carga
     y volver al mínimo del rango;
   - se completaron las series pero sin llegar al tope → mismo peso, +1 rep;
   - no se completaron las series → repetir el peso;
   - repeticiones por debajo del mínimo → bajar un 5 %.
   El incremento es el 2,5 % redondeado a 0,5 kg (mínimo 0,5 kg).
   Sin historial no se inventa nada: se pide registrar una sesión.
   ============================================================ */
function parseRepTarget(raw){
  const txt = String(raw == null ? '' : raw);
  const range = txt.match(/(\d+)\s*[-–]\s*(\d+)/);
  if(range) return { min: Number(range[1]), max: Number(range[2]) };
  const one = txt.match(/\d+/);
  if(one) return { min: Number(one[0]), max: Number(one[0]) };
  return null;
}
function fmtKg(v){
  const n = Math.round(Number(v) * 100) / 100;
  return String(n).replace('.', ',');
}
function lastExerciseLog(d, id){
  const list = (d.sessions || []).slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  for(let i = list.length - 1; i >= 0; i--){
    const s = list[i];
    if(!s || !s.finished || s.status === 'cancelled') continue;
    const ex = (s.exercises || []).find(x => exKeyOf(x, d) === id);
    if(!ex) continue;
    const eff = hasSets(ex)
      ? ex.sets.filter(st => st.completed && st.type !== 'warmup' && ((Number(st.reps) || 0) > 0 || Number(st.weight) > 0))
      : (((Number(ex.reps) || 0) > 0 || Number(ex.weight) > 0) ? [{ weight: ex.weight, reps: ex.reps }] : []);
    if(!eff.length) continue;
    let best = null;
    eff.forEach(st => {
      const w = Number(st.weight) || 0, r = Number(st.reps) || 0;
      if(!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
    });
    return { session: s, ex, sets: eff, best };
  }
  return null;
}
/* Cuántas sesiones terminadas registran el ejercicio (incluye peso corporal). */
function exerciseSessionCount(d, id){
  return ((d && d.sessions) || []).filter(x => x && x.finished && x.status !== 'cancelled'
    && (x.exercises || []).some(e => exKeyOf(e, d) === id && (hasSets(e)
      ? e.sets.some(st => st.completed && st.type !== 'warmup')
      : ((Number(e.reps) || 0) > 0 || Number(e.weight) > 0)))).length;
}
function progressionSuggestion(d, id){
  const log = lastExerciseLog(d, id);
  const sessions = exerciseSessionCount(d, id);
  if(!log){
    return { kind:'none', exId:id, weight:0, reps:0, sessions, text:'Sin historial todavía: registra este ejercicio en una sesión y aquí verás cuánto subir.' };
  }
  const eff = log.sets;
  const best = log.best;
  const ex = log.ex;
  const target = (ex && (parseRepTarget(ex.target) || parseRepTarget(ex.targetReps))) || { min: best.reps, max: best.reps };
  const planned = Number(ex && ex.targetSets) || eff.length;
  const allTop = eff.length > 0 && eff.every(st => (Number(st.reps) || 0) >= target.max);
  const step = Math.max(0.5, Math.round(best.weight * 0.025 * 2) / 2);
  const roundHalf = v => Math.round(v * 2) / 2;
  const base = { exId:id, sessions, best, last: { sets: eff.length, date: log.session.date } };

  if(!(best.weight > 0)){
    const reps = (Number(best.reps) || 0) + 1;
    return Object.assign(base, { kind:'reps', weight:0, reps, text:'Sin carga: busca ' + reps + ' repeticiones (una más que la última vez).' });
  }
  if(eff.length < planned){
    return Object.assign(base, { kind:'hold', weight:best.weight, reps:target.min, text:'Repite ' + fmtKg(best.weight) + ' kg × ' + target.min + ' rep: la última vez hiciste ' + eff.length + ' de ' + planned + ' series.' });
  }
  if(allTop){
    const w = roundHalf(best.weight + step);
    return Object.assign(base, { kind:'up', weight:w, reps:target.min, text:'Sube a ' + fmtKg(w) + ' kg y vuelve a ' + target.min + ' rep: llegaste al tope en todas las series.' });
  }
  if((Number(best.reps) || 0) >= target.min){
    const reps = (Number(best.reps) || 0) + 1;
    return Object.assign(base, { kind:'reps', weight:best.weight, reps, text:'Mantén ' + fmtKg(best.weight) + ' kg y busca ' + reps + ' rep antes de subir.' });
  }
  const w = Math.max(0.5, roundHalf(best.weight * 0.95));
  return Object.assign(base, { kind:'down', weight:w, reps:target.min, text:'Baja a ' + fmtKg(w) + ' kg × ' + target.min + ' rep: la última vez te quedaste por debajo del objetivo.' });
}
/* 1RM estimado con la fórmula de Epley: peso × (1 + rep/30).
   Es una estimación matemática, no un levantamiento real. */
function epley1RM(weight, reps){
  const w = Number(weight) || 0, r = Number(reps) || 0;
  if(!(w > 0) || !(r > 0)) return 0;
  if(r === 1) return w;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}
function bestE1RM(rows){
  return (rows || []).reduce((best, r) => Math.max(best, epley1RM(r.best && r.best.weight, r.best && r.best.reps)), 0);
}
/* Compara las últimas 4 semanas con las 4 anteriores (ventanas de 28 días). */
function progressWindows(rows, now){
  const DAY = 86400000;
  const end = now ? new Date(now) : new Date();
  end.setHours(23, 59, 59, 999);
  const t0 = end.getTime();
  const recentFrom = t0 - 28 * DAY;
  const prevFrom = t0 - 56 * DAY;
  const when = r => new Date(String(r.date) + 'T00:00:00').getTime();
  const sum = list => {
    const out = { sessions: list.length, volume: 0, reps: 0, best: null, e1rm: 0 };
    list.forEach(r => {
      out.volume += r.volume;
      out.reps += r.reps;
      out.e1rm = Math.max(out.e1rm, epley1RM(r.best && r.best.weight, r.best && r.best.reps));
      if(r.best && (!out.best || r.best.weight > out.best.weight || (r.best.weight === out.best.weight && r.best.reps > out.best.reps))) out.best = r.best;
    });
    out.volume = Math.round(out.volume);
    return out;
  };
  const all = rows || [];
  return {
    recent: sum(all.filter(r => { const x = when(r); return x >= recentFrom && x <= t0; })),
    previous: sum(all.filter(r => { const x = when(r); return x >= prevFrom && x < recentFrom; }))
  };
}
function cmpDelta(prev, now, unit){
  if(!prev && !now) return { text: '—', cls: 'flat' };
  if(!prev) return { text: 'nuevo', cls: 'up' };
  const diff = now - prev;
  if(!diff) return { text: 'igual', cls: 'flat' };
  const pct = Math.round((diff / prev) * 100);
  return { text: (diff > 0 ? '+' : '') + pct + ' %', cls: diff > 0 ? 'up' : 'down' };
}
/* ---------------- Progreso por ejercicio ---------------- */
const PROG_PERIODS = [
  { days:30, label:'30 días' }, { days:90, label:'90 días' },
  { days:180, label:'6 meses' }, { days:365, label:'1 año' }, { days:0, label:'Todo' }
];
function trendLabel(trend){
  return trend === 'up' ? 'Mejorando' : trend === 'down' ? 'Bajando' : 'Se mantiene';
}
function cmpResultHTML(res, unit){
  if(!res) return '<span class="muted small">Faltan datos</span>';
  const txt = (res.current || 0).toLocaleString('es') + (unit ? ' ' + unit : '');
  const baseTxt = (res.base || 0).toLocaleString('es') + (unit ? ' ' + unit : '');
  return `<span class="cmp-val cmp-now">${txt}</span>
    <span class="muted small">antes ${baseTxt}</span>
    <span class="trend-chip ${res.trend}">${trendLabel(res.trend)}${res.pct == null ? '' : ' ' + (res.pct > 0 ? '+' : '') + res.pct + ' %'}</span>`;
}
function renderProgress(main){
  const d = dataFor(currentUser);
  const resolve = name => resolveExerciseId(name, d);
  const exercises = exerciseOptions(d);
  let sel = state.progressExercise && exercises.some(o => o.id === state.progressExercise) ? state.progressExercise : (exercises[0] ? exercises[0].id : null);
  state.progressExercise = sel || null;
  if(!state.prExercise || !exercises.some(o => o.id === state.prExercise)) state.prExercise = sel || null;
  if(state.progDays == null) state.progDays = 0;
  const days = state.progDays;
  const picked = exercises.find(o => o.id === sel);
  const label = picked ? picked.name : '';
  const series = sel ? PG.seriesFor(d, resolve, sel, { days }) : { rows: [], weight: [], reps: [], volume: [], e1rm: [] };
  const rows = series.rows;
  const rec = sel ? PG.recordsFor(d, resolve, sel) : null;
  const history = PG.history(d, resolve).filter(r => !days || (PG.parseDay(r.date) || 0) >= Date.now() - days * PG.DAY);
  const volume = PG.volumeSummary(d, resolve);
  const prog = sel ? progressionSuggestion(d, sel) : { kind:'none', sessions:0, text:'Elige un ejercicio para ver su progresión.', weight:0, reps:0 };
  const totalVolume = rows.reduce((a, r) => a + r.volume, 0);
  const totalReps = rows.reduce((a, r) => a + r.reps, 0);
  const comparisons = PG.METRIC_LABELS && ['weight', 'reps', 'volume', 'e1rm'].map(metric => ({
    metric,
    session: PG.compare(rows, metric, 'session'),
    first: PG.compare(rows, metric, 'first'),
  }));
  const weekCmp = [
    { label:'Volumen semanal', metric:'volume', res: PG.compare(rows, 'volume', 'week'), unit:'kg' },
    { label:'Peso máximo semanal', metric:'weight', res: PG.compare(rows, 'weight', 'week'), unit:'kg' },
    { label:'Volumen mensual', metric:'volume', res: PG.compare(rows, 'volume', 'month'), unit:'kg' },
  ];
  const win = progressWindows(rows);
  const winKg = v => v ? fmtKg(Math.round(v * 10) / 10) + ' kg' : '—';
  const winRows = [
    { label:'Sesiones', prev: win.previous.sessions || '—', now: win.recent.sessions || '—', delta: cmpDelta(win.previous.sessions, win.recent.sessions) },
    { label:'Volumen', prev: winKg(win.previous.volume), now: winKg(win.recent.volume), delta: cmpDelta(win.previous.volume, win.recent.volume) },
    { label:'Repeticiones', prev: win.previous.reps ? win.previous.reps + ' rep' : '—', now: win.recent.reps ? win.recent.reps + ' rep' : '—', delta: cmpDelta(win.previous.reps, win.recent.reps) },
    { label:'Mejor serie', prev: win.previous.best ? fmtKg(win.previous.best.weight) + ' kg × ' + win.previous.best.reps : '—', now: win.recent.best ? fmtKg(win.recent.best.weight) + ' kg × ' + win.recent.best.reps : '—', delta: cmpDelta(win.previous.best ? win.previous.best.weight : 0, win.recent.best ? win.recent.best.weight : 0) },
    { label:'1RM estimado', prev: winKg(win.previous.e1rm), now: winKg(win.recent.e1rm), delta: cmpDelta(win.previous.e1rm, win.recent.e1rm) },
  ];
  const freqRows = PG.buckets(history, 'week');
  const unitOf = metric => metric === 'reps' ? 'rep' : 'kg';

  main.innerHTML = `
    <div class="page-head">
      <h1>Progreso por ejercicio</h1>
      <p class="muted">Tu semana, tu mes y cada ejercicio, sesión a sesión. Solo cuentan sesiones terminadas y series efectivas.</p>
    </div>

    ${streakCardHTML(d)}

    ${muscleVolumeCardHTML(d)}

    ${monthCompareHTML(d)}

    <div class="pr-top">
      <div class="pr-select">
        <label>Ejercicio</label>
        <select id="pg-select">
          ${exercises.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
        </select>
      </div>
      <div class="pr-select">
        <label>Período</label>
        <select id="pg-days">
          ${PROG_PERIODS.map(p => `<option value="${p.days}"${p.days === days ? ' selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-ghost" data-action="progress-prs" type="button" ${sel ? '' : 'disabled'}>Ver récords</button>
      <button class="btn btn-ghost" data-action="share-progress" type="button" ${rows.length ? '' : 'disabled'} title="Comparte la gráfica como imagen (WhatsApp, Instagram, etc.)">Compartir gráfica</button>
    </div>

    ${!rows.length
      ? `<section class="empty-state">En ${days ? 'los últimos ' + days + ' días' : 'todo el historial'} no hay sesiones terminadas con «${esc(label || 'este ejercicio')}». Prueba otro período o completa una sesión.</section>`
      : `<section class="stats-grid small five">
      <div class="stat-card"><p class="stat-value">${rec && rec.bestWeight ? fmtKg(rec.bestWeight.value) + ' kg' : '—'}</p><p class="stat-label">Mejor peso</p></div>
      <div class="stat-card"><p class="stat-value">${rec && rec.bestSetVolume ? fmtKg(rec.bestSetVolume.value) + ' kg' : '—'}</p><p class="stat-label">Mejor serie (volumen)</p></div>
      <div class="stat-card"><p class="stat-value">${fmtKg(totalVolume)} kg</p><p class="stat-label">Volumen del período</p></div>
      <div class="stat-card"><p class="stat-value">${rows.length}</p><p class="stat-label">Sesiones</p></div>
      <div class="stat-card"><p class="stat-value">${rec && rec.bestE1rm ? fmtKg(rec.bestE1rm.value) + ' kg' : '—'}</p><p class="stat-label">1RM estimado</p></div>
    </section>

    <section class="cmp-card">
      <div class="section-head"><h2>Últimas 4 semanas</h2><span class="muted">Frente a las 4 anteriores</span></div>
      <div class="cmp-legend"><span>Métrica</span><span class="muted small">Antes</span><span class="muted small">Ahora</span><span></span></div>
      ${winRows.map(m => `<div class="cmp-row">
        <span>${m.label}</span>
        <span class="cmp-val">${m.prev}</span>
        <span class="cmp-val cmp-now">${m.now}</span>
        <span class="cmp-delta ${m.delta.cls}">${m.delta.text}</span>
      </div>`).join('')}
      <p class="muted small">Ventanas de 28 días: la actual frente a la inmediatamente anterior.</p>
    </section>

    <section class="cmp-card">
      <div class="section-head"><h2>Comparaciones</h2><span class="muted">${esc(label)}</span></div>
      ${comparisons.map(c => `
        <div class="prog-cmp">
          <p class="prog-cmp-title">${esc(PG.METRIC_LABELS[c.metric].label)}</p>
          <div class="cmp-row">
            <span>Última sesión</span>
            ${cmpResultHTML(c.session, unitOf(c.metric))}
          </div>
          <div class="cmp-row">
            <span>Primer registro</span>
            ${cmpResultHTML(c.first, unitOf(c.metric))}
          </div>
        </div>`).join('')}
      <p class="muted small">«Mejorando» exige una diferencia mayor que el margen de ruido (0,5 kg o 1 % en peso y 1RM; 2 % en repeticiones y volumen). El volumen mide trabajo total, no fuerza: un día con más series puede subir el volumen sin que levantes más peso.</p>
    </section>

    <section class="cmp-card">
      <div class="section-head"><h2>Semana y mes</h2><span class="muted">Media del período frente al anterior</span></div>
      ${weekCmp.map(w => `<div class="cmp-row">
        <span>${esc(w.label)}</span>
        ${cmpResultHTML(w.res, w.unit)}
      </div>`).join('')}
      <p class="muted small">Se comparan ventanas de 7 y 30 días con las inmediatamente anteriores. Si falta una de las dos ventanas, se indica «Faltan datos» en vez de inventar una tendencia.</p>
    </section>

    <section class="cmp-card">
      <div class="section-head"><h2>Hace tres meses</h2><span class="muted">Tu marca de entonces frente a la de ahora</span></div>
      ${['weight', 'reps', 'volume', 'e1rm'].map(metric => {
        const since = PG.compareSince(rows, metric, 90);
        return `<div class="cmp-row">
          <span>${esc(PG.METRIC_LABELS[metric].label)}</span>
          ${cmpResultHTML(since, metric === 'reps' ? 'rep' : 'kg')}
        </div>`;
      }).join('')}
      <p class="muted small">Se toma la última sesión de hace 90 días o más y se compara con la más reciente. Si no había entrenamientos de ese ejercicio, se indica «Faltan datos».</p>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Peso levantado</h2><span class="muted">Mejor serie de cada sesión</span></div>
      <div id="pg-weight" class="chart"></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Repeticiones</h2><span class="muted">Reps efectivas por sesión</span></div>
      <div id="pg-reps" class="chart"></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Volumen</h2><span class="muted">Peso × repeticiones</span></div>
      <div id="pg-volume" class="chart"></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Volumen semanal</h2><span class="muted">Toda la cuenta, últimas 12 semanas</span></div>
      <div id="pg-volweek" class="chart"></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>1RM estimado</h2><span class="muted">Fórmula de Epley</span></div>
      <div id="pg-e1rm" class="chart"></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Frecuencia</h2><span class="muted">Sesiones por semana en tu historial completo</span></div>
      <div id="pg-freq" class="chart"></div>
    </section>

    <section class="prog-card prog-${prog.kind}">
      <div class="prog-head"><span class="prog-tag">Sugerencia</span><span class="muted small">${prog.sessions} sesión${prog.sessions === 1 ? '' : 'es'} de historial</span></div>
      <p class="prog-text">${esc(prog.text)}</p>
      ${prog.best ? `<p class="muted small">Última vez: ${fmtKg(prog.best.weight)} kg × ${prog.best.reps} rep · ${prog.last.sets} serie${prog.last.sets === 1 ? '' : 's'} efectiva${prog.last.sets === 1 ? '' : 's'}.</p>` : ''}
    </section>

    <section class="section">
      <div class="section-head"><h2>Sesiones</h2><span class="muted">${totalReps} repeticiones en total</span></div>
      <div class="pg-table">${[...rows].reverse().map(r => `
        <div class="pg-row">
          <span><b>${fmtDateLong(r.date)}</b><br><span class="muted small">${esc(r.name)} · ${r.sets} serie${r.sets === 1 ? '' : 's'}</span></span>
          <span class="pr-val">${r.best ? fmtKg(r.best.weight) + ' kg × ' + r.best.reps : '—'}</span>
          <span class="muted">${r.reps} reps</span>
          <span class="pr-val">${r.volume.toLocaleString('es')} kg</span>
        </div>`).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Volumen total</h2><span class="muted">De toda la cuenta</span></div>
      <div class="stats-grid small">
        <div class="stat-card"><p class="stat-value">${fmtKg(volume.week.volume)} kg</p><p class="stat-label">Esta semana</p></div>
        <div class="stat-card"><p class="stat-value">${fmtKg(volume.month.volume)} kg</p><p class="stat-label">Últimos 30 días</p></div>
        <div class="stat-card"><p class="stat-value">${fmtKg(volume.all.volume)} kg</p><p class="stat-label">Histórico</p></div>
        <div class="stat-card"><p class="stat-value">${volume.all.sets}</p><p class="stat-label">Series efectivas</p></div>
      </div>
      <p class="muted small">El peso corporal y los ejercicios asistidos no suman kilos de volumen (se cuentan sus series y repeticiones): mezclarlos con las pesas daría cifras infladas.</p>
    </section>`}
    ${recordsInlineHTML(d)}`;

  const selEl = $('#pg-select');
  if(selEl) selEl.addEventListener('change', () => { state.progressExercise = selEl.value; render(); });
  const daysEl = $('#pg-days');
  if(daysEl) daysEl.addEventListener('change', () => { state.progDays = Number(daysEl.value) || 0; render(); });
  if(rows.length){
    lineChart($('#pg-weight'), series.weight, 'Necesitas al menos dos sesiones para ver la evolución.');
    lineChart($('#pg-reps'), series.reps, 'Necesitas al menos dos sesiones para ver la evolución.');
    lineChart($('#pg-volume'), series.volume, 'Necesitas al menos dos sesiones para ver la evolución.');
    lineChart($('#pg-e1rm'), series.e1rm, 'Necesitas dos sesiones con repeticiones válidas (1–12) para estimar el 1RM.');
  }
  const volWeeks = volume.weekly.slice(-12);
  if(volWeeks.length){
    lineChart($('#pg-volweek'), volWeeks.map(b => ({ label: b.key, value: b.volume })), 'Necesitas al menos dos semanas con volumen para ver la tendencia.');
  } else {
    const vw = $('#pg-volweek');
    if(vw) vw.innerHTML = '<div class="chart-empty">Aún no hay volumen semanal registrado.</div>';
  }
  if(freqRows.length){
    lineChart($('#pg-freq'), freqRows.map(b => ({ label: b.key, value: b.sessions })), 'Necesitas al menos dos semanas con entrenamiento para ver la frecuencia.');
  } else {
    const el = $('#pg-freq');
    if(el) el.innerHTML = '<div class="chart-empty">Aún no hay semanas con entrenamiento registrado.</div>';
  }
  bindRecordsInline();
}
/* ============================================================
   AJUSTES DE LA CUENTA
   Tema, descanso y notificaciones en un solo sitio. Todo se guarda
   en d.prefs, así que cada cuenta tiene sus propios ajustes.
   ============================================================ */
/* ============================================================
   v2 · Rachas, logros y exportación CSV
   Todo se calcula en el cliente desde los datos que ya existen.
   ============================================================ */
function weekStartISO(dateStr){
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  if(isNaN(d)) return null;
  const dow = (d.getUTCDay() + 6) % 7;          // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function shiftISO(iso, days){
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function finishedSessions(d){
  return ((d && d.sessions) || []).filter(s => s && s.finished && s.date)
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function weeksWithSessions(d){
  const set = new Set();
  finishedSessions(d).forEach(s => { const w = weekStartISO(s.date); if(w) set.add(w); });
  return set;
}
/* Semanas consecutivas con al menos una sesión. La semana en curso solo cuenta
   si ya tiene entrenamiento: una semana recién empezada no corta la racha. */
function streakWeeks(d){
  const weeks = weeksWithSessions(d);
  const thisWeek = weekStartISO(todayISO());
  if(!thisWeek) return { weeks: 0, activeThisWeek: false };
  const activeThisWeek = weeks.has(thisWeek);
  let cursor = activeThisWeek ? thisWeek : shiftISO(thisWeek, -7);
  let weeksCount = 0;
  while(weeks.has(cursor)){ weeksCount++; cursor = shiftISO(cursor, -7); }
  return { weeks: weeksCount, activeThisWeek };
}
/* Meses con al menos una sesión en cada una de sus semanas. */
function fullMonths(d){
  const byMonth = new Map();
  finishedSessions(d).forEach(s => {
    const month = String(s.date).slice(0, 7);
    const week = weekStartISO(s.date);
    if(!month || !week) return;
    if(!byMonth.has(month)) byMonth.set(month, new Set());
    byMonth.get(month).add(week);
  });
  return [...byMonth.entries()].filter(([, weeks]) => weeks.size >= 4).map(([month]) => month);
}
const ACHIEVEMENTS = [
  { id: 'first-record', name: 'Primer récord', hint: 'Tu primera mejor marca registrada.' },
  { id: 'ten-sessions', name: '10 sesiones', hint: 'Diez entrenamientos completados.' },
  { id: 'full-month', name: 'Mes completo', hint: 'Al menos una sesión cada semana de un mes.' },
  { id: 'month-pr', name: 'PR del mes', hint: 'Un récord nuevo este mes.' }
];
function achievementList(d){
  const sessions = finishedSessions(d);
  const records = Array.isArray(d && d.records) ? d.records : [];
  const thisMonth = todayISO().slice(0, 7);
  const done = {
    'first-record': records.length > 0,
    'ten-sessions': sessions.length >= 10,
    'full-month': fullMonths(d).length > 0,
    'month-pr': records.some(r => String(r && r.date || '').slice(0, 7) === thisMonth)
  };
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: !!done[a.id] }));
}
/* Fija la fecha del primer desbloqueo (una sola vez) y avisa de los nuevos. */
function unlockAchievements(d, announce){
  if(!d) return [];
  if(!d.achievements || typeof d.achievements !== 'object') d.achievements = {};
  const fresh = [];
  achievementList(d).forEach(a => {
    if(a.unlocked && !d.achievements[a.id]){ d.achievements[a.id] = todayISO(); fresh.push(a); }
  });
  if(fresh.length && announce){
    const names = fresh.map(a => a.name).join(', ');
    toast('Logro desbloqueado: ' + names);
  }
  return fresh;
}
function streakCardHTML(d){
  const st = streakWeeks(d);
  const list = achievementList(d);
  const weeks = st.weeks === 1 ? '1 semana' : st.weeks + ' semanas';
  return `
    <section class="streak-card">
      <div class="streak-main">
        <span class="streak-flame" aria-hidden="true">🔥</span>
        <div>
          <p class="streak-value">${st.weeks ? weeks : 'Sin racha'}</p>
          <p class="streak-label">${st.activeThisWeek ? 'Semanas seguidas entrenando' : 'Entrena esta semana para mantenerla'}</p>
        </div>
      </div>
      <ul class="ach-grid">
        ${list.map(a => `<li class="ach-item ${a.unlocked ? 'on' : ''}" title="${esc(a.hint)}">
          <span class="ach-dot" aria-hidden="true">${a.unlocked ? '✓' : '·'}</span>
          <span class="ach-name">${esc(a.name)}</span>
          <span class="ach-hint">${a.unlocked ? 'Desbloqueado' : esc(a.hint)}</span>
        </li>`).join('')}
      </ul>
    </section>`;
}

/* ---------------- Exportación CSV ---------------- */
function csvEscape(value){
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
/* BOM para que Excel abra el archivo en UTF-8 y CRLF como separador de línea. */
function csvText(rows){
  return '\uFEFF' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
function setRPE(st){
  if(st && st.rpe != null && st.rpe !== '') return st.rpe;
  if(st && st.rir != null && st.rir !== '') return String(10 - Number(st.rir));
  return '';
}
function csvSetsRows(d){
  const rows = [['fecha', 'ejercicio', 'serie', 'peso', 'repeticiones', 'rpe', 'notas']];
  finishedSessions(d).forEach(s => {
    (s.exercises || []).forEach(ex => {
      (ex.sets || []).forEach((st, i) => {
        if(!st || !st.completed) return;
        rows.push([s.date, ex.name || '', st.number || i + 1, st.weight === '' ? '' : st.weight, st.reps === '' ? '' : st.reps, setRPE(st), st.note || '']);
      });
    });
  });
  return rows;
}
function csvSessionsRows(d){
  const rows = [['fecha', 'entrenamiento', 'duracion_min', 'series', 'repeticiones', 'volumen_kg', 'records']];
  finishedSessions(d).forEach(s => {
    const m = s.summary || buildSummary(s);
    const sets = (s.exercises || []).reduce((a, ex) => a + (ex.sets || []).filter(st => st && st.completed).length, 0);
    const records = (s.records || []).length;
    rows.push([s.date, s.workoutName || '', m.durationSec ? Math.round(m.durationSec / 60) : '', sets, m.reps || 0, Math.round(m.volume || 0), records]);
  });
  return rows;
}
function csvWeightsRows(d){
  const rows = [['fecha', 'peso_kg']];
  ((d && d.weights) || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach(w => rows.push([w.date || '', w.weight == null ? '' : w.weight]));
  return rows;
}
function accountSlug(){
  return String(currentUser || 'cuenta').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cuenta';
}
async function exportCSV(kind){
  if(!currentUser){ toast('Inicia sesión para exportar tus datos.', 'error'); return; }
  const d = dataFor(currentUser);
  const builders = { sets: csvSetsRows, sessions: csvSessionsRows, weights: csvWeightsRows };
  const build = builders[kind];
  if(!build) return;
  const rows = build(d);
  if(rows.length < 2){ toast('Todavía no hay datos para ese CSV.', 'info'); return; }
  const text = csvText(rows);
  const filename = 'drakotrack-' + accountSlug() + '-' + kind + '-' + todayISO() + '.csv';
  try{
    if(window.DrakoShare && DrakoShare.shareFile){
      const res = await DrakoShare.shareFile(filename, text, 'text/csv');
      toast(res === 'shared' ? 'CSV compartido — elige dónde guardarlo.' : 'CSV descargado.');
    } else {
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a');
      aEl.href = url; aEl.download = filename;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('CSV descargado.');
    }
  }catch(e){ toast('No se pudo generar el CSV.', 'error'); }
}

/* ============================================================
   v2 · Plan en tres pasos, volumen por grupo y mes a mes
   El plan se guarda en d.profile, dentro del mismo jsonb que ya
   usa la cuenta: no hay tablas nuevas ni migraciones.
   ============================================================ */
const GOALS = [
  { id:'fuerza',      label:'Fuerza',       hint:'Levantar más en los básicos',   cat:'strength' },
  { id:'hipertrofia', label:'Músculo',      hint:'Ganar tamaño y volumen',        cat:'hyper' },
  { id:'grasa',       label:'Perder grasa', hint:'Moverte más y cuidar el peso',  cat:'fitness' },
  { id:'resistencia', label:'Resistencia',  hint:'Aguantar más series y trabajo', cat:'endurance' },
];
const LEVELS = [
  { id:'principiante', label:'Principiante', hint:'Menos de 6 meses entrenando',  sets:3, reps:10, rest:90,  match:['Beginner', 'Intermediate'] },
  { id:'intermedio',   label:'Intermedio',   hint:'Entre 6 meses y 2 años',       sets:4, reps:8,  rest:120, match:['Intermediate'] },
  { id:'avanzado',     label:'Avanzado',     hint:'Más de 2 años con constancia', sets:4, reps:6,  rest:150, match:['Advanced', 'Intermediate'] },
];
const DAYS_CHOICES = [2, 3, 4, 5, 6];
function goalById(id){ return GOALS.find(g => g.id === id) || null; }
function levelById(id){ return LEVELS.find(l => l.id === id) || null; }
/* Perfil válido o null: nunca se da por elegido algo que el usuario no marcó. */
function userProfile(d){
  const p = d && d.profile;
  if(!p || typeof p !== 'object') return null;
  const goal = goalById(p.goal), level = levelById(p.level);
  const days = Number(p.days);
  if(!goal || !level || !DAYS_CHOICES.includes(days)) return null;
  return { goal: goal.id, level: level.id, days, at: p.at || null };
}
function profileDone(d){ return !!userProfile(d); }
function saveProfile(patch){
  const d = currentUser ? dataFor(currentUser) : null;
  if(!d) return null;
  const next = Object.assign({}, userProfile(d) || {}, patch || {});
  if(!next.at) next.at = todayISO();
  d.profile = next;
  saveDB();
  return userProfile(d);
}
/* Series, repeticiones y descanso por defecto según la experiencia elegida.
   Sin plan no hay suposiciones: quien no lo configura mantiene lo de antes. */
function planDefaults(d){
  const p = userProfile(d);
  const lvl = levelById(p && p.level);
  return lvl ? { sets: lvl.sets, reps: lvl.reps, rest: lvl.rest } : null;
}
/* Programas que encajan con el plan. Solo ordena el catálogo que ya existe. */
function rankPrograms(profile, catalog){
  if(!profile || !Array.isArray(catalog)) return [];
  const goal = goalById(profile.goal);
  const level = levelById(profile.level);
  const days = Number(profile.days) || 0;
  return catalog
    .filter(p => p && p.slug && p.t && p.ok !== false)
    .map(p => {
      const cats = Array.isArray(p.c) ? p.c : [];
      const diffs = Array.isArray(p.diff) ? p.diff : [];
      let score = 0;
      if(goal && cats.includes(goal.cat)) score += 6;
      if(level && diffs.some(x => level.match.includes(x))) score += 3;
      const dpw = Number(p.dpw) || 0;
      if(days && dpw) score += Math.max(0, 4 - Math.abs(dpw - days) * 2);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || String(a.p.t).localeCompare(String(b.p.t), 'es'))
    .slice(0, 3)
    .map(x => x.p);
}
/* ---------------- Asistente de tres pasos ---------------- */
function onboardingState(d){
  const p = userProfile(d);
  return { step: 1, goal: p ? p.goal : '', days: p ? p.days : '', level: p ? p.level : '' };
}
function openOnboarding(){
  if(!currentUser) return;
  state.onb = onboardingState(dataFor(currentUser));
  nav('#/start');
}
function onboardPick(kind, value){
  if(!state.onb) state.onb = onboardingState(currentUser ? dataFor(currentUser) : null);
  if(kind === 'goal'){ state.onb.goal = value; state.onb.step = 2; }
  else if(kind === 'days'){ state.onb.days = Number(value); state.onb.step = 3; }
  else if(kind === 'level'){ state.onb.level = value; }
  else if(kind === 'step'){ state.onb.step = Math.max(1, Math.min(3, Number(value) || 1)); }
  render();
}
function finishOnboarding(){
  const ob = state.onb || {};
  if(!ob.goal || !ob.days || !ob.level){ toast('Elige objetivo, días y experiencia.', 'error'); return; }
  const p = saveProfile({ goal: ob.goal, days: Number(ob.days), level: ob.level, skipped: false });
  if(!p){ toast('No se pudo guardar el plan.', 'error'); return; }
  state.onb = null;
  const goal = goalById(p.goal), level = levelById(p.level);
  toast('Plan guardado: ' + goal.label + ' · ' + p.days + ' días · ' + level.label);
  nav('#/workouts');
}
/* Omitir no bloquea nada ni vuelve a preguntar: el plan queda a un toque en Ajustes. */
function skipOnboarding(){
  const d = currentUser ? dataFor(currentUser) : null;
  if(d){ d.profile = { skipped: true, at: todayISO() }; saveDB(); }
  state.onb = null;
  toast('Puedes configurar tu plan cuando quieras desde Ajustes.', 'info');
  nav('#/workouts');
}
function planCardHTML(d){
  if(profileDone(d)) return '';
  if(d && d.profile && d.profile.skipped) return '';
  return `
    <section class="plan-card">
      <div>
        <h2>Configura tu plan</h2>
        <p class="muted small">Objetivo, días por semana y experiencia. Con eso te recomiendo programas del catálogo y ajusto las series por defecto.</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="open-onboarding">Empezar</button>
    </section>`;
}
function planSummaryHTML(d){
  const p = userProfile(d);
  if(!p){
    return `<p class="muted small">Sin configurar. Son tres preguntas y sirve para recomendarte programas y ajustar las series por defecto.</p>
      <div class="csv-row"><button class="btn btn-ghost" type="button" data-action="open-onboarding">Configurar plan</button></div>`;
  }
  const goal = goalById(p.goal), level = levelById(p.level);
  return `<p class="muted small">${esc(goal.label)} · ${p.days} día${p.days === 1 ? '' : 's'} por semana · ${esc(level.label)}${p.at ? ' · desde el ' + esc(fmtDate(p.at)) : ''}</p>
    <div class="csv-row"><button class="btn btn-ghost" type="button" data-action="open-onboarding">Cambiar plan</button></div>`;
}
function paintOnbRecs(){
  const box = $('#onb-recs');
  if(!box) return;
  const ob = state.onb || {};
  if(!ob.goal || !ob.days || !ob.level){
    box.innerHTML = '<p class="muted small">Elige objetivo, días y experiencia para ver programas que encajan.</p>';
    return;
  }
  box.innerHTML = '<p class="muted small">Buscando programas que encajan…</p>';
  DrakoBC.catalog().then(cat => {
    const target = $('#onb-recs');
    if(!target) return;
    const list = rankPrograms({ goal: ob.goal, days: Number(ob.days), level: ob.level }, cat);
    target.innerHTML = list.length
      ? `<div class="onb-rec-list">${list.map(p => `
          <article class="onb-rec">
            <span class="onb-rec-meta">${esc((Array.isArray(p.c) ? p.c : []).map(c => (BC_CATS.find(x => x.k === c) || {}).label || c).join(' · '))}${p.dpw ? ' · ' + p.dpw + ' d/sem' : ''}</span>
            <h3>${esc(p.t)}</h3>
            ${p.a ? `<p class="muted small">por ${esc(p.a)}</p>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" data-action="open-program" data-slug="${esc(p.slug)}">Ver programa</button>
          </article>`).join('')}</div>`
      : '<p class="muted small">El catálogo no está disponible ahora mismo. Guarda tu plan igualmente: puedes elegir programa en Entrenamientos.</p>';
  }).catch(() => {
    const target = $('#onb-recs');
    if(target) target.innerHTML = '<p class="muted small">No se pudo cargar el catálogo. Guarda tu plan y elige programa cuando quieras.</p>';
  });
}
function renderStart(main){
  const d = dataFor(currentUser);
  const ob = state.onb || (state.onb = onboardingState(d));
  const step = ob.step;
  const goal = goalById(ob.goal), level = levelById(ob.level);
  const dot = n => `<span class="onb-dot${n === step ? ' on' : n < step ? ' done' : ''}" aria-hidden="true">${n < step ? '✓' : n}</span>`;
  const opt = (kind, id, label, hint, on) => `<button type="button" class="onb-opt${on ? ' on' : ''}" data-action="onb-${kind}" data-id="${esc(String(id))}" aria-pressed="${on ? 'true' : 'false'}">
      <span class="onb-opt-name">${esc(label)}</span><span class="onb-opt-hint">${esc(hint)}</span></button>`;
  const body = step === 1
    ? `<h2>¿Qué buscas?</h2><div class="onb-grid">${GOALS.map(g => opt('goal', g.id, g.label, g.hint, ob.goal === g.id)).join('')}</div>`
    : step === 2
    ? `<h2>¿Cuántos días por semana puedes entrenar?</h2><div class="onb-grid days">${DAYS_CHOICES.map(n => opt('days', n, n + ' días', n <= 3 ? 'Lo justo para progresar' : 'Buen margen para repartir grupos', Number(ob.days) === n)).join('')}</div>
       <p class="muted small">Elige lo que puedas sostener cuatro semanas seguidas, no lo que te gustaría hacer en una semana buena.</p>`
    : `<h2>¿Cuánta experiencia tienes?</h2><div class="onb-grid">${LEVELS.map(l => opt('level', l.id, l.label, l.hint, ob.level === l.id)).join('')}</div>
       <div class="onb-summary">${goal ? esc(goal.label) : 'Sin objetivo'} · ${ob.days ? ob.days + ' días' : 'sin días'} · ${level ? esc(level.label) : 'sin experiencia'}</div>
       <div id="onb-recs" class="onb-recs"></div>`;

  main.innerHTML = `
    <div class="page-head">
      <h1>Tu plan en tres pasos</h1>
      <p class="muted">Sirve para recomendarte programas y ajustar las series por defecto. Puedes cambiarlo cuando quieras en Ajustes.</p>
    </div>
    <section class="onb-card">
      <div class="onb-progress">${dot(1)}${dot(2)}${dot(3)}<span class="muted small">Paso ${step} de 3</span></div>
      ${body}
      <div class="onb-actions">
        ${step > 1 ? `<button class="btn btn-ghost" type="button" data-action="onb-step" data-id="${step - 1}">← Atrás</button>` : `<button class="btn btn-ghost" type="button" data-action="onb-skip">Ahora no</button>`}
        ${step < 3
          ? `<button class="btn btn-primary" type="button" data-action="onb-step" data-id="${step + 1}">Siguiente</button>`
          : `<button class="btn btn-primary" type="button" data-action="onb-save" ${ob.goal && ob.days && ob.level ? '' : 'disabled'}>Guardar mi plan</button>`}
      </div>
    </section>`;
  if(step === 3) paintOnbRecs();
}
/* ---------------- Volumen semanal por grupo muscular ---------------- */
/* Series efectivas y volumen de un ejercicio: sin calentamientos, sin series
   sin completar y sin sesiones canceladas. Un ejercicio heredado cuenta como
   una serie si estaba marcado como hecho. */
function effectiveSets(ex){
  const out = { sets: 0, volume: 0 };
  if(!ex) return out;
  if(hasSets(ex)){
    ex.sets.forEach(st => {
      if(!st || !st.completed || st.type === 'warmup') return;
      out.sets++;
      out.volume += (Number(st.weight) || 0) * (Number(st.reps) || 0);
    });
  } else if(ex.done){
    out.sets = 1;
    out.volume = (Number(ex.weight) || 0) * (Number(ex.reps) || 0);
  }
  return out;
}
function weekMuscleVolume(d, weekISO){
  const to = shiftISO(weekISO, 6);
  const map = new Map();
  let totalSets = 0, classifiedSets = 0, totalVolume = 0;
  const add = (id, sets, volume) => {
    const cur = map.get(id) || { id, sets: 0, volume: 0 };
    cur.sets += sets;
    cur.volume += volume;
    map.set(id, cur);
  };
  finishedSessions(d).forEach(s => {
    const day = String(s.date).slice(0, 10);
    if(day < weekISO || day > to) return;
    (s.exercises || []).forEach(ex => {
      const t = effectiveSets(ex);
      if(!t.sets) return;
      totalSets += t.sets;
      totalVolume += t.volume;
      const shares = muscleBreakdownForExercise(ex, d);
      if(!shares.length){
        /* El diccionario no lo clasifica: no se reparte a ciegas. */
        add('sin-clasificar', t.sets, t.volume);
      } else {
        classifiedSets += t.sets;
        shares.forEach(sh => add(sh.id, t.sets * sh.weight, t.volume * sh.weight));
      }
    });
  });
  const rows = [...map.values()]
    .map(r => ({ id: r.id, sets: Math.round(r.sets * 10) / 10, volume: Math.round(r.volume * 10) / 10 }))
    .sort((a, b) => b.sets - a.sets || b.volume - a.volume);
  rows.meta = {
    totalSets: Math.round(totalSets * 10) / 10,
    classifiedSets: Math.round(classifiedSets * 10) / 10,
    totalVolume: Math.round(totalVolume),
  };
  return rows;
}
function groupName(id){
  if(id === 'sin-clasificar') return 'Sin clasificar';
  return groupLabel(id) || id;
}
function fmtMuscleSets(v){
  const n = Math.round(Number(v) * 10) / 10;
  return String(n).replace('.', ',');
}
function setCountLabel(v){
  const n = Math.round(Number(v) * 10) / 10;
  return fmtMuscleSets(n) + (n === 1 ? ' serie' : ' series');
}
function muscleVolumeCardHTML(d){
  const thisWeek = weekStartISO(todayISO());
  if(!thisWeek) return '';
  const rows = weekMuscleVolume(d, thisWeek);
  const meta = rows.meta || { totalSets: 0, classifiedSets: 0, totalVolume: 0 };
  const before = new Map(weekMuscleVolume(d, shiftISO(thisWeek, -7)).map(r => [r.id, r.sets]));
  const max = Math.max(1, ...rows.map(r => r.sets));
  const groupCount = MUSCLE_DICT && MUSCLE_DICT.groups ? Object.keys(MUSCLE_DICT.groups).length : 16;
  const loading = MUSCLE_DICT_STATE === 'idle' || MUSCLE_DICT_STATE === 'loading';
  const failed = MUSCLE_DICT_STATE === 'error';
  const unclassified = rows.find(r => r.id === 'sin-clasificar');
  const pct = meta.totalSets ? Math.round(meta.classifiedSets / meta.totalSets * 100) : 0;
  return `
    <section class="mv-card">
      <div class="section-head"><h2>Mapa muscular de la semana</h2><span class="muted">${groupCount} grupos · diccionario publicado</span></div>
      ${loading
        ? '<p class="muted small" role="status">Cargando las clasificaciones musculares publicadas…</p>'
        : failed
          ? '<div class="mv-error" role="status"><p class="muted small">No se pudo cargar el diccionario muscular. El mapa no reparte los ejercicios sin clasificar.</p><button class="btn btn-ghost btn-sm" type="button" data-action="muscle-retry">Reintentar</button></div>'
          : rows.length
            ? `<ul class="mv-list">${rows.map(r => {
                const diff = Math.round((r.sets - (before.get(r.id) || 0)) * 10) / 10;
                const diffText = diff > 0 ? '+' + fmtMuscleSets(diff) : diff < 0 ? '−' + fmtMuscleSets(Math.abs(diff)) : '=';
                return `<li class="mv-row">
                <span class="mv-name">${esc(groupName(r.id))}</span>
                <span class="mv-track"><span class="mv-bar" style="width:${Math.round(r.sets / max * 100)}%"></span></span>
                <span class="mv-val">${setCountLabel(r.sets)}</span>
                <span class="mv-delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}">${diffText}</span>
              </li>`;
              }).join('')}</ul>
              <p class="muted small">${fmtMuscleSets(meta.classifiedSets)} de ${fmtMuscleSets(meta.totalSets)} series efectivas clasificadas (${pct} %). ${meta.totalVolume ? esc(fmtKg(meta.totalVolume)) + ' kg de volumen total.' : ''} El reparto pondera primario 1 y secundario 0,5, y se ajusta para que cada serie sume una sola vez.</p>`
              + (unclassified ? `<p class="muted small">${setCountLabel(unclassified.sets)} sin clasificar no se ${unclassified.sets === 1 ? 'reparte' : 'reparten'} entre músculos: el diccionario no las identifica.</p>` : '')
            : '<p class="muted small">Esta semana todavía no hay series registradas. Completa una sesión y aquí verás el reparto por grupo muscular.</p>'}
    </section>`;
}

/* ---------------- Comparación mes a mes ---------------- */
function monthKey(iso){ return String(iso || '').slice(0, 7); }
function shiftMonth(ym, delta){
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if(!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function monthLabel(ym){
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if(!m) return '—';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const label = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function monthStats(d, ym){
  const rows = finishedSessions(d).filter(s => monthKey(s.date) === ym);
  let sets = 0, volume = 0, sessionRecords = 0;
  rows.forEach(s => {
    const m = s.summary || buildSummary(s);
    volume += Number(m.volume) || 0;
    sessionRecords += Array.isArray(s.records) ? s.records.length : (Array.isArray(m.records) ? m.records.length : 0);
    (s.exercises || []).forEach(ex => { sets += effectiveSets(ex).sets; });
  });
  /* Los récords automáticos llevan su propia fecha: es la fuente más fiable.
     Si la cuenta aún no tiene esa lista se usan los guardados en cada sesión. */
  const records = Array.isArray(d && d.records)
    ? d.records.filter(r => monthKey(r && r.date) === ym).length
    : sessionRecords;
  return { sessions: rows.length, sets, volume: Math.round(volume), records };
}
function monthCompareHTML(d){
  const nowYm = monthKey(todayISO());
  const prevYm = shiftMonth(nowYm, -1);
  const now = monthStats(d, nowYm), prev = monthStats(d, prevYm);
  if(!now.sessions && !prev.sessions) return '';
  const kg = v => v ? fmtKg(Math.round(v)) + ' kg' : '—';
  const rows = [
    { label: 'Sesiones', prev: prev.sessions || '—', now: now.sessions || '—', delta: cmpDelta(prev.sessions, now.sessions) },
    { label: 'Series efectivas', prev: prev.sets || '—', now: now.sets || '—', delta: cmpDelta(prev.sets, now.sets) },
    { label: 'Volumen', prev: kg(prev.volume), now: kg(now.volume), delta: cmpDelta(prev.volume, now.volume) },
    { label: 'Récords', prev: prev.records || '—', now: now.records || '—', delta: cmpDelta(prev.records, now.records) },
  ];
  return `
    <section class="cmp-card">
      <div class="section-head"><h2>Este mes frente al anterior</h2><span class="muted">${esc(monthLabel(prevYm))} → ${esc(monthLabel(nowYm))}</span></div>
      <div class="cmp-legend"><span>Métrica</span><span class="muted small">${esc(monthLabel(prevYm))}</span><span class="muted small">${esc(monthLabel(nowYm))}</span><span></span></div>
      ${rows.map(m => `<div class="cmp-row">
        <span>${m.label}</span>
        <span class="cmp-val">${m.prev}</span>
        <span class="cmp-val cmp-now">${m.now}</span>
        <span class="cmp-delta ${m.delta.cls}">${m.delta.text}</span>
      </div>`).join('')}
      <p class="muted small">El mes en curso se mide contra el mes anterior completo: a principios de mes es normal ir por detrás. Cuentan solo sesiones terminadas.</p>
    </section>`;
}

function renderSettings(main){
  const d = dataFor(currentUser);
  const light = theme === 'light';
  const secs = restAlertSeconds();
  const toggleRow = (name, label, hint) => '<label class="set-row">'
    + '<span class="set-text"><b>' + label + '</b><small class="muted">' + hint + '</small></span>'
    + '<input class="set-check" type="checkbox" data-pref="' + name + '"' + (prefEnabled(name, d) ? ' checked' : '') + '>'
    + '</label>';

  main.innerHTML = `
    <div class="page-head">
      <h1>Ajustes de la cuenta</h1>
      <p class="muted">Tema, descanso y avisos de ${esc(accountDisplayName())}. Se guardan en tu cuenta y te siguen en cualquier dispositivo.</p>
    </div>

    ${isCloud() ? `<section class="settings-card">
      <h2>Perfil en la nube</h2>
      <p class="muted small">Este nombre aparece en tu saludo y en la cabecera. No cambia tu correo de acceso.</p>
      <div class="form-row" style="margin-top:10px">
        <input id="set-cloud-name" maxlength="40" autocomplete="nickname" value="${esc(DrakoSB.name() || '')}" placeholder="Tu nombre de usuario" aria-label="Nombre de usuario en la nube">
        <button class="btn btn-primary" type="button" data-action="save-cloud-name">Guardar nombre</button>
      </div>
      <p class="muted small">Cuenta: ${esc(maskAccount(currentUser))}</p>
    </section>` : ''}

    <section class="settings-card">
      <h2>Exportar a CSV</h2>
      <p class="muted small">Archivos UTF-8 con BOM, listos para abrir en Excel o en Hojas de cálculo. Solo se generan en tu dispositivo.</p>
      <div class="csv-row">
        <button class="btn btn-ghost" type="button" data-action="csv-sets">Series</button>
        <button class="btn btn-ghost" type="button" data-action="csv-sessions">Sesiones</button>
        <button class="btn btn-ghost" type="button" data-action="csv-weights">Medidas</button>
      </div>
    </section>

    <section class="settings-card">
      <h2>Tu plan</h2>
      ${planSummaryHTML(d)}
    </section>

    ${offlineSettingsHTML()}

    <section class="settings-card">
      <h2>Apariencia</h2>
      <p class="muted small">El botón de sol y luna de la cabecera cambia lo mismo.</p>
      <div class="seg-row" role="group" aria-label="Tema">
        <button class="seg-btn" type="button" data-action="set-theme" data-theme="dark" aria-pressed="${light ? 'false' : 'true'}">Oscuro</button>
        <button class="seg-btn" type="button" data-action="set-theme" data-theme="light" aria-pressed="${light ? 'true' : 'false'}">Claro</button>
      </div>
    </section>

    <section class="settings-card">
      <h2>Descanso entre series</h2>
      ${toggleRow('restAlerts', 'Aviso al terminar el descanso', 'Suena y/o vibra cuando llega a cero. La campana de la barra de descanso hace lo mismo.')}
      <label class="set-row">
        <span class="set-text"><b>Duración del aviso</b><small class="muted">De 1 a 4 segundos. Las series pesadas usan un tono más largo.</small></span>
        <select class="rest-alert-len" id="set-rest-len" aria-label="Duración del aviso de descanso">
          ${[1, 2, 3, 4].map(n => `<option value="${n}" ${n === secs ? 'selected' : ''}>${n} s</option>`).join('')}
        </select>
      </label>
      <label class="set-row">
        <span class="set-text"><b>Sonido de la alarma</b><small class="muted">Elige el aviso que suena al llegar a cero.</small></span>
        <select class="rest-alert-len rest-sound-select" id="set-rest-sound" aria-label="Sonido de la alarma de descanso">
          ${REST_SOUNDS.map(x => `<option value="${x.id}" ${x.id === restSoundChoice() ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select>
      </label>
      <div class="settings-inline">
        <button class="btn btn-ghost btn-sm" type="button" data-action="rest-sound-test">Probar sonido</button>
      </div>
      <p class="muted sound-credit">Audios: <a href="https://freesound.org/people/Chelly01/sounds/541077/" target="_blank" rel="noopener noreferrer">Chelly01<span class="sr-only"> (se abre en una pestaña nueva)</span></a> (CC0), <a href="https://freesound.org/people/zanox/sounds/233645/" target="_blank" rel="noopener noreferrer">zanox<span class="sr-only"> (se abre en una pestaña nueva)</span></a> (CC BY-NC 4.0) y <a href="https://freesound.org/people/zharvill/sounds/721826/" target="_blank" rel="noopener noreferrer">zharvill<span class="sr-only"> (se abre en una pestaña nueva)</span></a> (CC0).</p>
    </section>

    <section class="settings-card">
      <h2>Notificaciones</h2>
      ${toggleRow('restSound', 'Sonido', 'Tres notas al terminar el descanso; cuatro y más largas si la serie fue pesada.')}
      ${toggleRow('restVibrate', 'Vibración', 'Solo en móviles compatibles.')}
      ${toggleRow('notifyRecords', 'Avisar de nuevos récords', 'Muestra un mensaje al superar tu mejor serie. La insignia 🏆 se guarda igual.')}
    </section>

    <p class="muted small">Para vaciar entrenamientos o eliminar la cuenta, usa el menú de tu cuenta en la cabecera.</p>`;

  const lenSel = $('#set-rest-len');
  if(lenSel) lenSel.addEventListener('change', () => {
    setRestAlertSeconds(lenSel.value);
    toast('Duración del aviso: ' + restAlertSeconds() + ' s.', 'info');
  });
  const soundSel = $('#set-rest-sound');
  if(soundSel) soundSel.addEventListener('change', () => {
    stopRestSoundPreview();
    setRestSoundChoice(soundSel.value);
    beepRestEnd(false);
    toast('Sonido de descanso: ' + (REST_SOUNDS.find(x => x.id === soundSel.value) || {}).label + '.', 'info');
  });
  $$('.set-check').forEach(cb => cb.addEventListener('change', () => { setPref(cb.dataset.pref, cb.checked); render(); }));
}
function weightPeriodDays(){
  return state.weightDays == null ? 0 : state.weightDays;
}
function renderWeight(main){
  const d = dataFor(currentUser);
  const bw = PG.bodyweight(d);
  const sorted = bw.list;
  const days = weightPeriodDays();
  const periodRows = days ? sorted.filter(w => (PG.parseDay(w.date) || 0) >= Date.now() - days * PG.DAY) : sorted;
  const periodChange = periodRows.length >= 2 ? PG.round1(periodRows[periodRows.length - 1].weight - periodRows[0].weight) : null;
  const edit = state.weightEdit || null;
  const last60 = sorted.slice(-60);
  const weekly = bw.weekly.slice(-8).reverse();
  const monthly = bw.monthly.slice(-6).reverse();
  const photo = safePhotoSrc(d.photo);

  main.innerHTML = `
    <div class="page-head">
      <h1>Control de peso</h1>
      <p class="muted">Registra tu peso corporal, edita cualquier medición y guarda una foto de referencia de tu progreso.</p>
    </div>

    <section class="stats-grid small">
      <div class="stat-card"><p class="stat-value">${bw.latest ? fmtKg(bw.latest.weight) + ' kg' : '—'}</p><p class="stat-label">Peso actual</p></div>
      <div class="stat-card"><p class="stat-value">${periodChange == null ? '—' : (periodChange > 0 ? '+' : '') + fmtKg(periodChange) + ' kg'}</p><p class="stat-label">${days ? 'Cambio en el período' : 'Cambio total'}</p></div>
      <div class="stat-card"><p class="stat-value">${bw.weekAvg == null ? '—' : fmtKg(bw.weekAvg) + ' kg'}</p><p class="stat-label">Media semanal</p></div>
      <div class="stat-card"><p class="stat-value">${bw.monthAvg == null ? '—' : fmtKg(bw.monthAvg) + ' kg'}</p><p class="stat-label">Media mensual</p></div>
    </section>

    <section class="chart-card">
      <div class="section-head"><h2>Tendencia de peso</h2><span class="muted">${periodRows.length} registro${periodRows.length === 1 ? '' : 's'}${days ? ' en el período' : ''}</span>
        <button class="btn btn-primary btn-sm" data-action="share-weight" type="button" ${sorted.length ? '' : 'disabled'}>Compartir en WhatsApp</button>
      </div>
      <div class="pr-top">
        <div class="pr-select">
          <label>Período</label>
          <select id="w-period">
            <option value="0"${days === 0 ? ' selected' : ''}>Todo</option>
            <option value="30"${days === 30 ? ' selected' : ''}>Últimos 30 días</option>
            <option value="90"${days === 90 ? ' selected' : ''}>Últimos 90 días</option>
            <option value="365"${days === 365 ? ' selected' : ''}>Último año</option>
          </select>
        </div>
      </div>
      <div id="w-chart" class="chart"></div>
    </section>

    <div class="grid-2">
      <div class="card">
        <h3>${edit ? 'Editar la medición' : 'Registrar el peso de hoy'}</h3>
        <div class="form-row">
          <input type="date" id="w-date" value="${edit ? esc(edit.date) : todayISO()}" aria-label="Fecha del registro de peso">
          <input type="number" id="w-weight" placeholder="kg" inputmode="decimal" min="0" value="${edit ? esc(String(edit.weight)) : ''}" aria-label="Peso en kg">
          <button class="btn btn-primary" data-action="add-weight" type="button">${edit ? 'Guardar cambios' : 'Añadir'}</button>
          ${edit ? `<button class="btn btn-ghost" data-action="cancel-weight-edit" type="button">Cancelar</button>` : ''}
        </div>
        <p class="muted small">Solo se guarda una medición por día: si repites la fecha se actualiza la existente.</p>
        <div class="weight-list">
          ${[...sorted].reverse().slice(0, 12).map(w => `
            <div class="pr-item">
              <span>${fmtDateLong(w.date)}</span>
              <span class="pr-val">${fmtKg(w.weight)} kg</span>
              <button class="icon-btn" data-action="edit-weight" data-id="${esc(w.id || '')}" type="button" aria-label="Editar el peso del ${fmtDateLong(w.date)}" title="Editar">✎</button>
              <button class="icon-btn danger" data-action="delete-weight" data-id="${esc(w.id || '')}" type="button" aria-label="Eliminar el registro de peso del ${fmtDateLong(w.date)}" title="Eliminar registro">✕</button>
            </div>`).join('') || '<div class="empty-state">Aún no hay registros. Añade tu primer peso arriba.</div>'}
        </div>
      </div>

      <div class="card">
        <h3>Foto de referencia</h3>
        <p class="muted small" style="margin-bottom:14px">Sube una foto de progreso — solo se guarda en este dispositivo.</p>
        ${photo
          ? `<div class="photo-wrap"><img src="${esc(photo)}" alt="Foto de referencia de progreso"><div class="photo-actions">
              <button class="btn btn-ghost btn-sm" data-action="change-photo" type="button">Reemplazar</button>
              <button class="btn btn-ghost btn-sm danger-text" data-action="remove-photo" type="button">Eliminar</button>
            </div></div>`
          : `<div class="photo-empty"><button class="btn btn-primary" data-action="change-photo" type="button">Subir foto</button>
             <p class="muted small" style="margin-top:10px">JPG / PNG, se comprime automáticamente.</p></div>`}
        <input type="file" id="photo-input" accept="image/*" hidden>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Medias semanales</h3>
        ${weekly.length ? `<div class="pr-list">${weekly.map(w => `<div class="pr-item"><span>Semana del ${fmtDate(w.key)}</span><span class="pr-val">${fmtKg(w.avg)} kg</span><span class="muted small">${w.n} medición${w.n === 1 ? '' : 'es'}</span></div>`).join('')}</div>` : '<p class="muted small">Sin mediciones suficientes.</p>'}
      </div>
      <div class="card">
        <h3>Medias mensuales</h3>
        ${monthly.length ? `<div class="pr-list">${monthly.map(m => `<div class="pr-item"><span>${esc(m.key)}</span><span class="pr-val">${fmtKg(m.avg)} kg</span><span class="muted small">${m.n} medición${m.n === 1 ? '' : 'es'}</span></div>`).join('')}</div>` : '<p class="muted small">Sin mediciones suficientes.</p>'}
      </div>
    </div>`;

  const per = $('#w-period');
  if(per) per.addEventListener('change', () => { state.weightDays = Number(per.value) || 0; render(); });
  const chartRows = days
    ? sorted.filter(w => (PG.parseDay(w.date) || 0) >= Date.now() - days * PG.DAY)
    : last60;
  if(chartRows.length){
    lineChart($('#w-chart'), chartRows.map(w => ({ label:w.date, value:w.weight })), 'Añade tu primer registro de peso para ver tu tendencia.');
  }
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
/* ---------------- Historial de entrenamientos ---------------- */
/* Filtros del historial: viven en `state`, así que se conservan al cambiar
   de pantalla y volver. Todo se calcula sobre las sesiones ya guardadas. */
function histFilters(){
  if(!state.hist) state.hist = { q:'', period:'all', workout:'all', exercise:'all', order:'desc', limit:20, from:'', to:'' };
  return state.hist;
}
function histFrom(period){
  if(!period || period === 'all') return null;
  const days = { week:7, month:30, '3m':90, year:365 }[period];
  if(!days) return null;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}
function histLiteRows(d){
  const f = histFilters();
  let rows = PG.history(d, name => resolveExerciseId(name, d));
  const from = histFrom(f.period);
  if(from) rows = rows.filter(r => r.date >= from);
  if(f.period === 'custom'){
    if(f.from) rows = rows.filter(r => r.date >= f.from);
    if(f.to) rows = rows.filter(r => r.date <= f.to);
  }
  if(f.workout !== 'all') rows = rows.filter(r => r.name === f.workout);
  if(f.exercise !== 'all') rows = rows.filter(r => (r.exercises || []).some(e => e.key === f.exercise));
  const q = f.q.trim().toLowerCase();
  if(q) rows = rows.filter(r =>
    String(r.name).toLowerCase().includes(q) ||
    (r.exercises || []).some(e => String(e.name).toLowerCase().includes(q)));
  rows.sort((a, b) => f.order === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  return rows;
}
function histClock(v){
  if(!v) return '';
  const t = new Date(v);
  if(isNaN(t)) return '';
  return t.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
}
function histTimeRange(lite){
  if(!lite) return '';
  const a = histClock(lite.startedAt), b = histClock(lite.finishedAt);
  if(a && b) return a + ' – ' + b;
  return a || b || '';
}
function renderHistory(main){
  const d = dataFor(currentUser);
  const f = histFilters();
  const all = PG.history(d, name => resolveExerciseId(name, d));
  const rows = histLiteRows(d);
  const shown = rows.slice(0, f.limit);
  const byId = new Map(((d && d.sessions) || []).map(s => [s.id, s]));
  const names = new Map();
  all.forEach(r => (r.exercises || []).forEach(e => { if(e.key && !names.has(e.key)) names.set(e.key, e.name); }));
  const workoutNames = [...new Set(all.map(r => r.name))].sort((a, b) => a.localeCompare(b, 'es'));
  const exerciseNames = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const filtered = !!(f.q || f.period !== 'all' || f.workout !== 'all' || f.exercise !== 'all');
  const totalVol = rows.reduce((a, r) => a + r.volume, 0);

  main.innerHTML = `
    <div class="page-head">
      <h1>Historial</h1>
      <p class="muted">Todas tus sesiones terminadas, con series, volumen y duración. Filtra para encontrar cualquier día.</p>
    </div>

    ${!all.length
      ? `<section class="empty-state">Cuando termines sesiones en «Entrenamientos» aparecerán aquí, con el peso que usaste en cada ejercicio.</section>`
      : `<section class="hist-tools" aria-label="Filtros del historial">
      <div class="hist-search field">
        <label for="hist-q">Buscar</label>
        <input id="hist-q" type="search" placeholder="Ejercicio o rutina…" value="${esc(f.q)}" autocomplete="off">
      </div>
      <div class="hist-filters">
        <label class="field"><span>Período</span>
          <select id="hist-period">
            <option value="all"${f.period === 'all' ? ' selected' : ''}>Todo</option>
            <option value="week"${f.period === 'week' ? ' selected' : ''}>Últimos 7 días</option>
            <option value="month"${f.period === 'month' ? ' selected' : ''}>Últimos 30 días</option>
            <option value="3m"${f.period === '3m' ? ' selected' : ''}>Últimos 3 meses</option>
            <option value="year"${f.period === 'year' ? ' selected' : ''}>Último año</option>
            <option value="custom"${f.period === 'custom' ? ' selected' : ''}>Fechas personalizadas</option>
          </select>
        </label>
        <label class="field"><span>Desde</span>
          <input type="date" id="hist-from" value="${esc(f.from || '')}">
        </label>
        <label class="field"><span>Hasta</span>
          <input type="date" id="hist-to" value="${esc(f.to || '')}">
        </label>
        <label class="field"><span>Rutina</span>
          <select id="hist-workout">
            <option value="all">Todas</option>
            ${workoutNames.map(n => `<option value="${esc(n)}"${f.workout === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Ejercicio</span>
          <select id="hist-exercise">
            <option value="all">Todos</option>
            ${exerciseNames.map(([id, n]) => `<option value="${esc(id)}"${f.exercise === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Orden</span>
          <select id="hist-order">
            <option value="desc"${f.order === 'desc' ? ' selected' : ''}>Más recientes primero</option>
            <option value="asc"${f.order === 'asc' ? ' selected' : ''}>Más antiguas primero</option>
          </select>
        </label>
      </div>
      <div class="hist-summary">
        <span><b>${rows.length}</b> de ${all.length} sesiones</span>
        <span><b>${rows.reduce((a, r) => a + r.sets, 0)}</b> series</span>
        <span><b>${fmtKg(totalVol)}</b> kg de volumen</span>
        ${filtered ? `<button class="btn btn-ghost btn-sm" type="button" id="hist-clear">Quitar filtros</button>` : ''}
      </div>
    </section>`}

    ${!rows.length
      ? `<section class="empty-state">Ninguna sesión coincide con esos filtros. <button class="btn btn-ghost btn-sm" type="button" id="hist-clear">Ver todo el historial</button></section>`
      : `<section class="section">${shown.map(lite => {
          const s = byId.get(lite.id);
          return s ? histCard(s, lite) : '';
        }).join('')}</section>
      ${rows.length > shown.length
        ? `<div class="hist-more"><button class="btn btn-ghost" type="button" id="hist-more">Cargar más (${rows.length - shown.length})</button></div>`
        : ''}`}
  `;

  const q = $('#hist-q');
  if(q) q.addEventListener('input', () => { f.q = q.value; f.limit = 20; render(); });
  const period = $('#hist-period');
  if(period) period.addEventListener('change', () => { f.period = period.value; f.limit = 20; render(); });
  const wSel = $('#hist-workout');
  if(wSel) wSel.addEventListener('change', () => { f.workout = wSel.value; f.limit = 20; render(); });
  const eSel = $('#hist-exercise');
  if(eSel) eSel.addEventListener('change', () => { f.exercise = eSel.value; f.limit = 20; render(); });
  const order = $('#hist-order');
  if(order) order.addEventListener('change', () => { f.order = order.value; render(); });
  const fromEl = $('#hist-from');
  if(fromEl) fromEl.addEventListener('change', () => { f.from = fromEl.value; f.period = 'custom'; f.limit = 20; render(); });
  const toEl = $('#hist-to');
  if(toEl) toEl.addEventListener('change', () => { f.to = toEl.value; f.period = 'custom'; f.limit = 20; render(); });
  document.querySelectorAll('#hist-clear').forEach(btn => btn.addEventListener('click', () => {
    Object.assign(f, { q:'', period:'all', workout:'all', exercise:'all', limit:20, from:'', to:'' });
    render();
  }));
  const more = $('#hist-more');
  if(more) more.addEventListener('click', () => { f.limit += 20; render(); });
}
function histCard(s, lite){
  const t = sessionTotals(s);
  const cancelled = s.status === 'cancelled';
  const status = SESSION_STATUS_LABELS[s.status] || 'Completada';
  const range = histTimeRange(lite);
  const duration = s.durationSec != null ? fmtDuration(s.durationSec) : (lite && lite.durationSec != null ? fmtDuration(lite.durationSec) : null);
  const bodyweightOnly = !!(lite && lite.sets > 0 && lite.sets === lite.bodyweightSets && !t.volume);
  return `
  <article class="hist-card${cancelled ? ' cancelled' : ''}">
    <div class="hist-top">
      <span class="wcard-emoji">${DUMBBELL}</span>
      <div class="hist-head">
        <h3>${esc(s.workoutName)}</h3>
        <span class="muted small">${fmtDateLong(s.date)}${range ? ' · ' + range : ''} · ${t.exercisesDone}/${t.exercisesTotal + t.legacy} ejercicios</span>
      </div>
      <span class="hist-status ${cancelled ? 'is-cancelled' : 'is-done'}">${esc(status)}</span>
      <button class="btn btn-ghost btn-sm" data-action="open-session" data-id="${esc(s.id)}" type="button">Ver sesión</button>
    </div>
    <div class="hist-metrics">
      <span><b>${t.setsDone}</b> series${t.warmupDone ? ' <span class="muted">(+' + t.warmupDone + ' calent.)</span>' : ''}</span>
      <span><b>${t.reps}</b> reps</span>
      <span><b>${t.volume ? fmtKg(t.volume) + ' kg' : (bodyweightOnly ? 'peso corporal' : '—')}</b>${bodyweightOnly ? '' : ' volumen'}</span>
      ${duration ? `<span><b>${duration}</b> de duración</span>` : ''}
    </div>
    <div class="hist-ex">
      ${s.exercises.map(e => {
        if(hasSets(e)){
          const done = e.sets.filter(st => st.completed);
          const shown = done.length ? done : e.sets;
          const all = e.sets.length > 0 && done.length === e.sets.length;
          return `<div class="hist-exrow hist-exsets">
            <span class="hn">${all ? '✓' : '·'} ${esc(e.name)}${e.superset ? ' <span class="sup-chip">SUPERSET</span>' : ''}</span>
            <span class="hv">${shown.map(st => {
              const w = st.weight !== '' && st.weight != null ? escapeHtmlNum(st.weight) + ' kg' : '';
              const r = st.reps ? ' × ' + escapeHtmlNum(st.reps) : '';
              const tag = st.type && st.type !== 'working' ? `<em class="set-type-tag">${esc(SET_TYPE_LABELS[st.type] || st.type)}</em>` : '';
              return `<span class="hist-set">${w}${r}${tag}</span>`;
            }).join('<span class="sep">·</span>')}</span>
            <span class="ht muted">${e.sets.length} serie${e.sets.length === 1 ? '' : 's'}</span>
          </div>`;
        }
        const w = e.weight != null && e.weight !== '' ? escapeHtmlNum(e.weight) + ' kg' : '';
        const r = e.reps ? ' × ' + escapeHtmlNum(e.reps) : '';
        return `<div class="hist-exrow">
          <span class="hn">${e.done ? '✓' : '✗'} ${esc(e.name)}${e.superset ? ' <span class="sup-chip">SUPERSET</span>' : ''}</span>
          <span class="hv">${w || r ? w + r : '<span class="muted">sin datos</span>'}</span>
          <span class="ht muted"><span class="badge-legacy">heredado</span>${e.targetSets ? ' · ' + e.targetSets + ' series' : ''}</span>
        </div>`;
      }).join('')}
    </div>
    ${s.notes ? `<p class="hist-note">${esc(s.notes)}</p>` : ''}
  </article>`;
}

/* ---------------- Programas Boostcamp ---------------- */
let bcCache = [], bcFilter = '', bcCat = 'all', bcCurrent = null, bcCurrentMeta = null, bcResume = null;
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
/* Las semanas del catálogo pueden traer un bloque repetido (w.r): se expande
   a una entrada por semana real para poder consultar cada una por separado. */
function bcWeekList(v){
  const out = [];
  ((v && v.weeks) || []).forEach((w, wi) => {
    const reps = Math.max(1, Math.min(52, Number(w && w.r) || 1));
    for(let k = 0; k < reps; k++) out.push({ wi, rep: k + 1, reps });
  });
  return out;
}
/* Abre la ficha del programa recordándolo como «último programa», de modo que
   quede anclado arriba en «Entrenamientos» a partir de ese momento. */
function openProgram(slug){
  if(!slug) return;
  const meta = (bcCache || []).find(p => p.slug === slug) || null;
  const prev = getLastProgram();
  const same = prev && prev.slug === slug;
  const vi = same ? (Number(prev.vi) || 0) : 0;
  const wx = same ? (Number(prev.wx) || 0) : 0;
  setLastProgram({
    slug,
    title: (meta && meta.t) || (same ? prev.title : slug),
    author: (meta && meta.a) || (same ? prev.author : null),
    vi, wi: same ? prev.wi : 0, di: same ? prev.di : null,
    wx, day: same ? prev.day : null, weekLabel: same ? prev.weekLabel : '',
  });
  bcResume = { slug, vi, wx };
  nav('#/program/' + slug);
}
/* Arranca la sesión de un día del programa (bc:slug:vi:wi:di) y lo recuerda. */
function startProgramDay(idStr){
  const parts = String(idStr).split(':');
  const slug = parts[1], vi = Number(parts[2]) || 0, wi = Number(parts[3]) || 0, di = Number(parts[4]) || 0;
  toast('Cargando el programa…');
  DrakoBC.program(slug).then(p => {
    const v = (p.vars || [])[vi];
    const week = v && (v.weeks || [])[wi];
    const day = week && (week.d || [])[di];
    const wx = v ? bcWeekList(v).findIndex(x => x.wi === wi) : -1;
    setLastProgram({
      slug, title: p.title, author: p.author || null,
      vi, wi, di, wx: wx < 0 ? 0 : wx,
      day: day ? DrakoBC.dayTitle(day, di) : null,
      weekLabel: 'Semana ' + (wi + 1),
    });
    const w = DrakoBC.buildWorkout(p, slug, vi, wi, di);
    const d = dataFor(currentUser);
    const today = todayISO();
    let s = d.sessions.find(x => !x.finished && x.workoutId === w.id && x.date === today);
    if(!s) s = newSessionFor(w);
    state.sessionId = s.id;
    nav('#/session/' + s.id);
  }).catch(() => toast('No se pudo cargar el programa desde el catálogo.', 'error'));
}
/* Devuelve la sesión que sigue después del día recordado. Si se acaba la
   semana, avanza a la siguiente; si se acaba el programa, vuelve al inicio
   para que el usuario pueda repetirlo sin buscar nada a mano. */
function nextProgramTarget(p, last){
  if(!p || !last) return null;
  const vars = Array.isArray(p.vars) ? p.vars : [];
  const vi = Math.max(0, Math.min(Number(last.vi) || 0, vars.length - 1));
  const v = vars[vi];
  if(!v || !Array.isArray(v.weeks)) return null;
  const startWi = Math.max(0, Math.min(Number(last.wi) || 0, v.weeks.length - 1));
  const startDi = last.di == null ? null : Number(last.di);
  const pick = (w, wrap) => {
    const week = v.weeks[w];
    const days = week && Array.isArray(week.d) ? week.d : [];
    const from = (!wrap && w === startWi && startDi != null) ? startDi + 1 : 0;
    for(let di = from; di < days.length; di++){
      const day = days[di];
      if(day && Array.isArray(day.ex) && day.ex.length){
        return { vi, wi: w, di, day: DrakoBC.dayTitle(day, di), weekLabel: 'Semana ' + (w + 1) };
      }
    }
    return null;
  };
  for(let wi = startWi; wi < v.weeks.length; wi++){
    const found = pick(wi);
    if(found) return found;
  }
  for(let wi = 0; wi <= startWi; wi++){
    const found = pick(wi, true);
    if(found) return Object.assign(found, { wrapped: true });
  }
  return null;
}
function continueProgram(){
  const last = getLastProgram();
  if(!last){ toast('Elige antes un programa.', 'info'); return; }
  toast('Buscando el siguiente día del programa…');
  DrakoBC.program(last.slug).then(p => {
    const target = nextProgramTarget(p, last);
    if(!target){ toast('Este programa no tiene días con ejercicios.', 'error'); return; }
    if(target.wrapped) toast('Programa completado: vuelves a empezar por el principio.', 'info');
    startProgramDay('bc:' + last.slug + ':' + target.vi + ':' + target.wi + ':' + target.di);
  }).catch(() => toast('No se pudo cargar el programa desde el catálogo.', 'error'));
}

function renderProgram(main, slug){
  if(!slug){ nav('#/workouts'); return; }
  /* Si venimos de la tarjeta anclada, se abre en la variación y semana que el
     usuario tenía delante en lugar de volver al principio del programa. */
  const resume = (bcResume && bcResume.slug === slug) ? bcResume : null;
  state.bc = { slug, vi: resume ? (Number(resume.vi) || 0) : 0, wi: resume ? (Number(resume.wx) || 0) : 0 };
  bcResume = null;
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
  const sourceNote = p.src === 'ms'
    ? `Fuente: <a href="${esc(p.url || 'https://www.muscleandstrength.com/workouts')}" target="_blank" rel="noopener noreferrer">muscleandstrength.com<span class="sr-only"> (se abre en una pestaña nueva)</span></a> — estructura publicada allí, con enlace al programa original. Anota el peso concreto que uses en cada sesión.`
    : `Fuente: catálogo público de boostcamp.app${p.author ? ' — programa de ' + esc(p.author) : ''}. Los porcentajes se calculan sobre tu 1RM; anota el peso concreto que uses en cada sesión.`;
  const v = p.vars[st.vi];
  if(!v){ body.innerHTML = '<div class="empty-state">Este programa no tiene sesiones disponibles.</div>'; return; }
  const weeksX = bcWeekList(v);
  const openIdx = Math.max(0, Math.min(Number(st.wi) || 0, weeksX.length - 1));
  const open = weeksX[openIdx];
  st.wi = openIdx;
  const days = v.weeks[open.wi].d;
  const totalW = weeksX.length;
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
    <div class="section-head"><h2 style="font-size:16px">Semanas</h2><span class="muted">${open.reps > 1 ? 'Semana ' + (openIdx + 1) + ' de ' + totalW + ' · repetición ' + open.rep + ' de ' + open.reps + ' de la misma plantilla (progresión por porcentajes).' : 'Semana ' + (openIdx + 1) + ' de ' + totalW + '. Elige la semana a consultar.'}</span></div>
    <div class="weektabs">${weeksX.map((x, i) => `<button class="weektab ${i === openIdx ? 'active' : ''}" data-action="bc-week" data-i="${i}" type="button" title="${x.reps > 1 ? 'Repetición ' + x.rep + ' de ' + x.reps + ' de la misma plantilla' : 'Semana ' + (i + 1) + ' de ' + totalW}">Semana ${i + 1}</button>`).join('')}</div>
    <div class="workout-cards" style="margin-top:14px">
      ${days.map((day, di) => programDayCard(st.slug, st.vi, open.wi, di, day)).join('') || '<div class="empty-state">Esta semana no tiene días con ejercicios (descanso).</div>'}
    </div>
    <p class="muted small" style="margin-top:18px">${sourceNote}</p>`;
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
/* Gráfica de progreso de un ejercicio con la MISMA imagen que usa
   DrakoShare (JPG 840 px con la marca y la curva). Se comparte por la
   hoja del sistema —WhatsApp incluido— o se descarga como respaldo. */
function progressSharePayload(d, id){
  if(!d || !id) return null;
  const picked = exerciseOptions(d).find(o => o.id === id);
  const name = picked ? picked.name : 'Ejercicio';
  const rows = exerciseProgress(d, id);
  if(!rows.length) return null;
  const shown = rows.slice(-12);
  const best = rows.reduce((acc, r) => (!acc || r.best.weight > acc.weight || (r.best.weight === acc.weight && r.best.reps > acc.reps)) ? r.best : acc, null);
  const e1 = bestE1RM(rows);
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'ejercicio';
  return {
    title: name,
    subtitle: rows.length + (rows.length === 1 ? ' sesión' : ' sesiones') + ' · ' + fmtDate(rows[0].date) + ' – ' + fmtDate(rows[rows.length - 1].date) + ' · mejor ' + fmtKg(best.weight) + ' kg',
    data: shown.map(r => ({ label: r.date, value: r.best.weight })),
    unit: 'kg',
    filename: 'drakotrack-progreso-' + slug + '.jpg',
    text: 'Mi progreso en ' + name + ' con DrakoTrack: ' + fmtKg(best.weight) + ' kg × ' + best.reps + (e1 ? ' · 1RM estimado ' + fmtKg(e1) + ' kg' : ''),
  };
}
async function shareProgressChart(){
  const d = dataFor(currentUser);
  const payload = state.progressExercise ? progressSharePayload(d, state.progressExercise) : null;
  if(!payload){ toast('Elige un ejercicio con sesiones registradas.', 'error'); return; }
  if(!window.DrakoShare){ toast('La compartición no está disponible aquí.', 'error'); return; }
  toast('Generando la imagen…');
  try{
    const res = await DrakoShare.shareJPG(payload);
    shareFeedback(res);
  }catch(err){
    if(err && err.name === 'AbortError'){ toast('Compartición cancelada.', 'info'); return; }
    console.error(err);
    toast('No se pudo compartir la imagen.', 'error');
  }
}
async function sharePRChart(){
  const d = dataFor(currentUser);
  const selId = state.prExercise;
  const picked = selId ? exerciseOptions(d).find(o => o.id === selId) : null;
  const sel = picked ? picked.name : '';
  const entries = d.prs.filter(p => prKey(p, d) === selId).sort((a,b) => a.date.localeCompare(b.date));
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

  /* Texto alternativo útil: resumen de los datos que muestra la gráfica. */
  const summary = `Gráfica de progreso: ${data.length} registros, de ${data[0].value} kg el ${fmtDate(data[0].label)} a ${data[data.length - 1].value} kg el ${fmtDate(data[data.length - 1].label)}.`;
  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" class="linechart" role="img" aria-label="${esc(summary)}">
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
    const chip = $('#user-chip');
    if(chip) chip.setAttribute('aria-expanded', 'false');
  }
  /* cerrar los selectores de repeticiones abiertos al tocar fuera */
  if(!e.target.closest('.reps-picker')){
    $$('.reps-menu').forEach(m => m.classList.add('hidden'));
    $$('.reps-toggle').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  const el = e.target.closest('[data-action]');
  if(!el) return;
  const a = el.dataset.action;
  if(a === 'muscle-retry'){ retryMuscleDictionary(); return; }
  if(a.indexOf('ana-') === 0 && analyticsAction(a, el)) return;
  if(a.indexOf('offline-') === 0 || a.indexOf('pwa-') === 0 || a.indexOf('sw-') === 0){ if(offlineAction(a, el)) return; }

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

  if(a === 'reps-toggle'){
    /* Lista plegable de repeticiones: solo un selector abierto a la vez */
    const wrap = el.closest('.reps-picker');
    const menu = wrap && wrap.querySelector('.reps-menu');
    if(!menu) return;
    if(menu.classList.contains('hidden')) openRepsMenu(el, menu);
    else closeRepsMenus();
    return;
  }
  if(a === 'reps-choose'){
    const wrap = el.closest('.reps-picker');
    if(!wrap) return;
    const raw = el.dataset.value;
    const value = raw === 'AMRAP' ? 'AMRAP' : Number(raw);
    const toggle = wrap.querySelector('.reps-toggle');
    if(toggle){
      toggle.innerHTML = esc(repLabel(value)) + ' <span class="reps-arrow" aria-hidden="true">▾</span>';
      repsToggleName(toggle, value);
    }
    $$('.reps-opt', wrap).forEach(o => {
      const on = o.dataset.value === String(value);
      o.classList.toggle('active', on);
      o.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    closeRepsMenus();
    if(toggle) toggle.focus({ preventScroll: true });
    if(wrap.dataset.session){
      const s = getSession(wrap.dataset.session);
      const target = s && s.exercises.find(x => x.id === wrap.dataset.ex);
      if(target){ target.reps = value; saveDB(); }
    } else if(wrap.dataset.idx !== undefined && state.editor){
      const target = state.editor.exercises[Number(wrap.dataset.idx)];
      if(target) target.reps = value;
    }
    return;
  }

  if(a === 'toggle-menu'){
    const menu = $('#user-menu');
    const open = menu.classList.toggle('open');
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
    return;
  }
  if(a === 'toggle-theme'){ setTheme(theme === 'light' ? 'dark' : 'light'); return; }
  if(a === 'set-theme'){ setTheme(el.dataset.theme); return; }
  if(a === 'csv-sets'){ exportCSV('sets'); return; }
  if(a === 'csv-sessions'){ exportCSV('sessions'); return; }
  if(a === 'csv-weights'){ exportCSV('weights'); return; }
  if(a === 'open-settings'){
    const menu = $('#user-menu'), chip = $('#user-chip');
    if(menu) menu.classList.remove('open');
    if(chip) chip.setAttribute('aria-expanded', 'false');
    nav('#/settings');
    return;
  }
  if(a === 'logout'){
    logout().finally(() => {
      render();
      toast('Sesión cerrada.', 'info');
      focusAuthTitle();
    });
    return;
  }
  if(a === 'reset-data'){
    /* La cuenta NO se elimina. En cuentas de nube el borrado se hace primero
       en el servidor (dt_delete_app_data: copia e historial) y solo si
       responde bien se vacía lo local: no se anuncia un borrado que no ocurrió. */
    const cloud = isCloud();
    confirmModal('¿Borrar mis datos de entrenamiento?',
      (cloud
        ? 'Se borrarán todos tus entrenamientos, sesiones, récords, registros de peso y la foto de esta cuenta. Tu copia de la nube y las versiones anteriores guardadas también se borrarán. La cuenta seguirá existiendo y podrás empezar de cero.'
        : 'Se borrarán todos tus entrenamientos, sesiones, récords, registros de peso y la foto de este dispositivo. Tu cuenta local seguirá existiendo y podrás empezar de cero.') +
      ' Si quieres eliminar también la cuenta, usa «Eliminar mi cuenta y todos mis datos».', 'Borrar datos', async () => {
      if(cloud){
        /* Un guardado pendiente que llegara después del borrado devolvería los
           datos: se deja terminar antes de borrar en el servidor. */
        if(cloudSync && cloudSync.sync){ try { await cloudSync.sync(currentUser, dataFor(currentUser)); } catch(_){} }
        const err = typeof DrakoSB.deleteData === 'function' ? await DrakoSB.deleteData() : 'No se pudo borrar la copia de la nube.';
        if(err){ closeModal(); toast(err, 'error'); return; }
        /* El servidor ya no tiene copia: se olvida la revisión anterior para no
           reenviar cambios sobre una versión que ya no existe. */
        if(cloudSync && cloudSync.reset) cloudSync.reset(currentUser);
      }
      dataFor(currentUser); // asegura que exista
      const prev = db.data[currentUser] || {};
      db.data[currentUser] = { workouts:[], sessions:[], prs:[], weights:[], photo:null, hiddenLib:[], consent: prev.consent || null };
      /* En la nube no se vuelve a subir nada: el servidor quedó vacío. */
      if(cloud) persistLocal(); else saveDB();
      closeModal(); toast('Tus datos de entrenamiento fueron borrados. La cuenta sigue activa.', 'info'); render();
    });
    return;
  }
  if(a === 'open-delete-account'){ openDeleteAccount(); return; }
  if(a === 'confirm-delete-account'){ confirmDeleteAccount(); return; }

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
    confirmModal('¿Borrar «' + esc(w.name) + '» de la biblioteca?', 'Desaparece de la biblioteca. Tus sesiones anteriores de este entrenamiento se conservan. Podrás restaurarlo desde el botón «Ocultos» cuando quieras.', 'Borrar', () => {
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
  if(a === 'open-sync-conflicts'){ openSyncConflicts(); return; }
  if(a === 'open-sync-history'){ openVersionHistory(); return; }
  if(a === 'restore-local-backup'){ restoreLocalBackup(); return; }
  if(a === 'conflict-keep' || a === 'conflict-theirs'){
    resolveSyncConflict(el.dataset.key, a === 'conflict-theirs' ? 'theirs' : 'mine');
    return;
  }
  if(a === 'restore-version'){ restoreServerVersion(Number(el.dataset.rev)); return; }
  if(a === 'sb-export'){ exportCloudJSON(); return; }
  if(a === 'sb-pull'){
    confirmModal('¿Restaurar copia de la nube?', 'Se reemplazarán los datos actuales de este dispositivo por la última copia guardada en la nube. Antes se guarda una copia local por si quieres volver atrás.', 'Restaurar', () => {
      closeModal();
      pullRemote(true);
    });
    return;
  }
  if(a === 'save-rec-pass'){ saveRecoveredPassword(); return; }
  if(a === 'open-change-pass'){ openChangePass(); return; }
  if(a === 'save-change-pass'){ saveChangePass(); return; }
  if(a === 'open-program'){ openProgram(el.dataset.slug); return; }
  if(a === 'last-prog-open'){
    const last = getLastProgram();
    if(last) openProgram(last.slug);
    return;
  }
  if(a === 'continue-program' || a === 'last-prog-start'){ continueProgram(); return; }
  if(a === 'save-cloud-name'){ saveCloudName(); return; }
  if(a === 'rest-sound-test'){ stopRestSoundPreview(); beepRestEnd(false); toast('Reproduciendo el sonido elegido.', 'info'); return; }
  if(a === 'last-prog-clear'){ clearLastProgram(); render(); return; }
  if(a === 'bc-cat'){
    bcCat = BC_CATS.some(c => c.k === el.dataset.cat) ? el.dataset.cat : 'all';
    renderBCList();
    return;
  }
  if(a === 'start-prog-session'){ startProgramDay(el.dataset.id); return; }

  if(a === 'toggle-ex'){
    const s = getSession(el.dataset.sid);
    if(!s) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex) return;
    ex.done = !ex.done;
    saveDB(); render();
    return;
  }
  if(a === 'toggle-superset'){
    /* Marcar o quitar el superset sin salir de la sesión en curso */
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex) return;
    ex.superset = !ex.superset;
    saveDB(); render();
    return;
  }
  if(a === 'link-superset'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const i = s.exercises.findIndex(x => x.id === el.dataset.ex);
    if(i < 0) return;
    if(i + 1 >= s.exercises.length){ toast('No hay un ejercicio siguiente que enlazar.', 'error'); return; }
    s.exercises[i].superset = true;
    s.exercises[i + 1].superset = true;
    saveDB(); render();
    toast('Superserie: «' + s.exercises[i].name + '» + «' + s.exercises[i + 1].name + '».', 'info');
    return;
  }
  if(a === 'rest-start'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    startRestForCurrent(s, undefined, 'rest-start');
    return;
  }
  if(a === 'rest-pause'){
    const s = getSession(el.dataset.sid);
    if(s) pauseRestTimer(s, 'rest-pause');
    return;
  }
  if(a === 'rest-resume'){
    const s = getSession(el.dataset.sid);
    if(s) resumeRestTimer(s, 'rest-resume');
    return;
  }
  if(a === 'rest-reset'){
    const s = getSession(el.dataset.sid);
    if(s) resetRestTimer(s);
    return;
  }
  if(a === 'rest-plus' || a === 'rest-minus'){
    const s = getSession(el.dataset.sid);
    if(!s || !s.rest) return;
    const delta = (a === 'rest-plus' ? 15 : -15) * 1000;
    if(restPaused(s)){
      /* En pausa se ajusta el resto guardado, no una hora de fin que no existe. */
      s.rest.remainingMs = Math.max(1000, Math.min(599000, Number(s.rest.remainingMs) + delta));
      s.rest.duration = Math.max(Number(s.rest.duration) || 0, Math.ceil(Number(s.rest.remainingMs) / 1000));
    } else {
      s.rest.endsAt = Math.max(Date.now() + 1000, s.rest.endsAt + delta);
      s.rest.duration = Math.max(5, Math.round((s.rest.endsAt - s.rest.startedAt) / 1000));
    }
    saveDB();
    renderRestBar(s);
    announceRest((a === 'rest-plus' ? 'Añadidos 15 segundos. ' : 'Quitados 15 segundos. ') + 'Quedan ' + fmtClock(restRemaining(s)) + '.');
    return;
  }
  if(a === 'rest-alerts'){ toggleRestAlerts(); return; }
  if(a === 'rest-skip'){
    const s = getSession(el.dataset.sid);
    if(!s) return;
    s.rest = null;
    saveDB();
    renderRestBar(s);
    return;
  }
  if(a === 'session-prev-ex' || a === 'session-next-ex'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const cur = s.currentExerciseId || ((s.exercises && s.exercises[0]) ? s.exercises[0].id : null);
    const target = a === 'session-prev-ex' ? sessionPrevExercise(s, cur) : sessionNextExercise(s, cur);
    if(target && target.ex){ s.currentExerciseId = target.ex.id; s.lastSavedAt = nowIso(); saveDB(); render(); }
    return;
  }
  if(a === 'session-goto-ex'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = (s.exercises || []).find(x => x && x.id === el.dataset.ex);
    if(!ex) return;
    /* Se guarda antes de moverse: ningún cambio pendiente se pierde al navegar. */
    s.currentExerciseId = ex.id;
    s.lastSavedAt = nowIso();
    saveDB();
    render();
    const block = document.querySelector('[data-ex-block="' + ex.id + '"]');
    if(block && block.scrollIntoView) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if(a === 'session-focus-current'){
    const s = getSession(el.dataset.sid);
    if(!s) return;
    const id = s.currentExerciseId || ((s.exercises && s.exercises[0]) ? s.exercises[0].id : null);
    const block = id ? document.querySelector('[data-ex-block="' + id + '"]') : null;
    if(block && block.scrollIntoView) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if(a === 'session-jump-ex'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    let sel = el.value;
    if(el.tagName !== 'SELECT' && el.querySelector('select')) sel = el.querySelector('select').value;
    if(sel){ s.currentExerciseId = sel; s.lastSavedAt = nowIso(); saveDB(); render(); }
    return;
  }
  if(a === 'finish-session'){
    const s = getSession(el.dataset.id);
    if(!s || s.finished) return;
    const pending = (s.exercises || []).some(e => hasSets(e) ? e.sets.some(st => !st.completed) : !e.done);
    if(pending){
      const pendingList = (s.exercises || []).filter(e => hasSets(e) ? e.sets.some(st => !st.completed) : !e.done).map(e=>e.name).slice(0,3).join(', ');
      confirmModal('¿Terminar el entrenamiento?', 'Hay series o ejercicios sin marcar (' + pendingList + (pendingList && (s.exercises||[]).filter(e=>hasSets(e)?e.sets.some(st=>!st.completed):!e.done).length>3?', ...':'') + '). Se guardará la sesión con lo realizado; lo no marcado no cuenta como hecho.', 'Terminar', () => finalizeSession(s));
    } else {
      finalizeSession(s);
    }
    return;
  }
  if(a === 'pause-session' || a === 'resume-session-status'){
    const s = getSession(el.dataset.id);
    if(!s || s.finished) return;
    if(a === 'pause-session'){
      s.status = 'paused';
      s.pausedAt = nowIso();
    } else {
      if(s.pausedAt){
        s.pausedMs = (Number(s.pausedMs) || 0) + Math.max(0, Date.now() - Date.parse(s.pausedAt));
        s.pausedAt = null;
      }
      s.status = 'in_progress';
    }
    s.lastSavedAt = nowIso();
    saveDB();
    render();
    toast(a === 'pause-session' ? 'Sesión pausada.' : 'Sesión reanudada.', 'info');
    return;
  }
  if(a === 'cancel-session'){
    const s = getSession(el.dataset.id);
    if(!s) return;
    confirmModal('¿Cancelar esta sesión?', 'Se guardará en el historial como cancelada y no contará para estadísticas ni récords.', 'Cancelar sesión', () => {
      if(s.pausedAt){
        s.pausedMs = (Number(s.pausedMs) || 0) + Math.max(0, Date.now() - Date.parse(s.pausedAt));
        s.pausedAt = null;
      }
      s.status = 'cancelled';
      s.finished = true;
      s.finishedAt = nowIso();
      s.durationSec = elapsedSec(s);
      s.lastSavedAt = s.finishedAt;
      saveDB();
      closeModal();
      toast('Sesión cancelada.', 'info');
      nav('#/workouts');
    });
    return;
  }
  if(a === 'resume-session'){
    const s = getSession(el.dataset.id);
    if(s) nav('#/session/' + s.id);
    return;
  }
  if(a === 'summary-close'){ closeModal(); render(); return; }
  if(a === 'toggle-set'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    const st = ex && hasSets(ex) ? ex.sets.find(x => x.id === el.dataset.set) : null;
    if(!st) return;
    st.completed = !st.completed;
    ex.done = ex.sets.length > 0 && ex.sets.every(x => x.completed);
    s.currentExerciseId = ex.id;
    s.lastSavedAt = nowIso();
    if(st.completed){ maybeMarkRecord(s, ex, st); maybeStartRest(s, ex, st); }
    else {
      clearSetRecord(s, st);
      if(s.rest && s.rest.setId === st.id) s.rest = null;
    }
    saveDB();
    render();
    return;
  }
  if(a === 'add-set'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex) return;
    if(!hasSets(ex)){ legacyToSets(ex); saveDB(); render(); return; }
    if(ex.sets.length >= LIMITS.sets){ toast('Máximo de series por ejercicio alcanzado.', 'error'); return; }
    const prev = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      id: uid(), number: ex.sets.length + 1,
      weight: prev ? prev.weight : '', reps: prev ? prev.reps : '',
      completed: false, type: prev ? prev.type : 'working',
      rir: null, rpe: null, restSeconds: prev ? prev.restSeconds : null, notes: ''
    });
    renumberSets(ex);
    saveDB();
    render();
    return;
  }
  if(a === 'adj-set'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    const st = ex && hasSets(ex) ? ex.sets.find(x => x.id === el.dataset.set) : null;
    if(!st) return;
    const dir = Number(el.dataset.dir) || 0;
    const field = el.dataset.field;
    if(field === 'weight'){
      /* Incremento configurable y sin derivas decimales (1,25 kg exacto). */
      st.weight = adjustWeight(st.weight, dir, weightStep());
    } else if(field === 'reps'){
      const step = 1;
      const cur = st.reps === '' || st.reps == null ? 0 : Number(st.reps);
      let next = cur + dir * step;
      if(next < 0) next = 0;
      st.reps = Math.min(LIMITS.reps, Math.round(next));
      if(st.reps === 0 && dir < 0) st.reps = '';
    }
    s.lastSavedAt = nowIso();
    saveDB();
    render();
    return;
  }
  if(a === 'copy-prev-set'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex || !hasSets(ex)) return;
    const idx = ex.sets.findIndex(x => x.id === el.dataset.set);
    if(idx <= 0){ toast('No hay serie anterior en este ejercicio.', 'info'); return; }
    const prevSt = ex.sets[idx - 1];
    const st = ex.sets[idx];
    st.weight = prevSt.weight === undefined || prevSt.weight === null ? '' : prevSt.weight;
    st.reps = prevSt.reps === undefined || prevSt.reps === null ? '' : prevSt.reps;
    st.type = prevSt.type || st.type;
    st.rir = prevSt.rir;
    st.rpe = prevSt.rpe;
    st.restSeconds = prevSt.restSeconds;
    s.lastSavedAt = nowIso();
    saveDB();
    render();
    toast('Valores copiados de la serie anterior.', 'info');
    return;
  }
  if(a === 'duplicate-set'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex || !hasSets(ex)) return;
    const idx = ex.sets.findIndex(x => x.id === el.dataset.set);
    if(idx < 0) return;
    if(ex.sets.length >= LIMITS.sets){ toast('Máximo de series por ejercicio alcanzado.', 'error'); return; }
    const src = ex.sets[idx];
    ex.sets.splice(idx + 1, 0, {
      id: uid(), number: src.number, weight: src.weight, reps: src.reps,
      completed: false, type: src.type, rir: src.rir, rpe: src.rpe,
      restSeconds: src.restSeconds, notes: ''
    });
    renumberSets(ex);
    saveDB();
    render();
    return;
  }
  if(a === 'delete-set'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex || !hasSets(ex)) return;
    if(ex.sets.length <= 1){ toast('Cada ejercicio necesita al menos una serie.', 'error'); return; }
    const doomed = ex.sets.find(x => x.id === el.dataset.set);
    if(!doomed) return;
    ex.sets = ex.sets.filter(x => x.id !== doomed.id);
    /* La serie borrada deja lápida: una sincronización antigua no la resucita y,
       si el otro dispositivo la había cambiado, su versión no se descarta. */
    recordSetTombstone(ex, doomed);
    renumberSets(ex);
    ex.done = ex.sets.length > 0 && ex.sets.every(x => x.completed);
    saveDB();
    render();
    return;
  }
  if(a === 'fill-last-sets'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex) return;
    const prev = lastSetsFor(s, ex);
    if(!prev.length){ toast('No hay sesiones anteriores de este ejercicio.', 'info'); return; }
    if(!hasSets(ex)) legacyToSets(ex);
    ex.sets.forEach((st, i) => {
      const p = prev[i];
      if(!p) return;
      st.weight = p.weight === undefined || p.weight === null ? '' : p.weight;
      st.reps = p.reps === undefined || p.reps === null ? '' : p.reps;
      st.completed = false;
    });
    saveDB();
    render();
    toast('Valores anteriores copiados: marca las series al terminarlas.', 'info');
    return;
  }
  if(a === 'convert-legacy'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const ex = s.exercises.find(x => x.id === el.dataset.ex);
    if(!ex) return;
    legacyToSets(ex);
    saveDB();
    render();
    toast('Convertido a series: revisa peso y repeticiones de cada una.', 'info');
    return;
  }
  if(a === 'add-session-ex'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    openModal(`
      <h3>Añadir ejercicio</h3>
      <div class="form">
        <label class="field"><span>Nombre del ejercicio</span><input id="ex-name" maxlength="80" placeholder="p. ej. Press inclinado con mancuernas"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label class="field"><span>Series</span><input id="ex-sets" type="number" min="1" max="${LIMITS.sets}" value="3"></label>
          <label class="field"><span>Repeticiones</span><input id="ex-reps" type="number" min="1" max="${LIMITS.reps}" value="10"></label>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" type="button">Cancelar</button>
        <button class="btn btn-primary" data-action="save-session-ex" data-sid="${esc(s.id)}" type="button">Añadir</button>
      </div>`);
    return;
  }
  if(a === 'save-session-ex'){
    const s = getSession(el.dataset.sid);
    if(!s || s.finished) return;
    const nameEl = $('#ex-name');
    const name = nameEl ? nameEl.value.trim().slice(0, LIMITS.name) : '';
    if(!name){ toast('Ponle un nombre al ejercicio.', 'error'); return; }
    if(s.exercises.some(e => String(e.name).toLowerCase() === name.toLowerCase())){
      toast('Ese ejercicio ya está en la sesión.', 'error'); return;
    }
    const setsEl = $('#ex-sets'), repsEl = $('#ex-reps');
    const def = planDefaults(dataFor(currentUser)) || { sets: 3, reps: 10, rest: 90 };
    const nSets = clampInt(setsEl && setsEl.value !== '' ? Number(setsEl.value) : def.sets, LIMITS.sets, def.sets);
    const nReps = clampInt(repsEl && repsEl.value !== '' ? Number(repsEl.value) : def.reps, LIMITS.reps, def.reps);
    s.exercises.push({
      id: uid(), name, targetSets: nSets, targetReps: nReps, done: false,
      sets: Array.from({ length: nSets }, (_, i) => ({
        id: uid(), number: i + 1, weight: '', reps: nReps, completed: false,
        type: 'working', rir: null, rpe: null, restSeconds: null, notes: ''
      }))
    });
    s.lastSavedAt = nowIso();
    saveDB();
    closeModal();
    render();
    toast('Ejercicio añadido a la sesión.');
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
    if('r' in el.dataset) ex.reps = el.dataset.r === '' ? '' : normReps(el.dataset.r, '');
    saveDB(); render();
    return;
  }
  if(a === 'open-session'){ nav('#/session/' + el.dataset.id); return; }
  if(a === 'pr-pick'){ state.prExercise = el.dataset.ex; state.progressExercise = el.dataset.ex; render(); return; }
  if(a === 'edit-weight'){
    const d = dataFor(currentUser);
    const w = d.weights.find(x => x.id && x.id === el.dataset.id) || d.weights.find(x => x.date === el.dataset.date);
    if(!w){ render(); return; }
    state.weightEdit = { id: w.id || null, date: w.date, weight: w.weight };
    render();
    return;
  }
  if(a === 'cancel-weight-edit'){ state.weightEdit = null; render(); return; }
  if(a === 'plan-tab'){ planState().tab = el.dataset.tab || 'week'; render(); return; }
  if(a === 'plan-week'){ const ps = planState(); ps.week = PL.addDays(ps.week, (Number(el.dataset.dir) || 0) * 7); render(); return; }
  if(a === 'plan-month'){ const ps = planState(); const [y, m] = ps.month.split('-').map(Number); ps.month = new Date(Date.UTC(y, m - 1 + (Number(el.dataset.dir) || 0), 1)).toISOString().slice(0, 7); render(); return; }
  if(a === 'plan-today'){ const ps = planState(); ps.week = PL.weekStart(todayISO()); ps.selectedDay = todayISO(); ps.month = todayISO().slice(0, 7); ps.tab = 'week'; render(); return; }
  if(a === 'plan-day'){ planState().selectedDay = el.dataset.date; render(); return; }
  if(a === 'plan-start'){
    const d = dataFor(currentUser);
    const entry = (d.planner || []).find(x => x.id === el.dataset.id);
    if(!entry) return;
    if(!getWorkout(entry.workoutId)){ toast('La rutina de este plan ya no existe. Elige otra desde Entrenamientos.', 'error'); return; }
    const session = startOrGetSession(entry.workoutId);
    if(!session) return;
    entry.sessionId = session.id;
    entry.updatedAt = nowIso();
    saveDB();
    nav('#/session/' + session.id);
    return;
  }
  if(a === 'plan-clear'){ const d = dataFor(currentUser); d.planner = (d.planner || []).filter(x => x.id !== el.dataset.id); saveDB(); render(); return; }
  if(a === 'plan-apply-template'){
    const d = dataFor(currentUser);
    const program = PL.activeProgram(d);
    if(!program){ toast('No hay un programa activo. Crea uno o actívalo en Programas.', 'error'); return; }
    const added = PL.applyTemplate(program, planState().week, d.planner, planNameOf(d));
    if(!added.length){ toast('La plantilla de esa semana ya estaba aplicada.', 'info'); return; }
    added.forEach(entry => d.planner.push(entry));
    saveDB(); toast(added.length + ' día(s) añadidos a la semana.'); render();
    return;
  }
  if(a === 'plan-copy-prev'){
    const d = dataFor(currentUser); const ps = planState(); const program = PL.activeProgram(d);
    const added = PL.copyWeek(d.planner, PL.addDays(ps.week, -7), ps.week, program ? program.id : '');
    if(!added.length){ toast('La semana anterior estaba vacía o ya está copiada.', 'info'); return; }
    added.forEach(entry => d.planner.push(entry));
    saveDB(); toast(added.length + ' día(s) copiados de la semana anterior.'); render();
    return;
  }
  if(a === 'plan-reminder'){ enablePlanReminders(); return; }
  if(a === 'program-new'){ const ps = planState(); ps.programEdit = 'new'; ps.tab = 'programs'; render(); return; }
  if(a === 'program-edit'){ const ps = planState(); ps.programEdit = el.dataset.id; ps.tab = 'programs'; render(); return; }
  if(a === 'program-cancel'){ planState().programEdit = null; render(); return; }
  if(a === 'program-save'){ saveProgramForm(); return; }
  if(a === 'program-add-phase'){ const box = document.getElementById('pf-phases'); if(box) box.insertAdjacentHTML('beforeend', planPhaseRowHTML(null)); return; }
  if(a === 'program-add-goal'){ const box = document.getElementById('pf-goals'); if(box) box.insertAdjacentHTML('beforeend', planGoalRowHTML(null, dataFor(currentUser))); return; }
  if(a === 'program-remove-row'){ const row = el.closest('.plan-phase-row, .plan-goal-row'); if(row) row.remove(); return; }
  if(a === 'program-duplicate'){
    const d = dataFor(currentUser); const program = PL.programById(d, el.dataset.id);
    if(!program) return;
    d.programs.push(PL.duplicateProgram(program));
    saveDB(); toast('Programa duplicado. Queda en pausa hasta que lo actives.'); render();
    return;
  }
  if(a === 'program-status'){
    const d = dataFor(currentUser); const program = PL.programById(d, el.dataset.id);
    if(!program) return;
    const next = el.dataset.status;
    if(!PL.STATUSES.some(x => x.id === next)) return;
    if(next === 'active'){ d.programs.forEach(x => { if(x.status === 'active' && x.id !== program.id) x.status = 'paused'; }); toast('Programa activo: ' + program.name); }
    program.status = next; program.updatedAt = nowIso();
    saveDB(); render();
    return;
  }
  if(a === 'program-delete'){
    const d = dataFor(currentUser); const program = PL.programById(d, el.dataset.id);
    if(!program) return;
    confirmModal('¿Eliminar el programa?', 'Se borra el programa y sus fases, pero tus entrenamientos realizados y los días del calendario se conservan.', 'Eliminar programa', () => {
      d.programs = d.programs.filter(x => x.id !== program.id);
      saveDB(); closeModal(); toast('Programa eliminado.', 'info'); render();
    });
    return;
  }
  if(a === 'bc-variation'){
    if(bcCurrent){ state.bc.vi = Number(el.dataset.i) || 0; state.bc.wi = 0; bcRenderBody(bcCurrentMeta, bcCurrent); }
    return;
  }
  if(a === 'bc-week'){
    if(bcCurrent && bcCurrent.vars[state.bc.vi]){
      const total = bcWeekList(bcCurrent.vars[state.bc.vi]).length;
      state.bc.wi = Math.max(0, Math.min(Number(el.dataset.i) || 0, total - 1));
      bcRenderBody(bcCurrentMeta, bcCurrent);
    }
    return;
  }

  if(a === 'open-onboarding'){ openOnboarding(); return; }
  if(a === 'onb-goal'){ onboardPick('goal', el.dataset.id); return; }
  if(a === 'onb-days'){ onboardPick('days', el.dataset.id); return; }
  if(a === 'onb-level'){ onboardPick('level', el.dataset.id); return; }
  if(a === 'onb-step'){ onboardPick('step', el.dataset.id); return; }
  if(a === 'onb-save'){ finishOnboarding(); return; }
  if(a === 'onb-skip'){ skipOnboarding(); return; }
  if(a === 'open-library'){ nav('#/library'); return; }
  if(a === 'add-ex'){ openExercisePicker(); return; }
  if(a === 'add-ex-blank'){
    if(state.editor.exercises.length >= LIMITS.exercises){ toast('Máximo de ejercicios alcanzado.', 'error'); return; }
    const def = planDefaults(dataFor(currentUser)) || { sets: 3, reps: 10, rest: 90 };
    state.editor.exercises.push({ id: uid(), exId:'', name:'', sets:def.sets, reps:def.reps, weight:'', rest:def.rest, superset:false });
    renderEditorRows();
    return;
  }
  if(a === 'pick-ex'){
    const entry = findExercise(el.dataset.id, dataFor(currentUser));
    if(!entry || !state.editor) return;
    if(state.editor.exercises.length >= LIMITS.exercises){ toast('Máximo de ejercicios alcanzado.', 'error'); return; }
    const def = planDefaults(dataFor(currentUser)) || { sets: 3, reps: 10, rest: 90 };
    const row = { id: uid(), exId: entry.id, name: entry.name, sets:def.sets, reps:def.reps, weight:'', rest:def.rest, superset:false };
    const rows = state.editor.exercises;
    /* La fila vacía con la que arranca un entrenamiento nuevo se sustituye
       por el ejercicio elegido: no queda una fila en blanco suelta. */
    if(rows.length === 1 && !String(rows[0].name || '').trim()) rows[0] = row;
    else rows.push(row);
    closeModal();
    renderEditorRows();
    toast('«' + entry.name + '» añadido. Ajusta series, repeticiones y descanso.', 'info');
    return;
  }
  if(a === 'del-ex'){
    state.editor.exercises.splice(Number(el.dataset.idx), 1);
    renderEditorRows();
    return;
  }
  if(a === 'ex-up' || a === 'ex-down'){
    const i = Number(el.dataset.idx);
    const j = a === 'ex-up' ? i - 1 : i + 1;
    const list = state.editor.exercises;
    if(j < 0 || j >= list.length) return;
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    renderEditorRows();
    return;
  }
  if(a === 'dup-ex'){
    const i = Number(el.dataset.idx);
    const src = state.editor.exercises[i];
    if(!src) return;
    if(state.editor.exercises.length >= LIMITS.exercises){ toast('Máximo de ejercicios alcanzado.', 'error'); return; }
    state.editor.exercises.splice(i + 1, 0, { ...src, id: uid() });
    renderEditorRows();
    return;
  }
  if(a === 'custom-ex-new'){ openCustomExercise(null); return; }
  if(a === 'custom-ex-edit'){ openCustomExercise(el.dataset.id); return; }
  if(a === 'custom-ex-del'){
    const id = el.dataset.id;
    const own = userExercises(dataFor(currentUser)).find(x => x.id === id);
    if(!own) return;
    confirmModal('¿Eliminar «' + esc(own.name) + '» de tu biblioteca?', 'Los entrenamientos y sesiones que ya lo usan conservan su nombre y sus datos; solo desaparece de la biblioteca.', 'Eliminar ejercicio', () => {
      const d = dataFor(currentUser);
      d.exercises = userExercises(d).filter(x => x.id !== id);
      saveDB();
      closeModal();
      refreshExerciseViews();
      toast('Ejercicio eliminado de tu biblioteca.', 'info');
    });
    return;
  }
  if(a === 'custom-ex-save'){
    const id = el.dataset.id;
    const name = String(fieldValue('cex-name')).trim().slice(0, LIMITS.name);
    const errBox = $('#cex-err');
    const fail = msg => { if(errBox){ errBox.textContent = msg; errBox.classList.remove('hidden'); } };
    if(!name) return fail('Ponle un nombre al ejercicio.');
    const aliases = String(fieldValue('cex-aliases')).split(',')
      .map(x => x.trim().slice(0, LIMITS.name)).filter(Boolean).slice(0, 12);
    const group = fieldValue('cex-group');
    const equip = fieldValue('cex-equip');
    const d = dataFor(currentUser);
    const clash = allExerciseEntries(d).find(x => x.id !== id && foldText(x.name) === foldText(name));
    if(clash) return fail('Ya existe un ejercicio con ese nombre en la biblioteca.');
    if(!Array.isArray(d.exercises)) d.exercises = [];
    if(id){
      const own = d.exercises.find(x => x.id === id);
      if(!own) return fail('Ese ejercicio ya no existe.');
      own.name = name; own.group = group; own.equip = equip; own.aliases = aliases;
    } else {
      let cid = CUSTOM_PREFIX + (slugify(name) || uid().slice(0, 8));
      if(findExercise(cid, d)) cid = cid + '-' + uid().slice(0, 4);
      d.exercises.push({ id: cid, name, group, equip, aliases });
    }
    saveDB();
    closeModal();
    refreshExerciseViews();
    toast('Ejercicio guardado en tu biblioteca.');
    return;
  }
  if(a === 'save-workout'){
    const d = dataFor(currentUser);
    state.editor.name = ($('#ed-name') ? $('#ed-name').value : state.editor.name).trim().slice(0, LIMITS.name);
    const exercises = state.editor.exercises
      .slice(0, LIMITS.exercises)
      .filter(ex => (ex.name || '').trim())
      .map(ex => {
        const name = ex.name.trim().slice(0, LIMITS.name);
        /* El id se conserva si se renombró un ejercicio que ya lo tenía
           (historial y récords siguen apuntando al mismo ejercicio); si el
           nombre corresponde a otro ejercicio de la biblioteca, se adopta el
           suyo. Nunca se recalcula a partir del texto visible sin más. */
        const known = ex.exId && findExercise(ex.exId, d) ? ex.exId : '';
        return {
          id: ex.id || uid(), name,
          exId: known || resolveExerciseId(name, d),
          sets: clampInt(ex.sets, LIMITS.sets, 3),
          reps: normReps(ex.reps, 10),
          weight: clampInt(ex.weight, LIMITS.kg, 0),
          rest: ex.rest === '' || ex.rest == null ? null : clampInt(ex.rest, 600, null),
          superset: !!ex.superset,
        };
      });
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
    const exId = $('#prf-exercise').value;
    const date = $('#prf-date').value;
    const weight = Number($('#prf-weight').value);
    const repsRaw = $('#prf-reps').value;
    const pickedEx = exId ? findExercise(exId, dataFor(currentUser)) : null;
    const exercise = pickedEx ? pickedEx.name : String(exId || '').replace(/^custom:/, '').replace(/-/g, ' ');
    if(!exId || !exercise){ toast('Elige un ejercicio.', 'error'); return; }
    if(!date){ toast('Elige una fecha.', 'error'); return; }
    if(!(weight > 0 && weight <= LIMITS.kg)){ toast('Introduce un peso válido entre 0 y ' + LIMITS.kg + ' kg.', 'error'); return; }
    const reps = repsRaw ? clampInt(repsRaw, LIMITS.reps, null) : null;
    if(repsRaw && reps === null){ toast('Introduce repeticiones válidas.', 'error'); return; }
    const d = dataFor(currentUser);
    d.prs.push({ id: uid(), exercise, exId, date, weight, reps: repsRaw ? reps : null });
    saveDB();
    state.prExercise = exId;
    closeModal();
    toast(`¡Nuevo récord! ${weight} kg`);
    render();
    return;
  }    if(a === 'apply-prog'){
    const d = dataFor(currentUser);
    const s = getSession(el.dataset.sid);
    const ex = s && !s.finished ? (s.exercises || []).find(x => x.id === el.dataset.ex) : null;
    if(!ex){ toast('No se puede aplicar en esta sesión.', 'info'); return; }
    const sug = progressionSuggestion(d, exKeyOf(ex, d));
    if(!sug || !(sug.weight > 0)){ toast('Este ejercicio no tiene una carga sugerida.', 'info'); return; }
    const pending = (ex.sets || []).filter(st => !st.completed && st.type !== 'warmup');
    if(!pending.length){ toast('No quedan series pendientes en «' + ex.name + '».', 'info'); return; }
    pending.forEach(st => { st.weight = sug.weight; st.reps = sug.reps; });
    saveDB();
    render();
    toast('Sugerencia aplicada a ' + pending.length + ' serie' + (pending.length === 1 ? '' : 's') + ' de «' + ex.name + '».', 'info');
    return;
  }
  if(a === 'share-progress'){ shareProgressChart(); return; }
  if(a === 'progress-prs'){
    state.prExercise = state.progressExercise;
    render();
    requestAnimationFrame(() => { const box = $('#records-block'); if(box && box.scrollIntoView) box.scrollIntoView({ behavior:'smooth', block:'start' }); });
    return;
  }
  if(a === 'pr-progress'){
    state.progressExercise = state.prExercise;
    nav('#/progress');
    requestAnimationFrame(() => { const box = $('#pg-select'); if(box && box.scrollIntoView) box.scrollIntoView({ behavior:'smooth', block:'center' }); });
    return;
  }
  if(a === 'delete-auto-record'){
    const d = dataFor(currentUser);
    d.records = (d.records || []).filter(r => r.id !== el.dataset.id);
    saveDB(); toast('Récord eliminado.', 'info'); render();
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
    const edit = state.weightEdit || null;
    const dupe = d.weights.find(w => w.date === date && !(edit && w.id === edit.id));
    if(edit){
      const target = d.weights.find(w => w.id === edit.id);
      state.weightEdit = null;
      if(!target){ render(); return; }
      if(dupe){
        /* La fecha destino ya tenía medición: se conserva una sola, con el valor nuevo. */
        target.weight = weight;
        target.date = date;
        d.weights = d.weights.filter(w => w !== dupe);
      } else {
        target.weight = weight;
        target.date = date;
      }
      d.weights.sort((x, y) => x.date.localeCompare(y.date));
      saveDB(); toast('Medición actualizada: ' + weight + ' kg');
      render();
      return;
    }
    if(dupe){
      dupe.weight = weight;
      saveDB(); toast('Actualizado: ' + weight + ' kg para ese día');
      render();
      return;
    }
    d.weights.push({ id: uid(), date, weight });
    d.weights.sort((x,y) => x.date.localeCompare(y.date));
    saveDB(); toast('Registrado: ' + weight + ' kg');
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
  if(t.id === 'exp-search' || t.id === 'lib-search'){
    refreshExerciseList(t.id === 'exp-search' ? 'modal' : 'lib');
    return;
  }
  if(t.dataset && t.dataset.set && t.dataset.session){
    const s = getSession(t.dataset.session);
    if(s && !s.finished){
      const ex = s.exercises.find(x => x.id === t.dataset.ex);
      const st = ex && hasSets(ex) ? ex.sets.find(x => x.id === t.dataset.set) : null;
      if(st){
        const f = t.dataset.field;
        if(f === 'notes'){
          st.notes = String(t.value).slice(0, LIMITS.setNotes);
          saveDB();
        } else if(f === 'weight' || f === 'reps' || f === 'restSeconds'){
          const cap = f === 'weight' ? LIMITS.kg : f === 'reps' ? LIMITS.reps : 600;
          const n = Number(t.value);
          st[f] = t.value === '' ? '' : (isFinite(n) && n >= 0 ? (f === 'weight' ? roundKg(n) : Math.min(cap, n)) : '');
          saveDB();
        }
      }
    }
    return;
  }
  if(t.id === 'session-notes'){
    const s = getSession(t.dataset.sessionNote);
    if(s && !s.finished){
      s.notes = String(t.value).slice(0, LIMITS.sessionNotes);
      s.lastSavedAt = nowIso();
      saveDB();
    }
    return;
  }
  if(t.id === 'del-confirm'){
    const go = $('#del-go');
    if(go) go.disabled = t.value.trim().toUpperCase() !== 'ELIMINAR';
    return;
  }
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
      if(f === 'superset') ex[f] = !!t.checked;
      else if(f === 'sets' || f === 'reps' || f === 'weight') ex[f] = t.value === '' ? '' : Number(t.value);
      else if(f === 'rest') ex[f] = t.value === '' ? '' : clampInt(t.value, 600, null);
      else if(f === 'name'){
        ex[f] = t.value;
        /* Si el texto escrito es otro ejercicio de la biblioteca, se adopta su
           id; si es un nombre nuevo, se conserva el id previo (estable). */
        const resolved = resolveExerciseId(t.value, dataFor(currentUser));
        if(resolved && resolved.indexOf(CUSTOM_PREFIX) !== 0) ex.exId = resolved;
        const meta = t.closest('.ex-row-edit') ? t.closest('.ex-row-edit').querySelector('.ex-meta') : null;
        const label = exerciseMeta({ exId: ex.exId, name: t.value }, dataFor(currentUser));
        if(meta) meta.textContent = label;
      }
      else ex[f] = t.value;
    } else if(t.dataset.bind === 'name'){
      state.editor.name = t.value;
    }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if(t && t.dataset && t.dataset.action === 'weight-step'){
    setWeightStep(t.value);
    toast('Incremento de peso: ' + weightStep() + ' kg.', 'info');
    render();
    return;
  }
  if(t && t.dataset && t.dataset.action === 'session-jump-ex'){
    const s = getSession(t.dataset.sid);
    if(s && !s.finished && t.value){
      s.currentExerciseId = t.value;
      s.lastSavedAt = nowIso();
      saveDB();
      render();
    }
    return;
  }
  if(t.id === 'exp-group' || t.id === 'exp-equip' || t.id === 'lib-group' || t.id === 'lib-equip'){
    refreshExerciseList(t.id.indexOf('exp-') === 0 ? 'modal' : 'lib');
    return;
  }
  if(t.dataset && t.dataset.set && (t.dataset.field === 'type' || t.dataset.field === 'rir' || t.dataset.field === 'rpe')){
    const s = getSession(t.dataset.session);
    if(s && !s.finished){
      const ex = s.exercises.find(x => x.id === t.dataset.ex);
      const st = ex && hasSets(ex) ? ex.sets.find(x => x.id === t.dataset.set) : null;
      if(st){
        const f = t.dataset.field;
        st[f] = f === 'type' ? t.value : (t.value === '' ? null : Number(t.value));
        saveDB();
        if(f === 'type'){
          const det = t.closest('details');
          const sum = det ? det.querySelector('summary') : null;
          if(sum) sum.textContent = 'Tipo, RIR/RPE y nota' + (st.type !== 'working' ? ' · ' + (SET_TYPE_LABELS[st.type] || st.type) : '');
        }
      }
    }
    return;
  }
  if(t.id === 'pr-select'){
    state.prExercise = t.value;
    state.progressExercise = t.value;
    render();
  }
  if(t.id === 'import-workouts-input' && t.files && t.files[0]){
    const file = t.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try{
        if(file.size > 2 * 1024 * 1024) throw new Error('too_large');
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
          if(w.exercises !== undefined && !Array.isArray(w.exercises)) return;
          const sourceExercises = Array.isArray(w.exercises) ? w.exercises.slice(0, LIMITS.exercises) : [];
          const exs = sourceExercises
            .filter(e => e && typeof e.name === 'string' && e.name.trim())
            .map(e => ({ id: uid(), name: e.name.trim().slice(0, LIMITS.name), sets: clampInt(e.sets, LIMITS.sets, 1), reps: normReps(e.reps, 1), weight: clampInt(e.weight, LIMITS.kg, 0), superset: !!e.superset }));
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
    const errBox = $('#auth-err');
    if(errBox){ errBox.classList.add('hidden'); errBox.textContent = ''; }
    clearAuthFieldErrors();
    let mode = state.authMode;
    const u = $('#auth-user').value;
    const p = $('#auth-pass').value;
    /* La pestaña "Iniciar sesión" es la que abre por defecto. Quien tiene cuenta
       en la nube escribe ahí su correo, así que un correo entra por Supabase. */
    if(mode === 'login' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.trim())) mode = 'cloud';
    if(!currentUser && mode !== 'login' && mode !== 'signup' && mode !== 'signup-local' && mode !== 'cloud' && mode !== 'forgot'){
      showAuthError('Elige iniciar sesión o crear una cuenta antes de continuar.');
      return;
    }

    /* Consentimiento: solo al crear cuenta y nunca premarcado */
    const needsConsent = mode === 'signup' || mode === 'signup-local';
    const consent = needsConsent ? requireConsent() : null;
    if(needsConsent && !consent) return;

    if(mode === 'signup'){
      /* Cuenta en la nube (por defecto): se crea directamente en Supabase */
      const mail = u.trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ showAuthError('Introduce un correo válido.', 'auth-user'); return; }
      if(p.length < 8){ showAuthError('La contraseña debe tener al menos 8 caracteres.', 'auth-pass'); return; }
      const nameEl = $('#auth-name');
      const cloudName = nameEl ? nameEl.value.trim().replace(/\s+/g, ' ') : '';
      if(cloudName && (cloudName.length < 2 || cloudName.length > 40)){ showAuthError('El nombre de usuario debe tener entre 2 y 40 caracteres.', 'auth-name'); return; }
      const btn = $('#auth-submit'); btn.disabled = true;
      const err = await DrakoSB.signUp(mail, p, consent, cloudName || undefined);
      btn.disabled = false;
      if(typeof err === 'string' && err){ showAuthError(err); return; }
      $('#auth-err').classList.add('hidden');
      form.reset();
      toast('¡Cuenta en la nube creada! Tus datos se respaldan y puedes restaurarlos.');
      await enterCloud(mail);
      focusAfterAuth();
      saveConsent(consent);
      openOnboarding();
      return;
    }

    if(mode === 'cloud'){
      const mail = u.trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ showAuthError('Introduce un correo válido.', 'auth-user'); return; }
      if(!p.length){ showAuthError('Introduce tu contraseña.', 'auth-pass'); return; }
      const btn = $('#auth-submit'); btn.disabled = true;
      const err = await DrakoSB.signIn(mail, p);
      btn.disabled = false;
      if(typeof err === 'string' && err){ showAuthError(err); return; }
      if(err !== null && typeof err !== 'object'){ showAuthError('No se pudo iniciar sesión.'); return; }
      $('#auth-err').classList.add('hidden');
      form.reset();
      toast('¡Hola de nuevo!');
      await enterCloud(mail);
      focusAfterAuth();
      return;
    }

    if(mode === 'forgot'){
      const mail = u.trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ showAuthError('Introduce un correo válido.', 'auth-user'); return; }
      const btn = $('#auth-submit'); btn.disabled = true;
      const err = await DrakoSB.recover(mail);
      btn.disabled = false;
      if(err){ showAuthError(err); return; }
      $('#auth-err').classList.add('hidden');
      form.reset();
      toast('Si ese correo existe, recibirás un enlace para restablecer tu contraseña.', 'info');
      setAuthMode('cloud');
      return;
    }

    const err = mode === 'signup-local' ? await signup(u, p) : await login(u, p);
    if(err){ showAuthError(err, mode === 'signup-local' ? localAuthErrorField(err) : null); return; }
    $('#auth-err').classList.add('hidden');
    form.reset();
    if(mode === 'signup-local') saveConsent(consent);
    toast(mode === 'signup-local' ? '¡Cuenta local creada! (solo en este dispositivo)' : '¡Hola de nuevo!');
    render();
    focusAfterAuth();
    if(mode === 'signup-local') openOnboarding();
  }
});

/* Pestañas y modos de la pantalla de acceso (nube primero / local / recuperación) */
function setAuthMode(mode){
  state.authMode = mode;
  $$('.auth-tab').forEach(t => {
    const on = t.dataset.auth === mode || (mode === 'signup-local' && t.dataset.auth === 'signup');
    t.classList.toggle('active', on);
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const errBox = $('#auth-err');
  if(errBox){ errBox.classList.add('hidden'); errBox.textContent = ''; }
  clearAuthFieldErrors();
  const submit = $('#auth-submit'); if(!submit) return;
  const userLabel = $('#auth-user-label'), userInput = $('#auth-user');
  const passField = $('#auth-pass-field'), passInput = $('#auth-pass');
  const nameField = $('#auth-name-field'), nameInput = $('#auth-name');
  const cloudExtra = $('#cloud-extra');
  const toggle = $('#cloud-toggle'), localLink = $('#local-signup-link'), cloudLink = $('#cloud-mode-link');
  const forgotBtn = cloudExtra ? cloudExtra.querySelector('[data-auth-alt="forgot"]') : null;
  const note = $('#auth-note');
  const showLink = (el, on) => { if(el) el.classList.toggle('hidden', !on); };
  /* Consentimiento: solo visible al crear cuenta y siempre sin premarcar */
  const consentBox = $('#consent-box');
  const isSignup = mode === 'signup' || mode === 'signup-local';
  if(nameField) nameField.classList.toggle('hidden', mode !== 'signup');
  if(nameInput) nameInput.disabled = mode !== 'signup';
  if(consentBox) consentBox.classList.toggle('hidden', !isSignup);
  if(!isSignup){
    const c1 = $('#consent-terms'), c2 = $('#consent-age');
    if(c1) c1.checked = false;
    if(c2) c2.checked = false;
  }
  passInput.autocomplete = isSignup ? 'new-password' : 'current-password';
  if(mode === 'signup'){
    submit.textContent = 'Crear cuenta en la nube';
    userLabel.textContent = 'Correo'; userInput.placeholder = 'tu@correo.com'; userInput.autocomplete = 'email';
    passField.classList.remove('hidden');
    cloudExtra.classList.remove('hidden');
    showLink(toggle, false); showLink(localLink, true); showLink(cloudLink, false);
    if(forgotBtn) forgotBtn.classList.add('hidden');
    if(note) note.innerHTML = 'Tu cuenta nueva vive en la nube (Supabase): puedes restaurarla desde cualquier dispositivo o si olvidas tu contraseña.';
  } else if(mode === 'signup-local'){
    submit.textContent = 'Crear cuenta local';
    userLabel.textContent = 'Usuario'; userInput.placeholder = 'p. ej. entrenador_marco'; userInput.autocomplete = 'username';
    passField.classList.remove('hidden');
    cloudExtra.classList.remove('hidden');
    showLink(toggle, false); showLink(localLink, false); showLink(cloudLink, true);
    if(forgotBtn) forgotBtn.classList.add('hidden');
    if(note) note.innerHTML = 'La cuenta local vive <b>solo en este dispositivo</b>: si pierdes el navegador pierdes los datos. Te avisaremos cada dos semanas para hacer una copia.';
  } else if(mode === 'login'){
    submit.textContent = 'Iniciar sesión';
    userLabel.textContent = 'Usuario o correo'; userInput.placeholder = 'tu@correo.com o entrenador_marco'; userInput.autocomplete = 'username';
    passField.classList.remove('hidden'); cloudExtra.classList.add('hidden');
    if(note) note.innerHTML = 'Las cuentas locales viven solo en este dispositivo. Con <b>Nube</b> tus datos se guardan en Supabase y puedes restaurarlos desde cualquier dispositivo o si olvidas tu contraseña.';
  } else if(mode === 'cloud'){
    submit.textContent = 'Entrar con la nube';
    userLabel.textContent = 'Correo'; userInput.placeholder = 'tu@correo.com'; userInput.autocomplete = 'email';
    passField.classList.remove('hidden');
    cloudExtra.classList.remove('hidden');
    showLink(toggle, true); showLink(localLink, false); showLink(cloudLink, false);
    if(forgotBtn) forgotBtn.classList.remove('hidden');
    if(toggle) toggle.textContent = '¿No tienes cuenta en la nube? Crear cuenta';
    if(note) note.innerHTML = 'Entra con tu correo de DrakoTrack para sincronizar tus datos y poder restaurarlos.';
  } else if(mode === 'forgot'){
    submit.textContent = 'Enviar enlace de recuperación';
    userLabel.textContent = 'Correo'; userInput.placeholder = 'tu@correo.com'; userInput.autocomplete = 'email';
    passField.classList.add('hidden');
    cloudExtra.classList.remove('hidden');
    showLink(toggle, false); showLink(localLink, false); showLink(cloudLink, false);
    if(forgotBtn) forgotBtn.classList.add('hidden');
  }
}
document.addEventListener('click', e => {
  const alt = e.target.closest('[data-auth-alt]');
  if(alt){
    const kind = alt.dataset.authAlt;
    if(kind === 'cloud-signup' || kind === 'cloud-mode') setAuthMode('signup');
    else if(kind === 'local-signup') setAuthMode('signup-local');
    else if(kind === 'forgot') setAuthMode('forgot');
    return;
  }
  const tab = e.target.closest('.auth-tab');
  if(tab) setAuthMode(tab.dataset.auth);
});
async function saveCloudName(){
  if(!isCloud()){ toast('Inicia sesión en la nube para cambiar el nombre.', 'error'); return; }
  const input = $('#set-cloud-name');
  const name = input ? input.value.trim().replace(/\s+/g, ' ') : '';
  if(name.length < 2 || name.length > 40){ toast('El nombre debe tener entre 2 y 40 caracteres.', 'error'); return; }
  const btn = document.querySelector('[data-action="save-cloud-name"]');
  if(btn) btn.disabled = true;
  const err = await DrakoSB.updateProfile(name);
  if(btn) btn.disabled = false;
  if(typeof err === 'string' && err){ toast(err, 'error'); return; }
  render();
  toast('Nombre de usuario guardado.');
}
function clearAuthFieldError(field){
  if(!field || !field.removeAttribute) return;
  field.removeAttribute('aria-invalid');
  if(field.getAttribute('aria-describedby') === 'auth-err') field.removeAttribute('aria-describedby');
}
function clearAuthFieldErrors(){
  ['auth-user','auth-name','auth-pass','consent-terms','consent-age'].forEach(id => clearAuthFieldError(document.getElementById(id)));
}
function localAuthErrorField(msg){
  if(/usuario/i.test(msg)) return 'auth-user';
  if(/contraseña/i.test(msg)) return 'auth-pass';
  return null;
}
function showAuthError(msg, fieldId){
  const box = $('#auth-err');
  if(!box) return;
  clearAuthFieldErrors();
  box.textContent = msg;
  box.classList.remove('hidden');
  const field = fieldId ? (typeof fieldId === 'string' ? document.getElementById(fieldId) : fieldId) : null;
  if(field){
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', 'auth-err');
    try{ field.focus({ preventScroll: true }); }catch(e){ field.focus(); }
  } else {
    try{ box.focus({ preventScroll: true }); }catch(e){ box.focus(); }
  }
}

/* ---------------- Teclado: diálogos, menú y foco ---------------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
document.addEventListener('keydown', e => {
  const modal = $('.modal');
  if(modal){
    if(e.key === 'Escape'){ e.preventDefault(); closeModal(); return; }
    if(e.key === 'Tab'){
      const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('.hidden'));
      if(!items.length){ e.preventDefault(); modal.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if(e.shiftKey && (active === first || active === modal)){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && active === last){ e.preventDefault(); first.focus(); }
    }
    return;
  }
  if(e.key === 'Escape'){
    const menu = $('#user-menu');
    if(menu && menu.classList.contains('open')){
      menu.classList.remove('open');
      const chip = $('#user-chip');
      if(chip){ chip.setAttribute('aria-expanded', 'false'); chip.focus(); }
    }
  }
  /* Listbox de repeticiones: flechas, Inicio/Fin, Escape y salida con Tab. */
  const repsMenu = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.reps-menu') : null;
  if(repsMenu){
    const options = [...repsMenu.querySelectorAll('[role="option"]')];
    if(!options.length) return;
    const idx = options.indexOf(document.activeElement);
    if(e.key === 'Escape'){
      e.preventDefault();
      const wrap = repsMenu.closest('.reps-picker');
      const toggle = wrap && wrap.querySelector('.reps-toggle');
      closeRepsMenus();
      if(toggle) toggle.focus({ preventScroll: true });
      return;
    }
    if(e.key === 'Tab'){ closeRepsMenus(); return; }
    let next = null;
    if(e.key === 'ArrowDown' || e.key === 'ArrowRight') next = options[(idx + 1) % options.length];
    else if(e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = options[(idx - 1 + options.length) % options.length];
    else if(e.key === 'Home') next = options[0];
    else if(e.key === 'End') next = options[options.length - 1];
    if(next){ e.preventDefault(); next.focus({ preventScroll: true }); }
    return;
  }
});

/* ---------------- Inicialización ---------------- */
applyTheme();
/* Al cambiar de vista el foco va al contenido: navegación por teclado y
   lectores de pantalla anuncian la nueva página. */
function skipTarget(){
  const app = $('#app');
  return app && !app.classList.contains('hidden') ? $('#main') : $('#auth-content');
}
function syncSkipLink(){
  const link = $('.skip-link');
  const target = skipTarget();
  if(link && target && target.id) link.setAttribute('href', '#' + target.id);
}
document.addEventListener('click', function(e){
  const link = e.target && e.target.closest ? e.target.closest('.skip-link') : null;
  if(!link) return;
  const target = skipTarget();
  if(!target) return;
  e.preventDefault();
  try{ target.focus({ preventScroll: true }); }catch(err){ target.focus(); }
  if(target.scrollIntoView) target.scrollIntoView({ block: 'start' });
});
function focusMain(){
  const m = $('#main');
  if(m && !$('#app').classList.contains('hidden')){
    try{ m.focus({ preventScroll: true }); }catch(e){ m.focus(); }
  }
}
window.addEventListener('hashchange', () => {
  /* Un evento tardío del mismo hash no debe repintar la vista ni mover el foco. */
  if(location.hash === _renderedHash) return;
  render();
  focusMain();
});
(async function boot(){
  try{ migrateAllData(); }catch(err){}
  /* ¿Volvió de un enlace de recuperación de contraseña? */
  const rec = parseRecoveryHash();
  if(rec){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    window.__recToken = rec.access_token;
    openModal(`
      <h3>Elige una contraseña nueva</h3>
      <div class="form">
        <label class="field"><span>Nueva contraseña</span><input type="password" id="rec-pass" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
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
  const s = await DrakoSB.loadSession();
  if(s && DrakoSB.hasSession() && DrakoSB.email()){
    currentUser = DrakoSB.email();
    localStorage.setItem(SESSION_KEY, currentUser);
    dataFor(currentUser);
    try{
      opQueue.recover(currentUser);
      const st0 = cloudSync.state(currentUser);
      if(st0 && st0.dirty) enqueueSyncJob(currentUser, st0, 'boot');
    }catch(e){}
    render();
    DrakoSB.refresh().then(ok => {
      if(!ok){ renderOfflineBar(); return; }
      runSync(false).then(() => { if(currentUser) render(); });
    });
  } else {
    render();
  }
})();

/* Si el dispositivo estuvo sin conexión, al volver la red se reintenta solo:
   los cambios pendientes ya están guardados en localStorage. */
window.addEventListener('online', () => { offlineState.online = true; handleConnectivity('online'); });
window.addEventListener('offline', () => { offlineState.online = false; renderOfflineBar(); });
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && Date.now() - (offlineState.lastCheck || 0) > 8000) handleConnectivity('visible');
});
window.addEventListener('focus', () => {
  if(Date.now() - (offlineState.lastCheck || 0) > 15000) handleConnectivity('focus');
});

/* ---------------- PWA: registro del service worker ---------------- */
/* Solo en contextos seguros (https o localhost): la app sigue funcionando
   igual si el navegador no lo soporta o el registro falla. */
setupPwa();
/* ============================================================
   PROMPT 6 — Programas, planificación semanal y calendario
   Los datos viven en d.programs y d.planner (sync.js los trata
   como colecciones normales). Las sesiones nunca se reescriben:
   el plan solo enlaza sessionId y el estado se deduce.
   ============================================================ */
function planState(){
  if(!state.plan) state.plan = { tab:'week', week:PL.weekStart(todayISO()), month:todayISO().slice(0, 7), selectedDay:todayISO(), programEdit:null };
  if(!state.plan.week) state.plan.week = PL.weekStart(todayISO());
  if(!state.plan.month) state.plan.month = todayISO().slice(0, 7);
  if(!state.plan.selectedDay) state.plan.selectedDay = todayISO();
  return state.plan;
}
function planNameOf(d){
  return id => {
    const w = getWorkout(id);
    if(w) return w.name;
    const e = ((d && d.planner) || []).find(x => x.workoutId === id);
    return e ? e.workoutName || '' : '';
  };
}
function planWorkoutChoices(d){
  const list = [], seen = new Set();
  ((d && d.workouts) || []).forEach(w => { if(w && w.id && !seen.has(w.id)){ seen.add(w.id); list.push({ id:w.id, name:w.name }); } });
  (typeof LIBRARY !== 'undefined' ? LIBRARY : []).forEach(w => { if(w && w.id && !seen.has(w.id)){ seen.add(w.id); list.push({ id:w.id, name:w.name }); } });
  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
function planChip(status){
  const map = {
    done: ['Hecha', 'is-done'], progress: ['En curso', 'is-progress'], pending: ['Pendiente', 'is-pending'],
    missed: ['Omitida', 'is-missed'], rest: ['Descanso', 'is-rest'], none: ['—', 'is-none'],
  };
  const item = map[status] || map.none;
  return '<span class="plan-chip ' + item[1] + '">' + item[0] + '</span>';
}
function planMoveOptions(entry){
  const dates = PL.weekDates(entry.date).concat(PL.weekDates(PL.addDays(entry.date, 7)));
  return dates.map(date => '<option value="' + esc(date) + '"' + (date === entry.date ? ' selected' : '') + '>' + esc(fmtDate(date)) + '</option>').join('');
}
function planEntryHTML(d, entry){
  const status = PL.entryStatus(entry, PL.sessionsById(d), todayISO());
  const isRest = entry.kind === 'rest';
  const name = isRest ? 'Descanso' : (entry.workoutName || planNameOf(d)(entry.workoutId) || 'Rutina eliminada');
  let actions = '';
  if(!isRest && status !== 'done') actions += '<button class="btn btn-primary btn-sm" type="button" data-action="plan-start" data-id="' + esc(entry.id) + '">Empezar</button>';
  if(!isRest && entry.sessionId) actions += '<button class="btn btn-ghost btn-sm" type="button" data-action="open-session" data-id="' + esc(entry.sessionId) + '">Ver sesión</button>';
  actions += '<label class="plan-move"><span class="sr-only">Mover a otro día</span><select data-plan-move="' + esc(entry.id) + '">' + planMoveOptions(entry) + '</select></label>';
  actions += '<button class="icon-btn danger" type="button" data-action="plan-clear" data-id="' + esc(entry.id) + '" aria-label="Quitar del plan" title="Quitar del plan">✕</button>';
  return '<div class="plan-entry">'
    + '<div class="plan-entry-head"><span class="plan-entry-name">' + esc(name) + '</span>' + (isRest ? planChip('rest') : planChip(status)) + '</div>'
    + '<div class="plan-entry-actions">' + actions + '</div>'
    + '</div>';
}
function planAddSelectHTML(d, date){
  const choices = planWorkoutChoices(d).map(w => '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>').join('');
  return '<label class="plan-add"><span class="sr-only">Añadir a este día</span><select data-plan-add="' + esc(date) + '"><option value="">+ Añadir…</option><option value="rest">Descanso</option>' + choices + '</select></label>';
}
function planReminderHTML(){
  const d = dataFor(currentUser);
  const on = !!(d.prefs && d.prefs.planReminder);
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  if(!supported) return '<p class="muted small">Este navegador no admite notificaciones locales. Los avisos push con la app cerrada necesitan infraestructura adicional; no se simulan.</p>';
  if(on && window.Notification.permission === 'granted') return '<p class="muted small">Recordatorios activos: al abrir la app el día del entrenamiento verás un aviso local. Con la app cerrada no hay push.</p>';
  return '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-reminder">Activar recordatorios del plan</button><p class="muted small">El permiso se pide solo al pulsar. Sin servidor push, el aviso llega al abrir la app ese día.</p>';
}
function planWeekHTML(d){
  const ps = planState();
  const dates = PL.weekDates(ps.week);
  const entries = PL.entriesForWeek(d.planner, ps.week);
  const byDate = new Map(dates.map(x => [x, []]));
  entries.forEach(e => { if(byDate.has(e.date)) byDate.get(e.date).push(e); });
  const doneByDate = new Map(dates.map(x => [x, []]));
  ((d && d.sessions) || []).forEach(s => {
    if(!s || !s.finished || s.status === 'cancelled' || !doneByDate.has(s.date)) return;
    doneByDate.get(s.date).push(s);
  });
  const program = PL.activeProgram(d);
  const today = todayISO();
  const rows = dates.map((date, i) => {
    const dayEntries = byDate.get(date) || [];
    const done = doneByDate.get(date) || [];
    const plannedSessions = new Set(dayEntries.map(e => e.sessionId).filter(Boolean));
    const extra = done.filter(s => !plannedSessions.has(s.id));
    const bits = [];
    dayEntries.forEach(e => bits.push(planEntryHTML(d, e)));
    extra.forEach(s => bits.push('<p class="plan-extra">También entrenaste: <b>' + esc(s.workoutName) + '</b> · <button class="linklike" type="button" data-action="open-session" data-id="' + esc(s.id) + '">ver</button></p>'));
    return '<div class="plan-day' + (date === today ? ' is-today' : '') + (date < today ? ' is-past' : '') + '">'
      + '<div class="plan-day-head"><span class="plan-day-name">' + esc(PL.WEEKDAY_LABELS[i]) + '</span><span class="plan-day-date">' + esc(fmtDate(date)) + '</span></div>'
      + '<div class="plan-day-body">' + (bits.join('') || '<p class="muted small">Sin planificar.</p>') + planAddSelectHTML(d, date) + '</div>'
      + '</div>';
  }).join('');
  return ''
    + '<div class="plan-bar">'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-week" data-dir="-1" aria-label="Semana anterior">‹</button>'
    +   '<span class="plan-range">' + esc(fmtDate(ps.week)) + ' – ' + esc(fmtDate(PL.addDays(ps.week, 6))) + '</span>'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-week" data-dir="1" aria-label="Semana siguiente">›</button>'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-today">Hoy</button>'
    + '</div>'
    + (program
        ? '<p class="plan-program-line">Programa activo: <b>' + esc(program.name) + '</b> · <button class="linklike" type="button" data-action="plan-tab" data-tab="programs">gestionar</button></p>'
        : '<p class="plan-program-line muted">Sin programa activo. <button class="linklike" type="button" data-action="plan-tab" data-tab="programs">Crear uno</button></p>')
    + '<div class="plan-actions">'
    +   '<button class="btn btn-primary btn-sm" type="button" data-action="plan-apply-template">Aplicar plantilla a esta semana</button>'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-copy-prev">Copiar semana anterior</button>'
    + '</div>'
    + '<div class="plan-week">' + rows + '</div>'
    + '<section class="card plan-reminder"><h2>Recordatorios</h2>' + planReminderHTML() + '</section>';
}
function planMonthHTML(d){
  const ps = planState();
  const [year, month] = ps.month.split('-').map(Number);
  const grid = PL.monthGrid(year, month - 1);
  const sessions = PL.sessionsById(d);
  const byDate = new Map();
  ((d && d.planner) || []).forEach(e => { if(!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });
  const doneByDate = new Map();
  ((d && d.sessions) || []).forEach(s => { if(s && s.finished && s.status !== 'cancelled'){ if(!doneByDate.has(s.date)) doneByDate.set(s.date, 0); doneByDate.set(s.date, doneByDate.get(s.date) + 1); } });
  const today = todayISO();
  const head = PL.WEEKDAY_LABELS.map(x => '<span class="cal-dow">' + esc(x.slice(0, 2)) + '</span>').join('');
  const cells = grid.map(week => week.map(cell => {
    const entries = byDate.get(cell.date) || [];
    const statuses = entries.map(e => PL.entryStatus(e, sessions, today));
    const doneCount = doneByDate.get(cell.date) || 0;
    const classes = ['cal-cell'];
    if(!cell.inMonth) classes.push('is-out');
    if(cell.date === today) classes.push('is-today');
    if(cell.date === ps.selectedDay) classes.push('is-selected');
    if(statuses.includes('done') || doneCount > 0) classes.push('has-done');
    if(statuses.includes('missed')) classes.push('has-missed');
    if(statuses.includes('pending')) classes.push('has-pending');
    if(statuses.includes('rest')) classes.push('has-rest');
    return '<button type="button" class="' + classes.join(' ') + '" data-action="plan-day" data-date="' + esc(cell.date) + '">'
      + '<span class="cal-num">' + cell.day + '</span>'
      + '<span class="cal-marks">' + (doneCount ? '<span class="cal-dot done" title="Entrenamiento completado"></span>' : '')
      + (statuses.includes('pending') ? '<span class="cal-dot pending" title="Planificado"></span>' : '')
      + (statuses.includes('missed') ? '<span class="cal-dot missed" title="Omitido"></span>' : '')
      + (statuses.includes('rest') ? '<span class="cal-dot rest" title="Descanso"></span>' : '') + '</span>'
      + '</button>';
  }).join('')).join('');
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('es', { month:'long', year:'numeric' });
  return ''
    + '<div class="plan-bar">'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-month" data-dir="-1" aria-label="Mes anterior">‹</button>'
    +   '<span class="plan-range">' + esc(label) + '</span>'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-month" data-dir="1" aria-label="Mes siguiente">›</button>'
    +   '<button class="btn btn-ghost btn-sm" type="button" data-action="plan-today">Hoy</button>'
    + '</div>'
    + '<div class="cal-head">' + head + '</div>'
    + '<div class="cal-grid">' + cells + '</div>'
    + '<div class="cal-legend"><span><i class="cal-dot pending"></i> Planificado</span><span><i class="cal-dot done"></i> Completado</span><span><i class="cal-dot missed"></i> Omitido</span><span><i class="cal-dot rest"></i> Descanso</span></div>'
    + planDayDetailHTML(d);
}
function planDayDetailHTML(d){
  const ps = planState();
  const day = PL.daySummary(d, ps.selectedDay);
  const entries = day.entries.map(item => planEntryHTML(d, item.entry)).join('');
  const done = day.done.map(s => '<div class="pr-item"><span>' + esc(s.workoutName) + '</span><span class="muted small">' + esc(SESSION_STATUS_LABELS[s.status] || 'Completada') + '</span><button class="btn btn-ghost btn-sm" type="button" data-action="open-session" data-id="' + esc(s.id) + '">Ver sesión</button></div>').join('');
  const extra = day.extra.length ? '<p class="muted small">' + day.extra.length + ' de estas sesiones no estaban planificadas: se conservan tal cual.</p>' : '';
  return '<section class="card plan-day-detail"><h2>' + esc(fmtDateLong(day.date)) + '</h2>'
    + (entries || '<p class="muted small">Nada planificado para este día.</p>')
    + (done ? '<div class="pr-list plan-done-list">' + done + '</div>' : '')
    + extra
    + planAddSelectHTML(d, day.date)
    + '</section>';
}
function planProgramCard(d, program){
  const progress = PL.programProgress(program, todayISO());
  const goals = PL.evaluateGoals(program, d, PG, { today: todayISO(), resolve: name => resolveExerciseId(name, d) });
  const sessions = ((d.sessions || []).filter(s => s && s.finished && s.status !== 'cancelled'
    && s.date >= (program.startDate || '0000-00-00') && s.date <= (program.endDate || '9999-12-31'))).length;
  const goalsHTML = goals.length
    ? '<ul class="plan-goals">' + goals.map(g => {
        const pct = g.target ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
        return '<li><span>' + esc(g.label) + '</span><span class="plan-goal-val">' + (g.verifiable ? esc(String(g.current)) + ' / ' + esc(String(g.target)) + ' ' + esc(g.unit) : 'Sin datos') + '</span>'
          + '<span class="plan-goal-track"><span class="plan-goal-fill' + (g.met ? ' is-met' : '') + '" style="width:' + (g.verifiable ? pct : 0) + '%"></span></span></li>';
      }).join('') + '</ul>'
    : '<p class="muted small">Sin objetivos definidos.</p>';
  const phases = (program.phases || []).length
    ? '<p class="muted small">Fases: ' + program.phases.map(ph => esc(ph.name) + (ph.weeks ? ' (' + ph.weeks + ' sem)' : '')).join(' · ') + '</p>'
    : '';
  const statusButtons = [];
  if(program.status === 'active') statusButtons.push('<button class="btn btn-ghost btn-sm" type="button" data-action="program-status" data-id="' + esc(program.id) + '" data-status="paused">Pausar</button>');
  if(program.status === 'paused') statusButtons.push('<button class="btn btn-primary btn-sm" type="button" data-action="program-status" data-id="' + esc(program.id) + '" data-status="active">Reanudar</button>');
  if(program.status !== 'completed') statusButtons.push('<button class="btn btn-ghost btn-sm" type="button" data-action="program-status" data-id="' + esc(program.id) + '" data-status="completed">Completar</button>');
  if(program.status !== 'archived') statusButtons.push('<button class="btn btn-ghost btn-sm" type="button" data-action="program-status" data-id="' + esc(program.id) + '" data-status="archived">Archivar</button>');
  return '<article class="card plan-program">'
    + '<div class="plan-program-head"><h2>' + esc(program.name) + '</h2><span class="plan-chip is-' + esc(program.status) + '">' + esc(PL.statusLabel(program.status)) + '</span></div>'
    + (program.description ? '<p class="muted small">' + esc(program.description) + '</p>' : '')
    + '<p class="muted small">' + esc(fmtDate(program.startDate)) + (program.endDate ? ' → ' + esc(fmtDate(program.endDate)) : '') + ' · ' + program.weeks + ' semanas · ' + program.daysPerWeek + ' días/semana · ' + (program.workoutIds || []).length + ' rutinas · ' + sessions + ' sesiones hechas</p>'
    + '<div class="plan-progress"><span style="width:' + progress.pct + '%"></span></div><p class="muted small">Semana ' + progress.elapsed + ' de ' + progress.weeks + (progress.remaining ? ' · quedan ' + progress.remaining : '') + '</p>'
    + phases
    + goalsHTML
    + '<div class="plan-program-actions">' + statusButtons.join('')
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="program-duplicate" data-id="' + esc(program.id) + '">Duplicar</button>'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="program-edit" data-id="' + esc(program.id) + '">Editar</button>'
    + '<button class="icon-btn danger" type="button" data-action="program-delete" data-id="' + esc(program.id) + '" aria-label="Eliminar programa" title="Eliminar programa">✕</button>'
    + '</div></article>';
}
function renderPlanPrograms(d){
  const ps = planState();
  if(ps.programEdit) return planEditorHTML(d, ps.programEdit);
  const programs = (d.programs || []).slice().sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || String(a.name).localeCompare(String(b.name), 'es'));
  return '<div class="plan-actions"><button class="btn btn-primary btn-sm" type="button" data-action="program-new">+ Nuevo programa</button></div>'
    + (programs.length ? programs.map(p => planProgramCard(d, p)).join('') : '<div class="empty-state">Aún no hay programas. Crea uno, define sus rutinas y su plantilla semanal, y aplícala al calendario.</div>');
}
function planPhaseRowHTML(phase){
  const ph = phase || { id:'', name:'', weeks:3, goal:'', notes:'' };
  return '<div class="plan-phase-row" data-id="' + esc(ph.id || '') + '">'
    + '<label class="field"><span>Fase</span><input class="ph-name" value="' + esc(ph.name) + '" placeholder="Hipertrofia" maxlength="80"></label>'
    + '<label class="field"><span>Semanas</span><input class="ph-weeks" type="number" min="1" max="104" value="' + esc(String(ph.weeks || 1)) + '"></label>'
    + '<label class="field"><span>Objetivo</span><input class="ph-goal" value="' + esc(ph.goal || '') + '" maxlength="200"></label>'
    + '<label class="field"><span>Notas</span><input class="ph-notes" value="' + esc(ph.notes || '') + '" maxlength="500"></label>'
    + '<button class="icon-btn danger" type="button" data-action="program-remove-row" aria-label="Quitar fase">✕</button>'
    + '</div>';
}
function planGoalRowHTML(goal, d){
  const g = goal || { id:'', type:'sessions', target:12, exerciseId:'', targetWeight:0 };
  const options = PG.GOAL_TYPES || [];
  const ex = exerciseOptions(d).map(o => '<option value="' + esc(o.id) + '"' + (o.id === g.exerciseId ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('');
  return '<div class="plan-goal-row" data-id="' + esc(g.id || '') + '">'
    + '<label class="field"><span>Objetivo</span><select class="pg-type">' + options.map(t => '<option value="' + esc(t.id) + '"' + (t.id === g.type ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select></label>'
    + '<label class="field"><span>Meta</span><input class="pg-target" type="number" min="0" max="100000" step="0.5" value="' + esc(String(g.target || 0)) + '"></label>'
    + '<label class="field"><span>Ejercicio (peso/reps)</span><select class="pg-ex"><option value="">—</option>' + ex + '</select></label>'
    + '<label class="field"><span>Peso para reps</span><input class="pg-tw" type="number" min="0" max="1000" step="0.5" value="' + esc(String(g.targetWeight || 0)) + '"></label>'
    + '<button class="icon-btn danger" type="button" data-action="program-remove-row" aria-label="Quitar objetivo">✕</button>'
    + '</div>';
}
function planEditorHTML(d, edit){
  const isNew = edit === 'new';
  const program = isNew ? { id:'', name:'', description:'', goal:'', startDate:todayISO(), endDate:'', weeks:8, daysPerWeek:3, status:'active', workoutIds:[], template:['','','','','','',''], phases:[], goals:[] } : (PL.programById(d, edit) || PL.newProgram());
  const choices = planWorkoutChoices(d);
  const goalOptions = [{ id:'', label:'Sin objetivo definido' }, { id:'fuerza', label:'Fuerza' }, { id:'hipertrofia', label:'Hipertrofia' }, { id:'resistencia', label:'Resistencia' }, { id:'perdida-grasa', label:'Pérdida de grasa' }, { id:'salud', label:'Salud general' }];
  const workoutChecks = choices.map(w => '<label class="check-inline"><input type="checkbox" data-pf-workout value="' + esc(w.id) + '"' + ((program.workoutIds || []).includes(w.id) ? ' checked' : '') + '> ' + esc(w.name) + '</label>').join('');
  const templateRows = [0,1,2,3,4,5,6].map(i => {
    const current = (program.template || [])[i] || '';
    const opts = ['<option value="">—</option>', '<option value="rest"' + (current === 'rest' ? ' selected' : '') + '>Descanso</option>']
      .concat(choices.map(w => '<option value="' + esc(w.id) + '"' + (current === w.id ? ' selected' : '') + '>' + esc(w.name) + '</option>')).join('');
    return '<label class="field"><span>' + esc(PL.WEEKDAY_LABELS[i]) + '</span><select data-pf-tpl="' + i + '">' + opts + '</select></label>';
  }).join('');
  return '<div class="card plan-editor">'
    + '<h2>' + (isNew ? 'Nuevo programa' : 'Editar programa') + '</h2>'
    + '<div class="plan-form">'
    + '<label class="field"><span>Nombre</span><input id="pf-name" maxlength="120" value="' + esc(program.name) + '" placeholder="Bloque de fuerza 8 semanas"></label>'
    + '<label class="field"><span>Descripción</span><textarea id="pf-desc" maxlength="600" rows="2">' + esc(program.description || '') + '</textarea></label>'
    + '<label class="field"><span>Objetivo principal</span><select id="pf-goal">' + goalOptions.map(o => '<option value="' + esc(o.id) + '"' + (o.id === (program.goal || '') ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select></label>'
    + '<label class="field"><span>Inicio</span><input id="pf-start" type="date" value="' + esc(program.startDate || todayISO()) + '"></label>'
    + '<label class="field"><span>Fin (opcional)</span><input id="pf-end" type="date" value="' + esc(program.endDate || '') + '"></label>'
    + '<label class="field"><span>Duración (semanas)</span><input id="pf-weeks" type="number" min="1" max="104" value="' + esc(String(program.weeks || 8)) + '"></label>'
    + '<label class="field"><span>Días por semana</span><input id="pf-days" type="number" min="1" max="7" value="' + esc(String(program.daysPerWeek || 3)) + '"></label>'
    + '<label class="field"><span>Estado</span><select id="pf-status">' + PL.STATUSES.map(x => '<option value="' + esc(x.id) + '"' + (x.id === program.status ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select></label>'
    + '</div>'
    + '<h3>Rutinas del programa</h3><div class="plan-checks">' + (workoutChecks || '<p class="muted small">No hay rutinas disponibles todavía.</p>') + '</div>'
    + '<h3>Plantilla semanal</h3><p class="muted small">Se aplica a una semana concreta con «Aplicar plantilla»; cambiar la plantilla no modifica semanas ya planificadas.</p><div class="plan-template">' + templateRows + '</div>'
    + '<h3>Fases</h3><div id="pf-phases" class="plan-rows">' + (program.phases || []).map(planPhaseRowHTML).join('') + '</div>'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="program-add-phase">+ Añadir fase</button>'
    + '<h3>Objetivos</h3><div id="pf-goals" class="plan-rows">' + (program.goals || []).map(g => planGoalRowHTML(g, d)).join('') + '</div>'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="program-add-goal">+ Añadir objetivo</button>'
    + '<p class="muted small">Los objetivos se comprueban con tus sesiones y récords reales. Un objetivo sin datos aparece como «Sin datos», nunca como cumplido.</p>'
    + '<div class="plan-actions"><button class="btn btn-primary" type="button" data-action="program-save">Guardar programa</button><button class="btn btn-ghost" type="button" data-action="program-cancel">Cancelar</button></div>'
    + '</div>';
}
function planSegHTML(){
  const ps = planState();
  return '<div class="plan-seg" role="tablist" aria-label="Vistas del plan">'
    + PLAN_TABS.map(t => '<button type="button" role="tab" aria-selected="' + (ps.tab === t.id) + '" class="plan-seg-btn' + (ps.tab === t.id ? ' is-active' : '') + '" data-action="plan-tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('')
    + '</div>';
}
function renderPlan(main){
  const d = dataFor(currentUser);
  PL.ensurePlanData(d);
  const ps = planState();
  const body = ps.tab === 'programs' ? renderPlanPrograms(d) : ps.tab === 'month' ? planMonthHTML(d) : planWeekHTML(d);
  main.innerHTML = '<div class="page-head"><h1>Plan</h1><p class="muted">Programas, plantilla semanal y calendario. Lo que entrenas de verdad se guarda aparte: aquí no se reescribe tu historial.</p></div>'
    + planSegHTML() + body;
  document.querySelectorAll('[data-plan-move]').forEach(sel => sel.addEventListener('change', () => {
    const dd = dataFor(currentUser);
    const entry = (dd.planner || []).find(x => x.id === sel.dataset.planMove);
    if(!entry || !sel.value) return;
    PL.moveEntry(entry, sel.value);
    saveDB();
    toast('Movido al ' + fmtDate(sel.value));
    render();
  }));
  document.querySelectorAll('[data-plan-add]').forEach(sel => sel.addEventListener('change', () => {
    if(!sel.value) return;
    planAddEntry(sel.dataset.planAdd, sel.value);
  }));
  if(ps.tab === 'week') maybePlanReminder();
}
function planAddEntry(date, value){
  const d = dataFor(currentUser);
  const program = PL.activeProgram(d);
  if(value === 'rest'){
    if(!d.planner.some(e => e.date === date && e.kind === 'rest')){
      d.planner.push({ id: PL.newId(), date, programId: program ? program.id : '', kind:'rest', workoutId:'', workoutName:'', sessionId:'' });
    }
  } else {
    const w = getWorkout(value);
    d.planner.push({ id: PL.newId(), date, programId: program ? program.id : '', kind:'workout', workoutId:value, workoutName:w ? w.name : '', sessionId:'' });
  }
  saveDB();
  render();
}
function saveProgramForm(){
  const d = dataFor(currentUser);
  const ps = planState();
  const isNew = ps.programEdit === 'new';
  const program = isNew ? PL.newProgram({ startDate: todayISO() }) : PL.programById(d, ps.programEdit);
  if(!program){ planState().programEdit = null; return; }
  const name = (($('#pf-name') || {}).value || '').trim();
  if(!name){ toast('Ponle un nombre al programa.', 'error'); return; }
  program.name = name.slice(0, 120);
  program.description = (($('#pf-desc') || {}).value || '').slice(0, 600);
  program.goal = (($('#pf-goal') || {}).value || '').slice(0, 40);
  program.startDate = (($('#pf-start') || {}).value) || todayISO();
  program.endDate = (($('#pf-end') || {}).value) || '';
  program.weeks = Math.max(1, Math.min(104, Number(($('#pf-weeks') || {}).value) || 8));
  program.daysPerWeek = Math.max(1, Math.min(7, Number(($('#pf-days') || {}).value) || 3));
  program.status = (($('#pf-status') || {}).value) || 'active';
  program.workoutIds = $$('input[data-pf-workout]:checked').map(i => i.value);
  program.template = [0,1,2,3,4,5,6].map(i => { const el = document.querySelector('[data-pf-tpl="' + i + '"]'); return el ? el.value : ''; });
  program.phases = $$('#pf-phases .plan-phase-row').map(row => ({
    id: row.dataset.id || PL.newId(),
    name: (row.querySelector('.ph-name').value || 'Fase').slice(0, 80),
    weeks: Math.max(1, Math.min(104, Number(row.querySelector('.ph-weeks').value) || 1)),
    goal: (row.querySelector('.ph-goal').value || '').slice(0, 200),
    workoutIds: [], notes: (row.querySelector('.ph-notes').value || '').slice(0, 500),
  }));
  program.goals = $$('#pf-goals .plan-goal-row').map(row => ({
    id: row.dataset.id || PL.newId(),
    type: row.querySelector('.pg-type').value,
    target: Math.max(0, Math.min(100000, Number(row.querySelector('.pg-target').value) || 0)),
    exerciseId: (row.querySelector('.pg-ex') || {}).value || '',
    targetWeight: Math.max(0, Math.min(1000, Number((row.querySelector('.pg-tw') || {}).value) || 0)),
    period: 'program', label: '',
  }));
  program.updatedAt = nowIso();
  if(isNew) d.programs.push(program);
  if(program.status === 'active') d.programs.forEach(p => { if(p.status === 'active' && p.id !== program.id) p.status = 'paused'; });
  saveDB();
  planState().programEdit = null;
  toast(isNew ? 'Programa creado.' : 'Programa actualizado.');
  render();
}
function planReminderEnabled(){
  const d = dataFor(currentUser);
  return !!(d && d.prefs && d.prefs.planReminder);
}
function enablePlanReminders(){
  const d = dataFor(currentUser);
  if(typeof window === 'undefined' || !('Notification' in window)){
    toast('Este navegador no admite notificaciones locales.', 'error');
    return;
  }
  window.Notification.requestPermission().then(permission => {
    d.prefs.planReminder = permission === 'granted';
    saveDB();
    toast(permission === 'granted' ? 'Recordatorios activados: aviso local al abrir la app el día planificado.' : 'Sin permiso de notificaciones: no se activan los avisos.', permission === 'granted' ? 'info' : 'error');
    render();
  }).catch(() => toast('No se pudo pedir permiso de notificaciones.', 'error'));
}
function maybePlanReminder(){
  if(!currentUser || !planReminderEnabled()) return;
  if(typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return;
  const today = todayISO();
  const key = 'dt_plan_notified_' + currentUser + '_' + today;
  try { if(localStorage.getItem(key)) return; } catch (e) { return; }
  const next = PL.upcoming(dataFor(currentUser), 1)[0];
  if(!next || next.entry.date !== today) return;
  try {
    new window.Notification('DrakoTrack — hoy toca entrenar', { body: next.entry.workoutName || 'Entrenamiento planificado', tag: 'dt-plan-' + today });
    localStorage.setItem(key, '1');
  } catch (e) { /* notificaciones bloqueadas por el sistema */ }
}
const PLAN_TABS = [{ id:'week', label:'Semana' }, { id:'month', label:'Mes' }, { id:'programs', label:'Programas' }];

/* ============================================================
   Prompt 7 — Dashboard avanzado y analíticas (interfaz)
   La lógica vive en analytics.js (AN). Aquí solo se pinta, se
   eligen períodos y se guardan las preferencias en d.prefs.dashboard,
   que viaja en el perfil sincronizado como el resto de prefs.
   ============================================================ */
function anaState(){
  if(!state.ana) state.ana = { period: null, custom: { from: '', to: '' }, exerciseKey: null, compareKey: '', compare: 'month', config: false, focus: null, group: null };
  if(!state.ana.custom) state.ana.custom = { from: '', to: '' };
  return state.ana;
}
function anaConfig(d){
  return AN.normalizeConfig(d && d.prefs ? d.prefs.dashboard : null);
}
function anaSaveConfig(d, cfg){
  if(!d.prefs) d.prefs = {};
  d.prefs.dashboard = AN.normalizeConfig(cfg);
  saveDB();
  return d.prefs.dashboard;
}
function anaGroupsOf(d){
  return key => muscleBreakdownForKey(key, d);
}
function anaOpts(d, preset, extra){
  const opts = {
    preset: preset || 'month',
    now: todayISO(),
    PG: PG,
    PL: PL,
    resolve: name => resolveExerciseId(name, d),
  };
  if(MUSCLE_DICT_STATE === 'ready') opts.groupsOf = anaGroupsOf(d);
  return Object.assign(opts, extra || {});
}
function anaCardHTML(c){
  const cmp = c.comparable && c.comparison
    ? '<span class="ana-kpi-cmp ' + (c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : 'flat') + '">' + esc(c.comparison) + '</span>'
    : '';
  return '<button type="button" class="ana-kpi" data-action="ana-open" data-card="' + esc(c.id) + '">'
    + '<span class="ana-kpi-label">' + esc(c.label) + '</span>'
    + '<span class="ana-kpi-value">' + esc(c.display) + '</span>'
    + '<span class="ana-kpi-period">' + esc(c.period) + '</span>'
    + cmp + '</button>';
}
function anaKpisHTML(a, cfg){
  const list = AN.visibleCards(a.cards, cfg);
  return '<div class="ana-kpis">' + (list.length ? list.map(anaCardHTML).join('') : '<div class="empty-state">Todos los indicadores están ocultos. Restaura la configuración para verlos.</div>') + '</div>';
}
function anaDeltaHTML(delta, pct, unit){
  if(delta == null) return '<span class="ana-muted">—</span>';
  const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const sign = delta > 0 ? '+' : '';
  return '<span class="ana-delta ' + cls + '">' + sign + AN.formatKg(delta) + ' ' + esc(unit || '') + (pct == null ? '' : ' · ' + sign + pct + ' %') + '</span>';
}
function anaFocusHTML(a, ana){
  if(!ana.focus) return '';
  const c = a.cards.find(x => x.id === ana.focus);
  if(!c) return '';
  return '<section class="ana-focus" id="ana-focus"><div class="section-head"><h2>' + esc(c.label) + '</h2><button type="button" class="icon-btn" data-action="ana-focus-clear" aria-label="Cerrar detalle">✕</button></div>'
    + '<p class="ana-focus-value">' + esc(c.display) + ' <span class="muted small">' + esc(c.period) + '</span></p>'
    + (c.comparable && c.comparison ? '<p class="muted small">' + esc(c.comparison) + '</p>' : '')
    + (c.hint ? '<p class="muted small">' + esc(c.hint) + '</p>' : '')
    + '</section>';
}
function anaInsightsHTML(a){
  if(!a.insights.length) return '';
  return '<section class="ana-sec"><div class="section-head"><h2>Resumen del período</h2><span class="muted">' + esc(a.range.label) + '</span></div>'
    + '<ul class="ana-insights">' + a.insights.map(i => '<li><span class="ana-fact">Hecho</span> ' + esc(i.text) + '</li>').join('') + '</ul>'
    + '<p class="muted small">Solo se describen datos registrados. No se atribuyen causas ni se hacen recomendaciones médicas o de carga.</p></section>';
}
function anaCompareHTML(a, ana, d){
  const cmp = ana.compare || 'month';
  const range = AN.rangeFor(cmp, { now: todayISO() });
  const exList = a.strength.exercises.map(s => '<option value="' + esc(s.key) + '"' + (s.key === ana.compareKey ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
  const table = AN.comparePeriods(d, PG, name => resolveExerciseId(name, d), { range, exerciseKey: ana.compareKey || null });
  return '<section class="ana-sec"><div class="section-head"><h2>Comparaciones</h2><span class="muted">' + esc(range.label) + ' frente a ' + esc(range.prevLabel || '—') + '</span></div>'
    + '<div class="ana-controls"><label class="field"><span>Período</span><select id="ana-compare">'
    + ['week', 'month', '30', '90'].map(id => '<option value="' + id + '"' + (id === cmp ? ' selected' : '') + '>' + esc((AN.PERIODS.find(p => p.id === id) || {}).label || id) + '</option>').join('')
    + '</select></label><label class="field"><span>Ejercicio (opcional)</span><select id="ana-compare-ex"><option value="">—</option>' + exList + '</select></label></div>'
    + '<div class="ana-table ana-cmp-table"><div class="ana-row ana-head"><span>Indicador</span><span>Este período</span><span>Anterior</span><span>Variación</span></div>'
    + table.rows.map(r => '<div class="ana-row"><span>' + esc(r.label) + '</span><span>' + (r.current == null ? '—' : esc(AN.formatKg(r.current))) + ' ' + esc(r.unit) + '</span><span>' + (r.previous == null ? '—' : esc(AN.formatKg(r.previous))) + ' ' + esc(r.unit) + '</span><span>' + (r.comparable ? anaDeltaHTML(r.delta, r.pct, r.unit) : '<span class="ana-muted">Faltan datos</span>') + '</span></div>').join('')
    + '</div><p class="muted small">' + esc(table.note) + '</p></section>';
}
function anaConsistencyHTML(a){
  const c = a.consistency;
  return '<section class="ana-sec"><div class="section-head"><h2>Consistencia</h2><span class="muted">' + esc(a.range.label) + '</span></div>'
    + '<div class="stats-grid small five">'
    + '<div class="stat-card"><p class="stat-value">' + c.daysTrained + '</p><p class="stat-label">Días entrenados</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + c.avgWeekly + '</p><p class="stat-label">Sesiones/semana (4 sem.)</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (c.plan.compliance == null ? '—' : c.plan.compliance + ' %') + '</p><p class="stat-label">Cumplimiento del plan</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + c.streaks.current + '</p><p class="stat-label">Semanas de racha</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + c.streaks.best + '</p><p class="stat-label">Mejor racha</p></div>'
    + '</div>'
    + '<div class="ana-split"><div class="chart-card"><div class="section-head"><h3>Días por semana</h3><span class="muted">12 semanas</span></div><div id="ana-weekdays" class="chart"></div></div>'
    + '<div class="chart-card"><div class="section-head"><h3>Días de la semana</h3><span class="muted">Frecuencia en el período</span></div><div id="ana-dow" class="chart"></div></div></div>'
    + '<div class="ana-plan-summary"><span>Planificados: <b>' + c.plan.planned + '</b></span><span>Hechos: <b>' + c.plan.done + '</b></span><span>Omitidos: <b>' + c.plan.missed + '</b></span><span>Descansos: <b>' + c.plan.rest + '</b></span><span>Próximos: <b>' + c.plan.upcoming + '</b></span></div>'
    + '<p class="muted small">Racha: ' + esc(c.streaks.definition) + ' La semana en curso no la corta si todavía no entrenaste. Los días de descanso planificados no cuentan como incumplimiento y una sesión por día no se cuenta dos veces.</p></section>';
}
function anaVolumeHTML(a){
  const v = a.volume;
  const rows = v.byExercise.slice(0, 12).map(x => '<div class="ana-row"><span>' + esc(x.name) + '<br><span class="muted small">' + esc(x.muscleGroups && x.muscleGroups.length ? x.muscleGroups.map(g => groupLabel(g)).join(' · ') : 'Sin clasificar') + '</span></span><span>' + AN.formatKg(x.volume) + ' kg</span><span>' + x.sets + ' series</span><span>' + x.sessions + ' ses.</span></div>').join('');
  return '<section class="ana-sec"><div class="section-head"><h2>Volumen</h2><span class="muted">Solo peso externo × repeticiones</span></div>'
    + '<div class="stats-grid small five">'
    + '<div class="stat-card"><p class="stat-value">' + AN.formatKg(v.total) + ' kg</p><p class="stat-label">Total del período</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + AN.formatKg(v.prevTotal) + ' kg</p><p class="stat-label">Período anterior</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (v.pct == null ? '—' : (v.pct > 0 ? '+' : '') + v.pct + ' %') + '</p><p class="stat-label">Variación</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (v.avgPerSession == null ? '—' : AN.formatKg(v.avgPerSession) + ' kg') + '</p><p class="stat-label">Media por sesión</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + v.bodyweightSets + '</p><p class="stat-label">Series sin peso externo</p></div>'
    + '</div>'
    + '<div class="chart-card"><div class="section-head"><h3>Evolución semanal</h3><span class="muted">kg levantados</span></div><div id="ana-volume-week" class="chart"></div></div>'
    + '<div class="ana-table"><div class="ana-row ana-head"><span>Ejercicio</span><span>Volumen</span><span>Series</span><span>Sesiones</span></div>' + (rows || '<div class="empty-state">Sin volumen en este período.</div>') + '</div>'
    + '<p class="muted small">Las series de peso corporal o asistidas se cuentan aparte y no se suman como kilos: mezclar magnitudes daría cifras infladas. Más volumen no significa automáticamente mejor rendimiento.</p></section>';
}
function anaStrengthHTML(a, ana){
  const s = a.strength;
  const focus = s.focus || (s.exercises[0] || null);
  const select = s.exercises.length ? '<label class="field"><span>Ejercicio</span><select id="ana-ex">' + s.exercises.map(x => '<option value="' + esc(x.key) + '"' + (focus && x.key === focus.key ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' : '';
  const list = (title, items, cls) => items.length ? '<div class="ana-list"><h4>' + esc(title) + '</h4>' + items.slice(0, 8).map(x => '<div class="ana-list-row"><span>' + esc(x.name) + '</span><span class="ana-delta ' + cls + '">' + (x.status === 'up' ? '+' : x.status === 'down' ? '' : '') + (x.delta ? AN.formatKg(x.delta) + ' kg' : x.sessions + ' sesiones') + '</span></div>').join('') + '</div>' : '';
  return '<section class="ana-sec"><div class="section-head"><h2>Fuerza y rendimiento</h2><span class="muted">' + esc(a.range.label) + '</span></div>'
    + (select || '<div class="empty-state">Todavía no hay ejercicios con series efectivas.</div>')
    + (focus ? '<div class="ana-focus-line">' + esc(focus.name) + ': ' + (focus.bestWeight ? 'mejor peso ' + AN.formatKg(focus.bestWeight) + ' kg' : 'sin peso externo') + ' · ' + (focus.bestE1rm ? '1RM estimado ' + AN.formatKg(focus.bestE1rm) + ' kg' : '1RM no estimable') + ' · ' + focus.sessions + ' sesión(es)</div>'
      + '<div class="ana-split"><div class="chart-card"><div class="section-head"><h3>Peso por sesión</h3><span class="muted">Mejor serie</span></div><div id="ana-ex-weight" class="chart"></div></div>'
      + '<div class="chart-card"><div class="section-head"><h3>1RM estimado</h3><span class="muted">Epley, no una marca real</span></div><div id="ana-ex-e1rm" class="chart"></div></div></div>'
      + '<p class="muted small">' + esc(s.note) + '</p>' : '')
    + '<div class="ana-split three">' + list('Progresión positiva', s.positive, 'up') + list('Sin cambios relevantes', s.stable, 'flat') + list('Disminución', s.declining, 'down') + '</div>'
    + (s.prs.length ? '<div class="ana-list"><h4>Récords del período</h4>' + s.prs.slice(0, 8).map(p => '<div class="ana-list-row"><span>' + esc(p.label || p.key) + '</span><span class="muted">' + esc(p.date) + '</span></div>').join('') + '</div>' : '')
    + '</section>';
}
function anaMusclesHTML(a, ana){
  const g = a.muscles;
  const dictStatus = MUSCLE_DICT_STATE === 'error'
    ? '<div class="ana-warn" role="status"><b>Diccionario muscular no disponible.</b> No se pudo cargar la clasificación publicada; los ejercicios no se reparten entre grupos. <button class="btn btn-ghost btn-sm" type="button" data-action="muscle-retry">Reintentar</button></div>'
    : (MUSCLE_DICT_STATE === 'idle' || MUSCLE_DICT_STATE === 'loading')
      ? '<div class="ana-warn" role="status">Cargando el diccionario muscular publicado…</div>'
      : '';
  if(dictStatus){
    return '<section class="ana-sec"><div class="section-head"><h2>Grupos musculares</h2><span class="muted">Diccionario muscular</span></div>' + dictStatus + '</section>';
  }
  const max = Math.max.apply(null, g.groups.map(x => x.volume).concat([1]));
  const chosen = ana.group && g.groups.find(x => x.id === ana.group);
  const bars = g.groups.map(x => '<button type="button" class="ana-bar-row' + (ana.group === x.id ? ' is-active' : '') + '" data-action="ana-group" data-group="' + esc(x.id) + '"><span>' + esc(groupLabel(x.id)) + '</span><span class="ana-bar"><i style="width:' + Math.round(x.volume / max * 100) + '%"></i></span><span>' + AN.formatKg(x.volume) + ' kg · ' + x.sessions + ' ses.</span></button>').join('');
  const detail = chosen ? '<div class="ana-table"><div class="ana-row ana-head"><span>Ejercicio</span><span>Volumen</span><span>Series</span><span>Sesiones</span></div>'
    + a.volume.byExercise.filter(x => (x.muscleGroups || []).includes(chosen.id) || x.group === chosen.id).map(x => '<div class="ana-row"><span>' + esc(x.name) + '</span><span>' + AN.formatKg(x.volume) + ' kg</span><span>' + x.sets + '</span><span>' + x.sessions + '</span></div>').join('') + '</div>' : '';
  return '<section class="ana-sec"><div class="section-head"><h2>Grupos musculares</h2><span class="muted">' + (g.classifiedPct == null ? 'Sin datos clasificados' : g.classifiedPct + ' % del volumen clasificado') + '</span></div>'
    + (bars || '<div class="empty-state">Los ejercicios de este período no tienen grupo muscular asignado.</div>')
    + (detail || '')
    + (g.unclassified.exercises.length ? '<div class="ana-warn"><b>Sin clasificar:</b> ' + g.unclassified.exercises.slice(0, 8).map(x => esc(x.name)).join(', ') + '. El diccionario muscular no las identifica, así que no se reparten entre grupos.</div>' : '')
    + '<p class="muted small">' + esc(g.note) + '</p></section>';
}
function anaBodyweightHTML(a){
  const b = a.bodyweight;
  return '<section class="ana-sec"><div class="section-head"><h2>Peso corporal</h2><span class="muted">' + esc(a.range.label) + '</span></div>'
    + '<div class="stats-grid small five">'
    + '<div class="stat-card"><p class="stat-value">' + (b.latest ? AN.formatKg(b.latest.weight) + ' kg' : '—') + '</p><p class="stat-label">Último del período</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (b.first ? AN.formatKg(b.first.weight) + ' kg' : '—') + '</p><p class="stat-label">Primero del período</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (b.change == null ? '—' : (b.change > 0 ? '+' : '') + AN.formatKg(b.change) + ' kg') + '</p><p class="stat-label">Cambio en el período</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (b.weekAvg == null ? '—' : AN.formatKg(b.weekAvg) + ' kg') + '</p><p class="stat-label">Media últimos 7 días</p></div>'
    + '<div class="stat-card"><p class="stat-value">' + (b.rangeAvg == null ? '—' : AN.formatKg(b.rangeAvg) + ' kg') + '</p><p class="stat-label">Media del período</p></div>'
    + '</div>'
    + '<div class="chart-card"><div class="section-head"><h3>Evolución</h3><span class="muted">Una medición por día</span></div><div id="ana-bw" class="chart"></div></div>'
    + '<p class="muted small">' + esc(b.note) + '</p></section>';
}
function anaProgramsHTML(a){
  const p = a.programs;
  if(!p.count) return '<section class="ana-sec"><div class="section-head"><h2>Programas</h2></div><div class="empty-state">Aún no hay programas. Crea uno en Plan para medir su cumplimiento aquí.</div></section>';
  let html = '<section class="ana-sec"><div class="section-head"><h2>Programas</h2><span class="muted">' + p.count + ' en total</span></div>';
  if(p.active){
    const s = p.active, prog = s.progress || { pct: 0, elapsed: 0, weeks: 0 };
    html += '<div class="ana-program"><div class="section-head"><h3>' + esc(s.program.name) + '</h3><span class="muted">' + (s.program.status === 'active' ? 'Activo' : esc(s.program.status)) + '</span></div>'
      + '<div class="ana-progress"><i style="width:' + Math.max(0, Math.min(100, prog.pct)) + '%"></i></div>'
      + '<p class="muted small">Semana ' + prog.elapsed + ' de ' + prog.weeks + ' · ' + s.done + ' de ' + s.planned + ' entrenamientos planificados hechos' + (s.compliance == null ? '' : ' · ' + s.compliance + ' % de cumplimiento') + '.</p>'
      + '<div class="ana-plan-summary"><span>Planificados: <b>' + s.planned + '</b></span><span>Hechos: <b>' + s.done + '</b></span><span>Omitidos: <b>' + s.missed + '</b></span><span>Descansos: <b>' + s.rest + '</b></span></div>'
      + (s.goals.length ? '<div class="ana-goals">' + s.goals.map(g => '<div class="ana-goal ' + (g.met ? 'met' : g.verifiable ? 'pending' : 'unknown') + '"><span>' + esc(g.label) + '</span><span>' + esc(String(g.current)) + ' / ' + esc(String(g.target)) + ' ' + esc(g.unit) + '</span><b>' + (g.met ? 'Cumplido' : g.verifiable ? 'Pendiente' : 'Sin datos') + '</b></div>').join('') + '</div>' : '')
      + '</div>';
  } else {
    html += '<div class="empty-state">No hay un programa activo. Puedes consultar el historial de programas abajo.</div>';
  }
  if(p.past.length){
    html += '<div class="ana-table"><div class="ana-row ana-head"><span>Programa</span><span>Estado</span><span>Hechos</span><span>Cumplimiento</span></div>'
      + p.past.map(x => '<div class="ana-row"><span>' + esc(x.program.name) + '</span><span>' + esc(x.program.status) + '</span><span>' + x.done + ' / ' + x.planned + '</span><span>' + (x.compliance == null ? '—' : x.compliance + ' %') + '</span></div>').join('') + '</div>';
  }
  return html + '<p class="muted small">' + esc(p.note) + '</p></section>';
}
function anaConfigHTML(d, a, cfg){
  const rows = cfg.order.map((id, i) => {
    const c = a.cards.find(x => x.id === id);
    return '<div class="ana-config-row"><label class="check-inline"><input type="checkbox" data-action="ana-card" data-card="' + esc(id) + '"' + (cfg.hidden.includes(id) ? '' : ' checked') + '> ' + esc((c && c.label) || id) + '</label>'
      + '<span class="ana-config-move"><button type="button" class="icon-btn" data-action="ana-move" data-card="' + esc(id) + '" data-dir="-1" aria-label="Subir ' + esc((c && c.label) || id) + '">↑</button>'
      + '<button type="button" class="icon-btn" data-action="ana-move" data-card="' + esc(id) + '" data-dir="1" aria-label="Bajar ' + esc((c && c.label) || id) + '">↓</button></span></div>';
  }).join('');
  return '<section class="ana-sec ana-config"><div class="section-head"><h2>Personalizar dashboard</h2><button type="button" class="btn btn-ghost btn-sm" data-action="ana-reset">Restaurar</button></div>'
    + '<p class="muted small">Elige qué tarjetas ver y en qué orden. Se guarda en tu perfil y se sincroniza con el resto de preferencias.</p>'
    + rows
    + '<label class="field"><span>Período predeterminado</span><select id="ana-default-period">'
    + AN.PERIODS.filter(p => p.id !== 'custom').map(p => '<option value="' + p.id + '"' + (cfg.period === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('')
    + '</select></label></section>';
}
function anaPeriodBarHTML(a, ana, cfg){
  const current = ana.period || cfg.period || 'month';
  return '<div class="ana-controls ana-periods">'
    + '<label class="field"><span>Período analizado</span><select id="ana-period">'
    + AN.PERIODS.map(p => '<option value="' + p.id + '"' + (current === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('')
    + '</select></label>'
    + '<div class="ana-custom' + (current === 'custom' ? '' : ' hidden') + '"><label class="field"><span>Desde</span><input type="date" id="ana-from" value="' + esc(ana.custom.from || a.range.from || '') + '"></label>'
    + '<label class="field"><span>Hasta</span><input type="date" id="ana-to" value="' + esc(ana.custom.to || a.range.to || '') + '"></label>'
    + '<button type="button" class="btn btn-ghost btn-sm" data-action="ana-custom-apply">Aplicar</button></div>'
    + '<button type="button" class="btn btn-ghost btn-sm" data-action="ana-config-toggle">' + (ana.config ? 'Cerrar personalización' : 'Personalizar') + '</button>'
    + '</div>';
}
function anaExportHTML(){
  return '<section class="ana-sec"><div class="section-head"><h2>Exportar</h2><span class="muted">Sin credenciales ni datos de acceso</span></div>'
    + '<div class="ana-actions"><button type="button" class="btn btn-primary btn-sm" data-action="ana-export-csv">Descargar CSV</button>'
    + '<button type="button" class="btn btn-ghost btn-sm" data-action="ana-export-json">Descargar JSON</button></div>'
    + '<p class="muted small">El CSV incluye resumen, sesiones, volumen por ejercicio, peso y objetivos del período elegido. El JSON guarda la estructura completa con las notas de cada cálculo. Los indicadores que no puedan calcularse se marcan como «sin datos» en el propio archivo.</p></section>';
}
function anaDownload(file){
  try{
    if(window.DrakoShare && DrakoShare.shareFile){
      DrakoShare.shareFile(file.filename, file.text, file.mime).then(res => toast(res === 'shared' ? 'Archivo compartido.' : 'Archivo descargado.')).catch(() => toast('No se pudo compartir el archivo.', 'error'));
      return;
    }
    const blob = new Blob([file.text], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Archivo descargado.');
  }catch(e){ toast('No se pudo generar el archivo.', 'error'); }
}
function dashboardAnalyticsHTML(d){
  const cfg = anaConfig(d);
  const a = AN.analyze(d, anaOpts(d, cfg.period || 'month'));
  return '<section class="ana-dash">'
    + '<div class="section-head"><h2>Panel de rendimiento</h2><span class="muted">' + esc(a.range.label) + '</span></div>'
    + anaKpisHTML(a, cfg)
    + (a.insights.length ? '<p class="ana-dash-insight">' + esc(a.insights[0].text) + '</p>' : '')
    + '<div class="ana-dash-actions"><button type="button" class="btn btn-primary btn-sm" data-action="tab" data-route="analytics">Ver análisis completo</button>'
    + '<button type="button" class="btn btn-ghost btn-sm" data-action="tab" data-route="plan">Ver plan</button></div></section>';
}
function renderAnalytics(main){
  const d = dataFor(currentUser);
  const ana = anaState();
  const cfg = anaConfig(d);
  const preset = ana.period || cfg.period || 'month';
  const a = AN.analyze(d, anaOpts(d, preset, { custom: ana.custom, exerciseKey: ana.exerciseKey }));
  const opts = anaOpts(d, preset, { custom: ana.custom, exerciseKey: ana.exerciseKey });
  main.innerHTML = '<div class="page-head"><h1>Analíticas</h1><p class="muted">Estadísticas reconstruidas de tus sesiones, récords, peso y programas. Sin datos inventados: cuando no alcanza la evidencia, se indica.</p></div>'
    + anaPeriodBarHTML(a, ana, cfg)
    + (ana.config ? anaConfigHTML(d, a, cfg) : '')
    + anaFocusHTML(a, ana)
    + anaKpisHTML(a, cfg)
    + anaInsightsHTML(a)
    + anaCompareHTML(a, ana, d)
    + anaConsistencyHTML(a)
    + anaVolumeHTML(a)
    + anaStrengthHTML(a, ana)
    + anaMusclesHTML(a, ana)
    + anaBodyweightHTML(a)
    + anaProgramsHTML(a)
    + anaExportHTML();

  const periodEl = $('#ana-period');
  if(periodEl) periodEl.addEventListener('change', () => {
    const st = anaState();
    st.period = periodEl.value;
    render();
  });
  const cmpEl = $('#ana-compare');
  if(cmpEl) cmpEl.addEventListener('change', () => { anaState().compare = cmpEl.value; render(); });
  const cmpEx = $('#ana-compare-ex');
  if(cmpEx) cmpEx.addEventListener('change', () => { anaState().compareKey = cmpEx.value; render(); });
  const exEl = $('#ana-ex');
  if(exEl) exEl.addEventListener('change', () => { anaState().exerciseKey = exEl.value; render(); });
  const defEl = $('#ana-default-period');
  if(defEl) defEl.addEventListener('change', () => {
    const next = anaConfig(d); next.period = defEl.value; anaSaveConfig(d, next); toast('Período predeterminado guardado.'); render();
  });

  /* Gráficas después de insertar el HTML */
  const weekRows = a.consistency.weeks.map(w => ({ label: w.week, value: w.days }));
  barChart($('#ana-weekdays'), weekRows, { unit: 'días', label: 'Días entrenados por semana' });
  const dow = a.consistency.weekday.map((v, i) => ({ label: PL.WEEKDAY_LABELS[i].slice(0, 3), value: v }));
  barChart($('#ana-dow'), dow, { unit: 'sesiones', label: 'Sesiones por día de la semana' });
  const volWeeks = a.volume.weekly.map(b => ({ label: b.key, value: b.volume }));
  lineChart($('#ana-volume-week'), volWeeks, 'Necesitas al menos dos semanas con volumen para ver la evolución.');
  const focus = a.strength.focus || a.strength.exercises[0];
  if(focus){
    lineChart($('#ana-ex-weight'), focus.weight, 'Necesitas al menos dos sesiones con peso para ver la evolución.');
    lineChart($('#ana-ex-e1rm'), focus.e1rm, 'Necesitas dos sesiones con repeticiones válidas (1–12) para estimar el 1RM.');
  }
  lineChart($('#ana-bw'), (a.bodyweight.list || []).map(w => ({ label: w.date, value: w.weight })), 'Necesitas al menos dos mediciones para ver la evolución.');
}
/* Barras verticales con base en cero: no exagera diferencias. */
function barChart(el, data, opts){
  if(!el) return;
  const o = opts || {};
  const unit = o.unit || '';
  const list = (data || []).filter(d => d && isFinite(d.value));
  if(!list.length){ el.innerHTML = '<div class="chart-empty">' + esc(o.empty || 'Aún no hay datos para este gráfico.') + '</div>'; return; }
  const W = 560, H = 210, P = 20;
  const max = Math.max.apply(null, list.map(d => d.value).concat([1]));
  const bw = (W - 2 * P) / list.length;
  const barW = Math.max(4, Math.min(38, bw * 0.62));
  const bars = list.map((d, i) => {
    const x = P + bw * i + (bw - barW) / 2;
    const h = Math.max(d.value > 0 ? 2 : 0, (H - 2 * P) * (d.value / max));
    const y = H - P - h;
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" class="bar"><title>' + esc(d.label + ': ' + d.value + ' ' + unit) + '</title></rect>'
      + (list.length <= 8 ? '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle" class="axis">' + d.value + '</text>' : '');
  }).join('');
  const shortLabel = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d.label)) ? String(d.label).slice(5) : String(d.label);
  const labels = list.map((d, i) => (list.length > 12 && i % 3) ? '' : '<text x="' + (P + bw * i + bw / 2).toFixed(1) + '" y="' + (H - 3) + '" text-anchor="middle" class="axis">' + esc(shortLabel(d)) + '</text>').join('');
  const summary = (o.label || 'Gráfico de barras') + ': ' + list.length + ' valores, máximo ' + max + ' ' + unit + '.';
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="linechart barchart" role="img" aria-label="' + esc(summary) + '">'
    + '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" class="grid"/>'
    + bars + labels + '</svg>';
}
function analyticsAction(action, el){
  const d = currentUser ? dataFor(currentUser) : null;
  if(!d) return false;
  const ana = anaState();
  if(action === 'ana-open'){
    ana.focus = el.dataset.card || null;
    nav('#/analytics');
    return true;
  }
  if(action === 'ana-focus-clear'){ ana.focus = null; render(); return true; }
  if(action === 'ana-config-toggle'){ ana.config = !ana.config; render(); return true; }
  if(action === 'ana-card'){
    const cfg = anaConfig(d);
    const id = el.dataset.card;
    if(!id) return true;
    if(cfg.hidden.includes(id)) cfg.hidden = cfg.hidden.filter(x => x !== id);
    else cfg.hidden = cfg.hidden.concat([id]);
    anaSaveConfig(d, cfg); render(); return true;
  }
  if(action === 'ana-move'){
    const cfg = AN.moveCard(anaConfig(d), el.dataset.card, Number(el.dataset.dir) || 1);
    anaSaveConfig(d, cfg); render(); return true;
  }
  if(action === 'ana-reset'){
    delete d.prefs.dashboard;
    ana.period = null; ana.config = false;
    saveDB(); toast('Dashboard restaurado.', 'info'); render(); return true;
  }
  if(action === 'ana-custom-apply'){
    const from = $('#ana-from') ? $('#ana-from').value : '';
    const to = $('#ana-to') ? $('#ana-to').value : '';
    if(!from || !to){ toast('Elige las dos fechas del período.', 'error'); return true; }
    if(from > to){ toast('La fecha inicial debe ser anterior a la final.', 'error'); return true; }
    ana.custom = { from, to }; ana.period = 'custom'; render(); return true;
  }
  if(action === 'ana-group'){ ana.group = el.dataset.group || null; render(); return true; }
  if(action === 'ana-export-csv' || action === 'ana-export-json'){
    const cfg = anaConfig(d);
    const preset = ana.period || cfg.period || 'month';
    const opts = anaOpts(d, preset, { custom: ana.custom, exerciseKey: ana.exerciseKey });
    const file = action === 'ana-export-csv' ? AN.exportCSV(d, opts) : AN.exportJSON(d, opts);
    anaDownload(file);
    return true;
  }
  return false;
}

/* ============================================================
   Prompt 8 — PWA, offline, cola y estado de sincronización
   ============================================================ */
function isStandaloneApp(){
  try{ return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  catch(e){ return false; }
}
function isIos(){ return /iPad|iPhone|iPod/.test(navigator.userAgent || '') && !window.MSStream; }
function hasUnfinishedSession(){
  if(!currentUser) return false;
  const d = dataFor(currentUser);
  if(state.sessionId){
    const open = (d.sessions || []).find(s => s.id === state.sessionId);
    if(open && !open.finished && open.status !== 'cancelled') return true;
  }
  return (d.sessions || []).some(s => s && !s.finished && s.status !== 'cancelled');
}
function offlineTime(ts){
  if(!ts) return '—';
  try{ return new Date(ts).toLocaleString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return '—'; }
}
function queueStatsSafe(account){
  try{ return account ? opQueue.stats(account) : { pending:0, conflicts:0, permanent:0, confirmed:0, lastConfirmedAt:null, lastError:null }; }
  catch(e){ return { pending:0, conflicts:0, permanent:0, confirmed:0, lastConfirmedAt:null, lastError:null, error:true }; }
}
function enqueueSyncJob(account, st, reason){
  if(!account || !window.Offline) return null;
  try{
    const job = opQueue.enqueue(account, {
      kind: 'sync', target: 'doc', reason: reason || 'local-change',
      revision: st && st.revision != null ? st.revision : 0,
      digest: st && st.digest ? JSON.stringify(st.digest) : '',
    });
    registerBackgroundSync();
    return job;
  }catch(e){ return null; }
}
function beginSyncJob(account){
  try{
    let job = opQueue.next(account);
    if(!job){
      const st = cloudSync.state(account) || {};
      job = enqueueSyncJob(account, st, 'sync');
    }
    return job ? opQueue.begin(job.id) : null;
  }catch(e){ return null; }
}
function finishSyncJob(job, st){
  if(!job || !job.id) return;
  try{
    if(st && Array.isArray(st.conflicts) && st.conflicts.length) opQueue.conflict(job.id);
    else if(st && st.dirty) opQueue.pending(job.id, 'pending-local-changes');
    else opQueue.confirm(job.id);
  }catch(e){}
}
function registerBackgroundSync(){
  try{
    if(typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(reg => {
      if(reg && reg.sync && typeof reg.sync.register === 'function') reg.sync.register('draktrack-sync').catch(() => {});
    }).catch(() => {});
  }catch(e){}
}
function offlinePendingTotal(){
  const stats = queueStatsSafe(currentUser);
  const st = currentUser ? cloudSync.state(currentUser) : null;
  const engineDirty = !!(st && st.dirty);
  return stats.pending + (engineDirty && stats.pending === 0 ? 1 : 0);
}
function renderOfflineBar(){
  const bar = $('#offline-bar');
  if(!bar) return;
  const hide = () => {
    if(bar.__lastHTML === '') return;
    bar.__lastHTML = '';
    bar.className = 'offline-bar hidden';
    bar.innerHTML = '';
  };
  if(!currentUser){ hide(); return; }
  const stats = queueStatsSafe(currentUser);
  const st = cloudSync.state(currentUser) || {};
  const pending = offlinePendingTotal();
  const conflicts = stats.conflicts + ((st.conflicts || []).length && !stats.conflicts ? (st.conflicts || []).length : 0);
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || offlineState.online === false;
  let text = '', tone = '', action = '';
  if(offlineState.storageError){
    text = 'Almacenamiento lleno o no disponible: exporta tus datos antes de seguir.';
    tone = 'is-error';
    action = '<button type="button" class="offline-btn" data-action="sb-export">Exportar</button>';
  } else if(offlineState.updateReady){
    text = hasUnfinishedSession() ? 'Nueva versión lista · termina tu entrenamiento para actualizar.' : 'Nueva versión de DrakoTrack disponible.';
    tone = 'is-update';
    action = '<button type="button" class="offline-btn" data-action="sw-update">' + (hasUnfinishedSession() ? 'Más tarde' : 'Actualizar') + '</button>';
  } else if(offline){
    text = 'Sin conexión · tus cambios se guardan en este dispositivo' + (pending ? ' (' + pending + ')' : '') + '.';
    tone = 'is-offline';
    action = '<button type="button" class="offline-btn" data-action="offline-retry">Reintentar</button>';
  } else if(state.sb.status === 'syncing'){
    text = 'Sincronizando cambios…'; tone = 'is-syncing';
  } else if(conflicts){
    text = conflicts + ' cambio(s) en conflicto entre dispositivos.';
    tone = 'is-error';
    action = '<button type="button" class="offline-btn" data-action="open-sync-conflicts">Revisar</button>';
  } else if(stats.permanent){
    text = 'La sincronización necesita atención: ' + stats.permanent + ' operación(es) no pudieron enviarse.';
    tone = 'is-error';
    action = '<button type="button" class="offline-btn" data-action="offline-retry">Reintentar</button>';
  } else if(pending){
    text = pending + ' cambio(s) pendiente(s) de subir.';
    tone = 'is-pending';
    action = '<button type="button" class="offline-btn" data-action="offline-retry">Sincronizar</button>';
  }
  if(!text){ hide(); return; }
  const html = '<span class="offline-text">' + esc(text) + '</span><span class="offline-actions">' + action
    + '<button type="button" class="offline-btn ghost" data-action="offline-details">Detalles</button></span>';
  /* La barra es una región viva: no se reescribe si el estado no cambió. */
  if(bar.__lastHTML === html && bar.className === 'offline-bar ' + tone) return;
  bar.__lastHTML = html;
  bar.className = 'offline-bar ' + tone;
  bar.innerHTML = html;
}
function markStorageError(result){
  offlineState.storageError = true;
  if(!_storageWarned){
    _storageWarned = true;
    toast(result && result.quota
      ? 'El almacenamiento del navegador está lleno. Exporta tus datos y libera espacio; no se borró nada automáticamente.'
      : 'No se pudo guardar en el almacenamiento de este dispositivo. Exporta tus datos antes de cerrar.', 'error');
  }
  renderOfflineBar();
}
function clearStorageError(){ offlineState.storageError = false; }

async function handleConnectivity(source){
  if(offlineState.checking) return offlineState.checking;
  offlineState.checking = Offline.probe().then(ok => {
    offlineState.online = ok;
    offlineState.lastCheck = Date.now();
    renderOfflineBar();
    if(ok && currentUser && isCloud()){
      try{ opQueue.recover(currentUser); }catch(e){}
      const st = cloudSync.state(currentUser);
      if(st && st.dirty) enqueueSyncJob(currentUser, st, source || 'connectivity');
      runSync(false);
    }
    return ok;
  }).catch(() => false).then(value => { offlineState.checking = null; return value; });
  return offlineState.checking;
}
async function retryOfflineNow(){
  if(!currentUser){ toast('Inicia sesión para sincronizar.', 'info'); return false; }
  const stats = queueStatsSafe(currentUser);
  try{
    opQueue.list(currentUser).forEach(job => {
      if(job.state === 'retry' || job.state === 'permanent' || job.state === 'conflict') opQueue.reopen(job.id);
    });
  }catch(e){}
  const ok = await handleConnectivity('manual');
  if(!ok){ toast('Sigue sin haber conexión con el servidor. Tus datos están guardados aquí.', 'error'); renderOfflineBar(); return false; }
  if(isCloud()){ const done = await runSync(true); renderOfflineBar(); return done; }
  toast(stats.pending ? 'No hay sesión de nube: los cambios quedan en este dispositivo.' : 'Todo guardado en este dispositivo.', 'info');
  renderOfflineBar();
  return true;
}
function offlineSettingsHTML(){
  if(!currentUser) return '';
  const stats = queueStatsSafe(currentUser);
  const st = cloudSync.state(currentUser) || {};
  const cloud = isCloud();
  const pending = offlinePendingTotal();
  const conflicts = stats.conflicts + ((st.conflicts || []).length && !stats.conflicts ? (st.conflicts || []).length : 0);
  const last = state.sb.last || stats.lastConfirmedAt || st.lastSync || null;
  const installBtn = offlineState.installPrompt
    ? '<button type="button" class="btn btn-primary btn-sm" data-action="pwa-install">Instalar DrakoTrack</button>' : '';
  return '<section class="settings-card offline-card">'
    + '<h2>Conexión y sincronización</h2>'
    + '<p class="muted small">Puedes entrenar sin Internet: cada serie se guarda en este dispositivo al instante. Al recuperar la conexión, los cambios pendientes se envían solos y se combinan con los de tus otros dispositivos.</p>'
    + '<div class="offline-grid">'
    + '<div><span class="muted">Conexión</span><b class="' + (offlineState.online ? 'ok-text' : 'warn-text') + '">' + (offlineState.online ? 'En línea' : 'Sin conexión') + '</b></div>'
    + '<div><span class="muted">Cambios pendientes</span><b>' + pending + '</b></div>'
    + '<div><span class="muted">Conflictos</span><b>' + conflicts + '</b></div>'
    + '<div><span class="muted">Última sincronización</span><b>' + esc(offlineTime(last)) + '</b></div>'
    + '<div><span class="muted">Cola persistente</span><b>' + (stats.total ? stats.total + ' operación(es)' : 'Vacía') + '</b></div>'
    + '<div><span class="muted">Modo</span><b>' + (isStandaloneApp() ? 'Instalada' : 'Navegador') + '</b></div>'
    + '</div>'
    + (stats.lastError ? '<p class="muted small">Último aviso: ' + esc(stats.lastError) + '</p>' : '')
    + '<div class="offline-actions">'
    + '<button type="button" class="btn btn-ghost btn-sm" data-action="offline-check">Comprobar conexión</button>'
    + (cloud ? '<button type="button" class="btn btn-ghost btn-sm" data-action="offline-retry">Sincronizar ahora</button>' : '')
    + (stats.confirmed ? '<button type="button" class="btn btn-ghost btn-sm" data-action="offline-clear-confirmed">Limpiar confirmadas</button>' : '')
    + (offlineState.sw ? '<button type="button" class="btn btn-ghost btn-sm" data-action="sw-check">Buscar actualización</button>' : '')
    + (offlineState.sw ? '<button type="button" class="btn btn-ghost btn-sm" data-action="sw-rollback">Rollback de emergencia</button>' : '')
    + installBtn
    + '</div>'
    + (isIos() && !isStandaloneApp() ? '<p class="muted small">En iPhone/iPad: Compartir → Añadir a pantalla de inicio para instalar la app.</p>' : '')
    + (offlineState.sw ? '<p class="muted small">El rollback desregistra el Service Worker y borra solo las cachés de DrakoTrack; entrenamientos, copias y cambios pendientes siguen en este dispositivo. Solo se permite con conexión y sin trabajo abierto.</p>' : '')
    + '<p class="muted small">La cola guarda solo metadatos de sincronización, nunca contraseñas ni tokens. Al cerrar sesión los cambios pendientes se conservan por cuenta y no se mezclan con otra.</p>'
    + '</section>';
}
function offlineAction(action, el){
  if(action === 'offline-retry'){ retryOfflineNow(); return true; }
  if(action === 'offline-details'){ nav('#/settings'); return true; }
  if(action === 'offline-check'){
    handleConnectivity('manual').then(ok => toast(ok ? 'Conexión con el servidor confirmada.' : 'Sin conexión con el servidor. Los datos siguen guardados aquí.', ok ? 'info' : 'error'));
    return true;
  }
  if(action === 'offline-clear-confirmed'){
    try{ opQueue.clearConfirmed(currentUser); toast('Historial de operaciones confirmadas limpiado.', 'info'); }catch(e){}
    renderOfflineBar(); if(parseHash().route === 'settings') render();
    return true;
  }
  if(action === 'pwa-install'){ installPwa(); return true; }
  if(action === 'sw-update'){ applyServiceWorkerUpdate(); return true; }
  if(action === 'sw-rollback'){ openServiceWorkerRollback(); return true; }
  if(action === 'sw-check'){
    if(offlineState.sw && offlineState.sw.update) offlineState.sw.update().then(() => toast('Buscando actualización…', 'info')).catch(() => toast('No se pudo comprobar la actualización.', 'error'));
    else toast('El navegador no permite comprobar actualizaciones desde aquí.', 'info');
    return true;
  }
  return false;
}
async function installPwa(){
  const prompt = offlineState.installPrompt;
  if(!prompt){
    toast(isIos() ? 'En iPhone/iPad, usa Compartir → Añadir a pantalla de inicio.' : 'Para instalar, usa el menú del navegador → Instalar aplicación.', 'info');
    return;
  }
  try{
    prompt.prompt();
    const choice = await prompt.userChoice;
    offlineState.installPrompt = null;
    if(choice && choice.outcome === 'accepted') toast('DrakoTrack instalada.');
    renderOfflineBar();
    if(parseHash().route === 'settings') render();
  }catch(e){ toast('No se pudo abrir la instalación.', 'error'); }
}
function offerServiceWorkerUpdate(){
  if(offlineState.updateReady) return;
  offlineState.updateReady = true;
  renderOfflineBar();
  if(parseHash().route === 'settings') render();
}
function applyServiceWorkerUpdate(){
  const st = currentUser ? (cloudSync.state(currentUser) || {}) : {};
  const stats = currentUser ? queueStatsSafe(currentUser) : { conflicts: 0 };
  const conflicts = stats.conflicts + ((st.conflicts || []).length && !stats.conflicts ? (st.conflicts || []).length : 0);
  const decision = Offline.updateDecision({
    hasActiveSession: hasUnfinishedSession(),
    pending: offlinePendingTotal(),
    conflicts,
  });
  if(decision.defer){
    offlineState.deferredUpdate = true;
    toast(decision.reason === 'active-session'
      ? 'Termina o cierra el entrenamiento activo antes de actualizar. No se perderá nada: se aplicará cuando quieras.'
      : 'Hay cambios pendientes de sincronizar. Sincronízalos antes de actualizar para no arriesgar datos.', 'info');
    return;
  }
  const reg = offlineState.sw;
  if(reg && reg.waiting){ try{ reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }catch(e){} }
  else window.location.reload();
}
/* Rollback de emergencia. Un Service Worker roto puede seguir sirviendo una
   shell inválida aunque la red ya tenga la versión buena. Desregistrar solo
   este ámbito y borrar solo las cachés de DrakoTrack devuelve la app a la red
   sin tocar los datos (localStorage) ni la cola de sincronización. */
function rollbackBlockedMessage(reason){
  if(reason === 'offline') return 'Necesitas conexión para hacer el rollback: si se borra la caché sin red, la app no podría cargar.';
  if(reason === 'active-session') return 'Termina o cierra el entrenamiento activo antes de hacer el rollback.';
  if(reason === 'pending-changes') return 'Sincroniza los cambios pendientes antes de hacer el rollback.';
  if(reason === 'conflicts') return 'Resuelve los conflictos de sincronización antes de hacer el rollback.';
  return 'Ahora no se puede hacer el rollback.';
}
async function rollbackServiceWorker(options){
  const opts = options || {};
  const warn = msg => { if(!opts.silent) toast(msg, 'error'); };
  if(typeof navigator === 'undefined' || !navigator.serviceWorker){
    warn('Este navegador no tiene un Service Worker que restablecer.');
    return false;
  }
  const st = currentUser ? (cloudSync.state(currentUser) || {}) : {};
  const stats = currentUser ? queueStatsSafe(currentUser) : { conflicts: 0 };
  const conflicts = stats.conflicts + ((st.conflicts || []).length && !stats.conflicts ? (st.conflicts || []).length : 0);
  let online = true;
  try{ online = navigator.onLine !== false; }catch(e){}
  if(online && typeof Offline.probe === 'function') online = await Offline.probe().catch(() => false);
  const decision = Offline.rollbackDecision({
    online,
    hasActiveSession: hasUnfinishedSession(),
    pending: offlinePendingTotal(),
    conflicts,
  });
  if(!decision.allow){ warn(rollbackBlockedMessage(decision.reason)); return false; }
  let registrations = [];
  try{
    if(typeof navigator.serviceWorker.getRegistrations === 'function') registrations = await navigator.serviceWorker.getRegistrations();
    if(!Array.isArray(registrations) || !registrations.length){
      const one = typeof navigator.serviceWorker.getRegistration === 'function' ? await navigator.serviceWorker.getRegistration() : null;
      registrations = one ? [one] : [];
    }
  }catch(e){ warn('No se pudo consultar el Service Worker.'); return false; }
  const scope = new URL('./', location.href).href;
  const own = registrations.filter(reg => {
    try{ return !!reg && reg.scope === scope; }catch(e){ return false; }
  });
  if(!own.length){ warn('No se encontró un Service Worker de esta app para desregistrar.'); return false; }
  for(const reg of own){
    let ok = false;
    try{ ok = await reg.unregister(); }catch(e){}
    if(!ok){ warn('El navegador no permitió desregistrar el Service Worker.'); return false; }
  }
  const cleared = await Offline.clearOwnCaches(window.caches, SW_CACHE_PREFIX);
  if(cleared.total && !cleared.ok){ warn('No se pudieron borrar todas las cachés de DrakoTrack. No se recargó la app.'); return false; }
  try{ sessionStorage.setItem(SW_ROLLBACK_KEY, '1'); }catch(e){}
  if(opts.reload === false) return true;
  try{
    const url = new URL(location.href);
    url.searchParams.set('sw_reset', String(Date.now()));
    location.replace(url.href);
  }catch(e){ location.reload(); }
  return true;
}
function openServiceWorkerRollback(){
  confirmModal('¿Hacer rollback del Service Worker?',
    'Se desregistrará el Service Worker de DrakoTrack y se borrarán solo sus cachés. Tus entrenamientos, copias locales y cambios pendientes no se tocan. Después se recargará la app desde la red.',
    'Hacer rollback', () => { closeModal(); rollbackServiceWorker(); });
}
function maybeNotifySwRollback(){
  try{
    if(!sessionStorage.getItem(SW_ROLLBACK_KEY)) return;
    sessionStorage.removeItem(SW_ROLLBACK_KEY);
    const u = new URL(location.href);
    if(u.searchParams.has('sw_reset')){
      u.searchParams.delete('sw_reset');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
    toast('Service Worker restablecido. Tus datos siguen en este dispositivo.', 'info');
  }catch(e){}
}

function setupPwa(){
  if(typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if(location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data || {};
    if(data.type === 'PROCESS_QUEUE') handleConnectivity('sw-message');
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(offlineState.refreshing) return;
    offlineState.refreshing = true;
    window.location.reload();
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    offlineState.installPrompt = event;
    if(parseHash().route === 'settings') render();
  });
  window.addEventListener('appinstalled', () => {
    offlineState.installPrompt = null;
    toast('DrakoTrack instalada. Ya puedes abrirla como una app.');
    renderOfflineBar();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
      offlineState.sw = reg;
      if(reg.waiting && navigator.serviceWorker.controller) offerServiceWorkerUpdate();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if(!worker) return;
        worker.addEventListener('statechange', () => {
          if(worker.state === 'installed' && navigator.serviceWorker.controller) offerServiceWorkerUpdate();
        });
      });
    }).catch(() => {});
  });
}
function setupOffline(){
  if(window.__dtOfflineReady) return;
  window.__dtOfflineReady = true;
  try{ if(currentUser) opQueue.recover(currentUser); }catch(e){}
  renderOfflineBar();
  /* online/offline/visibility/focus se registran una sola vez arriba, junto al
     arranque; aquí solo se sincroniza el estado entre pestañas. */
  window.addEventListener('storage', event => { if(event.key === 'draktrack_offline_v1') renderOfflineBar(); });
}

setupOffline();

/* El diccionario se carga después del primer render para no bloquear el acceso.
   Cuando llega, solo se repinta si la vista actual muestra el mapa. */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => { loadMuscleDictionary(); }, { once: true });
} else {
  setTimeout(loadMuscleDictionary, 0);
}
