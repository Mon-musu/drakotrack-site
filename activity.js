/* ============================================================
   DrakoTrack — calendario anual de actividad (F3, lógica pura)

   Solo lee sesiones terminadas y el calendario del plan. No guarda
   nada ni modifica el historial: agrupa por día, calcula la racha y
   devuelve las cuadrículas mensuales listas para pintar.

   Reglas de la racha (acordadas en F3):
   - Una sesión terminada por día cuenta una vez.
   - Los días de descanso planificados ni suman ni rompen la racha.
   - Los días posteriores al último entrenamiento no la cortan: el día
     de hoy no penaliza mientras no haya terminado.
   - Cualquier otro día sin sesión sí la reinicia.
   ============================================================ */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function dayISO(v) { return String(v == null ? '' : v).slice(0, 10); }
  function parseDay(iso) {
    const t = Date.parse(dayISO(iso) + 'T00:00:00Z');
    return isFinite(t) ? t : null;
  }
  function addDays(iso, n) {
    const t = parseDay(iso);
    if (t == null) return null;
    return new Date(t + n * DAY).toISOString().slice(0, 10);
  }
  function dayOfWeek(iso) {
    const t = parseDay(iso);
    if (t == null) return 0;
    return (new Date(t).getUTCDay() + 6) % 7;  /* lunes = 0 */
  }
  function weekStart(iso) {
    const t = parseDay(iso);
    if (t == null) return null;
    return new Date(t - dayOfWeek(iso) * DAY).toISOString().slice(0, 10);
  }

  /* ---------------- Sesiones ---------------- */

  function isFinished(s) {
    return !!(s && s.finished && s.date && s.status !== 'cancelled' && parseDay(s.date) != null);
  }
  function sessionVolume(s) {
    let v = 0;
    ((s && s.exercises) || []).forEach(ex => {
      ((ex && ex.sets) || []).forEach(st => {
        if (!st || st.type === 'warmup') return;
        const w = Number(st.weight), r = Number(st.reps);
        if (st.completed && w > 0 && r > 0) v += w * r;
      });
    });
    return Math.round(v);
  }
  function sessionMinutes(s) {
    const direct = Number(s && s.durationSec);
    if (isFinite(direct) && direct > 0) return Math.round(direct / 60);
    const from = Number(s && s.startedAt), to = Number(s && s.finishedAt);
    if (isFinite(from) && isFinite(to) && to > from) return Math.max(0, Math.round((to - from) / 60000));
    return 0;
  }

  /* Mapa fecha → {date, sessions, minutes, volume}. */
  function byDay(sessions) {
    const map = new Map();
    (sessions || []).filter(isFinished).forEach(s => {
      const date = dayISO(s.date);
      const cur = map.get(date) || { date, sessions: 0, minutes: 0, volume: 0 };
      cur.sessions += 1;
      cur.minutes += sessionMinutes(s);
      cur.volume += sessionVolume(s);
      map.set(date, cur);
    });
    return map;
  }

  function restDays(planner) {
    const set = new Set();
    (planner || []).forEach(e => {
      if (e && e.kind === 'rest') {
        const d = dayISO(e.date);
        if (parseDay(d) != null) set.add(d);
      }
    });
    return set;
  }

  function levelFor(minutes, sessions) {
    if (!sessions) return 0;
    const m = Number(minutes) || 0;
    if (m >= 90 || sessions >= 3) return 4;
    if (m >= 60 || sessions === 2) return 3;
    if (m >= 30) return 2;
    return 1;
  }

  /* ---------------- Racha ---------------- */

  function streak(days, rest, now) {
    const dates = [...days.keys()].sort();
    if (!dates.length) return { current: 0, best: 0, last: null, restDays: (rest ? rest.size : 0) };
    const today = dayISO(now) || dayISO(Date.now());
    const last = dates[dates.length - 1];
    let run = 0, best = 0;
    let cursor = dates[0];
    /* Del primer día con sesión hasta hoy: descanso planificado y días
       posteriores al último entrenamiento se saltan sin romper. */
    while (parseDay(cursor) != null && parseDay(cursor) <= parseDay(today)) {
      if (days.has(cursor)) {
        run += 1;
        if (run > best) best = run;
      } else if (!rest.has(cursor) && cursor < last) {
        run = 0;
      }
      cursor = addDays(cursor, 1);
    }
    return { current: run, best, last, restDays: rest ? rest.size : 0 };
  }

  /* ---------------- Años y meses ---------------- */

  function yearsFor(sessions, now) {
    const set = new Set();
    const current = Number(dayISO(now || Date.now()).slice(0, 4));
    if (current) set.add(current);
    (sessions || []).filter(isFinished).forEach(s => {
      const y = Number(dayISO(s.date).slice(0, 4));
      if (y) set.add(y);
    });
    return [...set].sort((a, b) => b - a);
  }

  function labelFor(date, info, isRest) {
    const day = Number(date.slice(8, 10));
    const month = MONTHS[Number(date.slice(5, 7)) - 1] || '';
    const head = day + ' de ' + month;
    if (info && info.sessions) {
      const parts = [info.sessions === 1 ? '1 sesión' : info.sessions + ' sesiones'];
      if (info.minutes > 0) parts.push(info.minutes + ' min');
      if (info.volume > 0) parts.push(info.volume.toLocaleString('es') + ' kg');
      return head + ': ' + parts.join(' · ');
    }
    if (isRest) return head + ': descanso planificado';
    return head + ': sin actividad';
  }

  function monthCells(year, month, days, rest, today) {
    const first = year + '-' + pad2(month) + '-01';
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const last = year + '-' + pad2(month) + '-' + pad2(lastDay);
    const cells = [];
    let cursor = weekStart(first);
    const end = addDays(weekStart(last), 6);
    while (cursor && cursor <= end) {
      const info = days.get(cursor);
      const sessions = info ? info.sessions : 0;
      const minutes = info ? info.minutes : 0;
      const volume = info ? info.volume : 0;
      const out = Number(cursor.slice(0, 4)) !== Number(year) || Number(cursor.slice(5, 7)) !== Number(month);
      const isRest = rest.has(cursor);
      cells.push({
        date: cursor,
        day: Number(cursor.slice(8, 10)),
        inMonth: !out,
        sessions, minutes, volume,
        level: levelFor(minutes, sessions),
        rest: isRest,
        isToday: cursor === today,
        label: labelFor(cursor, info, isRest),
      });
      cursor = addDays(cursor, 1);
    }
    return { month, label: MONTHS[month - 1] || '', cells };
  }

  /* ---------------- Vista completa ---------------- */

  function build(sessions, opts) {
    const o = opts || {};
    const today = dayISO(o.now) || dayISO(Date.now());
    const days = byDay(sessions);
    const rest = restDays(o.planner);
    const years = yearsFor(sessions, today);
    let year = Number(o.year);
    if (!(Number.isInteger(year) && year >= 1970 && year <= 2100)) year = years[0];
    /* Un año pedido explícitamente se conserva aunque no tenga sesiones:
       la vista debe poder avisar de que está vacío. */
    const yearList = years.includes(year) ? years : [...years, year].sort((a, b) => b - a);
    const month = o.month === 'all' || o.month == null ? 'all' : Number(o.month);
    const validMonth = month === 'all' && month !== 0 ? 'all' : (month >= 1 && month <= 12 ? month : 'all');

    const scoped = [...days.keys()].filter(d =>
      d.slice(0, 4) === String(year) && (validMonth === 'all' || Number(d.slice(5, 7)) === validMonth));
    const stats = { activeDays: 0, sessions: 0, minutes: 0, volume: 0, monthsActive: 0 };
    scoped.forEach(d => {
      const info = days.get(d);
      stats.activeDays += 1;
      stats.sessions += info.sessions;
      stats.minutes += info.minutes;
      stats.volume += info.volume;
    });
    stats.monthsActive = new Set(scoped.map(d => d.slice(0, 7))).size;
    stats.streak = streak(days, rest, today);
    stats.totalDays = days.size;

    const list = validMonth === 'all' ? MONTHS.map((_, i) => i + 1) : [validMonth];
    const months = list.map(m => monthCells(year, m, days, rest, today));

    return {
      now: today, year, month: validMonth, years: yearList, months, stats,
      hasData: days.size > 0,
      hasYearData: scoped.length > 0,
    };
  }

  const API = {
    DAY, MONTHS, WEEKDAY_INITIALS,
    dayISO, parseDay, addDays, dayOfWeek, weekStart,
    isFinished, sessionVolume, sessionMinutes, byDay, restDays,
    levelFor, streak, yearsFor, monthCells, build,
  };

  root.Activity = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
