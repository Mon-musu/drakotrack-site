'use strict';
/* Prueba de contrato del diccionario muscular publicado.
   Sirve el mismo archivo que consume la app, lo pide con ?v=2 y comprueba
   que la respuesta conserva las 612 entradas y que todas sus referencias
   (grupos y patrones) son válidas. */
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const FILE = path.join(ROOT, 'data', 'muscles.json');
const EXPECTED_EXERCISES = 612;
const EXPECTED_GROUPS = 16;
const EXPECTED_PATTERNS = 10;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ok  ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

/* La misma normalización que usan el verificador y la app. */
function normalize(name) {
  let s = String(name || '');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\b(barbell|dumbbells?|cable|machine|ez[-\s]?bar|smith machine|kettlebells?|bands?|bodyweight|landmine|trap bar|hex bar)\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

async function main() {
  check('el diccionario publicado existe en data/muscles.json', fs.existsSync(FILE));
  const source = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  /* Se sirve como en producción: misma ruta, misma query de versión. */
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/data/muscles.json') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const body = fs.readFileSync(FILE);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    });
    res.end(body);
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', err => err ? reject(err) : resolve()));

  let response, data;
  try {
    const { port } = server.address();
    response = await fetch(`http://127.0.0.1:${port}/data/muscles.json?v=2`);
    check('el diccionario responde con 200 y la query ?v=2', response.status === 200,
      'HTTP ' + response.status);
    check('la respuesta se declara como JSON', /application\/json/.test(response.headers.get('content-type') || ''),
      response.headers.get('content-type') || 'sin content-type');
    data = await response.json();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  check('la respuesta es el mismo diccionario que el archivo',
    JSON.stringify(data) === JSON.stringify(source));

  const groups = data && typeof data.groups === 'object' ? data.groups : {};
  const patterns = data && typeof data.patterns === 'object' ? data.patterns : {};
  const exercises = data && typeof data.exercises === 'object' ? data.exercises : {};
  const entries = Object.entries(exercises);

  check('conserva exactamente 612 entradas', entries.length === EXPECTED_EXERCISES,
    entries.length + ' entradas');
  check('conserva los 16 grupos musculares', Object.keys(groups).length === EXPECTED_GROUPS,
    Object.keys(groups).length + ' grupos');
  check('conserva los 10 patrones de movimiento', Object.keys(patterns).length === EXPECTED_PATTERNS,
    Object.keys(patterns).length + ' patrones');
  check('la versión publicada es la 3', data.version === 3, 'versión ' + data.version);

  const errors = [];
  for (const [key, entry] of entries) {
    if (key !== normalize(key)) errors.push('clave sin normalizar: ' + key);
    if (!entry || !Array.isArray(entry.primary) || !entry.primary.length) {
      errors.push(key + ': sin músculo primario');
      continue;
    }
    const primary = entry.primary;
    const secondary = Array.isArray(entry.secondary) ? entry.secondary : [];
    const all = primary.concat(secondary);
    for (const id of all) {
      if (!groups[id]) errors.push(key + ': grupo inexistente ' + id);
    }
    if (new Set(all).size !== all.length) errors.push(key + ': grupo repetido');
    if (!patterns[entry.pattern]) errors.push(key + ': patrón inexistente ' + entry.pattern);
  }
  check('todas las entradas apuntan a grupos y patrones publicados', errors.length === 0,
    errors.slice(0, 5).join('; '));

  const bench = exercises['press de banca'];
  check('la clasificación de press de banca responde como se publicó',
    !!bench && bench.primary.join(',') === 'pecho'
    && (bench.secondary || []).includes('triceps') && (bench.secondary || []).includes('hombros'));
  const squat = exercises['sentadilla trasera'];
  check('la clasificación de sentadilla trasera responde como se publicó',
    !!squat && squat.primary.join(',') === 'cuadriceps'
    && (squat.secondary || []).includes('gluteos'));

  const nuevos = {
    'press declinado': 'pecho',
    'aperturas con': 'pecho',
    'fondos en banco': 'triceps',
    'thruster': 'cuadriceps',
    'burpee': 'cuadriceps',
  };
  const faltan = Object.keys(nuevos).filter(k => !exercises[k] || exercises[k].primary[0] !== nuevos[k]);
  check('los ejercicios que antes quedaban sin clasificar ya tienen primario', faltan.length === 0,
    faltan.join(', '));

  console.log('\npassed: ' + pass + ' failed: ' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(error => {
  console.error('ERROR en la prueba del diccionario muscular:', error);
  process.exit(1);
});
