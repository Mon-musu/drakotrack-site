'use strict';
const { json, isSameOrigin, cookieSession } = require('../../lib/security');
const sb = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Origin, Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'DELETE') return json(res, 405, { error: 'method_not_allowed' });
  if (!isSameOrigin(req)) return json(res, 403, { error: 'origin_not_allowed' });
  if (!sb.hasServerKey()) return json(res, 503, { error: 'server_auth_not_configured' });
  try {
    const session = await sb.authenticatedSession(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    if (session.refreshed) cookieSession(res, session.refreshed);
    const response = await sb.rest('/rpc/delete_my_account', { method: 'POST', accessToken: session.accessToken, body: {} });
    if (!response.ok) return json(res, response.status === 401 ? 401 : 502, { error: response.status === 401 ? 'reauthentication_required' : 'account_deletion_failed' });
    sb.clearSession(res);
    return json(res, 200, { ok: true });
  } catch (_) {
    return json(res, 500, { error: 'account_deletion_failed' });
  }
};
