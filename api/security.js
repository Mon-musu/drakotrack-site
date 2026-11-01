'use strict';
const { json, isSameOrigin } = require('../lib/security');
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
  if (req.method === 'HEAD') { res.statusCode = 204; return res.end(); }
  return json(res, 200, { ok: true, same_origin: isSameOrigin(req) });
};
