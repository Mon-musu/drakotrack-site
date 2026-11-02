'use strict';
const { json, readJson, isSameOrigin, cookieSession, validateData } = require('../../lib/security');
const sb = require('../_lib/supabase');
const rateLimit = require('../_lib/rate-limit');

/* Rutas:
     GET    /api/data/profile   lee la copia con su revisión
     PUT    /api/data/profile   guarda solo si la revisión coincide (atómico)
     DELETE /api/data/profile   borra la copia (derecho de supresión)
     GET    /api/data/history   últimas versiones recuperables
     PUT    /api/data/restore   recupera una versión como revisión nueva */
const ACTIONS = {
  profile: new Set(['GET', 'PUT', 'DELETE']),
  history: new Set(['GET']),
  restore: new Set(['PUT']),
};
const MAX_OP_ID = 80;
const getAction = req => String((req.query && req.query.action) || '').toLowerCase();
const isRev = value => Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Origin, Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const action = getAction(req);
  const methods = ACTIONS[action];
  if (!methods) return json(res, 404, { error: 'not_found' });
  if (!methods.has(req.method)) return json(res, 405, { error: 'method_not_allowed' });
  if (await rateLimit.enforce(req, res, 'api:ip')) return;
  if (req.method !== 'GET' && !isSameOrigin(req)) return json(res, 403, { error: 'origin_not_allowed' });
  if (!sb.hasServerKey()) return json(res, 503, { error: 'server_auth_not_configured' });
  try {
    const session = await sb.authenticatedSession(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    if (session.refreshed) cookieSession(res, session.refreshed);
    const accessToken = session.accessToken;
    const user = session.user;

    const policy = req.method === 'GET' ? 'data:read' : req.method === 'DELETE' ? 'data:delete' : 'data:write';
    if (await rateLimit.enforce(req, res, policy, { userId: user.id })) return;

    if (action === 'profile' && req.method === 'GET') {
      const response = await sb.rest(`/app_data?user_id=eq.${encodeURIComponent(user.id)}&select=data,updated_at,rev`, {
        accessToken, headers: { Accept: 'application/json' },
      });
      if (!response.ok) return json(res, 502, { error: 'data_unavailable' });
      const rows = await response.json();
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      return json(res, 200, {
        data: row ? row.data : null,
        updated_at: row ? row.updated_at : null,
        rev: row && isRev(row.rev) ? row.rev : (row ? 0 : null),
      });
    }

    if (action === 'profile' && req.method === 'PUT') {
      const body = await readJson(req);
      if (!validateData(body.data)) return json(res, 400, { error: 'invalid_data' });
      /* base_rev es obligatorio para escribir sobre una copia existente: sin
         él no hay forma de saber sobre qué versión se construyó el cambio. El
         servidor decide con la revisión real, no con fechas del dispositivo. */
      const baseRev = body.base_rev === null || body.base_rev === undefined ? null : body.base_rev;
      if (baseRev !== null && !isRev(baseRev)) return json(res, 400, { error: 'invalid_base_revision' });
      const opId = body.op_id === undefined || body.op_id === null ? null : body.op_id;
      if (opId !== null && (typeof opId !== 'string' || !opId.length || opId.length > MAX_OP_ID || !/^[a-zA-Z0-9:_-]+$/.test(opId))) {
        return json(res, 400, { error: 'invalid_operation_id' });
      }
      const response = await sb.rpcAuthed('dt_save_app_data', {
        p_data: body.data,
        p_base_rev: baseRev,
        p_op_id: opId,
      }, accessToken);
      if (!response.ok) return json(res, 502, { error: 'data_save_failed' });
      const result = await response.json().catch(() => null);
      if (!result || typeof result !== 'object') return json(res, 502, { error: 'data_save_failed' });
      if (!result.ok) {
        return json(res, 409, {
          error: 'conflict',
          rev: isRev(result.rev) ? result.rev : 0,
          message: 'Tus datos cambiaron en otro dispositivo. Se combinaron los cambios; revisa si hay algo que decidir.',
        });
      }
      return json(res, 200, { rev: isRev(result.rev) ? result.rev : 0, replay: result.replay === true });
    }

    if (action === 'profile' && req.method === 'DELETE') {
      const response = await sb.rpcAuthed('dt_delete_app_data', {}, accessToken);
      if (!response.ok) return json(res, 502, { error: 'data_delete_failed' });
      res.statusCode = 204;
      return res.end();
    }

    if (action === 'history' && req.method === 'GET') {
      const response = await sb.rpcAuthed('dt_app_data_history', { p_limit: 10 }, accessToken);
      if (!response.ok) return json(res, 502, { error: 'data_unavailable' });
      const rows = await response.json().catch(() => null);
      const items = Array.isArray(rows) ? rows.filter(row => row && isRev(row.rev)).map(row => ({
        rev: row.rev,
        saved_at: typeof row.saved_at === 'string' ? row.saved_at : null,
        bytes: Number.isFinite(row.bytes) ? row.bytes : null,
      })) : [];
      return json(res, 200, { items });
    }

    if (action === 'restore' && req.method === 'PUT') {
      const body = await readJson(req);
      if (!isRev(body.rev)) return json(res, 400, { error: 'invalid_revision' });
      const response = await sb.rpcAuthed('dt_restore_app_data', { p_rev: body.rev }, accessToken);
      if (!response.ok) return json(res, 502, { error: 'data_save_failed' });
      const result = await response.json().catch(() => null);
      if (!result || !result.ok) return json(res, 404, { error: 'revision_not_found' });
      return json(res, 200, { rev: isRev(result.rev) ? result.rev : 0, restored: result.restored });
    }

    return json(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    const status = Number(error && error.status) || 500;
    return json(res, status, { error: status === 413 ? 'payload_too_large' : 'request_failed' });
  }
};
