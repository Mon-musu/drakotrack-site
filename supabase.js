'use strict';
/* DrakoTrack cloud client: the browser never talks to Supabase directly and never stores auth tokens.
   HttpOnly session cookies and all Supabase credentials are handled by same-origin Vercel API routes. */
window.DrakoSB = (function () {
  const API = '/api';
  let current = null;
  const hasSession = () => !!(current && current.id);
  const email = () => current && current.email || null;
  const userId = () => current && current.id || null;
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
    if (data && data.error === 'captcha_required') return 'Completa la verificación «No soy un robot» para crear la cuenta.';
    if (data && data.error === 'captcha_failed') return 'La verificación «No soy un robot» caducó o no es válida. Vuelve a verificarla.';
    return (data && data.message) || generic || 'No se pudo completar la solicitud.';
  }
  /* `captcha` es la prueba ALTCHA (cadena base64) que emite el widget ya verificado. */
  async function signUp(mail, pass, consent, captcha) {
    try {
      const body = { email: mail, password: pass, consent };
      if (typeof captcha === 'string' && captcha) body.altcha = captcha;
      const { response, data } = await request('/auth/signup', { body });
      if (!response.ok) return authError(response, data, 'No se pudo crear la cuenta.');
      setSession(data);
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
    if (!response.ok) throw new Error((data && data.message) || 'No se pudo leer la copia guardada.');
    return data && data.data ? { data: data.data, updated_at: data.updated_at } : null;
  }
  async function saveData(data) {
    if (!hasSession()) return false;
    const { response, data: result } = await request('/data/profile', { method: 'PUT', body: { data } });
    if (!response.ok) throw new Error((result && result.message) || 'No se pudo guardar la copia.');
    return true;
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
  return { signIn, signUp, recover, updatePasswordFromToken, changePassword, signOut, loadData, saveData, deleteAccount, refresh,
    session: () => current ? { user: current } : null, email, userId, hasSession, loadSession, setSession };
})();
