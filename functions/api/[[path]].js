import authHandler from "../../api/auth/[action].js";
import dataHandler from "../../api/data/[action].js";
import accountHandler from "../../api/account/[action].js";

/*
 * Cloudflare Pages Functions adapter.
 *
 * The application keeps one API implementation. This file only translates the
 * Web Request/Response model into the small req/res contract used by the
 * existing handlers (statusCode, setHeader, end, query.action, body, headers).
 * Authentication, cookies, validation and Supabase calls remain in api/.
 */
const HANDLERS = {
  auth: authHandler,
  data: dataHandler,
  account: accountHandler,
};
const MAX_BODY_BYTES = 2 * 1024 * 1024 + 32 * 1024;

// Pages calls onRequest(); the Workers entry-point (worker.js) calls handleApi()
// directly. Both end up in exactly the same translation code below.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const segments = Array.isArray(context.params.path) ? context.params.path : [context.params.path].filter(Boolean);
  return handleApi(context.request, context.env, segments, url);
}

export async function handleApi(request, env, segments, url) {
  if (!Array.isArray(segments) || segments.length !== 2 || !HANDLERS[segments[0]]) {
    return json(404, { error: "not_found" });
  }

  // Pages populates process.env for compatibility dates >= 2025-04-01. Keep
  // this fallback for local Wrangler runs and older projects.
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value === "string" && process.env[key] === undefined) process.env[key] = value;
  }

  // Pages production and previews are HTTPS. Keep local HTTP development
  // cookies usable while ensuring production sets Secure + __Host- cookies.
  // Do not use NODE_ENV here: Wrangler replaces it at build time.
  process.env.DT_PRODUCTION = url.protocol === "https:" ? "1" : "0";

  const headers = {};
  for (const [key, value] of request.headers) headers[key.toLowerCase()] = value;
  if (!headers.host) headers.host = url.host;

  // Cloudflare overwrites this header at the edge. Mirror it to the header
  // name the existing rate limiter understands, and to the socket fallback.
  const clientIp = headers["cf-connecting-ip"] || "";
  if (clientIp) {
    headers["x-real-ip"] = clientIp;
    headers["x-forwarded-for"] = clientIp;
  }

  const declaredLength = Number(headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    let raw;
    try {
      raw = await request.text();
    } catch (_) {
      return json(400, { error: "invalid_body" });
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json(413, { error: "payload_too_large" });
    }
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (_) {
      // Let readJson() produce the same 400 invalid_json response as Vercel.
      body = raw;
    }
  }

  const req = {
    method: request.method,
    url: request.url,
    headers,
    query: { ...Object.fromEntries(url.searchParams), action: segments[1] },
    body,
    socket: clientIp ? { remoteAddress: clientIp } : undefined,
  };
  const res = createResponse();

  try {
    await HANDLERS[segments[0]](req, res);
  } catch (error) {
    console.error("[cf-api] unhandled_error", error && error.message);
    if (!res.ended) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "private, no-store");
      res.end(JSON.stringify({ error: "request_failed" }));
    }
  }

  return res.finish();
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function createResponse() {
  const headers = new Headers();
  let statusCode = 200;
  let body = "";
  let ended = false;

  return {
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = Number(value) || 500; },
    get ended() { return ended; },
    setHeader(name, value) {
      if (Array.isArray(value)) {
        headers.delete(name);
        for (const item of value) headers.append(name, String(item));
      } else {
        headers.set(name, String(value));
      }
    },
    getHeader(name) { return headers.get(name); },
    end(chunk = "") {
      if (chunk !== undefined && chunk !== null) body += String(chunk);
      ended = true;
    },
    finish() {
      // 204 must not carry a response body.
      const payload = statusCode === 204 || body === "" ? null : body;
      return new Response(payload, { status: statusCode, headers });
    },
  };
}
