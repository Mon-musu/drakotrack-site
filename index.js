const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' data: https://rxamdcgcpjzfeygxeukj.supabase.co; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (isBlockedPath(path)) return notFound();

    // API routes are served by the platform only if present; here we serve the
    // static SPA for everything except known asset extensions.
    const asset = await getAsset(path, env);
    if (asset) {
      return new Response(asset.body, {
        headers: responseHeaders(path, contentTypeFor(path, asset), cacheControlFor(path)),
      });
    }

    if (path.endsWith("/") || path === "/index.html" || isLikelyClientRoute(path)) {
      const html = await getAsset("/index.html", env);
      if (html) return htmlResponse(html);
    }

    const html = await getAsset("/index.html", env);
    if (html) return htmlResponse(html);

    return notFound();
  },
};

function responseHeaders(path, contentType, cacheControl) {
  const headers = {
    ...SECURITY_HEADERS,
    "content-type": contentType,
    "cache-control": cacheControl,
  };
  if (path === "/sw.js") headers["service-worker-allowed"] = "/";
  return headers;
}

function htmlResponse(asset) {
  return new Response(asset.body, {
    headers: responseHeaders("/index.html", "text/html; charset=utf-8", "public, max-age=0, must-revalidate"),
  });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isBlockedPath(path) {
  const name = path.split("/").pop().toLowerCase();
  return name.startsWith(".") || name.endsWith(".map");
}

async function getAsset(path, env) {
  try {
    const response = await env.ASSETS.fetch(
      new Request("http://placeholder" + path)
    );
    if (response.ok) {
      return response;
    }
  } catch (err) {
    // Fallback below.
  }
  return null;
}

function contentTypeFor(path, asset) {
  const name = path.split("/").pop().toLowerCase();
  if (name.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (name.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".ico")) return "image/x-icon";
  if (name.endsWith(".webmanifest")) return "application/manifest+json";
  if (name.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  const ct = asset?.headers?.get("content-type");
  return ct || "application/octet-stream";
}

function cacheControlFor(path) {
  const name = path.split("/").pop().toLowerCase();
  if (["app.js", "sync.js", "supabase.js", "share.js", "boostcamp.js", "update-check.js"].includes(name)) {
    return "public, max-age=0, must-revalidate";
  }
  if (name.endsWith(".html")) return "public, max-age=0, must-revalidate";
  return "public, max-age=31536000, immutable";
}

function isLikelyClientRoute(path) {
  return !path.match(/\.[a-zA-Z0-9]+$/) && path.length > 1;
}
