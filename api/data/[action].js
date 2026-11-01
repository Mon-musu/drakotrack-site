'use strict';
const { json, readJson, isSameOrigin, cookieSession, validateData } = require('../../lib/security');
const sb = require('../_lib/supabase');
const query = userId => `?user_id=eq.${encodeURIComponent(userId)}`;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Origin, Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'method_not_allowed' });
  if (req.method !== 'GET' && !isSameOrigin(req)) return json(res, 403, { error: 'origin_not_allowed' });
  if (!sb.hasServerKey()) return json(res, 503, { error: 'server_auth_not_configured' });
  try {
    const session = await sb.authenticatedSession(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    if (session.refreshed) cookieSession(res, session.refreshed);
    const accessToken = session.accessToken;
    const user = session.user;
    if (req.method === 'GET') {
      const response = await sb.rest(`/app_data${query(user.id)}&select=data,updated_at`, { accessToken, headers: { Accept: 'application/json' } });
      if (!response.ok) return json(res, 502, { error: 'data_unavailable' });
      const rows = await response.json();
      return json(res, 200, { data: Array.isArray(rows) && rows.length ? rows[0].data : null, updated_at: Array.isArray(rows) && rows.length ? rows[0].updated_at : null });
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (!validateData(body.data)) return json(res, 400, { error: 'invalid_data' });
      const response = await sb.rest('/app_data', { method: 'POST', accessToken, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: [{ user_id: user.id, data: body.data }] });
      if (!response.ok) return json(res, 502, { error: 'data_save_failed' });
      res.statusCode = 204;
      return res.end();
    }
    const response = await sb.rest(query(user.id), { method: 'DELETE', accessToken, headers: { Prefer: 'return=minimal' } });
    if (!response.ok) return json(res, 502, { error: 'data_delete_failed' });
    res.statusCode = 204;
    return res.end();
  } catch (error) {
    const status = Number(error && error.status) || 500;
    return json(res, status, { error: status === 413 ? 'payload_too_large' : 'request_failed' });
  }
};
