'use strict';
/* ============================================================
   DrakoTrack — Programas Boostcamp
   Carga el catálogo y los programas extraídos de boostcamp.app.
   Primero intenta los archivos locales /programs/ (mismo origen);
   si no existen en este despliegue, usa la copia pública en
   Supabase Storage (mismos datos, respaldo en la nube).
   ============================================================ */
window.DrakoBC = (function () {
  const cache = { catalog: null, programs: {} };
  const ASSETS = 'https://rxamdcgcpjzfeygxeukj.supabase.co/storage/v1/object/public/drakotrack-assets/';

  async function fetchJSON(url) {
    let r = await fetch(url, { credentials: 'same-origin' });
    if(!r.ok){
      /* fallback: copia pública en Supabase Storage */
      r = await fetch(ASSETS + url.replace(/^\//, ''));
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function catalog() {
    if (cache.catalog) return cache.catalog;
    try { cache.catalog = await fetchJSON('programs/index.json?v=2'); }
    catch (e) { cache.catalog = []; }
    return cache.catalog;
  }

  async function program(slug) {
    if (cache.programs[slug]) return cache.programs[slug];
    const p = await fetchJSON('programs/' + encodeURIComponent(slug) + '.json?v=1');
    cache.programs[slug] = p;
    return p;
  }

  /* Etiqueta legible de una fila de serie:
     "8@65%"  -> "8×65%"   |  "3-5@9rpe" -> "3-5 @RPE9"
     "45s"    -> "45s"     |  "AMRAP"    -> "AMRAP"            */
  function setLabel(row) {
    let s = String(row == null ? '' : row).trim();
    if (!s) return '?';
    let m = s.match(/^([0-9.]+)@([0-9.]+)%$/);
    if (m) return m[1] + '×' + m[2] + '%';
    m = s.match(/^([0-9a-zA-Z.+-]+)@([0-9.]+)rpe$/);
    if (m) return m[1] + '@RPE' + m[2];
    m = s.match(/^([0-9a-zA-Z.+-]+)@([0-9.]+)1rm$/);
    if (m) return m[1] + '@' + m[2] + 'RM';
    return s.replace(/rpe$/i, ' RPE').replace(/1rm$/i, ' RM');
  }
  function rowsLabel(joined) {
    return String(joined).split('|').map(setLabel).join(' · ');
  }
  function rowsCount(joined) {
    return String(joined).split('|').length;
  }

  function dayTitle(d, idx) {
    return (typeof d.n === 'string' && d.n.trim()) || (typeof d.t === 'string' && d.t.trim()) || ('Día ' + (idx + 1));
  }
  /* Nombre corto de sesión a partir del título del día (línea 1 del tooltip) */
  function shortDayTitle(d, idx) {
    const t = dayTitle(d, idx);
    return t.length > 42 ? t.slice(0, 40) + '…' : t;
  }

  /* Construye un "workout" compatible con el resto de la app a partir de
     program + variation + week + day. Solo se usa al arrancar la sesión:
     la sesión guarda su propia copia de los ejercicios. */
  function buildWorkout(p, slug, vi, wi, di) {
    const v = p.vars[vi];
    const w = v.weeks[wi];
    const d = w.d[di];
    const name = p.title + (v.v ? ' · ' + v.v : '') + ' — ' + dayTitle(d, di);
    const exercises = d.ex.map((row, k) => ({
      id: 'bce-' + vi + '-' + wi + '-' + di + '-' + k,
      name: row[0],
      sets: rowsCount(row[1]),
      reps: 0,
      weight: 0,
      target: rowsLabel(row[1]),
    }));
    return { id: 'bc:' + slug + ':' + vi + ':' + wi + ':' + di, name, exercises, bc: true };
  }

  return { catalog, program, setLabel, rowsLabel, rowsCount, dayTitle, shortDayTitle, buildWorkout };
})();
