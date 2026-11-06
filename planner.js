/* ============================================================
   DrakoTrack — programas, planificación y calendario (lógica pura)

   Este archivo no guarda nada por su cuenta: trabaja sobre
   `d.programs` y `d.planner`, que sync.js sincroniza como
   colecciones normales (id estable + fusión por elemento).
   Las sesiones realizadas NUNCA se modifican desde aquí: el
   calendario solo enlaza `sessionId` y el estado se deduce.
   ============================================================ */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const STATUSES = [
    { id: 'active', label: 'Activo' },
    { id: 'paused', label: 'Pausado' },
    { id: 'completed', label: 'Completado' },
    { id: 'archived', label: 'Archivado' },
  ];
  const GOAL_TYPES = [
    { id: 'sessions', label: 'Cumplir un número de sesiones', unit: 'sesiones' },
    { id: 'weeklyFreq', label: 'Frecuencia semanal', unit: 'sesiones/semana' },
    { id: 'weight', label: 'Peso objetivo en un ejercicio', unit: 'kg' },
    { id: 'reps', label: 'Repeticiones objetivo a un peso', unit: 'rep' },
    { id: 'volume', label: 'Volumen semanal', unit: 'kg/semana' },
  ];
  const PHASE_PRESETS = ['Adaptación', 'Hipertrofia', 'Fuerza', 'Resistencia', 'Descarga', 'Recuperación'];
  const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

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
  function weekDates(startISO) {
    const start = weekStart(startISO) || startISO;
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  function statusLabel(id) {
    const s = STATUSES.find(x => x.id === id);
    return s ? s.label : 'Activo';
  }
  function goalType(id) {
    return GOAL_TYPES.find(g => g.id === id) || GOAL_TYPES[0];
  }

  /* ---------------- Programas ---------------- */

  function newId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) { /* sin crypto: reloj + azar */ }
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function newProgram(overrides) {
    const o = overrides || {};
    const start = dayISO(o.startDate) || new Date().toISOString().slice(0, 10);
    return Object.assign({
      id: newId(),
      name: 'Programa nuevo',
      description: '',
      goal: '',
      startDate: start,
      endDate: '',
      weeks: 8,
      daysPerWeek: 3,
      status: 'active',
      workoutIds: [],
      template: ['', '', '', '', '', '', ''],
      phases: [],
      goals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, o, { id: o.id || newId(), startDate: start });
  }

  function normalizeTemplate(list) {
    const arr = Array.isArray(list) ? list.slice(0, 7) : [];
    while (arr.length < 7) arr.push('');
    return arr.map(v => (typeof v === 'string' ? v : ''));
  }

  /* Normaliza un programa leído del almacenamiento sin perder nada:
     rellena solo lo que falta y respeta los datos existentes. */
  function normalizeProgram(p) {
    if (!p || typeof p !== 'object') return null;
    if (!p.id) p.id = newId();
    if (typeof p.name !== 'string' || !p.name.trim()) p.name = 'Programa';
    if (typeof p.description !== 'string') p.description = '';
    if (typeof p.goal !== 'string') p.goal = '';
    if (!p.startDate) p.startDate = new Date().toISOString().slice(0, 10);
    if (typeof p.endDate !== 'string') p.endDate = '';
    if (!(Number(p.weeks) >= 1)) p.weeks = 8;
    if (!(Number(p.daysPerWeek) >= 1)) p.daysPerWeek = 3;
    if (!STATUSES.some(s => s.id === p.status)) p.status = 'active';
    if (!Array.isArray(p.workoutIds)) p.workoutIds = [];
    p.template = normalizeTemplate(p.template);
    if (!Array.isArray(p.phases)) p.phases = [];
    if (!Array.isArray(p.goals)) p.goals = [];
    if (typeof p.createdAt !== 'string') p.createdAt = new Date().toISOString();
    if (typeof p.updatedAt !== 'string') p.updatedAt = p.createdAt;
    return p;
  }

  function normalizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    if (!e.id) e.id = newId();
    if (!parseDay(e.date)) return null;
    if (e.kind !== 'rest') e.kind = 'workout';
    if (typeof e.workoutId !== 'string') e.workoutId = '';
    if (typeof e.workoutName !== 'string') e.workoutName = '';
    if (typeof e.programId !== 'string') e.programId = '';
    if (typeof e.sessionId !== 'string') e.sessionId = '';
    return e;
  }

  /* Garantiza las colecciones nuevas en cualquier documento, incluido uno
     antiguo que nunca las tuvo. Idempotente y sin tocar el resto. */
  function ensurePlanData(d) {
    if (!d || typeof d !== 'object') return d;
    if (!Array.isArray(d.programs)) d.programs = [];
    if (!Array.isArray(d.planner)) d.planner = [];
    d.programs = d.programs.map(normalizeProgram).filter(Boolean);
    d.planner = d.planner.map(normalizeEntry).filter(Boolean);
    return d;
  }

  function activeProgram(d) {
    const list = (d && d.programs) || [];
    return list.find(p => p.status === 'active') || null;
  }

  function programById(d, id) {
    return ((d && d.programs) || []).find(p => p.id === id) || null;
  }

  function duplicateProgram(program) {
    const copy = JSON.parse(JSON.stringify(program));
    copy.id = newId();
    copy.name = (program.name || 'Programa') + ' (copia)';
    copy.status = 'paused';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    copy.phases = (copy.phases || []).map(ph => Object.assign({}, ph, { id: newId() }));
    copy.goals = (copy.goals || []).map(g => Object.assign({}, g, { id: newId() }));
    return copy;
  }

  function newPhase(overrides) {
    return Object.assign({ id: newId(), name: 'Fase', weeks: 3, goal: '', workoutIds: [], notes: '' }, overrides || {});
  }

  function newGoal(overrides) {
    return Object.assign({ id: newId(), type: 'sessions', target: 12, exerciseId: '', targetWeight: 0, period: 'program', label: '' }, overrides || {});
  }

  function programProgress(program, today) {
    if (!program) return { weeks: 0, elapsed: 0, pct: 0, remaining: 0 };
    const total = Math.max(1, Number(program.weeks) || 1);
    const start = parseDay(program.startDate);
    const now = parseDay(today) || Date.now();
    const elapsed = start == null ? 0 : Math.max(0, Math.floor((now - start) / (7 * DAY)) + 1);
    return {
      weeks: total,
      elapsed: Math.min(total, elapsed),
      remaining: Math.max(0, total - elapsed),
      pct: Math.min(100, Math.round(elapsed / total * 100)),
    };
  }

  /* ---------------- Calendario y planificación semanal ---------------- */

  function sessionsById(d) {
    const map = new Map();
    ((d && d.sessions) || []).forEach(s => { if (s && s.id) map.set(s.id, s); });
    return map;
  }

  /* Estado visible de una entrada. No se guarda: se deduce de la sesión
     enlazada y de la fecha, así editar un programa no reescribe historia. */
  function entryStatus(entry, sessions, today) {
    if (!entry) return 'none';
    if (entry.kind === 'rest') return 'rest';
    const s = entry.sessionId ? sessions.get(entry.sessionId) : null;
    if (s && s.finished && s.status !== 'cancelled') return 'done';
    if (s && !s.finished) return 'progress';
    const d = dayISO(entry.date), t = dayISO(today);
    return d < t ? 'missed' : 'pending';
  }

  function templateSlot(program, iso) {
    if (!program) return '';
    const tpl = normalizeTemplate(program.template);
    return tpl[dayOfWeek(iso)] || '';
  }

  function entriesForWeek(planner, startISO) {
    const dates = new Set(weekDates(startISO));
    return (planner || []).filter(e => e && dates.has(dayISO(e.date)))
      .sort((a, b) => dayISO(a.date).localeCompare(dayISO(b.date)) || String(a.id).localeCompare(String(b.id)));
  }

  function entriesForDay(planner, dateISO) {
    return (planner || []).filter(e => e && dayISO(e.date) === dayISO(dateISO));
  }

  /* Genera las entradas de una semana desde la plantilla del programa.
     No duplica lo que ya existe (misma fecha + rutina) ni convierte una
     sesión hecha en planificada. */
  function applyTemplate(program, startISO, planner, nameOf) {
    if (!program) return [];
    const out = [];
    weekDates(startISO).forEach(date => {
      const slot = templateSlot(program, date);
      if (!slot) return;
      const sameDay = (planner || []).filter(e => e && dayISO(e.date) === date);
      if (slot === 'rest') {
        if (!sameDay.some(e => e.kind === 'rest')) out.push({ id: newId(), date, programId: program.id, kind: 'rest' });
        return;
      }
      if (sameDay.some(e => e.kind !== 'rest' && e.workoutId === slot)) return;
      out.push({
        id: newId(), date, programId: program.id, kind: 'workout',
        workoutId: slot, workoutName: nameOf ? nameOf(slot) : '',
      });
    });
    return out;
  }

  /* Copia la semana anterior a la actual, sin pisar lo que ya hay. */
  function copyWeek(planner, fromStartISO, toStartISO, programId) {
    const from = entriesForWeek(planner, fromStartISO);
    const targetDates = weekDates(toStartISO);
    const existing = new Set((planner || []).filter(e => e && targetDates.includes(dayISO(e.date)))
      .map(e => dayISO(e.date) + ':' + (e.kind === 'rest' ? 'rest' : e.workoutId)));
    const out = [];
    from.forEach(entry => {
      const offset = (parseDay(entry.date) - parseDay(weekStart(entry.date))) / DAY;
      const date = targetDates[offset];
      if (!date) return;
      const key = date + ':' + (entry.kind === 'rest' ? 'rest' : entry.workoutId);
      if (existing.has(key)) return;
      out.push({
        id: newId(), date, programId: programId || entry.programId || '',
        kind: entry.kind, workoutId: entry.workoutId || '', workoutName: entry.workoutName || '',
      });
    });
    return out;
  }

  function moveEntry(entry, dateISO) {
    if (!entry || !parseDay(dateISO)) return entry;
    entry.date = dayISO(dateISO);
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  /* Matriz de 6 semanas para el calendario mensual (lunes primero). */
  function monthGrid(year, monthIndex) {
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const startDow = (first.getUTCDay() + 6) % 7;
    const cells = [];
    const start = new Date(Date.UTC(year, monthIndex, 1 - startDow));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * DAY);
      cells.push({
        date: d.toISOString().slice(0, 10),
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === monthIndex,
      });
    }
    return Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  }

  function daySummary(d, dateISO) {
    const sessions = sessionsById(d);
    const entries = entriesForDay((d && d.planner) || [], dateISO).map(e => ({
      entry: e, status: entryStatus(e, sessions, new Date().toISOString().slice(0, 10)),
    }));
    const done = ((d && d.sessions) || []).filter(s => s && dayISO(s.date) === dayISO(dateISO) && s.finished && s.status !== 'cancelled');
    const plannedIds = new Set(entries.map(x => x.entry.sessionId).filter(Boolean));
    return {
      date: dayISO(dateISO),
      entries,
      done,
      /* Sesiones hechas ese día que no estaban planificadas: se muestran
         aparte, nunca se borran ni sustituyen la planificación. */
      extra: done.filter(s => !plannedIds.has(s.id)),
      rest: entries.some(x => x.entry.kind === 'rest'),
      missed: entries.some(x => x.status === 'missed'),
    };
  }

  function upcoming(d, limit) {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = sessionsById(d);
    return ((d && d.planner) || [])
      .filter(e => e && e.kind !== 'rest' && dayISO(e.date) >= today)
      .map(e => ({ entry: e, status: entryStatus(e, sessions, today) }))
      .filter(x => x.status === 'pending' || x.status === 'progress' || x.status === 'done')
      .sort((a, b) => dayISO(a.entry.date).localeCompare(dayISO(b.entry.date)))
      .slice(0, limit || 5);
  }

  /* ---------------- Objetivos ---------------- */

  function inRange(dateISO, fromISO, toISO) {
    const d = dayISO(dateISO);
    return d >= fromISO && d <= toISO;
  }

  /* Evalúa los objetivos de un programa con las sesiones reales y los
     récords del Prompt 5. `verifiable` distingue "no cumplido" de
     "no hay datos para saberlo": solo cuenta como cumplido lo comprobado. */
  function evaluateGoals(program, d, PG, opts) {
    if (!program || !Array.isArray(program.goals)) return [];
    const o = opts || {};
    const today = dayISO(o.today) || new Date().toISOString().slice(0, 10);
    const start = dayISO(program.startDate) || today;
    const end = dayISO(program.endDate) || today;
    const sessions = ((d && d.sessions) || []).filter(s => s && s.finished && s.status !== 'cancelled' && inRange(s.date, start, end));
    const weeksElapsed = Math.max(1, Math.ceil((Math.min(parseDay(end) || Date.now(), parseDay(today) || Date.now()) - (parseDay(start) || Date.now())) / (7 * DAY)) || 1);
    const vol = PG && PG.volumeSummary ? PG.volumeSummary(d, o.resolve, o.now) : null;

    return program.goals.map(g => {
      const target = Number(g.target) || 0;
      const base = { id: g.id, type: g.type, label: goalType(g.type).label, target, unit: goalType(g.type).unit, met: false, verifiable: false, current: 0 };
      if (g.type === 'sessions') {
        base.current = sessions.length;
        base.verifiable = true;
        base.met = sessions.length >= target;
        return base;
      }
      if (g.type === 'weeklyFreq') {
        base.current = Math.round((sessions.length / weeksElapsed) * 10) / 10;
        base.verifiable = sessions.length > 0;
        base.met = base.verifiable && base.current >= target;
        return base;
      }
      if (g.type === 'weight') {
        if (!PG || !g.exerciseId) return base;
        const rec = PG.recordsFor(d, o.resolve, g.exerciseId);
        if (!rec || !rec.bestWeight) return base;
        base.current = rec.bestWeight.value;
        base.verifiable = true;
        base.met = rec.bestWeight.value >= target;
        base.date = rec.bestWeight.date;
        return base;
      }
      if (g.type === 'reps') {
        const weight = Number(g.targetWeight) || 0;
        let bestReps = 0, found = false;
        ((d && d.sessions) || []).forEach(s => {
          if (!s || !s.finished || s.status === 'cancelled' || !inRange(s.date, start, end)) return;
          (s.exercises || []).forEach(ex => {
            if (PG && o.resolve && PG.exerciseKey(ex, o.resolve) !== g.exerciseId) return;
            if (!PG && ex.exId !== g.exerciseId) return;
            (PG ? PG.effectiveSets(ex) : []).forEach(st => {
              if (weight > 0 && st.weight !== weight) return;
              found = true;
              bestReps = Math.max(bestReps, st.reps);
            });
          });
        });
        base.current = bestReps;
        base.verifiable = found;
        base.met = found && bestReps >= target;
        return base;
      }
      if (g.type === 'volume') {
        const weekly = (vol && vol.weekly) || [];
        const usable = weekly.filter(w => w.key >= start && w.key <= end);
        if (!usable.length) return base;
        base.current = Math.round(usable.reduce((a, w) => a + w.volume, 0) / usable.length);
        base.verifiable = usable.some(w => w.volume > 0);
        base.met = base.verifiable && base.current >= target;
        return base;
      }
      return base;
    });
  }

  const PL = {
    DAY, STATUSES, GOAL_TYPES, PHASE_PRESETS, WEEKDAY_LABELS,
    dayISO, parseDay, addDays, dayOfWeek, weekStart, weekDates, statusLabel, goalType,
    newId, newProgram, normalizeProgram, normalizeEntry, ensurePlanData, activeProgram, programById,
    duplicateProgram, newPhase, newGoal, programProgress, normalizeTemplate,
    sessionsById, entryStatus, templateSlot, entriesForWeek, entriesForDay,
    applyTemplate, copyWeek, moveEntry, monthGrid, daySummary, upcoming,
    evaluateGoals,
  };

  root.PL = PL;
  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
})(typeof window !== 'undefined' ? window : globalThis);
