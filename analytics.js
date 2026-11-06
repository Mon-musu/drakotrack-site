/* ============================================================
   DrakoTrack — analíticas de rendimiento (lógica pura)

   Este módulo NO guarda estadísticas: todo se reconstruye desde
   `d.sessions`, `d.weights`, `d.records`, `d.prs`, `d.programs` y
   `d.planner`. La caché es solo memoria del proceso y se invalida
   con una huella de los datos de origen, así que nunca puede quedar
   desincronizada tras editar, borrar o sincronizar una sesión.

   No toca `sync.js` ni escribe en el documento: recibe PG y PL para
   reutilizar los cálculos de los Prompts 5 y 6.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const CARD_IDS = [
    'sessionsWeek', 'sessionsMonth', 'totalTime', 'volumeWeek', 'volumeMonth',
    'streak', 'prs', 'exercises', 'goals', 'bodyweight',
  ];
  const CARD_LABELS = {
    sessionsWeek: 'Entrenamientos de la semana',
    sessionsMonth: 'Entrenamientos del mes',
    totalTime: 'Tiempo total entrenado',
    volumeWeek: 'Volumen semanal',
    volumeMonth: 'Volumen mensual',
    streak: 'Racha de entrenamiento',
    prs: 'Récords en el período',
    exercises: 'Ejercicios registrados',
    goals: 'Objetivos del programa activo',
    bodyweight: 'Peso corporal más reciente',
  };
  const PERIODS = [
    { id: 'week', label: 'Esta semana' },
    { id: 'month', label: 'Este mes' },
    { id: '30', label: 'Últimos 30 días' },
    { id: '90', label: 'Últimos 90 días' },
    { id: '365', label: 'Último año' },
    { id: 'all', label: 'Todo el historial' },
    { id: 'custom', label: 'Período personalizado' },
  ];
  const CARD_PERIODS = ['week', 'month', '30', '90'];

  function dayISO(value) { return String(value == null ? '' : value).slice(0, 10); }
  function parseDay(iso) {
    const t = Date.parse(dayISO(iso) + 'T00:00:00Z');
    return isFinite(t) ? t : null;
  }
  function todayISO(now) { return dayISO(now) || new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) {
    const t = parseDay(iso);
    return t == null ? null : new Date(t + n * DAY).toISOString().slice(0, 10);
  }
  function dayOfWeek(iso) {
    const t = parseDay(iso);
    return t == null ? 0 : (new Date(t).getUTCDay() + 6) % 7;
  }
  function weekStart(iso) {
    const t = parseDay(iso);
    if (t == null) return null;
    return new Date(t - dayOfWeek(iso) * DAY).toISOString().slice(0, 10);
  }
  function monthStart(iso) { return dayISO(iso).slice(0, 7) + '-01'; }
  function monthEnd(iso) {
    const [y, m] = dayISO(iso).slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  function shiftMonth(iso, n) {
    const [y, m] = dayISO(iso).slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  }
  function diffDays(from, to) {
    const a = parseDay(from), b = parseDay(to);
    return a == null || b == null ? 0 : Math.round((b - a) / DAY) + 1;
  }
  function round1(v) { return Math.round((Number(v) || 0) * 10) / 10; }
  function round0(v) { return Math.round(Number(v) || 0); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function sum(list, pick) { return (list || []).reduce((a, x) => a + (Number(pick(x)) || 0), 0); }
  function inRange(dateISO, range) {
    if (!range) return true;
    const d = dayISO(dateISO);
    if (!d) return false;
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  }
  function pctChange(current, previous) {
    if (!(previous > 0)) return null;
    return round1((current - previous) / previous * 100);
  }

  /* ---------------- Rangos y comparaciones ---------------- */

  function rangeFor(preset, opts) {
    const o = opts || {};
    const now = todayISO(o.now);
    const p = CARD_PERIODS.includes(preset) || preset === '365' || preset === 'all' || preset === 'custom' ? preset : 'month';
    if (p === 'all') {
      return {
        key: 'all', label: 'Todo el historial', short: 'Histórico',
        from: null, to: now, days: null,
        prevFrom: null, prevTo: null, prevLabel: null, partial: false,
      };
    }
    if (p === 'custom') {
      let from = dayISO(o.custom && o.custom.from) || addDays(now, -29);
      let to = dayISO(o.custom && o.custom.to) || now;
      if (parseDay(from) > parseDay(to)) { const t = from; from = to; to = t; }
      const span = diffDays(from, to);
      const prevTo = addDays(from, -1);
      return {
        key: 'custom', label: from + ' — ' + to, short: 'Personalizado',
        from, to, days: span,
        prevFrom: addDays(prevTo, -(span - 1)), prevTo, prevLabel: 'Los ' + span + ' días anteriores', partial: false,
      };
    }
    if (p === 'week') {
      const from = weekStart(now);
      const to = addDays(from, 6);
      return {
        key: 'week', label: 'Semana del ' + from, short: 'Esta semana',
        from, to, days: 7,
        prevFrom: addDays(from, -7), prevTo: addDays(from, -1), prevLabel: 'La semana anterior',
        partial: now < to,
      };
    }
    if (p === 'month') {
      const from = monthStart(now);
      const to = monthEnd(now);
      const prevStart = shiftMonth(from, -1) + '-01';
      return {
        key: 'month', label: 'Mes de ' + from.slice(0, 7), short: 'Este mes',
        from, to, days: diffDays(from, to),
        prevFrom: prevStart, prevTo: monthEnd(prevStart), prevLabel: 'El mes anterior',
        partial: now < to,
      };
    }
    const n = Number(p) || 30;
    const to = now;
    const from = addDays(now, -(n - 1));
    const prevTo = addDays(from, -1);
    return {
      key: String(n), label: 'Últimos ' + n + ' días', short: n + ' días',
      from, to, days: n,
      prevFrom: addDays(prevTo, -(n - 1)), prevTo, prevLabel: 'Los ' + n + ' días anteriores',
      partial: false,
    };
  }

  function rangeLabel(range) {
    if (!range) return '';
    if (range.key === 'all') return 'todo el historial';
    return 'del ' + range.from + ' al ' + range.to;
  }

  /* ---------------- Sesiones y rachas ---------------- */

  function rowsIn(rows, range) {
    return (rows || []).filter(r => r && inRange(r.date, range));
  }
  function sessionRows(d, PG, resolve) {
    return PG && PG.history ? PG.history(d, resolve) : [];
  }
  function uniqueDays(rows) {
    return new Set((rows || []).map(r => dayISO(r.date)).filter(Boolean));
  }
  function uniqueWeeks(rows) {
    return new Set((rows || []).map(r => weekStart(r.date)).filter(Boolean));
  }

  /* Racha = semanas consecutivas con al menos una sesión terminada.
     La semana en curso no corta la racha mientras no haya terminado:
     si aún no entrenaste esta semana, se cuenta desde la anterior.
     Documentado también en la interfaz. */
  function streaks(d, PG, resolve, opts) {
    const now = todayISO(opts && opts.now);
    const rows = sessionRows(d, PG, resolve);
    const weeks = [...uniqueWeeks(rows)].sort();
    const currentWeek = weekStart(now);
    let cursor = weeks.includes(currentWeek) ? currentWeek : addDays(currentWeek, -7);
    let current = 0;
    while (weeks.includes(cursor)) { current++; cursor = addDays(cursor, -7); }
    let best = 0, run = 0, prev = null;
    weeks.forEach(w => {
      run = prev && (parseDay(w) - parseDay(prev)) === 7 * DAY ? run + 1 : 1;
      best = Math.max(best, run);
      prev = w;
    });
    return {
      current, best, activeThisWeek: weeks.includes(currentWeek),
      weeks: weeks.length, definition: 'Semanas consecutivas con al menos una sesión terminada.',
    };
  }

  /* Cumplimiento del plan: días de entrenamiento planificados que ya pasaron
     y tienen sesión terminada, sobre planificados que ya pasaron. Los días de
     descanso y los futuros no cuentan ni penalizan. */
  function planStats(d, range, opts) {
    const now = todayISO(opts && opts.now);
    const PL = opts && opts.PL;
    const entries = ((d && d.planner) || []).filter(e => e && inRange(e.date, range));
    const sessions = new Map(((d && d.sessions) || []).filter(Boolean).map(s => [s.id, s]));
    const isDone = e => {
      if (!e.sessionId) return false;
      const s = sessions.get(e.sessionId);
      return !!(s && s.finished && s.status !== 'cancelled');
    };
    const workout = entries.filter(e => e.kind !== 'rest');
    const rest = entries.filter(e => e.kind === 'rest');
    const done = workout.filter(isDone);
    const past = workout.filter(e => dayISO(e.date) < now && !isDone(e));
    const upcoming = workout.filter(e => dayISO(e.date) >= now && !isDone(e));
    return {
      planned: workout.length, done: done.length, missed: past.length,
      rest: rest.length, upcoming: upcoming.length,
      compliance: done.length + past.length ? round0(done.length / (done.length + past.length) * 100) : null,
      hasPlan: entries.length > 0, PL,
    };
  }

  function consistency(d, PG, resolve, opts) {
    const o = opts || {};
    const now = todayISO(o.now);
    const rows = sessionRows(d, PG, resolve);
    const range = o.range || rangeFor('30', { now });
    const inRange = rowsIn(rows, range);
    const days = uniqueDays(inRange);
    const weeks = [];
    const currentWeek = weekStart(now);
    for (let i = 11; i >= 0; i--) {
      const start = addDays(currentWeek, -7 * i);
      const weekRows = rows.filter(r => weekStart(r.date) === start);
      const ps = planStats(d, { from: start, to: addDays(start, 6) }, { now, PL: o.PL });
      weeks.push({
        week: start, days: uniqueDays(weekRows).size, sessions: weekRows.length,
        volume: sum(weekRows, r => r.volume), planned: ps.planned, done: ps.done,
        rest: ps.rest, missed: ps.missed,
      });
    }
    const last28 = rowsIn(rows, { from: addDays(now, -27), to: now });
    const weekday = [0, 0, 0, 0, 0, 0, 0];
    rowsIn(rows, range).forEach(r => { const t = parseDay(r.date); if (t != null) weekday[dayOfWeek(r.date)]++; });
    const plan = planStats(d, range, { now, PL: o.PL });
    return {
      range, weeks, weekday,
      daysTrained: days.size,
      sessions: inRange.length,
      avgWeekly: round1(last28.length / 4),
      plan,
      streaks: streaks(d, PG, resolve, { now }),
      definition: 'Promedio de las últimas 4 semanas. Las semanas consecutivas se cuentan con al menos una sesión terminada.',
    };
  }

  /* ---------------- Volumen ---------------- */

  function volumeAnalysis(d, PG, resolve, groupOf, opts) {
    const o = opts || {};
    const range = o.range || rangeFor('month', { now: o.now });
    const all = sessionRows(d, PG, resolve);
    const rows = rowsIn(all, range);
    const prevRows = o.range && o.range.prevFrom ? rowsIn(all, { from: o.range.prevFrom, to: o.range.prevTo }) : [];
    const total = sum(rows, r => r.volume);
    const prevTotal = sum(prevRows, r => r.volume);
    const byExercise = new Map();
    const noGroup = [];
    rows.forEach(r => (r.exercises || []).forEach(ex => {
      if (!(ex.volume > 0) && !(ex.sets > 0)) return;
      const key = ex.key || ex.name;
      if (!key) return;
      const item = byExercise.get(key) || {
        key, name: ex.name || key, volume: 0, sets: 0, reps: 0,
        sessions: new Set(), group: typeof groupOf === 'function' ? groupOf(key) : '',
      };
      item.volume += ex.volume || 0;
      item.sets += ex.sets || 0;
      item.reps += ex.reps || 0;
      item.sessions.add(r.id);
      byExercise.set(key, item);
    }));
    const exercises = [...byExercise.values()].map(x => Object.assign({}, x, {
      sessions: x.sessions.size, volume: round0(x.volume), reps: round0(x.reps),
    })).sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name, 'es'));

    /* Solo se suman kilos de ejercicios con peso externo (PG.setVolume exige
       peso > 0). Series de peso corporal o asistidas se informan aparte. */
    const bodyweightSets = sum(rows, r => r.bodyweightSets);
    const weightedSets = sum(rows, r => r.weightedSets);
    const groups = new Map();
    exercises.forEach(x => {
      const id = x.group || '';
      if (!id) { noGroup.push(x); return; }
      const g = groups.get(id) || { id, volume: 0, sets: 0, sessions: 0, exercises: [] };
      g.volume += x.volume; g.sets += x.sets; g.sessions += x.sessions;
      g.exercises.push(x.key);
      groups.set(id, g);
    });
    const classifiedVolume = [...groups.values()].reduce((a, g) => a + g.volume, 0);
    return {
      range, total: round0(total), prevTotal: round0(prevTotal),
      delta: round0(total - prevTotal), pct: pctChange(total, prevTotal),
      sets: sum(rows, r => r.sets), reps: sum(rows, r => r.reps),
      weightedSets, bodyweightSets,
      sessions: rows.length,
      avgPerSession: rows.length ? round0(total / rows.length) : null,
      weekly: PG && PG.buckets ? PG.buckets(rows, 'week').filter(b => inRange(b.key, range)) : [],
      monthly: PG && PG.buckets ? PG.buckets(rows, 'month').filter(b => inRange(b.key + '-01', range)) : [],
      byExercise: exercises,
      groups: [...groups.values()].map(g => Object.assign(g, {
        volume: round0(g.volume), pct: classifiedVolume > 0 ? round1(g.volume / classifiedVolume * 100) : null,
      })).sort((a, b) => b.volume - a.volume),
      unclassified: { volume: round0(sum(noGroup, x => x.volume)), exercises: noGroup },
      classifiedPct: total > 0 ? round1(classifiedVolume / total * 100) : null,
      compatible: true,
    };
  }

  /* ---------------- Fuerza ---------------- */

  function strengthFor(d, PG, resolve, key, range) {
    const rows = PG.exerciseRows(d, resolve, key).filter(r => inRange(r.date, range));
    const weight = rows.filter(r => r.best).map(r => ({ label: r.date, value: r.best.weight }));
    const reps = rows.map(r => ({ label: r.date, value: r.reps }));
    const volume = rows.map(r => ({ label: r.date, value: r.volume }));
    const e1rm = rows.filter(r => r.e1rm > 0).map(r => ({ label: r.date, value: r.e1rm }));
    const name = rows.length ? rows[0].name : key;
    const enough = rows.length >= 3;
    let status = 'insufficient', delta = 0, pct = null;
    if (enough) {
      const half = Math.max(2, Math.floor(rows.length / 2));
      const prev = rows.slice(0, half), recent = rows.slice(-half);
      const avg = list => sum(list.filter(r => r.best), r => r.best.weight) / Math.max(1, list.filter(r => r.best).length);
      const a = avg(prev), b = avg(recent);
      delta = round1(b - a);
      pct = pctChange(b, a);
      const trend = PG.trendOf ? PG.trendOf(delta, a, 'weight') : (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
      status = trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'flat';
    }
    return {
      key, name, rows, sessions: rows.length, enough, status, delta, pct,
      weight, reps, volume, e1rm,
      bestWeight: rows.filter(r => r.best).reduce((m, r) => Math.max(m, r.best.weight), 0) || null,
      bestE1rm: rows.reduce((m, r) => Math.max(m, r.e1rm || 0), 0) || null,
      first: rows.length ? rows[0].date : null, last: rows.length ? rows[rows.length - 1].date : null,
    };
  }

  function strengthAnalysis(d, PG, resolve, opts) {
    const o = opts || {};
    const range = o.range || rangeFor('month', { now: o.now });
    const keys = new Map();
    sessionRows(d, PG, resolve).forEach(r => (r.exercises || []).forEach(ex => {
      if (ex.key && !keys.has(ex.key)) keys.set(ex.key, ex.name || ex.key);
    }));
    const list = [...keys.keys()].map(key => strengthFor(d, PG, resolve, key, range))
      .filter(s => s.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'es'));
    const focus = o.exerciseKey && list.find(s => s.key === o.exerciseKey) || null;
    const prs = [];
    const addPr = (key, date, label) => {
      if (!inRange(date, range)) return;
      prs.push({ key, date, label });
    };
    ((d && d.records) || []).forEach(r => { if (r && r.date) addPr(r.exId || r.exercise, r.date, r.exercise || r.exId); });
    ((d && d.prs) || []).forEach(r => { if (r && r.date) addPr(r.exId || r.exercise, r.date, r.exercise || r.exId); });
    return {
      range, exercises: list, focus, prs,
      positive: list.filter(s => s.status === 'up'),
      stable: list.filter(s => s.status === 'flat'),
      declining: list.filter(s => s.status === 'down'),
      insufficient: list.filter(s => s.status === 'insufficient'),
      note: 'La tendencia compara la primera mitad de las sesiones del período con la segunda. Necesita al menos 3 sesiones: una sesión atípica no se interpreta como pérdida de fuerza.',
    };
  }

  function muscleAnalysis(d, PG, resolve, groupOf, opts) {
    const vol = volumeAnalysis(d, PG, resolve, groupOf, opts);
    return {
      range: vol.range, groups: vol.groups, unclassified: vol.unclassified,
      classifiedPct: vol.classifiedPct,
      note: 'Cada ejercicio del catálogo tiene un grupo muscular principal y su volumen se asigna una sola vez a ese grupo. El modelo actual no admite varios grupos por ejercicio, así que no se inventan repartos. Los ejercicios sin grupo aparecen como «Sin clasificar».',
      total: vol.total,
    };
  }

  /* ---------------- Peso corporal ---------------- */

  function bodyweightAnalysis(d, PG, opts) {
    const o = opts || {};
    const range = o.range || rangeFor('month', { now: o.now });
    const bw = PG && PG.bodyweight ? PG.bodyweight(d) : { list: [] };
    const all = bw.list || [];
    const list = all.filter(w => inRange(w.date, range));
    const prev = o.range && o.range.prevFrom ? all.filter(w => inRange(w.date, { from: o.range.prevFrom, to: o.range.prevTo })) : [];
    const avg = xs => xs.length ? round1(sum(xs, x => x.weight) / xs.length) : null;
    const bucketAvg = (xs, kind) => {
      const map = new Map();
      xs.forEach(w => {
        const key = kind === 'month' ? dayISO(w.date).slice(0, 7) : weekStart(w.date);
        if (!key) return;
        const b = map.get(key) || { key, values: [] };
        b.values.push(w.weight);
        map.set(key, b);
      });
      return [...map.values()].map(b => ({ key: b.key, value: round1(sum(b.values, v => v) / b.values.length) }))
        .sort((a, b) => a.key.localeCompare(b.key));
    };
    const first = list.length ? list[0] : null;
    const latest = list.length ? list[list.length - 1] : null;
    const change = first && latest && list.length > 1 ? round1(latest.weight - first.weight) : null;
    const trend = change == null ? 'insufficient' : Math.abs(change) < 0.2 ? 'flat' : change > 0 ? 'up' : 'down';
    return {
      range, list, weekly: bucketAvg(list, 'week'), monthly: bucketAvg(list, 'month'),
      latest, first, change, trend,
      rangeAvg: avg(list), weekAvg: avg(list.filter(w => inRange(w.date, { from: addDays(todayISO(o.now), -6), to: todayISO(o.now) }))),
      prevAvg: avg(prev), prevChange: prev.length > 1 ? round1(prev[prev.length - 1].weight - prev[0].weight) : null,
      note: 'Los cambios de peso se muestran como datos registrados: no indican grasa corporal ni masa muscular, y no se proyectan valores futuros.',
    };
  }

  /* ---------------- Programas ---------------- */

  function programStats(d, PL, program, range, opts) {
    if (!PL || !program) return null;
    const now = todayISO(opts && opts.now);
    const entries = ((d && d.planner) || []).filter(e => e && e.programId === program.id && inRange(e.date, range));
    const sessions = new Map(((d && d.sessions) || []).filter(Boolean).map(s => [s.id, s]));
    const done = e => {
      const s = e && e.sessionId ? sessions.get(e.sessionId) : null;
      return !!(s && s.finished && s.status !== 'cancelled');
    };
    const workout = entries.filter(e => e.kind !== 'rest');
    const doneList = workout.filter(done);
    const missed = workout.filter(e => !done(e) && dayISO(e.date) < now);
    const upcoming = workout.filter(e => !done(e) && dayISO(e.date) >= now);
    const compliance = doneList.length + missed.length ? round0(doneList.length / (doneList.length + missed.length) * 100) : null;
    const goals = PL.evaluateGoals ? PL.evaluateGoals(program, d, opts.PG, { today: now, resolve: opts.resolve }) : [];
    return {
      program, progress: PL.programProgress ? PL.programProgress(program, now) : null,
      planned: workout.length, done: doneList.length, missed: missed.length, upcoming: upcoming.length,
      rest: entries.filter(e => e.kind === 'rest').length,
      compliance, goals,
      goalsMet: goals.filter(g => g.met).length,
      goalsPending: goals.filter(g => !g.met).length,
      goalsUnknown: goals.filter(g => !g.verifiable).length,
    };
  }

  function programAnalysis(d, PL, PG, resolve, range, opts) {
    const programs = (d && d.programs) || [];
    const active = PL && PL.activeProgram ? PL.activeProgram(d) : null;
    return {
      active: active ? programStats(d, PL, active, range, { now: opts && opts.now, PG, resolve }) : null,
      past: programs.filter(p => p.status !== 'active').map(p => programStats(d, PL, p, null, { now: opts && opts.now, PG, resolve })),
      count: programs.length,
      note: 'El cumplimiento solo cuenta días de entrenamiento planificados que ya pasaron; los días de descanso y los futuros no penalizan. Calcular estadísticas no modifica el plan.',
    };
  }

  /* ---------------- Dashboard: tarjetas ---------------- */

  function recordsIn(d, range) {
    const list = [];
    ((d && d.records) || []).forEach(r => { if (r && inRange(r.date, range)) list.push(r); });
    ((d && d.prs) || []).forEach(r => { if (r && inRange(r.date, range)) list.push(r); });
    return list;
  }

  function cards(d, PG, PL, resolve, opts) {
    const o = opts || {};
    const now = todayISO(o.now);
    const range = o.range || rangeFor('month', { now });
    const all = sessionRows(d, PG, resolve);
    const rows = rowsIn(all, range);
    const prevRows = range.prevFrom ? rowsIn(all, { from: range.prevFrom, to: range.prevTo }) : [];
    const week = rangeFor('week', { now });
    const month = rangeFor('month', { now });
    const weekRows = rowsIn(all, week), prevWeek = rowsIn(all, { from: week.prevFrom, to: week.prevTo });
    const monthRows = rowsIn(all, month), prevMonth = rowsIn(all, { from: month.prevFrom, to: month.prevTo });
    const vol = PG.volumeSummary ? PG.volumeSummary(d, resolve, now) : { all: { seconds: 0 } };
    const recs = recordsIn(d, range);
    const prevRecs = range.prevFrom ? recordsIn(d, { from: range.prevFrom, to: range.prevTo }) : [];
    const bw = PG.bodyweight ? PG.bodyweight(d) : { list: [] };
    const bwList = bw.list || [];
    const bwLatest = bwList.length ? bwList[bwList.length - 1] : null;
    const bwPrev = bwList.length > 1 ? bwList[bwList.length - 2] : null;
    const st = streaks(d, PG, resolve, { now });
    const active = PL && PL.activeProgram ? PL.activeProgram(d) : null;
    const goals = active && PL.evaluateGoals ? PL.evaluateGoals(active, d, PG, { today: now, resolve }) : [];
    const goalsMet = goals.filter(g => g.met).length;

    const card = (id, value, display, period, extra) => Object.assign({
      id, label: CARD_LABELS[id], value, display, period, empty: value == null,
      route: '#/analytics',
    }, extra || {});
    const cmp = (current, previous, unit) => {
      /* Sin datos en ninguno de los dos períodos no hay comparación que hacer:
         evitar «0 contra 0» disfrazado de evolución. */
      const havePrev = previous != null && !(current === 0 && previous === 0);
      const delta = havePrev ? current - previous : null;
      return {
        previous, delta,
        comparison: havePrev ? (delta === 0 ? 'Igual que ' + unit : (delta > 0 ? '+' : '') + delta + ' ' + unit) : null,
        comparable: havePrev,
      };
    };

    return [
      card('sessionsWeek', weekRows.length, String(weekRows.length), 'Esta semana',
        Object.assign(cmp(weekRows.length, prevWeek.length, 'la semana anterior'), { hint: 'Sesiones terminadas, no días distintos.' })),
      card('sessionsMonth', monthRows.length, String(monthRows.length), 'Este mes',
        Object.assign(cmp(monthRows.length, prevMonth.length, 'el mes anterior'), {})),
      card('totalTime', vol.all ? vol.all.seconds : 0, vol.all && vol.all.seconds ? null : '—', 'Histórico',
        { display: formatDuration(vol.all ? vol.all.seconds : 0), empty: !(vol.all && vol.all.seconds), comparison: null, comparable: false }),
      card('volumeWeek', round0(sum(weekRows, r => r.volume)), formatKg(sum(weekRows, r => r.volume)), 'Esta semana',
        Object.assign(cmp(round0(sum(weekRows, r => r.volume)), round0(sum(prevWeek, r => r.volume)), 'kg la semana anterior'), { unit: 'kg' })),
      card('volumeMonth', round0(sum(monthRows, r => r.volume)), formatKg(sum(monthRows, r => r.volume)), 'Este mes',
        Object.assign(cmp(round0(sum(monthRows, r => r.volume)), round0(sum(prevMonth, r => r.volume)), 'kg el mes anterior'), { unit: 'kg' })),
      card('streak', st.current, st.current ? st.current + (st.current === 1 ? ' semana' : ' semanas') : 'Sin racha',
        'Semanas seguidas', { hint: 'Mejor racha: ' + st.best + ' semana(s). ' + st.definition, comparison: null, comparable: false }),
      card('prs', recs.length, String(recs.length), 'En ' + rangeLabel(range),
        Object.assign(cmp(recs.length, prevRecs.length, 'en el período anterior'), { hint: 'Récords automáticos y manuales registrados en el período.' })),
      card('exercises', new Set(all.flatMap(r => (r.exercises || []).map(e => e.key))).size,
        String(new Set(all.flatMap(r => (r.exercises || []).map(e => e.key))).size), 'Histórico',
        { comparison: null, comparable: false, hint: 'Ejercicios distintos con series efectivas registradas.' }),
      card('goals', goals.length ? goalsMet + '/' + goals.length : null,
        goals.length ? goalsMet + '/' + goals.length : 'Sin objetivos', active ? active.name : 'Sin programa activo',
        { hint: goals.length ? goalsMet + ' cumplido(s), ' + goals.filter(g => !g.met).length + ' pendiente(s), ' + goals.filter(g => !g.verifiable).length + ' sin datos.' : 'Crea un programa con objetivos para ver su progreso.', comparison: null, comparable: false }),
      card('bodyweight', bwLatest ? bwLatest.weight : null, bwLatest ? formatKg(bwLatest.weight) + ' kg' : '—', bwLatest ? 'Último registro' : 'Sin datos',
        {
          hint: bwLatest ? 'Registrado el ' + bwLatest.date + (bwPrev ? ' · ' + (bwLatest.weight - bwPrev.weight >= 0 ? '+' : '') + round1(bwLatest.weight - bwPrev.weight) + ' kg desde el anterior' : '') : 'Añade un registro en Peso.',
          comparison: null, comparable: false, detail: bwLatest ? bwLatest.date : null,
        }),
    ];
  }

  function formatKg(v) {
    const n = round1(v);
    return (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
  }
  function formatDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    if (h) return h + ' h ' + (m ? m + ' min' : '');
    return m + ' min';
  }

  /* ---------------- Comparaciones personalizadas ---------------- */

  function comparePeriods(d, PG, resolve, opts) {
    const o = opts || {};
    const range = o.range || rangeFor('30', { now: o.now });
    const all = sessionRows(d, PG, resolve);
    const cur = rowsIn(all, range);
    const prev = range.prevFrom ? rowsIn(all, { from: range.prevFrom, to: range.prevTo }) : [];
    const stats = list => ({
      sessions: list.length,
      days: uniqueDays(list).size,
      volume: round0(sum(list, r => r.volume)),
      minutes: round0(sum(list, r => r.durationSec) / 60),
      sets: sum(list, r => r.sets),
    });
    const a = stats(cur), b = stats(prev);
    const hasPrev = !!range.prevFrom;
    const metric = (id, label, unit, current, previous) => ({
      id, label, unit, current, previous,
      delta: previous == null ? null : round1(current - previous),
      pct: previous == null ? null : pctChange(current, previous),
      comparable: previous != null,
      note: previous == null ? 'Sin datos del período anterior' : previous === 0 && current > 0 ? 'El período anterior estaba vacío: se muestra la diferencia absoluta, sin porcentaje' : '',
    });
    const list = [
      metric('sessions', 'Entrenamientos', 'sesiones', a.sessions, hasPrev ? b.sessions : null),
      metric('volume', 'Volumen', 'kg', a.volume, hasPrev ? b.volume : null),
      metric('frequency', 'Frecuencia', 'sesiones/semana', range.days ? round1(a.days / range.days * 7) : null, hasPrev && range.days ? round1(b.days / range.days * 7) : null),
      metric('minutes', 'Tiempo entrenado', 'min', a.minutes, hasPrev ? b.minutes : null),
      metric('sets', 'Series efectivas', 'series', a.sets, hasPrev ? b.sets : null),
    ];
    const bw = PG.bodyweight ? PG.bodyweight(d) : { list: [] };
    const bwCur = (bw.list || []).filter(w => inRange(w.date, range));
    const bwPrev = range.prevFrom ? (bw.list || []).filter(w => inRange(w.date, { from: range.prevFrom, to: range.prevTo })) : [];
    const avg = xs => xs.length ? round1(sum(xs, x => x.weight) / xs.length) : null;
    list.push(metric('bodyweight', 'Peso corporal (media)', 'kg', avg(bwCur), hasPrev ? avg(bwPrev) : null));

    if (o.exerciseKey) {
      const s = strengthFor(d, PG, resolve, o.exerciseKey, range);
      const prevRange = range.prevFrom ? { from: range.prevFrom, to: range.prevTo } : null;
      const prevS = prevRange ? strengthFor(d, PG, resolve, o.exerciseKey, prevRange) : null;
      const curVal = s.bestE1rm, prevVal = prevS && prevS.sessions ? prevS.bestE1rm : null;
      list.push(metric('exercise', '1RM estimado de ' + s.name, 'kg', curVal, prevVal));
    }
    return { range, rows: list, note: 'Se comparan períodos equivalentes. Si falta uno de los dos, se indica en vez de inventar una variación; los porcentajes solo se calculan con una base mayor que cero.' };
  }

  /* ---------------- Resumen inteligente ---------------- */

  function insights(d, PG, PL, resolve, opts) {
    const o = opts || {};
    const range = o.range || rangeFor('month', { now: o.now });
    const all = sessionRows(d, PG, resolve);
    const cur = rowsIn(all, range);
    const prev = range.prevFrom ? rowsIn(all, { from: range.prevFrom, to: range.prevTo }) : [];
    const out = [];
    const fact = (id, text, extra) => out.push(Object.assign({ id, kind: 'hecho', text, period: range.label }, extra || {}));
    if (!all.length) {
      fact('empty', 'Todavía no hay sesiones terminadas. Cuando completes la primera, aquí aparecerán conclusiones verificables.');
      return out;
    }
    if (!cur.length) {
      fact('no-current', 'No hay sesiones terminadas en ' + rangeLabel(range) + '.');
    } else if (!prev.length) {
      fact('no-prev', 'Hay ' + cur.length + ' sesión(es) en ' + rangeLabel(range) + ', pero no hay datos del período anterior para comparar.');
    } else {
      const diff = cur.length - prev.length;
      fact('sessions', diff === 0
        ? 'Entrenaste las mismas sesiones que en ' + (range.prevLabel || 'el período anterior') + ' (' + cur.length + ').'
        : (diff > 0
          ? 'Esta vez completaste ' + diff + ' sesión(es) más que en ' + (range.prevLabel || 'el período anterior') + '.'
          : 'Esta vez completaste ' + Math.abs(diff) + ' sesión(es) menos que en ' + (range.prevLabel || 'el período anterior') + '.'),
        { delta: diff });
      const volCur = round0(sum(cur, r => r.volume)), volPrev = round0(sum(prev, r => r.volume));
      if (volPrev > 0) {
        const pct = pctChange(volCur, volPrev);
        if (pct != null && Math.abs(pct) >= 5) {
          fact('volume', 'El volumen total ' + (pct > 0 ? 'aumentó' : 'disminuyó') + ' un ' + Math.abs(pct) + ' % (' + formatKg(Math.abs(volCur - volPrev)) + ' kg). El volumen mide trabajo total, no fuerza ni calidad del entrenamiento.',
            { pct });
        }
      }
      const freqCur = range.days ? cur.length / range.days * 7 : 0;
      const freqPrev = range.days ? prev.length / range.days * 7 : 0;
      if (freqCur > 0 && freqPrev > 0 && Math.abs(freqCur - freqPrev) <= 0.5) {
        fact('frequency', 'Tu frecuencia de entrenamiento se mantuvo estable: ' + round1(freqCur) + ' sesiones por semana frente a ' + round1(freqPrev) + '.');
      }
    }
    const newRecords = recordsIn(d, range);
    if (newRecords.length) {
      const names = [...new Set(newRecords.map(r => r.exercise || r.exId).filter(Boolean))].slice(0, 3);
      fact('prs', newRecords.length + ' récord(s) registrado(s) en ' + rangeLabel(range) + (names.length ? ': ' + names.join(', ') + '.' : '.'), { count: newRecords.length });
    }
    const bw = PG.bodyweight ? PG.bodyweight(d) : { list: [] };
    if ((bw.list || []).length > 1) {
      const latest = bw.list[bw.list.length - 1], first = bw.list[0];
      fact('weight', 'Tu peso pasó de ' + formatKg(first.weight) + ' kg a ' + formatKg(latest.weight) + ' kg entre ' + first.date + ' y ' + latest.date + ' (dato registrado; no indica composición corporal).');
    }
    if (PL && PL.activeProgram) {
      const active = PL.activeProgram(d);
      const ps = active ? programStats(d, PL, active, range, { now: todayISO(o.now), PG, resolve }) : null;
      if (ps && ps.compliance != null) {
        fact('plan', 'Cumpliste ' + ps.compliance + ' % de los días de entrenamiento planificados que ya pasaron en ' + rangeLabel(range) + ' (' + ps.done + ' de ' + (ps.done + ps.missed) + ').', { compliance: ps.compliance });
      }
      if (ps && ps.goals.length) {
        fact('goals', 'Objetivos del programa «' + active.name + '»: ' + ps.goalsMet + ' cumplido(s), ' + ps.goalsPending + ' pendiente(s)' + (ps.goalsUnknown ? ' y ' + ps.goalsUnknown + ' sin datos para verificar.' : '.'));
      }
    }
    const strength = strengthAnalysis(d, PG, resolve, { range, exerciseKey: o.exerciseKey });
    if (strength.focus && strength.focus.sessions < 2) {
      fact('exercise-insufficient', 'No hay suficientes sesiones de ' + strength.focus.name + ' en este período para evaluar su tendencia.');
    }
    return out;
  }

  /* ---------------- Caché en memoria ---------------- */

  let cache = new Map();
  function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  /* Huella de TODO lo que alimenta las estadísticas. Incluye ids, fechas,
     estado, duración, ejercicios, pesos, récords, programas y planificación:
     editar o borrar una sesión cambia la huella y tira la caché. */
  function signature(d, opts) {
    const sources = {
      sessions: ((d && d.sessions) || []).map(s => [
        s && s.id, s && s.date, s && s.finished, s && s.status, s && s.finishedAt, s && s.lastSavedAt,
        s && s.durationSec, ((s && s.exercises) || []).map(ex => [
          ex && ex.id, ex && ex.name, ex && ex.exId,
          ((ex && ex.sets) || []).map(st => [st && st.id, st && st.weight, st && st.reps, st && st.completed, st && st.type]),
        ]),
      ]),
      weights: ((d && d.weights) || []).map(w => [w && w.id, w && w.date, w && w.weight]),
      records: ((d && d.records) || []).map(r => [r && r.id, r && r.date, r && r.exId, r && r.weight, r && r.reps]),
      prs: ((d && d.prs) || []).map(r => [r && r.id, r && r.date, r && r.exId, r && r.weight, r && r.reps]),
      programs: ((d && d.programs) || []).map(p => [p && p.id, p && p.status, p && p.updatedAt, p && p.startDate, p && p.endDate, p && p.template, p && p.goals]),
      planner: ((d && d.planner) || []).map(e => [e && e.id, e && e.date, e && e.programId, e && e.workoutId, e && e.kind, e && e.sessionId, e && e.updatedAt]),
      exercises: ((d && d.exercises) || []).map(e => [e && e.id, e && e.group]),
      prefs: opts && opts.prefs ? opts.prefs : null,
    };
    return hash(JSON.stringify(sources));
  }
  function cached(d, opts, compute) {
    const key = signature(d, opts) + '|' + (opts.range ? opts.range.from + ':' + opts.range.to : '') + '|' + (opts.exerciseKey || '');
    if (cache.has(key)) return cache.get(key);
    const value = compute();
    cache.set(key, value);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    return value;
  }
  function clearCache() { cache = new Map(); }

  /* ---------------- Análisis completo ---------------- */

  function analyze(d, opts) {
    const o = opts || {};
    const PG = o.PG, PL = o.PL;
    if (!PG) throw new Error('analytics: falta PG');
    const range = o.range || rangeFor(o.preset || 'month', { now: o.now, custom: o.custom });
    const ctx = Object.assign({}, o, { range });
    return cached(d, ctx, () => {
      const groupOf = o.groupOf || (() => '');
      const cardsList = cards(d, PG, PL, o.resolve, ctx);
      const volume = volumeAnalysis(d, PG, o.resolve, groupOf, ctx);
      return {
        generatedAt: new Date().toISOString(),
        range,
        cards: cardsList,
        consistency: consistency(d, PG, o.resolve, ctx),
        volume,
        muscles: muscleAnalysis(d, PG, o.resolve, groupOf, ctx),
        strength: strengthAnalysis(d, PG, o.resolve, ctx),
        bodyweight: bodyweightAnalysis(d, PG, ctx),
        programs: PL ? programAnalysis(d, PL, PG, o.resolve, range, { now: todayISO(o.now) }) : { active: null, past: [], count: 0 },
        comparison: comparePeriods(d, PG, o.resolve, ctx),
        insights: insights(d, PG, PL, o.resolve, ctx),
      };
    });
  }

  /* ---------------- Preferencias del dashboard ---------------- */

  function defaultConfig() {
    return { version: 1, period: 'month', order: CARD_IDS.slice(), hidden: [] };
  }
  function normalizeConfig(raw) {
    const base = defaultConfig();
    if (!raw || typeof raw !== 'object') return base;
    const out = defaultConfig();
    if (PERIODS.some(p => p.id === raw.period) && raw.period !== 'custom') out.period = raw.period;
    const order = Array.isArray(raw.order) ? raw.order.filter((id, i, arr) => CARD_IDS.includes(id) && arr.indexOf(id) === i) : [];
    if (order.length) out.order = order.concat(CARD_IDS.filter(id => !order.includes(id)));
    out.hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((id, i, arr) => CARD_IDS.includes(id) && arr.indexOf(id) === i) : [];
    return out;
  }
  function visibleCards(list, config) {
    const cfg = normalizeConfig(config);
    const byId = new Map((list || []).map(c => [c.id, c]));
    return cfg.order.filter(id => !cfg.hidden.includes(id)).map(id => byId.get(id)).filter(Boolean);
  }
  function moveCard(config, id, dir) {
    const cfg = normalizeConfig(config);
    const i = cfg.order.indexOf(id);
    if (i < 0) return cfg;
    const j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= cfg.order.length) return cfg;
    const copy = cfg.order.slice();
    copy[i] = copy[j]; copy[j] = id;
    cfg.order = copy;
    return cfg;
  }

  /* ---------------- Exportaciones ---------------- */

  function csvEscape(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function csvText(rows) {
    return '\uFEFF' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  }
  function exportCSV(d, opts) {
    const a = analyze(d, opts);
    const rows = [
      ['DrakoTrack — Estadísticas de rendimiento'],
      ['Generado', new Date().toISOString()],
      ['Período', a.range.label],
      ['Desde', a.range.from || 'inicio'],
      ['Hasta', a.range.to],
      [],
      ['Resumen'],
      ['indicador', 'valor', 'unidad', 'periodo', 'anterior', 'variacion_pct', 'comparacion'],
    ];
    a.cards.forEach(c => rows.push([c.label, c.value == null ? '' : c.value, c.id === 'totalTime' ? 'segundos' : c.unit || '', c.period, c.previous == null ? '' : c.previous, c.pct == null ? '' : c.pct, c.comparison || '']));
    rows.push([], ['Sesiones'], ['fecha', 'entrenamiento', 'duracion_min', 'series_efectivas', 'repeticiones', 'volumen_kg']);
    rowsIn(sessionRows(d, opts.PG, opts.resolve), a.range).forEach(r => {
      rows.push([r.date, r.name || '', r.durationSec ? Math.round(r.durationSec / 60) : '', r.sets || 0, r.reps || 0, r.volume || 0]);
    });
    rows.push([], ['Volumen por ejercicio'], ['ejercicio', 'volumen_kg', 'series', 'repeticiones', 'sesiones', 'grupo_muscular']);
    a.volume.byExercise.forEach(x => rows.push([x.name, x.volume, x.sets, x.reps, x.sessions, x.group || 'Sin clasificar']));
    rows.push([], ['Peso corporal'], ['fecha', 'peso_kg']);
    (a.bodyweight.list || []).forEach(w => rows.push([w.date, w.weight]));
    rows.push([], ['Objetivos del programa activo'], ['programa', 'objetivo', 'meta', 'valor', 'unidad', 'cumplido', 'verificable']);
    if (a.programs.active) a.programs.active.goals.forEach(g => rows.push([a.programs.active.program.name, g.label, g.target, g.current, g.unit, g.met ? 'sí' : 'no', g.verifiable ? 'sí' : 'no']));
    rows.push([], ['Notas'], ['Las estadísticas se reconstruyen de las sesiones originales. Los ejercicios sin peso externo no suman kilos de volumen. Los cambios de peso no indican grasa ni masa muscular.']);
    return {
      filename: 'drakotrack-estadisticas-' + todayISO(opts && opts.now) + '.csv',
      mime: 'text/csv;charset=utf-8', text: csvText(rows),
    };
  }
  function exportJSON(d, opts) {
    const a = analyze(d, opts);
    const payload = {
      app: 'DrakoTrack', kind: 'statistics', version: 1,
      generatedAt: new Date().toISOString(),
      range: a.range,
      cards: a.cards.map(c => ({ id: c.id, label: c.label, value: c.value, display: c.display, period: c.period, previous: c.previous, delta: c.delta, pct: c.pct, comparable: c.comparable })),
      consistency: { range: a.consistency.range, sessions: a.consistency.sessions, daysTrained: a.consistency.daysTrained, avgWeekly: a.consistency.avgWeekly, streaks: a.consistency.streaks, plan: { planned: a.consistency.plan.planned, done: a.consistency.plan.done, missed: a.consistency.plan.missed, rest: a.consistency.plan.rest, compliance: a.consistency.plan.compliance }, weekday: a.consistency.weekday, weeks: a.consistency.weeks },
      volume: { total: a.volume.total, prevTotal: a.volume.prevTotal, delta: a.volume.delta, pct: a.volume.pct, sets: a.volume.sets, reps: a.volume.reps, weightedSets: a.volume.weightedSets, bodyweightSets: a.volume.bodyweightSets, avgPerSession: a.volume.avgPerSession, weekly: a.volume.weekly, monthly: a.volume.monthly, byExercise: a.volume.byExercise, groups: a.volume.groups, unclassified: a.volume.unclassified },
      strength: { positive: a.strength.positive.map(s => ({ key: s.key, name: s.name, delta: s.delta, sessions: s.sessions })), stable: a.strength.stable.map(s => ({ key: s.key, name: s.name, sessions: s.sessions })), declining: a.strength.declining.map(s => ({ key: s.key, name: s.name, delta: s.delta, sessions: s.sessions })), insufficient: a.strength.insufficient.map(s => ({ key: s.key, name: s.name, sessions: s.sessions })), prs: a.strength.prs },
      bodyweight: { latest: a.bodyweight.latest, first: a.bodyweight.first, change: a.bodyweight.change, rangeAvg: a.bodyweight.rangeAvg, weekly: a.bodyweight.weekly, monthly: a.bodyweight.monthly },
      programs: { active: a.programs.active ? { name: a.programs.active.program.name, compliance: a.programs.active.compliance, planned: a.programs.active.planned, done: a.programs.active.done, goals: a.programs.active.goals.map(g => ({ label: g.label, target: g.target, current: g.current, met: g.met, verifiable: g.verifiable })) } : null, count: a.programs.count },
      sessions: rowsIn(sessionRows(d, opts.PG, opts.resolve), a.range).map(r => ({ date: r.date, workout: r.name, durationSec: r.durationSec, sets: r.sets, reps: r.reps, volume: r.volume })),
      weights: a.bodyweight.list,
      notes: ['Datos derivados de las sesiones y registros originales.', 'No se incluyen credenciales ni preferencias.', 'El volumen solo suma peso externo × repeticiones.', 'Los cambios de peso no indican composición corporal.'],
    };
    return {
      filename: 'drakotrack-estadisticas-' + todayISO(opts && opts.now) + '.json',
      mime: 'application/json', text: JSON.stringify(payload, null, 2),
    };
  }

  return {
    DAY, CARD_IDS, CARD_LABELS, PERIODS, CARD_PERIODS,
    dayISO, parseDay, todayISO, addDays, weekStart, monthStart, monthEnd, shiftMonth, diffDays,
    rangeFor, rangeLabel, inRange, pctChange,
    sessionRows, rowsIn, uniqueDays, uniqueWeeks, streaks, planStats,
    consistency, volumeAnalysis, strengthFor, strengthAnalysis, muscleAnalysis,
    bodyweightAnalysis, programStats, programAnalysis,
    cards, comparePeriods, insights, recordsIn,
    analyze, signature, cached, clearCache,
    defaultConfig, normalizeConfig, visibleCards, moveCard,
    exportCSV, exportJSON, csvText, csvEscape, formatKg, formatDuration,
  };
});
