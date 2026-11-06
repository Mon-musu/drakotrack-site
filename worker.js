/*
 * Cloudflare Workers entry-point.
 *
 * The repository can be built as a Workers project (`wrangler deploy`, which
 * reads `main` + [assets] from wrangler.toml) or as a Pages project
 * (`functions/` + `wrangler pages deploy dist`). Both reach the same API
 * adapter, so authentication, cookies, validation and rate limiting do not have
 * a second implementation.
 *
 * Order matters:
 *   1. dotfiles and configuration files  -> real 404, never index.html
 *   2. /api/*                            -> adapter in functions/api/[[path]].js
 *   3. existing file in dist/            -> env.STATIC (with dist/_headers)
 *   4. anything else                     -> index.html with 200 (SPA, hash routes)
 */
import { handleApi } from "./functions/api/[[path]].js";

const SENSITIVE_EXACT = new Set([
  "/package.json",
  "/package-lock.json",
  "/vercel.json",
  "/index.js",
  "/drakotrack-manifest.json",
  "/wrangler.toml",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/.") || SENSITIVE_EXACT.has(path)) return notFound();

    if (path === "/api" || path.startsWith("/api/")) {
      const segments = path.slice("/api/".length).split("/").filter(Boolean).map(decodeSegment);
      return handleApi(request, env, segments, url);
    }

    // `binding = "STATIC"` in wrangler.toml exposes the built assets. It cannot
    // be called ASSETS because that name is reserved in Pages projects, which
    // this same configuration also has to keep working.
    const assets = env && env.STATIC;
    if (!assets) return notFound();

    const asset = await assets.fetch(request);
    if (asset.status !== 404 || (request.method !== "GET" && request.method !== "HEAD")) return asset;

    const index = await assets.fetch(new Request(new URL("/index.html", url), { method: request.method }));
    if (!index.ok) return asset;

    const headers = new Headers(index.headers);
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    return new Response(request.method === "HEAD" ? null : index.body, { status: 200, headers });
  },
};

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (_) {
    // A malformed escape cannot name a handler, so it will 404 like any other
    // unknown route instead of throwing a 500.
    return "";
  }
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
