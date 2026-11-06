/*
 * Pages invokes this middleware only for the routes listed in dist/_routes.json.
 * API traffic falls through to functions/api/[[path]].js; sensitive files get a
 * real 404 instead of the SPA's index.html fallback.
 */
const SENSITIVE_EXACT = new Set([
  "/package.json",
  "/package-lock.json",
  "/vercel.json",
  "/index.js",
  "/drakotrack-manifest.json",
  "/wrangler.toml",
]);

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;

  if (path.startsWith("/.") || (!path.startsWith("/api/") && SENSITIVE_EXACT.has(path))) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return context.next();
}
