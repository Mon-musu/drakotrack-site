'use strict';
/* ============================================================
   DrakoTrack — Cliente Supabase (sin dependencias)
   Usa la API REST directa: GoTrue (/auth/v1) + PostgREST (/rest/v1).
   La clave anon es pública por diseño (RLS protege los datos).
   ============================================================ */
window.DrakoSB = (function () {
  const SB_URL = 'https://rxamdcgcpjzfeygxeukj.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4YW1kY2djcGp6ZmV5Z3hldWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MDEwMTMsImV4cCI6MjEwODQ3NzAxM30.Ty8ba1wfmf3P5_yMJr5GPFezyReqjwDFEtyuJ5gRPS0';
  const SESSION_KEY = 'draktrack_sb_session_v1';

  let session = null; /* { access_token, refresh_token, expires_at, user } */

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch (e) { session = null; }
    return session;
  }
  function setSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { }
  }
  loadSession();

  const email = () => (session && session.user && session.user.email) || null;
  const userId = () => (session && session.user && session.user.id) || null;
  const hasSession = () => !!(session && session.access_token);

  function errorMessage(res, fallback) {
    try {
      const body = this && null;
      return body;
    } catch (e) { return fallback; }
  }

  async function readError(res) {
    let body = null;
    try { body = await res.json(); } catch (e) { }
    const code = body && (body.error_code || body.code || (body.msg && 'msg'));
    const msg = body && (body.message || body.error_description || body.msg);
    if (res.status === 400 && code === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
    if (res.status === 400 && code === 'email_not_confirmed') return 'Confirma tu correo primero: revisa tu bandeja de entrada.';
    if (res.status === 400 && /email/i.test(String(msg)) && /confirm/i.test(String(msg))) return 'Confirma tu correo primero: revisa tu bandeja de entrada.';
    if ((res.status === 400 || res.status === 422) && /already (registered|exists)/i.test(String(msg))) return 'Ese correo ya está registrado.';
    if ((res.status === 400 || res.status === 422) && /password.*(short|weak|length)/i.test(String(msg))) return 'La contraseña es demasiado débil (mínimo 6 caracteres, usa letras y números).';
    if (res.status === 429) return 'Demasiados intentos — espera un minuto y vuelve a intentarlo.';
    if (res.status >= 500) return 'El servicio no está disponible ahora mismo. Inténtalo en unos minutos.';
    return msg || fallback || 'Error inesperado con el servidor.';
  }

  async function api(path, opts = {}) {
    const doFetch = () => {
      const headers = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
      if (opts.headers) Object.assign(headers, opts.headers);
      if (session && !opts.anon && !headers.Authorization) headers.Authorization = 'Bearer ' + session.access_token;
      return fetch(SB_URL + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    };
    let res = await doFetch();
    if (res.status === 401 && session && !opts.anon && !opts.noRefresh) {
      const ok = await refresh();
      if (ok) res = await doFetch();
    }
    return res;
  }

  async function refresh() {
    if (!session || !session.refresh_token) return false;
    try {
      const res = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) { setSession(null); return false; }
      const data = await res.json();
      setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || session.refresh_token,
        expires_at: data.expires_at || null,
        user: data.user || session.user,
      });
      return true;
    } catch (e) { return false; }
  }

  /* --- Auth --- */
  async function signUp(mail, pass) {
    try {
      const res = await api('/auth/v1/signup', {
        anon: true, noRefresh: true, method: 'POST',
        body: { email: mail, password: pass },
      });
      if (!res.ok) return await readError(res);
      const data = await res.json().catch(() => ({}));
      if (data.access_token) { /* confirmación desactivada: entra directo */
        setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at || null,
          user: data.user || { id: data.user_id, email: mail },
        });
        return null;
      }
      return { needsConfirm: true };
    } catch (e) { return 'Sin conexión con el servidor.'; }
  }

  async function signIn(mail, pass) {
    try {
      const res = await api('/auth/v1/token?grant_type=password', {
        anon: true, noRefresh: true, method: 'POST',
        body: { email: mail, password: pass },
      });
      if (!res.ok) return await readError(res);
      const data = await res.json();
      setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at || null,
        user: data.user,
      });
      return null;
    } catch (e) { return 'Sin conexión con el servidor.'; }
  }

  async function recover(mail) {
    try {
      const res = await api('/auth/v1/recover', {
        anon: true, noRefresh: true, method: 'POST',
        body: { email: mail, email_redirect_to: location.origin },
      });
      if (!res.ok && res.status !== 422) {
        const msg = await readError(res);
        return /correo|correo|registered|not.*found|user/i.test(msg) ? null : msg;
      }
      return null;
    } catch (e) { return 'Sin conexión con el servidor.'; }
  }

  /* Cambio de contraseña completando el enlace de recuperación (token implícito) */
  async function updatePasswordFromToken(access, pass) {
    try {
      const res = await fetch(SB_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
        body: JSON.stringify({ password: pass }),
      });
      if (!res.ok) return await readError(res);
      return null;
    } catch (e) { return 'Sin conexión con el servidor.'; }
  }

  /* Cambio de contraseña con la sesión ya iniciada */
  async function changePassword(pass) {
    try {
      if (!hasSession()) return 'No hay sesión activa en la nube.';
      const res = await api('/auth/v1/user', {
        noRefresh: true,
        method: 'PUT',
        body: { password: pass },
      });
      if (!res.ok) return await readError(res);
      return null;
    } catch (e) { return 'Sin conexión con el servidor.'; }
  }

  function signOut() {
    if (session) {
      fetch(SB_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': SB_KEY, Authorization: 'Bearer ' + session.access_token },
      }).catch(() => { });
    }
    setSession(null);
  }

  /* --- Datos (PostgREST, protegido por RLS: cada usuario solo ve lo suyo) --- */
  async function loadData() {
    if (!hasSession()) return null;
    const res = await api('/rest/v1/app_data?user_id=eq.' + encodeURIComponent(userId()) + '&select=data,updated_at');
    if (!res.ok) throw new Error(await readError(res));
    const rows = await res.json();
    return rows && rows.length ? rows[0] : null;
  }

  async function saveData(dataObj) {
    if (!hasSession()) return false;
    const res = await api('/rest/v1/app_data', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ user_id: userId(), data: dataObj }],
    });
    if (!res.ok) throw new Error(await readError(res));
    return true;
  }

  return {
    signIn, signUp, recover, updatePasswordFromToken, changePassword, signOut,
    loadData, saveData, refresh,
    session: () => session,
    email, userId, hasSession, loadSession, setSession,
  };
})();
