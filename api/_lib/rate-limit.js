'use strict';

const firewall = require('@vercel/firewall');
const RATE_LIMIT_ID = 'drakotrack-api-v1';
const WINDOW_SECONDS = 60;

function requestHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (typeof value === 'string') headers[name] = value;
    else if (Array.isArray(value)) headers[name] = value.join(', ');
  }
  return headers;
}

async function isRateLimited(req, key) {
  // Local development has no Vercel WAF. Production and preview must have the
  // matching Firewall rate-limit ID configured; missing configuration fails closed.
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) return false;
  const check = firewall.unstable_checkRateLimit || firewall.checkRateLimit;
  if (typeof check !== 'function') throw new Error('rate_limiter_unavailable');
  const options = { headers: requestHeaders(req), timeout: 1000 };
  if (key) options.rateLimitKey = key;
  if (process.env.VERCEL_URL) options.firewallHostForDevelopment = process.env.VERCEL_URL;
  const result = await check(RATE_LIMIT_ID, options);
  if (result.error === 'not-found') throw new Error('rate_limit_not_configured');
  if (result.error && result.error !== 'blocked') throw new Error('rate_limiter_unavailable');
  return result.rateLimited === true;
}

async function blockIfRateLimited(req, res, key) {
  if (!await isRateLimited(req, key)) return false;
  res.setHeader('Retry-After', String(WINDOW_SECONDS));
  const { json } = require('../../lib/security');
  json(res, 429, { error: 'rate_limited', message: 'Too many requests. Please try again shortly.' });
  return true;
}

function rateLimitUnavailable(res) {
  const { json } = require('../../lib/security');
  json(res, 503, { error: 'rate_limit_unavailable', message: 'Request protection is temporarily unavailable.' });
}

module.exports = { RATE_LIMIT_ID, WINDOW_SECONDS, requestHeaders, isRateLimited, blockIfRateLimited, rateLimitUnavailable };
