#!/usr/bin/env node
/* ============================================================
   DrakoTrack — cobertura del diccionario muscular

   Comprueba que data/muscles.json es válido y mide qué parte del
   catálogo real de ejercicios queda clasificada.

   Fuentes que se miden:
   - programas/*.json  → cada aparición de un ejercicio en un día
   - app.js (LIBRARY)  → los ejercicios de la biblioteca local

   Uso:
     node scripts/muscle-coverage.mjs
     node scripts/muscle-coverage.mjs --json   (solo el resumen)

   Sale con código 1 si el diccionario no es válido: sirve como
   base de la prueba automática de la fase del mapa muscular.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICT_PATH = path.join(ROOT, 'data', 'muscles.json');

/* Misma normalización que usará la app: si cambia aquí, debe cambiar
   el test que la fija. */
function normalize(name) {
  let s = String(name || '');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\b(barbell|dumbbells?|cable|machine|ez[-\s]?bar|smith machine|kettlebells?|bands?|bodyweight|landmine|trap bar|hex bar)\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/* Nombres que no son ejercicios de fuerza: cardio, movilidad, estiramientos,
   calentamiento, descanso o marcadores genéricos del programa. Se excluyen del
   cálculo "solo fuerza" para no mezclar peras con manzanas. */
const NON_STRENGTH = /\b(cardio|run|jog|jumping jacks?|jump rope|burpees?|shadow boxing|intervals?|conditioning|circuit|stretch|mobility|mobil|warmup|warm up|prep|breathing|rest|optional|autonomy|variation|hip openers|splits|pancake|cat cow|couch|thoracic|shoulder warmup|yuri|gmb|knee hugs|arm circle|butt kicks|shuffle|pogo|skaters?|march|walking knee|swing|clean|snatch|dead hang|skin the cat|rice bucket|deep breathing|rolling|walkout|sky reaches|progression|level \d|support hold|hang)\b/i;

function loadDictionary() {
  const raw = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
  const errors = [];
  const groups = raw.groups || {};
  const patterns = raw.patterns || {};
  const exercises = raw.exercises || {};

  if (!Object.keys(groups).length) errors.push('faltan los grupos musculares');
  if (!Object.keys(patterns).length) errors.push('faltan los patrones de movimiento');

  for (const [key, entry] of Object.entries(exercises)) {
    if (key !== normalize(key)) errors.push(`clave sin normalizar: "${key}"`);
    if (!entry || !Array.isArray(entry.primary) || !entry.primary.length) {
      errors.push(`"${key}" no tiene músculo primario`);
      continue;
    }
    for (const g of [...entry.primary, ...(entry.secondary || [])]) {
      if (!groups[g]) errors.push(`"${key}" usa un grupo inexistente: ${g}`);
    }
    if (entry.primary.some(g => (entry.secondary || []).includes(g))) {
      errors.push(`"${key}" repite un grupo como primario y secundario`);
    }
    if (!patterns[entry.pattern]) errors.push(`"${key}" usa un patrón inexistente: ${entry.pattern}`);
  }

  return { raw, groups, patterns, exercises, errors };
}

function programInstances() {
  const dir = path.join(ROOT, 'programs');
  const counts = new Map();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'ex' && Array.isArray(value)) {
        for (const item of value) {
          const name = Array.isArray(item) ? item[0] : (typeof item === 'string' ? item : null);
          if (!name) continue;
          const norm = normalize(name);
          if (!norm) continue;
          const current = counts.get(norm) || { raw: name, count: 0 };
          current.count += 1;
          counts.set(norm, current);
        }
      } else {
        walk(value);
      }
    }
  }

  for (const file of files) {
    walk(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }
  return counts;
}

function libraryInstances() {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const start = src.indexOf('const LIBRARY = [');
  if (start === -1) return new Map();
  let i = src.indexOf('[', start);
  let depth = 0;
  let end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return new Map();
  const list = new Function('return ' + src.slice(src.indexOf('[', start), end + 1))();
  const counts = new Map();
  for (const workout of list) {
    for (const exercise of workout.exercises || []) {
      const norm = normalize(exercise.name);
      if (!norm) continue;
      const current = counts.get(norm) || { raw: exercise.name, count: 0 };
      current.count += 1;
      counts.set(norm, current);
    }
  }
  return counts;
}

function summarize(counts, exercises) {
  let total = 0;
  let totalStrength = 0;
  let covered = 0;
  let coveredStrength = 0;
  const missing = [];

  for (const [norm, { raw, count }] of counts) {
    total += count;
    const isStrength = !NON_STRENGTH.test(norm);
    if (isStrength) totalStrength += count;
    if (exercises[norm]) {
      covered += count;
      if (isStrength) coveredStrength += count;
    } else {
      missing.push({ norm, raw, count, strength: isStrength });
    }
  }

  missing.sort((a, b) => b.count - a.count);
  return {
    total,
    covered,
    coverage: total ? covered / total : 0,
    totalStrength,
    coveredStrength,
    coverageStrength: totalStrength ? coveredStrength / totalStrength : 0,
    distinct: counts.size,
    distinctCovered: counts.size - missing.length,
    distinctCoverage: counts.size ? (counts.size - missing.length) / counts.size : 0,
    missing,
  };
}

function pct(value) {
  return (value * 100).toFixed(1) + '%';
}

function main() {
  const dict = loadDictionary();
  if (dict.errors.length) {
    console.error('Diccionario inválido:');
    for (const error of dict.errors) console.error('  - ' + error);
    process.exit(1);
  }

  const programs = summarize(programInstances(), dict.exercises);
  const library = summarize(libraryInstances(), dict.exercises);

  if (process.argv.includes('--missing')) {
    for (const item of programs.missing) {
      console.log([item.strength ? 'fuerza' : 'otro', item.count, item.raw, item.norm].join('\t'));
    }
    return;
  }

  const summary = {
    version: dict.raw.version,
    entries: Object.keys(dict.exercises).length,
    groups: Object.keys(dict.groups).length,
    programs: {
      instances: programs.total,
      distinct: programs.distinct,
      coverage: Number(pct(programs.coverage).replace('%', '')),
      coverageStrength: Number(pct(programs.coverageStrength).replace('%', '')),
      distinctCoverage: Number(pct(programs.distinctCoverage).replace('%', '')),
    },
    library: {
      instances: library.total,
      distinct: library.distinct,
      coverage: Number(pct(library.coverage).replace('%', '')),
    },
    topMissing: programs.missing.slice(0, 25).map(m => ({ name: m.raw, count: m.count })),
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('Diccionario muscular v' + dict.raw.version +
    ' — ' + summary.entries + ' ejercicios, ' + summary.groups + ' grupos\n');

  console.log('CATÁLOGO DE PROGRAMAS');
  console.log('  apariciones:            ' + programs.total);
  console.log('  nombres distintos:      ' + programs.distinct);
  console.log('  cobertura por uso:      ' + pct(programs.coverage) +
    '  (' + programs.covered + ' de ' + programs.total + ')');
  console.log('  cobertura solo fuerza:  ' + pct(programs.coverageStrength) +
    '  (' + programs.coveredStrength + ' de ' + programs.totalStrength + ')');
  console.log('  nombres cubiertos:      ' + pct(programs.distinctCoverage) +
    '  (' + programs.distinctCovered + ' de ' + programs.distinct + ')\n');

  console.log('BIBLIOTECA LOCAL (app.js)');
  console.log('  apariciones:            ' + library.total);
  console.log('  nombres distintos:      ' + library.distinct);
  console.log('  cobertura por uso:      ' + pct(library.coverage) + '\n');

  console.log('SIN CLASIFICAR — 25 más usados');
  for (const item of programs.missing.slice(0, 25)) {
    console.log('  ' + String(item.count).padStart(4) + '  ' + item.raw +
      (item.strength ? '' : '   [no es fuerza]'));
  }
  const unclassified = programs.missing.length;
  console.log('\n  nombres sin clasificar: ' + unclassified +
    ' de ' + programs.distinct + ' (' + pct(unclassified / programs.distinct) + ')');
}

main();
