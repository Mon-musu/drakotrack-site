#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const out = join(root, "dist");

const FILES = [
  "index.html",
  "landing.js",
  "app.js",
  "sync.js",
  "styles.css",
  "share.js",
  "supabase.js",
  "boostcamp.js",
  "legal.html",
  "legal.js",
  "logo.png",
  "update-check.js",
  "progress.js",
  "planner.js",
  "analytics.js",
  "activity.js",
  "offline.js",
  "offline.html",
  "manifest.webmanifest",
  "sw.js",
  "apk/version.json",
];
const DIRECTORIES = ["icons", "sounds", "programs", "vendor", "data"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of FILES) {
  const source = join(root, file);
  if (!existsSync(source)) throw new Error(`build:cloudflare: missing ${file}`);
  const target = join(out, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
}

for (const directory of DIRECTORIES) {
  const source = join(root, directory);
  if (!existsSync(source)) throw new Error(`build:cloudflare: missing ${directory}/`);
  cpSync(source, join(out, directory), { recursive: true });
}

const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src https://sketchfab.com; connect-src 'self' data: https://rxamdcgcpjzfeygxeukj.supabase.co; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/legal.html
  Cache-Control: public, max-age=0, must-revalidate

/offline.html
  Cache-Control: public, max-age=0, must-revalidate

/app.js
  Cache-Control: public, max-age=0, must-revalidate

/sync.js
  Cache-Control: public, max-age=0, must-revalidate

/supabase.js
  Cache-Control: public, max-age=0, must-revalidate

/share.js
  Cache-Control: public, max-age=0, must-revalidate

/boostcamp.js
  Cache-Control: public, max-age=0, must-revalidate

/update-check.js
  Cache-Control: public, max-age=0, must-revalidate

/progress.js
  Cache-Control: public, max-age=0, must-revalidate

/planner.js
  Cache-Control: public, max-age=0, must-revalidate

/analytics.js
  Cache-Control: public, max-age=0, must-revalidate

/activity.js
  Cache-Control: public, max-age=0, must-revalidate

/offline.js
  Cache-Control: public, max-age=0, must-revalidate

/styles.css
  Cache-Control: public, max-age=0, must-revalidate

/sw.js
  Cache-Control: public, max-age=0, must-revalidate
  Service-Worker-Allowed: /

/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/logo.png
  Cache-Control: public, max-age=86400

/icons/*
  Cache-Control: public, max-age=86400

/sounds/*
  Cache-Control: public, max-age=86400

/vendor/*
  Cache-Control: public, max-age=0, must-revalidate

/programs/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/data/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/apk/version.json
  Cache-Control: no-store, max-age=0
`;
writeFileSync(join(out, "_headers"), headers);

// Only API routes invoke Pages Functions. Everything else is served as a
// static asset, which keeps static requests out of the Functions quota.
writeFileSync(join(out, "_routes.json"), JSON.stringify({
  version: 1,
  include: [
    "/api/*",
    "/.env",
    "/.env.example",
    "/.env.local",
    "/.env.production",
    "/.git/*",
    "/package.json",
    "/package-lock.json",
    "/vercel.json",
    "/index.js",
    "/drakotrack-manifest.json",
    "/wrangler.toml",
  ],
  exclude: [],
}, null, 2) + "\n");

console.log(`build:cloudflare: dist ready (${FILES.length} files, ${DIRECTORIES.length} directories)`);
