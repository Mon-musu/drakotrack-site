/* ============================================================
   DrakoTrack — capa offline (Prompt 8)

   No reemplaza al motor de sync: lo acompaña. El motor sigue siendo
   la única fuente de verdad del documento, las revisiones, la fusión
   y las lápidas. Aquí viven:
   - una cola persistente de intentos de sincronización (metadatos,
     nunca una copia paralela del entrenamiento),
   - la comprobación de conectividad real (no solo navigator.onLine),
   - la escritura segura del documento con detección de cuota.

   Todo es puro y recibe almacenamiento/reloj/fetch por parámetro para
   poder probarlo sin navegador.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Offline = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'draktrack_offline_v1';
  const JOB_STATES = ['pending', 'sending', 'confirmed', 'conflict', 'retry', 'permanent'];
  const ACTIVE = ['pending', 'sending', 'retry', 'conflict'];
  const MAX_CONFIRMED = 80;

  function createQueue(options) {
    const opts = options || {};
    const storage = opts.storage;
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
      throw new Error('createQueue necesita storage con get/set');
    }
    const key = opts.key || STORAGE_KEY;
    const now = opts.now || (() => Date.now());
    const newId = opts.newId || (() => 'op-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
    const baseDelay = Number(opts.baseDelay) > 0 ? Number(opts.baseDelay) : 2000;
    const maxDelay = Number(opts.maxDelay) > 0 ? Number(opts.maxDelay) : 60000;
    const maxAttempts = Number(opts.maxAttempts) > 0 ? Number(opts.maxAttempts) : 8;
    let writeError = null;

    function blank() { return { v: 1, jobs: [] }; }
    function read() {
      try {
        const parsed = JSON.parse(storage.get(key) || '{}');
        if (!parsed || !Array.isArray(parsed.jobs)) return blank();
        return { v: 1, jobs: parsed.jobs.filter(j => j && j.id && j.account && JOB_STATES.includes(j.state)) };
      } catch (_) { return blank(); }
    }
    /* Un solo blob JSON: la escritura es todo o nada para la cola. Si el
       almacenamiento falla, la cola sigue viva en memoria y se informa; no se
       borra nada para "hacer sitio". */
    function write(all) {
      try {
        storage.set(key, JSON.stringify({ v: 1, jobs: all.jobs }));
        writeError = null;
        return true;
      } catch (error) {
        writeError = error && (error.name || 'storage_error');
        return false;
      }
    }
    function persist(all) {
      const trimmed = all.jobs.filter(j => j.state !== 'confirmed').concat(
        all.jobs.filter(j => j.state === 'confirmed').sort((a, b) => (b.confirmedAt || 0) - (a.confirmedAt || 0)).slice(0, MAX_CONFIRMED)
      );
      return write({ v: 1, jobs: trimmed });
    }
    function allJobs() { return read().jobs; }
    function byAccount(account) { return allJobs().filter(j => j.account === account); }
    function get(id) { return allJobs().find(j => j.id === id) || null; }

    function backoff(attempts) {
      const n = Math.max(1, Number(attempts) || 1);
      return Math.min(maxDelay, baseDelay * Math.pow(2, n - 1));
    }

    /* Deduplica por cuenta + tipo + destino mientras el trabajo siga activo:
       guardar diez series no crea diez envíos del mismo documento. */
    function enqueue(account, info) {
      if (!account) throw new Error('enqueue necesita una cuenta');
      const data = info || {};
      const all = read();
      const active = all.jobs.find(j => j.account === account && j.kind === (data.kind || 'sync') && j.target === (data.target || 'doc') && ACTIVE.includes(j.state));
      if (active) {
        active.updatedAt = now();
        active.reason = data.reason || active.reason || '';
        if (data.revision != null) active.revision = data.revision;
        if (data.digest) active.digest = data.digest;
        persist(all);
        return Object.assign({}, active);
      }
      const id = newId();
      const job = {
        id, account, kind: data.kind || 'sync', target: data.target || 'doc',
        state: 'pending', attempts: 0, nextAt: 0, createdAt: now(), updatedAt: now(),
        lastAttemptAt: null, confirmedAt: null, lastError: null,
        idempotencyKey: data.idempotencyKey || id,
        dependsOn: Array.isArray(data.dependsOn) ? data.dependsOn.slice(0, 10) : [],
        revision: data.revision == null ? 0 : data.revision,
        digest: data.digest || '', reason: data.reason || '',
      };
      all.jobs.push(job);
      persist(all);
      return Object.assign({}, job);
    }

    function patch(id, changes) {
      const all = read();
      const job = all.jobs.find(j => j.id === id);
      if (!job) return null;
      Object.assign(job, changes, { updatedAt: now() });
      persist(all);
      return Object.assign({}, job);
    }

    /* begin es idempotente: dos llamadas concurrentes no incrementan dos veces
       los intentos ni crean dos envíos. */
    function begin(id) {
      const job = get(id);
      if (!job || job.state === 'sending') return job;
      return patch(id, { state: 'sending', attempts: (Number(job.attempts) || 0) + 1, lastAttemptAt: now(), nextAt: 0, lastError: null });
    }

    function pending(id, reason) {
      return patch(id, { state: 'pending', nextAt: 0, lastError: reason ? String(reason).slice(0, 120) : null });
    }

    function retry(id, error) {
      const job = get(id);
      if (!job) return null;
      const attempts = Math.max(1, Number(job.attempts) || 1);
      const permanent = attempts >= maxAttempts;
      return patch(id, {
        state: permanent ? 'permanent' : 'retry',
        nextAt: permanent ? 0 : now() + backoff(attempts),
        lastError: error ? String(error).slice(0, 120) : 'network',
      });
    }

    function confirm(id) {
      return patch(id, { state: 'confirmed', confirmedAt: now(), nextAt: 0, lastError: null });
    }
    function conflict(id, detail) {
      return patch(id, { state: 'conflict', lastError: detail ? String(detail).slice(0, 120) : 'conflict' });
    }
    function failPermanent(id, error) {
      return patch(id, { state: 'permanent', lastError: error ? String(error).slice(0, 120) : 'error' });
    }
    function reopen(id) {
      const job = get(id);
      if (!job) return null;
      return patch(id, { state: 'pending', attempts: 0, nextAt: 0, lastError: null });
    }
    function remove(id) {
      const all = read();
      all.jobs = all.jobs.filter(j => j.id !== id);
      persist(all);
      return true;
    }
    function clearConfirmed(account) {
      const all = read();
      all.jobs = all.jobs.filter(j => !(j.account === account && j.state === 'confirmed'));
      persist(all);
    }
    /* Solo al eliminar la cuenta: no se usa al cerrar sesión, porque los
       cambios pendientes deben sobrevivir al logout y volver a subir después. */
    function removeAccount(account) {
      const all = read();
      all.jobs = all.jobs.filter(j => j.account !== account);
      persist(all);
    }

    /* Al arrancar, un trabajo que quedó "sending" pudo haberse aplicado o no.
       Vuelve a la cola: el op_id del motor evita duplicarlo en el servidor. */
    function recover(account) {
      const all = read();
      let changed = false;
      all.jobs.forEach(j => {
        if (j.account === account && j.state === 'sending') {
          j.state = 'retry'; j.nextAt = now(); j.lastError = 'interrupted'; j.updatedAt = now(); changed = true;
        }
      });
      if (changed) persist(all);
      return byAccount(account);
    }

    function depsReady(job, jobs) {
      return (job.dependsOn || []).every(id => {
        const dep = jobs.find(j => j.id === id);
        return dep && dep.state === 'confirmed';
      });
    }
    function next(account, at) {
      const jobs = byAccount(account);
      if (jobs.some(j => j.state === 'sending')) return null;
      const time = at == null ? now() : at;
      const all = allJobs();
      return jobs
        .filter(j => (j.state === 'pending' || j.state === 'retry') && (Number(j.nextAt) || 0) <= time && depsReady(j, all))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0] || null;
    }

    function stats(account) {
      const jobs = byAccount(account);
      const count = state => jobs.filter(j => j.state === state).length;
      const pendingJobs = jobs.filter(j => ACTIVE.includes(j.state));
      const nextAt = pendingJobs.filter(j => j.state === 'pending' || j.state === 'retry').map(j => Number(j.nextAt) || 0);
      return {
        total: jobs.length,
        pending: count('pending') + count('retry') + count('sending'),
        sending: count('sending'),
        conflicts: count('conflict'),
        permanent: count('permanent'),
        confirmed: count('confirmed'),
        retry: count('retry'),
        nextAt: nextAt.length ? Math.min.apply(null, nextAt) : null,
        lastError: pendingJobs.map(j => j.lastError).filter(Boolean).slice(-1)[0] || null,
        lastConfirmedAt: jobs.filter(j => j.state === 'confirmed').reduce((max, j) => Math.max(max, j.confirmedAt || 0), 0) || null,
      };
    }

    return {
      key, enqueue, begin, pending, retry, confirm, conflict, failPermanent,
      reopen, remove, clearConfirmed, removeAccount, recover, next, stats,
      get, list: byAccount, all: allJobs, backoff,
      writeError: () => writeError,
    };
  }

  /* ---------------- Conectividad real ---------------- */
  /* navigator.onLine solo dice si hay una interfaz de red. El servidor puede
     no ser accesible (portal cautivo, DNS, 5xx). Se comprueba con una petición
     HEAD al propio origen, sin caché y con timeout. */
  async function probe(fetchImpl, options) {
    const opts = options || {};
    const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (typeof f !== 'function') return false;
    const url = opts.url || './index.html?dt_probe=1';
    let controller = null;
    try { if (typeof AbortController !== 'undefined') controller = new AbortController(); } catch (_) {}
    const timer = setTimeout(() => { if (controller) controller.abort(); }, Number(opts.timeout) > 0 ? Number(opts.timeout) : 4000);
    try {
      const response = await f(url, {
        method: 'HEAD', cache: 'no-store', credentials: 'same-origin',
        signal: controller ? controller.signal : undefined,
        headers: { 'X-Drako-Probe': '1' },
      });
      if (!response) return false;
      return !!(response.ok || response.status === 0 || response.type === 'opaqueredirect');
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- Escritura segura del documento ---------------- */
  function isQuotaError(error) {
    if (!error) return false;
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 || error.code === 1014;
  }
  /* Nunca borra la versión anterior para "hacer sitio". Devuelve el resultado
     para que la app pueda avisar y ofrecer exportar. */
  /* Acepta tanto un adaptador { get, set, remove } como el localStorage
     nativo ({ getItem, setItem, removeItem }). Llamar a storage.set sobre
     localStorage nativo lanzaba TypeError y bloqueaba todos los guardados. */
  function readStorage(storage, key) {
    if (typeof storage.getItem === 'function') return storage.getItem(key);
    return storage.get(key);
  }
  function writeStorage(storage, key, value) {
    if (typeof storage.setItem === 'function') return storage.setItem(key, value);
    return storage.set(key, value);
  }
  function removeStorage(storage, key) {
    if (typeof storage.removeItem === 'function') return storage.removeItem(key);
    return storage.remove(key);
  }
  function writeDocument(storage, key, value) {
    let previous = null;
    try { previous = readStorage(storage, key); } catch (_) {}
    try {
      writeStorage(storage, key, value);
      let stored;
      try { stored = readStorage(storage, key); } catch (_) { stored = value; }
      if (stored !== value) return { ok: false, reason: 'verification_failed', quota: false, previousPreserved: true };
      return { ok: true, quota: false, bytes: String(value).length };
    } catch (error) {
      let preserved = true;
      try { preserved = readStorage(storage, key) === previous; } catch (_) { preserved = false; }
      return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable', quota: isQuotaError(error), error: error && error.name, previousPreserved: preserved };
    }
  }
  function storageAvailable(storage) {
    try {
      const probeKey = '__dt_probe__';
      writeStorage(storage, probeKey, '1');
      const ok = readStorage(storage, probeKey) === '1';
      removeStorage(storage, probeKey);
      return ok;
    } catch (_) { return false; }
  }

  /* Una actualización nunca debe interrumpir un entrenamiento ni descartar
     cambios pendientes. El usuario decide cuándo aplicarla. */
  function updateDecision(info) {
    const data = info || {};
    if (data.hasActiveSession) return { defer: true, reason: 'active-session' };
    if (Number(data.pending) > 0) return { defer: true, reason: 'pending-changes' };
    if (data.conflicts > 0) return { defer: true, reason: 'conflicts' };
    return { defer: false, reason: null };
  }

  /* El rollback del Service Worker es más destructivo que una actualización:
     deja la app sin caché. Solo se permite online y cuando no hay trabajo que
     pueda perderse. No toca localStorage ni la cola; eso lo garantiza el
     llamador, que borra exclusivamente las cachés de DrakoTrack. */
  function rollbackDecision(info) {
    const data = info || {};
    if (data.online === false) return { allow: false, reason: 'offline' };
    const update = updateDecision(data);
    if (update.defer) return { allow: false, reason: update.reason };
    return { allow: true, reason: null };
  }

  /* Borra solo las cachés cuyo nombre empieza por el prefijo de la app. Se
     usa durante el rollback; nunca debe recibir un prefijo vacío. */
  async function clearOwnCaches(cacheStorage, prefix) {
    const wanted = typeof prefix === 'string' && prefix ? prefix : 'drakotrack-';
    if (!cacheStorage || typeof cacheStorage.keys !== 'function' || typeof cacheStorage.delete !== 'function') {
      return { ok: false, reason: 'unavailable', deleted: [], total: 0 };
    }
    let names;
    try { names = await cacheStorage.keys(); } catch (_) {
      return { ok: false, reason: 'unavailable', deleted: [], total: 0 };
    }
    const own = (Array.isArray(names) ? names : []).filter(name => String(name).startsWith(wanted));
    const deleted = [];
    for (const name of own) {
      try { if (await cacheStorage.delete(name)) deleted.push(name); } catch (_) {}
    }
    const ok = deleted.length === own.length;
    return { ok, reason: ok ? null : 'partial', deleted, total: own.length };
  }

  return {
    STORAGE_KEY, JOB_STATES, ACTIVE,
    createQueue, probe, writeDocument, storageAvailable, isQuotaError, updateDecision,
    rollbackDecision, clearOwnCaches,
    backoff: (attempts, base, max) => Math.min(max || 60000, (base || 2000) * Math.pow(2, Math.max(1, attempts) - 1)),
  };
});
