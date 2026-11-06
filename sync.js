/* ============================================================
   DrakoTrack — sincronización entre dispositivos
   ------------------------------------------------------------
   Módulo puro: no toca el DOM ni la red. Se usa igual en el
   navegador (window.DrakoSync) y en las pruebas de Node
   (require('./sync')), que es la única forma de probar de
   verdad la combinación de datos.

   Piezas:
   - digest(doc): huella compacta del documento que el
     dispositivo ya sincronizó. Es la base del merge a tres
     bandas; no guarda los datos otra vez.
   - merge(base, local, remote): une cambios independientes por
     identificador estable y deja los choques como conflicto,
     conservando las dos versiones.
   - createEngine(...): cola persistente, reintentos, copia de
     seguridad previa y resolución de conflictos.

   Nada de esto decide qué versión es "más nueva" por fecha: el
   servidor lleva la revisión y rechaza escrituras basadas en una
   revisión vieja (ver api/data/[action].js).
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DrakoSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLLECTIONS = ['workouts', 'sessions', 'records', 'prs', 'weights', 'exercises', 'programs', 'planner'];
  const KEYED_OBJECTS = ['prefs', 'profile', 'achievements'];
  const SCALARS = ['photo', 'consent'];
  const SETS = ['hiddenLib'];
  const MAX_CONFLICTS = 20;
  const MAX_STASH_BYTES = 400000;
  const STORAGE_KEY = 'draktrack_sync_v1';

  /* ---------------------------------------------------------------- hash */
  /* JSON estable: mismo valor, mismo texto, sin importar el orden en que el
     motor de JavaScript enumeró las claves. */
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  /* Dos FNV-1a de 32 bits con semillas distintas: 64 bits de huella, sin
     dependencias ni criptografía asíncrona. Solo se usa para detectar
     "¿cambió esto?", nunca para guardar datos. */
  function hash(text) {
    const str = String(text);
    let a = 0x811c9dc5, b = 0xc2b2ae35;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      a ^= code; a = Math.imul(a, 0x01000193) >>> 0;
      b ^= code + i; b = Math.imul(b, 0x85ebca6b) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const same = (a, b) => stable(a) === stable(b);
  const isObj = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  /* Identificador estable de un elemento. Los documentos modernos siempre
     traen id; los antiguos (prs y pesos sin id) se identifican por su
     contenido, que es lo que evita duplicarlos al fusionar. */
  function itemKey(item, index) {
    if (!isObj(item)) return null;
    if (typeof item.id === 'string' && item.id) return item.id;
    return '#' + hash(stable(item)) + (index === undefined ? '' : '');
  }
  function setKey(set, index) {
    if (!isObj(set)) return null;
    if (typeof set.id === 'string' && set.id) return set.id;
    return '#' + index;
  }
  function exerciseKey(ex, index) {
    if (!isObj(ex)) return null;
    if (typeof ex.id === 'string' && ex.id) return ex.id;
    return '#' + index;
  }

  /* -------------------------------------------------------------- digest */
  function sessionDigest(session) {
    const sets = {};
    const shell = clone(session) || {};
    shell.exercises = (Array.isArray(shell.exercises) ? shell.exercises : []).map((ex, i) => {
      const ek = exerciseKey(ex, i);
      (Array.isArray(ex.sets) ? ex.sets : []).forEach((set, j) => {
        const sk = setKey(set, j);
        sets[ek + '::' + sk] = hash(stable(set));
      });
      const copy = Object.assign({}, ex);
      delete copy.sets;
      return copy;
    });
    return { h: hash(stable(shell)), sets };
  }

  function digest(doc) {
    const out = { items: {}, objects: {}, fields: {} };
    COLLECTIONS.forEach(name => {
      const map = {};
      const list = doc && Array.isArray(doc[name]) ? doc[name] : [];
      list.forEach((item, i) => {
        const key = itemKey(item, i);
        if (!key) return;
        map[key] = name === 'sessions' ? sessionDigest(item) : hash(stable(item));
      });
      out.items[name] = map;
    });
    KEYED_OBJECTS.forEach(name => {
      const map = {};
      const value = doc && isObj(doc[name]) ? doc[name] : {};
      Object.keys(value).forEach(key => { map[key] = hash(stable(value[key])); });
      out.objects[name] = map;
    });
    SCALARS.concat(SETS).forEach(name => {
      out.fields[name] = doc && doc[name] !== undefined ? hash(stable(doc[name])) : null;
    });
    return out;
  }

  /* ------------------------------------------------------------ conflictos */
  function conflict(entry) {
    return Object.assign({ at: Date.now(), kind: 'modified' }, entry);
  }
  function stashable(value) {
    try { return JSON.stringify(value).length <= MAX_STASH_BYTES; } catch (_) { return false; }
  }
  function mergeConflicts(existing, additions) {
    const out = Array.isArray(existing) ? existing.slice() : [];
    (additions || []).forEach(entry => {
      if (!entry) return;
      const at = out.findIndex(item => item && item.key === entry.key);
      if (at >= 0) out[at] = entry;
      else pushConflict(out, entry);
    });
    return out.slice(-MAX_CONFLICTS);
  }
  function pushConflict(list, entry) {
    if (list.length >= MAX_CONFLICTS) {
      const dropped = list.shift();
      list.dropped = (list.dropped || 0) + 1;
      if (dropped) list.droppedKeys = (list.droppedKeys || []).concat(dropped.key);
    }
    list.push(entry);
  }

  /* --------------------------------------------------------------- merge */
  function byKey(list, keyFn) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item, i) => {
      const key = keyFn(item, i);
      if (key && !map.has(key)) map.set(key, item);
    });
    return map;
  }

  /* Lápida (tombstone) de una serie: la copia de lo borrado, con su hora.
     Se guarda dentro del ejercicio para que una sincronización antigua no
     resucite la serie y para poder recuperarla si el otro dispositivo la
     había modificado. Es un campo opcional: las sesiones antiguas siguen
     combinándose igual. */
  const MAX_TOMBSTONES = 40;
  function tombstonesOf(ex) {
    return isObj(ex) && isObj(ex.setTombstones) ? ex.setTombstones : {};
  }
  function trimTombstones(map) {
    const keys = Object.keys(map);
    if (keys.length <= MAX_TOMBSTONES) return map;
    keys.sort((a, b) => (Number(map[a] && map[a].at) || 0) - (Number(map[b] && map[b].at) || 0));
    keys.slice(0, keys.length - MAX_TOMBSTONES).forEach(key => { delete map[key]; });
    return map;
  }
  function setDeletedConflict(entry, conflicts) {
    return conflict(Object.assign({ collection: 'sessions', label: 'Una serie' }, entry, {
      key: 'sessions:' + entry.id + ':' + entry.exerciseId + ':' + entry.setId + ':deleted',
    }));
  }

  /* Combina las series de un ejercicio respetando las lápidas de los dos
     lados. Devuelve las series y las lápidas que sobreviven. */
  function mergeExerciseSets(localEx, remoteEx, baseSets, keyPrefix, conflicts, sessionId, exerciseId) {
    const l = byKey(localEx && localEx.sets, setKey);
    const r = byKey(remoteEx && remoteEx.sets, setKey);
    const lt = tombstonesOf(localEx);
    const rt = tombstonesOf(remoteEx);
    const base = baseSets || {};
    const out = [];
    const tombstones = {};
    const seen = new Set();
    const consider = key => {
      if (seen.has(key)) return;
      seen.add(key);
      const lv = l.get(key), rv = r.get(key);
      const localTomb = lt[key], remoteTomb = rt[key];
      const baseHash = base[keyPrefix + '::' + key];
      const lh = lv ? hash(stable(lv)) : null;
      const rh = rv ? hash(stable(rv)) : null;

      /* 1. Borrada en los dos dispositivos: sigue borrada. */
      if (localTomb && remoteTomb) { tombstones[key] = localTomb; return; }

      /* 2. Borrada aquí y modificada allí: no se resucita sola, pero la
            versión del otro dispositivo se conserva para poder decidir. */
      if (localTomb) {
        if (rv && !(baseHash && rh === baseHash)) {
          pushConflict(conflicts, setDeletedConflict({
            kind: 'set-deleted', id: sessionId, exerciseId, setId: key,
            number: localTomb.number,
            remote: stashable(rv) ? rv : null,
            deleted: stashable(localTomb) ? localTomb : null,
          }, conflicts));
        }
        tombstones[key] = localTomb;
        return;
      }

      /* 3. Borrada allí y modificada aquí: se conserva el cambio y se avisa.
            Una serie nueva de este dispositivo nunca se borra por una lápida
            ajena que coincida por casualidad. */
      if (remoteTomb) {
        if (lv && baseHash && lh !== baseHash) {
          pushConflict(conflicts, setDeletedConflict({
            kind: 'set-deleted-remote', id: sessionId, exerciseId, setId: key,
            number: lv.number, remote: null,
            deleted: stashable(remoteTomb) ? remoteTomb : null,
          }, conflicts));
          out.push(lv);
          return;
        }
        if (lv && !baseHash) { out.push(lv); return; }
        tombstones[key] = remoteTomb;
        return;
      }

      /* 4. Sin lápidas: combinación normal por huella de la última
            sincronización. */
      if (lv && rv) {
        if (lh === rh) out.push(lv);
        else if (baseHash && lh === baseHash) out.push(rv);
        else if (baseHash && rh === baseHash) out.push(lv);
        else {
          out.push(lv);
          pushConflict(conflicts, conflict({
            kind: 'set', collection: 'sessions', id: sessionId, exerciseId,
            key: 'sessions:' + sessionId + ':' + exerciseId + ':' + key,
            label: 'Una serie', remote: stashable(rv) ? rv : null,
          }));
        }
      } else if (lv) {
        /* Falta en el otro lado. Sin lápida no se puede afirmar que se borró:
           si aquí hay cambios se conservan y se avisa del posible borrado. */
        if (baseHash && lh !== baseHash) {
          pushConflict(conflicts, setDeletedConflict({
            kind: 'set-deleted-remote', id: sessionId, exerciseId, setId: key,
            number: lv.number, remote: null, deleted: null,
          }, conflicts));
        }
        if (!baseHash || lh !== baseHash) out.push(lv);
      } else if (rv) {
        if (baseHash && rh !== baseHash) {
          pushConflict(conflicts, setDeletedConflict({
            kind: 'set-deleted', id: sessionId, exerciseId, setId: key,
            number: rv.number, remote: stashable(rv) ? rv : null, deleted: null,
          }, conflicts));
          out.push(rv);
        } else if (!baseHash) out.push(rv);
      }
    };
    l.forEach((_v, key) => consider(key));
    r.forEach((_v, key) => consider(key));
    return { sets: out, tombstones: trimTombstones(tombstones) };
  }

  function mergeSession(lv, rv, base, conflicts) {
    const id = itemKey(lv) || itemKey(rv);
    if (same(lv, rv)) return lv;
    const ld = sessionDigest(lv);
    const rd = sessionDigest(rv);
    const baseH = base && base.h;
    const localShellSame = Boolean(baseH && ld.h === baseH);
    const remoteShellSame = Boolean(baseH && rd.h === baseH);
    let shell;
    if (remoteShellSame || ld.h === rd.h) shell = lv;
    else if (localShellSame) shell = rv;
    else {
      pushConflict(conflicts, conflict({
        kind: 'item', collection: 'sessions', id, key: 'sessions:' + id,
        label: (lv && (lv.workoutName || lv.date)) || 'Una sesión',
        remote: stashable(rv) ? rv : null,
      }));
      return lv;
    }
    const out = clone(shell);
    const baseSets = (base && base.sets) || {};
    const lEx = byKey(lv && lv.exercises, exerciseKey);
    const rEx = byKey(rv && rv.exercises, exerciseKey);
    const chosen = byKey(Array.isArray(shell && shell.exercises) ? shell.exercises : [], exerciseKey);
    const keys = [];
    (Array.isArray(shell && shell.exercises) ? shell.exercises : []).forEach((ex, i) => keys.push(exerciseKey(ex, i)));
    lEx.forEach((_v, k) => { if (!keys.includes(k)) keys.push(k); });
    rEx.forEach((_v, k) => { if (!keys.includes(k)) keys.push(k); });
    out.exercises = keys.map(key => {
      const baseEx = chosen.get(key) || lEx.get(key) || rEx.get(key) || {};
      const merged = clone(baseEx);
      const setsResult = mergeExerciseSets(
        lEx.get(key), rEx.get(key), baseSets, key, conflicts, id, key,
      );
      merged.sets = setsResult.sets;
      if (!merged.sets.length) delete merged.sets;
      if (setsResult.tombstones && Object.keys(setsResult.tombstones).length) merged.setTombstones = setsResult.tombstones;
      else delete merged.setTombstones;
      return merged;
    });
    return out;
  }

  function mergeCollection(name, baseMap, localList, remoteList, conflicts) {
    const l = byKey(localList, itemKey);
    const r = byKey(remoteList, itemKey);
    const base = baseMap || {};
    const out = [];
    const seen = new Set();
    const consider = key => {
      if (seen.has(key) || !key) return;
      seen.add(key);
      const lv = l.get(key), rv = r.get(key);
      const baseHash = base[key];
      if (lv && rv) {
        if (name === 'sessions' && isObj(baseHash)) {
          out.push(mergeSession(lv, rv, baseHash, conflicts));
          return;
        }
        const lh = hash(stable(lv)), rh = hash(stable(rv));
        if (lh === rh) out.push(lv);
        else if (baseHash && lh === baseHash) out.push(rv);
        else if (baseHash && rh === baseHash) out.push(lv);
        else {
          out.push(lv);
          pushConflict(conflicts, conflict({
            kind: 'item', collection: name, id: key, key: name + ':' + key,
            label: lv.name || lv.workoutName || lv.exercise || 'Un elemento',
            remote: stashable(rv) ? rv : null,
          }));
        }
      } else if (lv && !rv) {
        if (!baseHash) out.push(lv);
        else if (hash(stable(lv)) === baseHash) { /* borrado en el otro dispositivo */ }
        else {
          out.push(lv);
          pushConflict(conflicts, conflict({
            kind: 'deleted-remote', collection: name, id: key, key: name + ':' + key,
            label: lv.name || lv.workoutName || lv.exercise || 'Un elemento', remote: null,
          }));
        }
      } else if (!lv && rv) {
        if (!baseHash) out.push(rv);
        else if (hash(stable(rv)) === baseHash) { /* borrado en este dispositivo */ }
        else {
          out.push(rv);
          pushConflict(conflicts, conflict({
            kind: 'deleted-local', collection: name, id: key, key: name + ':' + key,
            label: rv.name || rv.workoutName || rv.exercise || 'Un elemento',
            remote: stashable(rv) ? rv : null,
          }));
        }
      }
    };
    l.forEach((_v, key) => consider(key));
    r.forEach((_v, key) => consider(key));
    return out;
  }

  function mergeKeyedObject(name, baseMap, localValue, remoteValue, conflicts) {
    const l = isObj(localValue) ? localValue : {};
    const r = isObj(remoteValue) ? remoteValue : {};
    const base = baseMap || {};
    const out = {};
    Object.keys(l).forEach(key => {
      const lv = l[key], rv = r[key], baseHash = base[key];
      if (rv === undefined) { out[key] = lv; return; }
      const lh = hash(stable(lv)), rh = hash(stable(rv));
      if (lh === rh) out[key] = lv;
      else if (baseHash && lh === baseHash) out[key] = rv;
      else if (baseHash && rh === baseHash) out[key] = lv;
      else {
        out[key] = lv;
        pushConflict(conflicts, conflict({
          kind: 'field', collection: name, id: key, key: name + ':' + key,
          label: name === 'prefs' ? 'Una preferencia' : 'Un dato del perfil',
          remote: stashable(rv) ? rv : null,
        }));
      }
    });
    Object.keys(r).forEach(key => {
      if (out[key] !== undefined || l[key] !== undefined) return;
      const baseHash = base[key];
      /* Llegó del otro dispositivo; si existía en la base y aquí no está,
         es que este dispositivo lo borró. */
      if (!baseHash) out[key] = r[key];
    });
    return out;
  }

  function mergeAchievements(baseMap, localValue, remoteValue) {
    const l = isObj(localValue) ? localValue : {};
    const r = isObj(remoteValue) ? remoteValue : {};
    const out = {};
    Object.keys(l).forEach(key => { out[key] = l[key]; });
    Object.keys(r).forEach(key => {
      if (out[key] === undefined) out[key] = r[key];
      else if (typeof out[key] === 'string' && typeof r[key] === 'string' && r[key] < out[key]) out[key] = r[key];
    });
    return out;
  }

  /* merge(base, local, remote):
     base es la huella de lo último sincronizado (o null en el primer contacto).
     Devuelve el documento combinado y la lista de conflictos sin decidir. */
  function merge(baseDigest, local, remote) {
    const localDoc = isObj(local) ? local : {};
    const remoteDoc = isObj(remote) ? remote : {};
    const base = isObj(baseDigest) ? baseDigest : { items: {}, objects: {}, fields: {} };
    const conflicts = [];
    const out = {};

    COLLECTIONS.forEach(name => {
      const baseMap = name === 'sessions' ? (base.items && base.items.sessions) || {} : (base.items && base.items[name]) || {};
      const list = mergeCollection(name, baseMap, localDoc[name], remoteDoc[name], conflicts);
      if (list.length) out[name] = list;
    });

    KEYED_OBJECTS.forEach(name => {
      if (name === 'achievements') {
        if (localDoc[name] !== undefined || remoteDoc[name] !== undefined) {
          out[name] = mergeAchievements((base.objects && base.objects[name]) || {}, localDoc[name], remoteDoc[name]);
        }
        return;
      }
      if (localDoc[name] !== undefined || remoteDoc[name] !== undefined) {
        out[name] = mergeKeyedObject(name, (base.objects && base.objects[name]) || {}, localDoc[name], remoteDoc[name], conflicts);
      }
    });

    /* Listas sin identidad propia: ocultar es reversible, así que la unión
       nunca pierde nada. */
    const hidden = new Set([].concat(Array.isArray(localDoc.hiddenLib) ? localDoc.hiddenLib : [], Array.isArray(remoteDoc.hiddenLib) ? remoteDoc.hiddenLib : []));
    if (localDoc.hiddenLib !== undefined || remoteDoc.hiddenLib !== undefined) out.hiddenLib = Array.from(hidden);

    SCALARS.forEach(name => {
      const lv = localDoc[name], rv = remoteDoc[name], baseHash = base.fields ? base.fields[name] : null;
      const hasL = lv !== undefined && lv !== null, hasR = rv !== undefined && rv !== null;
      if (!hasL && !hasR) return;
      if (!hasR) { out[name] = lv; return; }
      if (!hasL) { out[name] = rv; return; }
      if (same(lv, rv)) { out[name] = lv; return; }
      const lh = hash(stable(lv)), rh = hash(stable(rv));
      if (baseHash && lh === baseHash) { out[name] = rv; return; }
      if (baseHash && rh === baseHash) { out[name] = lv; return; }
      out[name] = lv;
      pushConflict(conflicts, conflict({
        kind: 'field', collection: name, id: name, key: name,
        label: name === 'photo' ? 'La foto de progreso' : 'El consentimiento',
        remote: stashable(rv) ? rv : null,
      }));
    });

    /* Cualquier clave presente en un solo lado y desconocida para la base se
       conserva: perder un campo nuevo es peor que arrastrarlo. */
    Object.keys(localDoc).forEach(key => {
      if (out[key] !== undefined || COLLECTIONS.includes(key) || KEYED_OBJECTS.includes(key) || SCALARS.includes(key) || SETS.includes(key)) return;
      out[key] = localDoc[key];
    });
    Object.keys(remoteDoc).forEach(key => {
      if (out[key] !== undefined) return;
      out[key] = remoteDoc[key];
    });

    return { data: out, conflicts };
  }

  function hasContent(doc) {
    if (!isObj(doc)) return false;
    return COLLECTIONS.some(name => Array.isArray(doc[name]) && doc[name].length > 0) ||
      Boolean(doc.photo) ||
      (isObj(doc.prefs) && Object.keys(doc.prefs).length > 0) ||
      (isObj(doc.profile) && Object.keys(doc.profile).length > 0) ||
      Boolean(doc.consent);
  }

  /* --------------------------------------------------------------- motor */
  function randomId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) { /* sin crypto: se usa el reloj */ }
    return 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function memoryStorage() {
    const map = new Map();
    return {
      get: key => (map.has(key) ? map.get(key) : null),
      set: (key, value) => { map.set(key, String(value)); },
      remove: key => { map.delete(key); },
    };
  }

  function createEngine(options) {
    const opts = options || {};
    const storage = opts.storage || memoryStorage();
    const remote = opts.remote;
    if (!remote || typeof remote.load !== 'function' || typeof remote.save !== 'function') {
      throw new Error('createEngine necesita un adaptador remoto con load() y save()');
    }
    const now = opts.now || (() => Date.now());
    const newId = opts.newId || randomId;
    const key = opts.key || STORAGE_KEY;

    function readAll() {
      try { const parsed = JSON.parse(storage.get(key) || '{}'); return isObj(parsed) ? parsed : {}; }
      catch (_) { return {}; }
    }
    function writeAll(all) {
      try { storage.set(key, JSON.stringify(all)); }
      catch (error) {
        /* Sin espacio: se conserva al menos la marca de pendiente y la copia
           de seguridad, que es lo que evita perder datos. */
        const slim = {};
        Object.keys(all).forEach(account => {
          const st = all[account] || {};
          slim[account] = { rev: st.rev, digest: null, dirty: true, opId: st.opId, conflicts: st.conflicts || [], backup: st.backup || null, lastSync: st.lastSync || null };
        });
        try { storage.set(key, JSON.stringify(slim)); } catch (_) {}
      }
    }
    function raw(account) { return readAll()[account] || null; }
    function save(account, st) { const all = readAll(); all[account] = st; writeAll(all); }
    function blank() {
      return { rev: null, digest: null, dirty: false, opId: null, conflicts: [], backup: null, lastSync: null, lastError: null, revision: 0 };
    }
    function state(account) {
      const st = raw(account);
      return st ? Object.assign(blank(), st) : null;
    }
    function markDirty(account) {
      const st = Object.assign(blank(), raw(account) || {});
      st.dirty = true;
      /* Cada cambio local sube la revisión. Una petición que ya estaba en
         vuelo no puede dar por sincronizada esta versión nueva. */
      st.revision = (Number(st.revision) || 0) + 1;
      if (!st.opId) st.opId = newId();
      save(account, st);
      return st;
    }
    function revisionOf(account) {
      const current = raw(account);
      return Number(current && current.revision) || 0;
    }
    /* Escribe el estado releyendo antes lo que otro guardado local haya podido
       cambiar mientras había una petición en vuelo: la revisión más nueva y la
       marca de pendiente mandan, nunca se pierden. */
    function persist(account, st, keepFreshConflicts) {
      const fresh = Object.assign(blank(), raw(account) || {});
      st.revision = Math.max(Number(fresh.revision) || 0, Number(st.revision) || 0);
      st.dirty = st.dirty === true || fresh.dirty === true;
      st.opId = st.opId || fresh.opId || null;
      /* Al resolver un conflicto la lista se recorta a propósito: en ese caso no
         se vuelve a mezclar con la que había en el almacenamiento. */
      st.conflicts = keepFreshConflicts === false ? (Array.isArray(st.conflicts) ? st.conflicts : []) : mergeConflicts(fresh.conflicts, st.conflicts);
      if (!st.backup && fresh.backup) st.backup = fresh.backup;
      if (st.lastSync == null && fresh.lastSync != null) st.lastSync = fresh.lastSync;
      save(account, st);
      return st;
    }
    function backup(account, doc, rev) {
      const st = Object.assign(blank(), raw(account) || {});
      st.backup = { at: now(), rev: rev === undefined ? st.rev : rev, data: clone(doc) };
      save(account, st);
    }

    const inflight = new Map();
    function once(account, fn) {
      if (inflight.has(account)) return inflight.get(account);
      const promise = Promise.resolve().then(fn).finally(() => inflight.delete(account));
      inflight.set(account, promise);
      return promise;
    }

    async function push(account, st, doc, baseRev, startRevision) {
      /* Se congela exactamente lo que se envía: la huella debe describir lo que
         el servidor tiene, no el documento que el usuario siguió editando. */
      const snapshot = clone(doc);
      const result = await remote.save(clone(snapshot), baseRev === undefined ? st.rev : baseRev, st.opId);
      st.rev = Number.isInteger(result && result.rev) ? result.rev : st.rev;
      st.digest = digest(snapshot);
      st.lastSync = now();
      st.lastError = null;
      persist(account, st);
      /* ¿Se guardó algo nuevo mientras la petición estaba en vuelo? Entonces
         esta respuesta es de una versión anterior y el cambio sigue pendiente. */
      if (revisionOf(account) !== (startRevision === undefined ? st.revision : startRevision)) {
        st.revision = revisionOf(account);
        st.dirty = true;
        st.opId = st.opId || newId();
      } else {
        st.dirty = false;
        st.opId = null;
      }
      save(account, st);
      return result;
    }

    function isConflictError(error) {
      return Boolean(error) && (error.status === 409 || error.conflict === true);
    }

    async function sync(account, doc) {
      /* Si ya hay una sincronización en vuelo se espera a que acabe y se vuelve
         a intentar con el documento actual: reutilizar la respuesta vieja es
         justo lo que dejaba cambios sin subir. */
      const running = inflight.get(account);
      if (running) await Promise.resolve(running).catch(() => null);
      return once(account, async () => {
        const st = Object.assign(blank(), raw(account) || {});
        const startRevision = revisionOf(account);
        /* Primer contacto con esta cuenta en este dispositivo. */
        if (st.rev === null) {
          const first = await remote.load();
          const remoteData = first && isObj(first.data) ? first.data : null;
          if (!remoteData || !hasContent(remoteData)) {
            await push(account, st, doc, null, startRevision);
            return { status: 'pushed', rev: st.rev, data: null, conflicts: [], needsPush: st.dirty };
          }
          /* La respuesta de un primer guardado se perdió pero el servidor sí
             lo aplicó: el contenido coincide, así que no se repite. */
          if (same(remoteData, doc)) {
            st.rev = Number.isInteger(first.rev) ? first.rev : 0;
            st.digest = digest(remoteData);
            st.dirty = false;
            st.opId = null;
            st.lastSync = now();
            persist(account, st);
            return { status: 'replayed', rev: st.rev, data: null, conflicts: [], needsPush: st.dirty };
          }
          if (!hasContent(doc)) {
            st.rev = Number.isInteger(first.rev) ? first.rev : 0;
            st.digest = digest(remoteData);
            st.dirty = false;
            st.opId = null;
            st.lastSync = now();
            persist(account, st);
            return { status: 'pulled', rev: st.rev, data: remoteData, conflicts: [], needsPush: st.dirty };
          }
          const baseRev = Number.isInteger(first.rev) ? first.rev : 0;
          const merged = merge(null, doc, remoteData);
          st.rev = baseRev;
          st.digest = digest(remoteData);
          persist(account, Object.assign(st, {
            conflicts: mergeConflicts(st.conflicts, merged.conflicts),
            dirty: true,
            opId: st.opId || newId(),
          }));
          return { status: 'merged', rev: baseRev, data: merged.data, conflicts: merged.conflicts, needsPush: true };
        }

        if (st.dirty) {
          try {
            const result = await push(account, st, doc, undefined, startRevision);
            return { status: result && result.replay ? 'replayed' : 'pushed', rev: st.rev, data: null, conflicts: [], needsPush: st.dirty };
          } catch (error) {
            if (!isConflictError(error)) {
              st.lastError = 'offline';
              persist(account, Object.assign(st, { dirty: true, opId: st.opId || newId() }));
              throw error;
            }
            /* El servidor tiene otra revisión: se combina, nunca se pisa. */
            const current = await remote.load();
            const remoteData = current && isObj(current.data) ? current.data : null;
            if (!remoteData) {
              /* Respuesta vacía inesperada: no se borra nada local. */
              st.lastError = 'empty_remote';
              persist(account, Object.assign(st, { dirty: true, opId: st.opId || newId() }));
              return { status: 'kept-local', rev: st.rev, data: null, conflicts: [], needsPush: true };
            }
            if (revisionOf(account) !== startRevision) {
              /* El documento cambió mientras se leía el servidor: esta base ya
                 no sirve. Se deja pendiente y se reintenta con lo más reciente. */
              persist(account, Object.assign(st, { dirty: true, opId: st.opId || newId(), lastError: null }));
              return { status: 'retrying', rev: st.rev, data: null, conflicts: [], needsPush: true };
            }
            backup(account, doc);
            const merged = merge(st.digest, doc, remoteData);
            st.rev = Number.isInteger(current.rev) ? current.rev : st.rev;
            st.digest = digest(remoteData);
            persist(account, Object.assign(st, {
              conflicts: mergeConflicts(st.conflicts, merged.conflicts),
              dirty: true, lastError: null,
            }));
            return { status: 'merged', rev: st.rev, data: merged.data, conflicts: merged.conflicts, needsPush: true };
          }
        }

        /* Sin cambios locales: se adopta lo del servidor si avanzó. */
        const current = await remote.load();
        if (revisionOf(account) !== startRevision) {
          /* Mientras se leía el servidor se guardó algo aquí: lo leído ya no es
             la base de nada, así que se deja pendiente en vez de pisarlo. */
          persist(account, Object.assign(st, { dirty: true, opId: st.opId || newId(), lastError: null }));
          return { status: 'retrying', rev: st.rev, data: null, conflicts: [], needsPush: true };
        }
        const remoteData = current && isObj(current.data) ? current.data : null;
        const remoteRev = current && Number.isInteger(current.rev) ? current.rev : st.rev;
        if (!remoteData) return { status: 'clean', rev: st.rev, data: null, conflicts: [] };
        /* Se compara siempre, incluso con la misma revisión: un cambio local
           que no llegó a marcarse (cierre abrupto, migración) no puede quedar
           como "sincronizado" sin haberse enviado. */
        const merged = merge(st.digest, doc, remoteData);
        st.rev = remoteRev;
        st.digest = digest(remoteData);
        st.lastError = null;
        st.conflicts = mergeConflicts(st.conflicts, merged.conflicts);
        /* Si tras combinar queda algo que el servidor no tiene, es un cambio
           local que todavía no se envió: se marca pendiente en vez de darlo
           por sincronizado (nunca se muestra "todo al día" en falso). */
        if (!same(merged.data, remoteData)) {
          persist(account, Object.assign(st, { dirty: true, opId: st.opId || newId() }));
          return { status: 'merged', rev: st.rev, data: merged.data, conflicts: merged.conflicts, needsPush: true };
        }
        st.dirty = false;
        st.opId = null;
        st.lastSync = now();
        persist(account, st);
        if (same(merged.data, doc)) return { status: 'clean', rev: st.rev, data: null, conflicts: [] };
        return { status: 'pulled', rev: st.rev, data: merged.data, conflicts: merged.conflicts };
      });
    }

    /* Restaurar la copia del servidor a mano: es la única acción destructiva y
       siempre deja antes una copia local. */
    async function forcePull(account, doc) {
      return once(account, async () => {
        const st = Object.assign(blank(), raw(account) || {});
        const current = await remote.load();
        const remoteData = current && isObj(current.data) ? current.data : null;
        if (!remoteData || !hasContent(remoteData)) return { status: 'empty', data: null };
        backup(account, doc);
        st.rev = Number.isInteger(current.rev) ? current.rev : 0;
        st.digest = digest(remoteData);
        st.dirty = false;
        st.opId = null;
        st.conflicts = [];
        st.lastSync = now();
        persist(account, st, false);
        return { status: 'pulled', data: remoteData, rev: st.rev };
      });
    }

    function restoreBackup(account) {
      const st = Object.assign(blank(), raw(account) || {});
      if (!st.backup || !st.backup.data) return null;
      return { data: clone(st.backup.data), at: st.backup.at };
    }

    function resolveConflict(account, conflictKey, choice, doc) {
      const st = Object.assign(blank(), raw(account) || {});
      const index = (st.conflicts || []).findIndex(c => c.key === conflictKey);
      if (index < 0) return { data: doc, conflict: null };
      const entry = st.conflicts[index];
      st.conflicts.splice(index, 1);
      const out = clone(doc) || {};
      const collection = entry.collection;
      /* Serie borrada en un dispositivo y modificada en el otro: se decide con
         las dos versiones delante y nada se descarta por el camino. */
      if (entry.kind === 'set-deleted' || entry.kind === 'set-deleted-remote') {
        const session = (out.sessions || []).find(s => s && s.id === entry.id);
        const exercise = session && (session.exercises || []).find(e => e && e.id === entry.exerciseId);
        if (exercise) {
          if (!Array.isArray(exercise.sets)) exercise.sets = [];
          if (!isObj(exercise.setTombstones)) exercise.setTombstones = {};
          if (choice === 'theirs' && entry.kind === 'set-deleted' && isObj(entry.remote)) {
            /* Recuperar la serie que el otro dispositivo había cambiado. */
            const at = exercise.sets.findIndex(set => set && set.id === entry.remote.id);
            if (at >= 0) exercise.sets[at] = entry.remote;
            else exercise.sets.push(entry.remote);
            delete exercise.setTombstones[entry.setId];
          } else if (choice === 'theirs' && entry.kind === 'set-deleted-remote') {
            /* Aceptar el borrado hecho en el otro dispositivo. */
            exercise.sets = exercise.sets.filter(set => set && set.id !== entry.setId);
            exercise.setTombstones[entry.setId] = isObj(entry.deleted) ? entry.deleted : { id: entry.setId, at: now() };
          } else if (entry.kind === 'set-deleted') {
            /* Conservar el borrado: la lápida se queda donde estaba. */
            exercise.setTombstones[entry.setId] = isObj(entry.deleted) ? entry.deleted : { id: entry.setId, at: now() };
          } else {
            /* Conservar la serie modificada aquí: la lápida ajena no vuelve. */
            delete exercise.setTombstones[entry.setId];
          }
          if (!Object.keys(exercise.setTombstones).length) delete exercise.setTombstones;
          exercise.done = exercise.sets.length > 0 && exercise.sets.every(set => set && set.completed);
        }
      } else if (choice === 'theirs') {
        if (entry.kind === 'set' && isObj(entry.remote)) {
          const session = (out.sessions || []).find(s => s && s.id === entry.id);
          const exercise = session && (session.exercises || []).find(e => e && e.id === entry.exerciseId);
          if (exercise && Array.isArray(exercise.sets)) {
            const at = exercise.sets.findIndex(set => set && set.id === entry.remote.id);
            if (at >= 0) exercise.sets[at] = entry.remote;
            else exercise.sets.push(entry.remote);
          }
        } else if (entry.kind === 'field') {
          if (collection === 'sessions') { /* no aplica */ }
          else if (collection === 'prefs' || collection === 'profile') {
            if (!out[collection]) out[collection] = {};
            if (entry.remote !== null && entry.remote !== undefined) out[collection][entry.id] = entry.remote;
          } else if (entry.remote !== null && entry.remote !== undefined) {
            out[collection] = entry.remote;
          }
        } else if (entry.kind === 'deleted-remote') {
          if (Array.isArray(out[collection])) out[collection] = out[collection].filter(item => item && (item.id || '') !== entry.id);
        } else if (entry.kind === 'deleted-local') {
          if (entry.remote && Array.isArray(out[collection]) && !out[collection].some(item => item && item.id === entry.id)) {
            out[collection].push(entry.remote);
          }
        } else if (entry.remote && Array.isArray(out[collection])) {
          const at = out[collection].findIndex(item => item && (item.id || '') === entry.id);
          if (at >= 0) out[collection][at] = entry.remote;
          else out[collection].push(entry.remote);
        }
      } else if (entry.kind === 'deleted-local' && entry.remote) {
        /* Conservar la mía: aquí el elemento no existe, así que se recupera. */
        if (Array.isArray(out[collection]) && !out[collection].some(item => item && item.id === entry.id)) out[collection].push(entry.remote);
      } else if (entry.kind === 'deleted-remote') {
        /* Conservar la mía: se queda el elemento local, que ya está en doc. */
      }
      st.dirty = true;
      if (!st.opId) st.opId = newId();
      persist(account, st, false);
      return { data: out, conflict: entry, remaining: st.conflicts.length };
    }

    function clearConflicts(account) {
      const st = Object.assign(blank(), raw(account) || {});
      st.conflicts = [];
      persist(account, st, false);
    }

    /* Se olvida el estado de una cuenta: la próxima sincronización vuelve a
       empezar de cero. Se usa cuando el servidor borró la copia, para no
       reenviar revisiones que ya no existen. */
    function reset(account) {
      const all = readAll();
      if (Object.prototype.hasOwnProperty.call(all, account)) {
        delete all[account];
        writeAll(all);
      }
      return true;
    }

    return {
      state, markDirty, sync, forcePull, backup, restoreBackup,
      resolveConflict, clearConflicts, reset, digest, key,
    };
  }

  return {
    merge, digest, sessionDigest, hash, stable, hasContent, itemKey,
    createEngine, memoryStorage, MAX_CONFLICTS, STORAGE_KEY,
  };
});
