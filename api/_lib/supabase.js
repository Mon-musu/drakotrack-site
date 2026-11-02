'use strict';

const { readCookie, cookieSession, safeUser, writeCookies, APP_ORIGIN } = require('../../lib/security');
const URL = process.env.SUPABASE_URL || 'https://rxamdcgcpjzfeygxeukj.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const hasServerKey = () => Boolean(URL && KEY && KEY.startsWith('sb_publishable_'));

async function auth(path, options = {}) {
  if (!hasServerKey()) throw new Error('Supabase public key is not configured on the server');
  const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(`${URL}/auth/v1${path}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: 'no-store' });
  return response;
}
async function userFromToken(token) {
  if (!token) return null;
  const response = await auth('/user', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return safeUser(await response.json());
}
async function currentUser(req) { return userFromToken(readCookie(req, 'access')); }
async function authenticatedSession(req) {
  const access = readCookie(req, 'access');
  if (access) {
    const response = await auth('/user', { headers: { Authorization: `Bearer ${access}` } });
    if (response.ok) {
      const user = safeUser(await response.json());
      if (user) return { accessToken: access, user };
    }
  }
  const refreshToken = readCookie(req, 'refresh');
  if (!refreshToken) return null;
  const refreshed = await refreshSession(refreshToken);
  if (!refreshed || !refreshed.access_token || !refreshed.refresh_token) return null;
  const refreshedUser = safeUser(refreshed.user);
  return refreshedUser ? { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, refreshed, user: refreshedUser } : null;
}
async function rest(path, options = {}) {
  if (!hasServerKey()) throw new Error('Supabase public key is not configured on the server');
  if (!options.accessToken) throw new Error('Authenticated user token is required');
  const response = await fetch(`${URL}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${options.accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });
  return response;
}
/* RPC con la clave publicable (rol anon). Solo para funciones SQL que el
   proyecto concede explícitamente a `anon` y que no exponen datos de usuarios
   y que no exponen datos de usuarios. Devuelve null si falla. */
async function rpc(name, body) {
  if (!hasServerKey()) throw new Error('Supabase public key is not configured on the server');
  const response = await fetch(`${URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {}),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  try { return await response.json(); } catch (_) { return null; }
}
/* RPC con el token del usuario (rol authenticated): la función SQL decide
   con auth.uid(), nunca con un id enviado por el cliente. Devuelve la
   respuesta para que el llamador pueda distinguir 409 de un fallo real. */
async function rpcAuthed(name, body, accessToken) {
  if (!hasServerKey()) throw new Error('Supabase public key is not configured on the server');
  if (!accessToken) throw new Error('Authenticated user token is required');
  return fetch(`${URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {}),
    cache: 'no-store',
  });
}
async function signIn(email, password) {
  const response = await auth('/token?grant_type=password', { method: 'POST', body: { email, password } });
  return { response, data: response.ok ? await response.json() : null };
}
async function signUp(email, password, consent) {
  const body = { email, password };
  if (consent) body.data = { drakotrack_consent: consent };
  const response = await auth('/signup', { method: 'POST', body });
  return { response, data: response.ok ? await response.json() : null };
}
async function refreshSession(token) {
  if (!token) return null;
  const response = await auth('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } });
  return response.ok ? response.json() : null;
}
function setSession(res, data) { cookieSession(res, data); }
function clearSession(res) { writeCookies(res, { access: null, refresh: null, recovery: null }); }

module.exports = { URL, KEY, APP_ORIGIN, hasServerKey, auth, rest, rpc, rpcAuthed, userFromToken, currentUser, authenticatedSession, signIn, signUp, refreshSession, setSession, clearSession };
