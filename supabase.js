'use strict';
/* DrakoTrack cloud client: the browser never talks to Supabase directly and never stores auth tokens.
   HttpOnly session cookies and all Supabase credentials are handled by same-origin Vercel API routes. */
window.DrakoSB = (function () {
  const API = '/api';
  let current = null;
  const hasSession = () => !!(current && current.id);
  const email = () => current && current.email || null;
  const userId = () => current && current.id || null;
  const name = () => current && typeof current.name === 'string' && current.name.trim() ? current.name.trim() : null;
  const setSession = session => { current = session && session.user ? session.user : (session && session.id ? session : null); };
  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      method: options.method || 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    return { response, data };
  }
  function authError(response, data, generic) {
    if (response.status === 429) return 'Demasiados intentos — espera un minuto y vuelve a intentarlo.';
    return (data && data.message) || generic || 'No se pudo completar la solicitud.';
  }
  async function signUp(mail, pass, consent, username) {
    try {
      const body = { email: mail, password: pass, consent };
      if (username) body.username = username;
      const { response, data } = await request('/auth/signup', { body });
      if (!response.ok) return authError(response, data, 'No se pudo crear la cuenta.');
      setSession(data);
      return null;
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function updateProfile(username) {
    try {
      const { response, data } = await request('/auth/profile', { body: { username } });
      if (!response.ok) return authError(response, data, 'No se pudo guardar el nombre de usuario.');
      if (data && data.user) setSession({ user: data.user });
      return null;
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function signIn(mail, pass) {
    try {
      const { response, data } = await request('/auth/signin', { body: { email: mail, password: pass } });
      if (!response.ok) return response.status === 429 ? authError(response, data) : 'Correo o contraseña incorrectos.';
      setSession(data);
      return null;
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function recover(mail) {
    try {
      const { response, data } = await request('/auth/recover', { body: { email: mail } });
      return response.ok ? null : authError(response, data, 'No se pudo solicitar el restablecimiento.');
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function updatePasswordFromToken(access, pass) {
    try {
      const { response, data } = await request('/auth/reset', { body: { access_token: access, password: pass } });
      return response.ok ? null : authError(response, data, 'No se pudo cambiar la contraseña.');
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function changePassword(pass, currentPassword) {
    try {
      const { response, data } = await request('/auth/change-password', { body: { password: pass, current_password: currentPassword } });
      return response.ok ? null : authError(response, data, 'No se pudo cambiar la contraseña.');
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function signOut() {
    try { await request('/auth/signout', { body: {} }); } catch (_) {}
    current = null;
  }
  async function loadSession() {
    try {
      const { response, data } = await request('/auth/session', { method: 'GET' });
      current = response.ok && data && data.user ? data.user : null;
    } catch (_) { current = null; }
    return current ? { user: current } : null;
  }
  async function refresh() { return !!(await loadSession()); }
  async function loadData() {
    if (!hasSession()) return null;
    const { response, data } = await request('/data/profile', { method: 'GET' });
    if (!response.ok) {
      /* .status permite distinguir una sesión caducada (401) de un fallo de red. */
      const error = new Error((data && data.message) || 'No se pudo leer la copia guardada.');
      error.status = response.status;
      throw error;
    }
    if (!data || data.data === null || data.data === undefined) return null;
    return {
      data: data.data,
      updated_at: data.updated_at || null,
      rev: Number.isInteger(data.rev) ? data.rev : 0,
    };
  }
  /* Guarda indicando sobre qué revisión se construyó el cambio. El servidor
     responde 409 si otro dispositivo guardó antes; ese error se propaga con
     .status para que el motor combine en vez de pisar. */
  async function saveData(doc, baseRev, opId) {
    if (!hasSession()) return false;
    const body = { data: doc };
    if (baseRev !== undefined && baseRev !== null) body.base_rev = baseRev;
    if (opId) body.op_id = opId;
    const { response, data: result } = await request('/data/profile', { method: 'PUT', body });
    if (response.status === 409) {
      const conflict = new Error((result && result.message) || 'conflict');
      conflict.status = 409;
      conflict.rev = result && Number.isInteger(result.rev) ? result.rev : null;
      /* Revisión sobre la que se construyó el envío: comparar ambas dice si la
         base local está atrasada o si otra sesión escribe sin parar. */
      conflict.baseRev = Number.isInteger(baseRev) ? baseRev : null;
      throw conflict;
    }
    if (!response.ok) {
      const error = new Error((result && (result.message || result.error)) || 'No se pudo guardar la copia.');
      error.status = response.status;
      throw error;
    }
    return { rev: result && Number.isInteger(result.rev) ? result.rev : 0, replay: !!(result && result.replay) };
  }
  async function dataHistory() {
    if (!hasSession()) return [];
    const { response, data } = await request('/data/history', { method: 'GET' });
    if (!response.ok) throw new Error((data && data.message) || 'No se pudieron leer las versiones anteriores.');
    return data && Array.isArray(data.items) ? data.items : [];
  }
  async function restoreVersion(rev) {
    if (!hasSession()) return 'No hay sesión activa en la nube.';
    try {
      const { response, data } = await request('/data/restore', { method: 'PUT', body: { rev } });
      if (!response.ok) return authError(response, data, 'No se pudo recuperar esa versión.');
      return null;
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  /* Borra la copia de la nube y las versiones anteriores (dt_delete_app_data).
     No elimina la cuenta. Devuelve un mensaje de error, o null si fue bien. */
  async function deleteData() {
    if (!hasSession()) return 'No hay sesión activa en la nube.';
    try {
      const { response, data } = await request('/data/profile', { method: 'DELETE' });
      if (!response.ok) return authError(response, data, 'No se pudo borrar la copia de la nube.');
      return null;
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  async function deleteAccount() {
    if (!hasSession()) return 'No hay sesión activa en la nube.';
    try {
      const { response, data } = await request('/account/delete', { method: 'DELETE' });
      if (!response.ok) return authError(response, data, 'No se pudo eliminar la cuenta.');
      current = null;
      return null;
    } catch (_) { return 'Sin conexión con el servidor.'; }
  }
  return { signIn, signUp, updateProfile, recover, updatePasswordFromToken, changePassword, signOut, loadData, saveData, dataHistory, restoreVersion, deleteData, deleteAccount, refresh,
    session: () => current ? { user: current } : null, email, userId, name, hasSession, loadSession, setSession };
})();
