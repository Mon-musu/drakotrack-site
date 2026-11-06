/* ============================================================
   DrakoTrack — cálculos de progreso (sin DOM)

   Todo lo de este archivo se deriva del historial existente
   (d.sessions) y del peso corporal (d.weights). No guarda estado
   propio ni crea una fuente de verdad paralela: si se edita o se
   borra una sesión, los récords y las estadísticas se recalculan
   solos. Así la sincronización, las lápidas y los conflictos siguen
   viviendo únicamente en sync.js.

   Reglas de conteo (deliberadamente estrictas):
   - Solo sesiones terminadas y no canceladas.
   - Solo series marcadas como completadas.
   - El calentamiento nunca suma volumen, repeticiones ni récords.
   - El volumen en kg exige peso externo > 0 y repeticiones > 0.
     Los ejercicios a peso corporal (sin peso) y los asistidos no se
     mezclan con el volumen de pesas: suman series y repeticiones,
     pero 0 kg. Inventar un peso corporal daría cifras falsas.
   - El 1RM es una ESTIMACIÓN (Epley) y solo con 1–12 repeticiones
     válidas; nunca se presenta como un levantamiento real.
   ============================================================ */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const MAX_REPS_1RM = 12;

  function num(v){ const n = Number(v); return isFinite(n) ? n : 0; }
  function dayISO(v){ return String(v == null ? '' : v).slice(0, 10); }
  function parseDay(iso){
    const t = Date.parse(dayISO(iso) + 'T00:00:00Z');
    return isFinite(t) ? t : null;
  }
  function round1(v){ return Math.round(num(v) * 10) / 10; }
  function round0(v){ return Math.round(num(v)); }

  /* ¿La sesión cuenta para historial, volumen y récords? */
  function isCountable(s){
    return !!(s && s.finished && s.status !== 'cancelled' && parseDay(s.date) != null);
  }

  function isEffectiveSet(st){
    return !!(st && st.completed && st.type !== 'warmup');
  }

  /* Volumen de una serie: peso × repeticiones, solo con peso externo. */
  function setVolume(st){
    if(!isEffectiveSet(st)) return 0;
    const w = num(st.weight), r = num(st.reps);
    if(!(w > 0) || !(r > 0)) return 0;
    return round1(w * r);
  }

  /* 1RM estimado con Epley: peso × (1 + rep/30). Solo 2–12 repeticiones:
     con 1 repetición la marca real ya es el peso levantado. */
  function estimate1RM(weight, reps){
    const w = num(weight), r = num(reps);
    if(!(w > 0) || !(r > 0)) return 0;
    if(r === 1) return round1(w);
    if(r > MAX_REPS_1RM) return 0;
    return round1(w * (1 + r / 30));
  }

  function exerciseKey(ex, resolve){
    if(!ex) return '';
    const own = ex.exId || ex.exerciseId;
    if(own) return String(own);
    if(typeof resolve === 'function'){
      const id = resolve(ex.name);
      if(id) return String(id);
    }
    return String(ex.name || '').trim().toLowerCase();
  }

  /* Series efectivas de un ejercicio, aceptando el formato heredado
     (sin desglose: un único par peso × repeticiones). */
  function effectiveSets(ex){
    if(!ex) return [];
    if(Array.isArray(ex.sets) && ex.sets.length){
      return ex.sets.filter(isEffectiveSet).map(st => ({
        weight: num(st.weight), reps: num(st.reps),
        volume: setVolume(st), rir: st.rir == null ? null : Number(st.rir),
        rpe: st.rpe == null ? null : Number(st.rpe), type: st.type || 'working',
      }));
    }
    const w = num(ex.weight), r = num(ex.reps);
    if(ex.done && w > 0 && r > 0) return [{ weight: w, reps: r, volume: round1(w * r), rir: null, rpe: null, type: 'legacy' }];
    return [];
  }

  function bestOfSets(sets){
    let best = null;
    sets.forEach(st => {
      if(!(st.weight > 0)) return;
      if(!best || st.weight > best.weight || (st.weight === best.weight && st.reps > best.reps)) best = st;
    });
    return best;
  }

  /* Datos ligeros de una sesión: lo que necesitan historial y gráficas. */
  function sessionLite(s, resolve){
    const out = {
      id: s && s.id, date: dayISO(s && s.date), name: (s && s.workoutName) || 'Sesión',
      status: (s && s.status) || 'completed',
      startedAt: (s && s.startedAt) || null, finishedAt: (s && s.finishedAt) || null,
      durationSec: s && s.durationSec != null ? Number(s.durationSec) : null,
      exercises: [], sets: 0, reps: 0, volume: 0, best: null, e1rm: 0,
      weightedSets: 0, bodyweightSets: 0,
    };
    ((s && s.exercises) || []).forEach(ex => {
      const sets = effectiveSets(ex);
      if(!sets.length) return;
      let volume = 0, reps = 0, weighted = 0, bodyweight = 0;
      sets.forEach(st => {
        reps += st.reps;
        if(st.volume > 0){ volume += st.volume; weighted++; }
        else bodyweight++;
      });
      const best = bestOfSets(sets);
      out.exercises.push({
        key: exerciseKey(ex, resolve), name: ex.name || '',
        sets: sets.length, reps, volume: round1(volume), best,
        e1rm: best ? estimate1RM(best.weight, best.reps) : 0,
      });
      out.sets += sets.length;
      out.reps += reps;
      out.volume += volume;
      out.weightedSets += weighted;
      out.bodyweightSets += bodyweight;
      if(best && (!out.best || best.weight > out.best.weight || (best.weight === out.best.weight && best.reps > out.best.reps))) out.best = best;
      out.e1rm = Math.max(out.e1rm, best ? estimate1RM(best.weight, best.reps) : 0);
    });
    out.volume = round0(out.volume);
    return out;
  }

  function sortAsc(list){
    return list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id || '').localeCompare(String(b.id || '')));
  }

  /* Historial completo (ascendente) de sesiones que cuentan. */
  function history(d, resolve){
    return sortAsc(((d && d.sessions) || []).filter(isCountable).map(s => sessionLite(s, resolve)));
  }

  function exerciseNames(rows){
    const map = new Map();
    rows.forEach(r => (r.exercises || []).forEach(e => { if(e.key && !map.has(e.key)) map.set(e.key, e.name); }));
    return map;
  }

  /* ---------------- Récords personales ---------------- */

  /* Métricas de récord, en orden de presentación. `better` define si un
     valor supera al anterior; `value` es lo que se muestra. */
  const RECORD_METRICS = [
    { key: 'weight', label: 'Mayor peso', unit: 'kg', hint: 'Peso máximo levantado en una serie efectiva.' },
    { key: 'repsAtWeight', label: 'Más repeticiones al peso máximo', unit: 'rep', hint: 'Repeticiones máximas con tu mejor peso.' },
    { key: 'setVolume', label: 'Mayor volumen en una serie', unit: 'kg', hint: 'Peso × repeticiones de una sola serie.' },
    { key: 'sessionVolume', label: 'Mayor volumen en una sesión', unit: 'kg', hint: 'Todo el volumen del ejercicio sumado en un día.' },
    { key: 'e1rm', label: 'Mejor 1RM estimado', unit: 'kg', hint: 'Estimación Epley, no una marca levantada.' },
  ];

  function pushTimeline(list, entry){
    const prev = list[list.length - 1];
    if(prev && !(entry.value > prev.value || (entry.value === prev.value && (entry.reps || 0) > (prev.reps || 0)))) return false;
    list.push(Object.assign({}, entry, { previous: prev ? prev.value : null, previousReps: prev ? prev.reps : null }));
    return true;
  }

  /* Récords de un ejercicio, reconstruidos del historial. */
  function recordsFor(d, resolve, key){
    const rows = history(d, resolve);
    const timeline = { weight: [], repsAtWeight: [], setVolume: [], sessionVolume: [], e1rm: [] };
    let sessions = 0, first = null, last = null, name = '';
    let bestWeight = null, bestRepsAtWeight = null;
    let bestSetVolume = null, bestSessionVolume = null, bestE1rm = null;

    rows.forEach(r => {
      const perSession = { volume: 0, best: null };
      (r.exercises || []).forEach(ex => {
        if(ex.key !== key) return;
        if(!name) name = ex.name;
        perSession.volume += ex.volume;
        (ex.best && (!perSession.best || ex.best.weight > perSession.best.weight || (ex.best.weight === perSession.best.weight && ex.best.reps > perSession.best.reps)))
          && (perSession.best = ex.best);
      });
      if(!perSession.best) return;
      sessions++;
      if(!first) first = r.date;
      last = r.date;

      /* Series individuales: peso, repeticiones y volumen por serie. */
      const raw = (d.sessions || []).find(s => s && s.id === r.id);
      const sets = [];
      ((raw && raw.exercises) || []).forEach(ex => {
        if(exerciseKey(ex, resolve) !== key) return;
        effectiveSets(ex).forEach(st => sets.push(st));
      });

      const best = perSession.best;
      const weightEntry = { value: best.weight, reps: best.reps, date: r.date, sessionId: r.id, sessionName: r.name };
      if(pushTimeline(timeline.weight, weightEntry)) bestWeight = timeline.weight[timeline.weight.length - 1];

      /* Repeticiones al peso máximo: solo compiten contra el mismo peso.
         Hacer 20 repeticiones con 60 kg no supera 8 con 85 kg. */
      const repsAtWeight = sets.filter(st => st.weight === best.weight).reduce((m, st) => Math.max(m, st.reps), 0);
      const prevReps = timeline.repsAtWeight[timeline.repsAtWeight.length - 1];
      if(repsAtWeight > 0 && (!prevReps || best.weight > prevReps.weight || (best.weight === prevReps.weight && repsAtWeight > prevReps.reps))){
        timeline.repsAtWeight.push({ value: repsAtWeight, weight: best.weight, reps: repsAtWeight, date: r.date, sessionId: r.id, sessionName: r.name, previous: prevReps ? prevReps.value : null });
        bestRepsAtWeight = timeline.repsAtWeight[timeline.repsAtWeight.length - 1];
      }

      const topSet = sets.reduce((best2, st) => (!best2 || st.volume > best2.volume) ? st : best2, null);
      if(topSet && topSet.volume > 0){
        const setEntry = { value: topSet.volume, weight: topSet.weight, reps: topSet.reps, date: r.date, sessionId: r.id, sessionName: r.name };
        if(pushTimeline(timeline.setVolume, setEntry)) bestSetVolume = timeline.setVolume[timeline.setVolume.length - 1];
      }

      if(perSession.volume > 0){
        const sessionEntry = { value: round0(perSession.volume), date: r.date, sessionId: r.id, sessionName: r.name };
        if(pushTimeline(timeline.sessionVolume, sessionEntry)) bestSessionVolume = timeline.sessionVolume[timeline.sessionVolume.length - 1];
      }

      const e1 = sets.reduce((m, st) => Math.max(m, estimate1RM(st.weight, st.reps)), 0);
      if(e1 > 0){
        const eEntry = { value: e1, date: r.date, sessionId: r.id, sessionName: r.name, estimated: true };
        if(pushTimeline(timeline.e1rm, eEntry)) bestE1rm = timeline.e1rm[timeline.e1rm.length - 1];
      }
    });

    return {
      key, name: name || key, sessions, first, last,
      bestWeight, bestRepsAtWeight, bestSetVolume, bestSessionVolume, bestE1rm,
      timeline,
      current: bestWeight,
      previous: timeline.weight.length > 1 ? timeline.weight[timeline.weight.length - 2] : null,
    };
  }

  /* Resumen de todos los ejercicios con historial, ordenado por sesiones. */
  function recordSummary(d, resolve){
    const rows = history(d, resolve);
    const names = exerciseNames(rows);
    return [...names.keys()].map(key => recordsFor(d, resolve, key))
      .filter(r => r.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'es'));
  }

  /* Contador de récords vigentes (para el dashboard). */
  function recordCount(d, resolve){
    return recordSummary(d, resolve).reduce((n, r) => n + RECORD_METRICS.filter(m => r[m.key]).length, 0);
  }

  /* ---------------- Series temporales por ejercicio ---------------- */

  const METRIC_LABELS = {
    weight: { label: 'Peso', unit: 'kg' },
    reps: { label: 'Repeticiones', unit: 'rep' },
    volume: { label: 'Volumen', unit: 'kg' },
    e1rm: { label: '1RM estimado', unit: 'kg' },
    frequency: { label: 'Frecuencia', unit: 'sesiones' },
  };

  /* Filas de un ejercicio en cada sesión (ascendente). */
  function exerciseRows(d, resolve, key){
    const out = [];
    history(d, resolve).forEach(r => {
      const found = (r.exercises || []).filter(e => e.key === key);
      if(!found.length) return;
      const sets = found.reduce((n, e) => n + e.sets, 0);
      const reps = found.reduce((n, e) => n + e.reps, 0);
      const volume = found.reduce((n, e) => n + e.volume, 0);
      const best = found.reduce((b, e) => (e.best && (!b || e.best.weight > b.weight || (e.best.weight === b.weight && e.best.reps > b.reps))) ? e.best : b, null);
      out.push({
        sessionId: r.id, date: r.date, name: found[0].name || r.name,
        sets, reps, volume: round0(volume), best,
        e1rm: best ? estimate1RM(best.weight, best.reps) : 0,
      });
    });
    return out;
  }

  function metricValue(row, metric){
    if(metric === 'weight') return row.best ? row.best.weight : 0;
    if(metric === 'reps') return row.reps;
    if(metric === 'volume') return row.volume;
    if(metric === 'e1rm') return row.e1rm;
    if(metric === 'frequency') return 1;
    return 0;
  }

  function inDays(dateISO, days, now){
    if(!days) return true;
    const t = parseDay(dateISO);
    if(t == null) return false;
    const end = now ? new Date(now).setHours(23, 59, 59, 999) : Date.now();
    return t >= end - days * DAY && t <= end;
  }

  function seriesFor(d, resolve, key, opts){
    const o = opts || {};
    const rows = exerciseRows(d, resolve, key).filter(r => inDays(r.date, o.days, o.now));
    return {
      key,
      rows,
      weight: rows.filter(r => r.best).map(r => ({ label: r.date, value: r.best.weight })),
      reps: rows.map(r => ({ label: r.date, value: r.reps })),
      volume: rows.map(r => ({ label: r.date, value: r.volume })),
      e1rm: rows.filter(r => r.e1rm > 0).map(r => ({ label: r.date, value: r.e1rm })),
    };
  }

  /* ---------------- Comparaciones ---------------- */

  /* Umbral de "sin cambio": no llamamos mejora a una diferencia mínima.
     - Peso y 1RM: 0,5 kg o 1 %, lo mayor.
     - Repeticiones y volumen: 2 %. */
  function trendOf(delta, base, metric){
    if(!base){ return delta > 0 ? 'up' : 'flat'; }
    const pct = Math.abs(delta / base) * 100;
    const absTol = (metric === 'weight' || metric === 'e1rm') ? Math.max(0.5, Math.abs(base) * 0.01) : Math.abs(base) * 0.02;
    if(Math.abs(delta) < absTol || pct < (metric === 'weight' || metric === 'e1rm' ? 1 : 2)) return 'flat';
    return delta > 0 ? 'up' : 'down';
  }

  function averageOf(rows, metric){
    const vals = rows.map(r => metricValue(r, metric)).filter(v => v > 0);
    if(!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /* Compara la serie según el modo pedido.
     - 'session': última sesión contra la anterior (misma métrica).
     - 'week' / 'month': media de los últimos 7/30 días contra los 7/30 previos.
     - 'first': primer registro contra el último.
     Devuelve null cuando no hay datos suficientes: la UI lo explica en vez
     de inventar una tendencia. */
  function compare(rows, metric, mode, now){
    const list = (rows || []).filter(r => metricValue(r, metric) > 0);
    if(!list.length) return null;
    const end = now ? new Date(now).setHours(23, 59, 59, 999) : Date.now();
    const mk = (current, base, label) => {
      if(!base && !current) return null;
      const delta = round1(current - base);
      return {
        label, metric, current: round1(current), base: round1(base), delta,
        pct: base ? round0(delta / base * 100) : null,
        trend: !base ? 'up' : trendOf(delta, base, metric),
      };
    };
    if(mode === 'first'){
      if(list.length < 2) return null;
      return mk(metricValue(list[list.length - 1], metric), metricValue(list[0], metric), 'Primer registro contra el último');
    }
    if(mode === 'week' || mode === 'month'){
      const span = mode === 'week' ? 7 : 30;
      const recentFrom = end - span * DAY, prevFrom = end - 2 * span * DAY;
      const within = r => { const t = parseDay(r.date); return t != null && t <= end; };
      const recent = list.filter(r => within(r) && parseDay(r.date) >= recentFrom);
      const prev = list.filter(r => within(r) && parseDay(r.date) >= prevFrom && parseDay(r.date) < recentFrom);
      if(!recent.length || !prev.length) return null;
      return mk(averageOf(recent, metric), averageOf(prev, metric), mode === 'week' ? 'Esta semana contra la anterior' : 'Este mes contra el anterior');
    }
    if(list.length < 2) return null;
    return mk(metricValue(list[list.length - 1], metric), metricValue(list[list.length - 2], metric), 'Última sesión contra la anterior');
  }

  /* Compara la marca más reciente con la última que había hace N días
     (por ejemplo, hace 3 meses). Sin dato en ese punto devuelve null:
     no se extrapola ni se compara con fechas que no existen. */
  function compareSince(rows, metric, days, now){
    const list = (rows || []).filter(r => metricValue(r, metric) > 0)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if(list.length < 2) return null;
    const end = now ? new Date(now).setHours(23, 59, 59, 999) : Date.now();
    const cut = end - days * DAY;
    const latest = list[list.length - 1];
    const base = list.filter(r => { const t = parseDay(r.date); return t != null && t <= cut; }).pop();
    if(!base || base === latest) return null;
    const cur = metricValue(latest, metric), old = metricValue(base, metric);
    const delta = round1(cur - old);
    return {
      label: 'Hace ' + Math.max(1, Math.round(days / 30)) + ' meses contra ahora',
      metric, current: round1(cur), base: round1(old), delta,
      pct: old ? round0(delta / old * 100) : null,
      trend: trendOf(delta, old, metric),
      baseDate: base.date, currentDate: latest.date,
    };
  }

  /* ---------------- Volumen agregado ---------------- */

  function weekKey(iso){
    const t = parseDay(iso);
    if(t == null) return null;
    const d = new Date(t);
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }

  function sumRows(rows){
    return rows.reduce((acc, r) => {
      acc.sessions += 1;
      acc.sets += r.sets;
      acc.reps += r.reps;
      acc.volume += r.volume;
      acc.seconds += r.durationSec || 0;
      return acc;
    }, { sessions: 0, sets: 0, reps: 0, volume: 0, seconds: 0 });
  }

  function volumeSummary(d, resolve, now){
    const rows = history(d, resolve);
    const end = now ? new Date(now).setHours(23, 59, 59, 999) : Date.now();
    const days = n => r => { const t = parseDay(r.date); return t != null && t > end - n * DAY && t <= end; };
    const week = sumRows(rows.filter(days(7)));
    const prevWeek = sumRows(rows.filter(r => { const t = parseDay(r.date); return t != null && t <= end - 7 * DAY && t > end - 14 * DAY; }));
    const month = sumRows(rows.filter(days(30)));
    const prevMonth = sumRows(rows.filter(r => { const t = parseDay(r.date); return t != null && t <= end - 30 * DAY && t > end - 60 * DAY; }));
    return {
      all: sumRows(rows), week, prevWeek, month, prevMonth,
      weekly: buckets(rows, 'week'), monthly: buckets(rows, 'month'),
    };
  }

  /* Volumen agrupado por semana o mes, ascendente. */
  function buckets(rows, kind){
    const map = new Map();
    (rows || []).forEach(r => {
      const key = kind === 'month' ? dayISO(r.date).slice(0, 7) : weekKey(r.date);
      if(!key) return;
      const cur = map.get(key) || { key, sessions: 0, sets: 0, reps: 0, volume: 0 };
      cur.sessions += 1; cur.sets += r.sets; cur.reps += r.reps; cur.volume += r.volume;
      map.set(key, cur);
    });
    return [...map.values()].map(b => Object.assign(b, { volume: round0(b.volume) })).sort((a, b) => a.key.localeCompare(b.key));
  }

  /* ---------------- Peso corporal ---------------- */

  /* Normaliza el historial de peso: una medición por día (la última guardada
     gana) para que un duplicado no distorsione medias ni gráficas. */
  function bodyweight(d){
    const byDay = new Map();
    ((d && d.weights) || []).forEach(w => {
      const day = dayISO(w && w.date);
      const kg = num(w && w.weight);
      if(!day || !(kg > 0)) return;
      byDay.set(day, { id: w.id || null, date: day, weight: round1(kg) });
    });
    const list = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = list.length ? list[list.length - 1] : null;
    const first = list.length ? list[0] : null;
    const changeSince = days => {
      if(!latest) return null;
      const t = parseDay(latest.date);
      const ref = list.filter(w => { const x = parseDay(w.date); return t != null && x != null && x >= t - days * DAY; });
      if(ref.length < 2) return null;
      return round1(latest.weight - ref[0].weight);
    };
    const weekly = bucketsWeight(list, 'week');
    const monthly = bucketsWeight(list, 'month');
    const avgOfKey = (rows, kind) => {
      const b = rows[rows.length - 1];
      return b ? b.avg : null;
    };
    return {
      list, latest, first,
      changeAll: latest && first && list.length > 1 ? round1(latest.weight - first.weight) : null,
      change30: changeSince(30), change90: changeSince(90),
      weekAvg: avgOfKey(weekly, 'week'),
      monthAvg: avgOfKey(monthly, 'month'),
      weekly, monthly,
    };
  }

  function bucketsWeight(list, kind){
    const map = new Map();
    list.forEach(w => {
      const key = kind === 'month' ? w.date.slice(0, 7) : weekKey(w.date);
      if(!key) return;
      const cur = map.get(key) || { key, rows: [] };
      cur.rows.push(w);
      map.set(key, cur);
    });
    return [...map.values()]
      .map(b => ({ key: b.key, n: b.rows.length, avg: round1(b.rows.reduce((a, w) => a + w.weight, 0) / b.rows.length) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /* ---------------- Dashboard ---------------- */

  /* Ejercicios con progresión positiva: la mejor serie de sus últimas
     sesiones sube respecto a las anteriores. Se exige un mínimo de dos
     sesiones en cada ventana para no llamar progreso a la casualidad. */
  function improvingExercises(d, resolve, opts){
    const o = opts || {};
    const minDelta = o.minDelta == null ? 0.5 : o.minDelta;
    const out = [];
    recordSummary(d, resolve).forEach(rec => {
      const rows = exerciseRows(d, resolve, rec.key).filter(r => r.best);
      if(rows.length < 4) return;
      const half = Math.max(2, Math.floor(rows.length / 2));
      const prev = rows.slice(0, half), recent = rows.slice(-half);
      const avg = list => list.reduce((a, r) => a + r.best.weight, 0) / list.length;
      const delta = round1(avg(recent) - avg(prev));
      if(delta >= minDelta) out.push({ key: rec.key, name: rec.name, delta, trend: 'up' });
      else if(delta <= -minDelta) out.push({ key: rec.key, name: rec.name, delta, trend: 'down' });
    });
    return out.sort((a, b) => b.delta - a.delta);
  }

  const PG = {
    DAY, MAX_REPS_1RM, RECORD_METRICS, METRIC_LABELS,
    num, dayISO, parseDay, round1, round0,
    isCountable, isEffectiveSet, setVolume, estimate1RM, exerciseKey, effectiveSets,
    sessionLite, history, recordsFor, recordSummary, recordCount,
    exerciseRows, seriesFor, metricValue, compare, compareSince, trendOf,
    weekKey, volumeSummary, buckets,
    bodyweight, improvingExercises,
  };

  root.PG = PG;
  if(typeof module !== 'undefined' && module.exports) module.exports = PG;
})(typeof window !== 'undefined' ? window : globalThis);
