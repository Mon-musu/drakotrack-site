'use strict';
const { json, readJson, isSameOrigin, readCookie, cookieSession, clearCookies, safeUser } = require('../../lib/security');
const sb = require('../_lib/supabase');
const altcha = require('../_lib/altcha');

function validEmail(value) { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function getAction(req) { return String(req.query && req.query.action || '').toLowerCase(); }
function validConsent(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.version === 'string' && value.version.length <= 40 &&
    typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at)) &&
    value.terms === true && value.age16 === true && value.health === true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Origin, Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  const action = getAction(req);
  if (!['signup', 'signin', 'recover', 'reset', 'change-password', 'signout', 'session', 'challenge'].includes(action)) return json(res, 404, { error: 'not_found' });
  const readOnly = action === 'session' || action === 'challenge';
  if ((readOnly && req.method !== 'GET') || (!readOnly && req.method !== 'POST')) return json(res, 405, { error: 'method_not_allowed' });
  /* El reto llega por GET (sin cabecera Origin) y va firmado: no cambia estado. */
  if (action !== 'session' && action !== 'challenge' && !isSameOrigin(req)) return json(res, 403, { error: 'origin_not_allowed' });
  if (!sb.hasServerKey()) return json(res, 503, { error: 'server_auth_not_configured', message: 'La autenticación de nube no está configurada en el servidor.' });
  try {
    if (action === 'challenge') {
      if (!altcha.isConfigured()) return json(res, 503, { error: 'captcha_not_configured' });
      const challenge = await altcha.create();
      if (!challenge) return json(res, 503, { error: 'captcha_not_configured' });
      return json(res, 200, challenge);
    }
    if (action === 'signout') {
      const access = readCookie(req, 'access');
      if (access) await sb.auth('/logout', { method: 'POST', headers: { Authorization: `Bearer ${access}` } }).catch(() => null);
      clearCookies(res);
      return json(res, 200, { ok: true });
    }
    if (action === 'session') {
      const session = await sb.authenticatedSession(req);
      if (!session) { clearCookies(res); return json(res, 200, { user: null }); }
      if (session.refreshed) cookieSession(res, session.refreshed);
      return json(res, 200, { user: session.user });
    }
    const body = await readJson(req, 16 * 1024);
    if (action === 'signup' || action === 'signin') {
      if (!validEmail(body.email) || typeof body.password !== 'string' || body.password.length < (action === 'signup' ? 12 : 1) || body.password.length > 256 || (action === 'signup' && !validConsent(body.consent))) return json(res, 400, { error: 'invalid_input', message: 'Correo, contraseña o consentimiento no válidos.' });
      if (action === 'signup') {
        /* Captcha obligatorio: se verifica antes de crear nada y se consume una sola vez. */
        if (typeof body.altcha !== 'string' || body.altcha.length < 32 || body.altcha.length > altcha.MAX_PAYLOAD_CHARS) {
          return json(res, 400, { error: 'captcha_required', message: 'Completa la verificación «No soy un robot» para crear la cuenta.' });
        }
        const proof = await altcha.verify(body.altcha);
        if (!proof.ok) {
          if (proof.reason === 'not_configured') return json(res, 503, { error: 'captcha_not_configured', message: 'La verificación anti-bots no está disponible ahora mismo. Inténtalo de nuevo más tarde.' });
          return json(res, 400, { error: 'captcha_failed', message: 'La verificación «No soy un robot» no es válida o caducó. Vuelve a verificarla.' });
        }
      }
      const { response, data } = action === 'signup' ? await sb.signUp(body.email.trim().toLowerCase(), body.password, body.consent) : await sb.signIn(body.email.trim().toLowerCase(), body.password);
      if (!response.ok) {
        if (response.status === 429) return json(res, 429, { error: action === 'signin' ? 'invalid_credentials' : 'auth_failed', message: action === 'signin' ? 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' : 'No se pudo crear la cuenta por ahora. Inténtalo de nuevo más tarde.' });
        if (action === 'signin' && response.status === 400) {
          const bodyText = (await response.text().catch(() => '')) || '';
          if (bodyText.includes('Invalid login') || bodyText.includes('Invalid password') || bodyText.includes('Invalid user')) return json(res, 401, { error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
          return json(res, 400, { error: 'auth_server_error', message: 'No se pudo completar el inicio de sesión por un problema temporal del servidor.' });
        }
        return json(res, 400, { error: action === 'signup' ? 'auth_failed' : 'auth_server_error', message: action === 'signup' ? 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.' : 'No se pudo completar la operación de autenticación.' });
      }
      if (!data || typeof data.user !== 'object' || !data.user.id) return json(res, 400, { error: 'confirmation_required', message: 'No se pudo iniciar la sesión. Comprueba la configuración de confirmación del correo.' });
      if (!data.access_token || !data.refresh_token) return json(res, 400, { error: 'confirmation_required', message: 'No se pudo iniciar la sesión. Comprueba la configuración de confirmación del correo.' });
      cookieSession(res, data);
      return json(res, action === 'signup' ? 201 : 200, { user: safeUser(data.user) });
    }
    if (action === 'recover') {
      if (!validEmail(body.email)) return json(res, 400, { error: 'invalid_input', message: 'Introduce un correo válido.' });
      const response = await sb.auth('/recover', { method: 'POST', body: { email: body.email.trim().toLowerCase(), redirect_to: `${sb.APP_ORIGIN}/` } });
      if (!response.ok && response.status !== 422) return json(res, response.status === 429 ? 429 : 400, { error: 'recovery_unavailable', message: 'No se pudo solicitar el restablecimiento ahora. Inténtalo más tarde.' });
      return json(res, 200, { ok: true });
    }
    if (action === 'reset') {
      if (typeof body.access_token !== 'string' || body.access_token.length > 8192 || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) return json(res, 400, { error: 'invalid_input', message: 'Enlace o contraseña no válidos.' });
      const response = await sb.auth('/user', { method: 'PUT', headers: { Authorization: `Bearer ${body.access_token}` }, body: { password: body.password } });
      if (!response.ok) return json(res, response.status === 429 ? 429 : 400, { error: 'reset_failed', message: 'No se pudo cambiar la contraseña. Solicita un enlace nuevo.' });
      clearCookies(res);
      return json(res, 200, { ok: true });
    }
    if (action === 'change-password') {
      const session = await sb.authenticatedSession(req);
      if (!session) { clearCookies(res); return json(res, 401, { error: 'unauthorized' }); }
      const { accessToken, user } = session;
      if (typeof body.current_password !== 'string' || !body.current_password.length || body.current_password.length > 256 || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) return json(res, 400, { error: 'invalid_input', message: 'Contraseña no válida.' });
      const check = await sb.signIn(user.email, body.current_password);
      if (!check.response.ok || !check.data || check.data.user.id !== user.id) return json(res, 403, { error: 'reauthentication_failed', message: 'La contraseña actual no es correcta.' });
      const response = await sb.auth('/user', { method: 'PUT', headers: { Authorization: `Bearer ${check.data.access_token}` }, body: { current_password: body.current_password, password: body.password } });
      if (!response.ok) return json(res, response.status === 429 ? 429 : 400, { error: 'password_update_failed', message: 'No se pudo cambiar la contraseña.' });
      cookieSession(res, check.data);
      return json(res, 200, { ok: true });
    }
  } catch (error) {
    const status = Number(error && error.status) || 500;
    return json(res, status, { error: status === 413 ? 'payload_too_large' : 'request_failed', message: status < 500 ? error.message : 'No se pudo completar la solicitud.' });
  }
};
