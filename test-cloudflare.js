'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const dist = path.join(root, 'dist');
let passed = 0;
function ok(value, label) {
  assert.equal(value, true, label);
  passed += 1;
}

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

ok(exists('wrangler.toml'), 'wrangler.toml exists');
const wrangler = read('wrangler.toml');
ok(/compatibility_date\s*=\s*"\d{4}-\d{2}-\d{2}"/.test(wrangler), 'wrangler declares a compatibility date');
ok(/pages_build_output_dir\s*=\s*"\.\/dist"/.test(wrangler), 'wrangler points Pages at dist');
const date = (wrangler.match(/compatibility_date\s*=\s*"([^"]+)"/) || [])[1];
ok(date >= '2025-04-01', 'compatibility date enables process.env population');
ok(/^main\s*=\s*"worker\.js"$/m.test(wrangler), 'wrangler declares a Worker entry-point');
ok(/\[assets\][\s\S]*directory\s*=\s*"\.\/dist"/.test(wrangler), 'Worker assets are served from dist');
ok(/nodejs_compat/.test(wrangler), 'nodejs_compat provides process.env');
ok(/binding\s*=\s*"STATIC"/.test(wrangler), 'assets binding has a Pages-safe name');
ok(!/binding\s*=\s*"ASSETS"/.test(wrangler), 'assets binding avoids the name Pages reserves');

ok(exists('worker.js'), 'Workers entry-point exists');
const worker = read('worker.js');
ok(/export\s+default/.test(worker) && /async\s+fetch\s*\(/.test(worker), 'Worker exports a fetch handler');
ok(/handleApi/.test(worker), 'Worker reuses the shared API adapter');
ok(/path\.startsWith\("\/api\/"\)/.test(worker), 'Worker routes /api/* before assets');
ok(/env\.STATIC|env && env\.STATIC/.test(worker), 'Worker reads the declared assets binding');
ok(/assets\.fetch/.test(worker), 'Worker serves the static build');
ok(/index\.html/.test(worker), 'Worker keeps the SPA fallback');
ok(/path\.startsWith\("\/\."\)/.test(worker) && /SENSITIVE_EXACT/.test(worker), 'Worker blocks dotfiles and configuration files');
ok(!/Access-Control-Allow-Origin.*\*/.test(worker), 'Worker does not add wildcard CORS');

ok(fs.existsSync(path.join(dist, 'index.html')), 'dist/index.html exists');
ok(fs.existsSync(path.join(dist, 'sw.js')), 'dist/sw.js exists');
ok(fs.existsSync(path.join(dist, 'manifest.webmanifest')), 'dist manifest exists');
ok(fs.existsSync(path.join(dist, 'apk/version.json')), 'dist APK feed exists');
ok(fs.existsSync(path.join(dist, 'programs/index.json')), 'dist program catalogue exists');
ok(fs.existsSync(path.join(dist, 'data/muscles.json')), 'dist muscle dictionary exists');
const distMuscles = JSON.parse(read('dist/data/muscles.json'));
ok(Object.keys(distMuscles.exercises || {}).length === 612,
  'dist muscle dictionary keeps 612 entries');
ok(fs.existsSync(path.join(dist, 'icons/icon-192.png')), 'dist icon exists');
ok(fs.existsSync(path.join(dist, 'sounds/rest-alarm.mp3')), 'dist sound exists');

for (const forbidden of ['api', 'lib', 'test-cloudflare.js', 'package.json', 'package-lock.json', 'node_modules', '.env', 'vercel.json', 'index.js', 'drakotrack-manifest.json']) {
  ok(!fs.existsSync(path.join(dist, forbidden)), `dist does not publish ${forbidden}`);
}
const localArchives = fs.readdirSync(root).filter(file => /\.zip$|\.bundle$|\.apk$|\.idsig$/.test(file));
ok(localArchives.every(file => !fs.existsSync(path.join(dist, file))), 'dist does not publish local archives');

const index = read('dist/index.html');
const localRefs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(match => match[1])
  .filter(ref => !/^(?:#|mailto:|https?:|\/\/)/.test(ref))
  .map(ref => ref.split(/[?#]/)[0]);
for (const ref of localRefs) {
  ok(fs.existsSync(path.join(dist, ref)), `index reference exists: ${ref}`);
}

const sw = read('dist/sw.js');
const precache = [...sw.matchAll(/'\.\/([^']+)'/g)]
  .map(match => match[1].split(/[?#]/)[0])
  .filter(Boolean);
for (const ref of [...new Set(precache)]) {
  ok(fs.existsSync(path.join(dist, ref)), `service worker precache exists: ${ref}`);
}

const headers = read('dist/_headers');
ok(/Content-Security-Policy:/.test(headers), 'Pages headers include CSP');
ok(/frame-src https:\/\/sketchfab\.com/.test(headers), 'CSP allows the lazy Sketchfab anatomy viewer');
ok(/Strict-Transport-Security:/.test(headers), 'Pages headers include HSTS');
ok(/X-Frame-Options: DENY/.test(headers), 'Pages headers deny framing');
ok(/\/sw\.js[\s\S]*Service-Worker-Allowed: \//.test(headers), 'Pages allows the root service worker');
ok(/\/apk\/version\.json[\s\S]*Cache-Control: no-store/.test(headers), 'APK feed is not cached');

const routes = JSON.parse(read('dist/_routes.json'));
ok(routes.version === 1, 'routes schema version is 1');
ok(Array.isArray(routes.include) && routes.include.includes('/api/*'), 'API routes invoke Functions');
ok(routes.include.includes('/.env') && routes.include.includes('/.git/*'), 'sensitive paths invoke the guard');
ok(!fs.existsSync(path.join(dist, '_redirects')), 'no catch-all redirect can swallow API routes');

ok(exists('functions/_middleware.js'), 'Pages sensitive-path middleware exists');
const middleware = read('functions/_middleware.js');
ok(/path\.startsWith\("\/\."\)/.test(middleware), 'middleware blocks dotfiles');
ok(/SENSITIVE_EXACT/.test(middleware), 'middleware blocks configuration files');

ok(exists('functions/api/[[path]].js'), 'Pages API catch-all exists');
const fn = read('functions/api/[[path]].js');
ok(/export\s+async\s+function\s+onRequest/.test(fn), 'Pages adapter exports onRequest');
ok(/export\s+async\s+function\s+handleApi/.test(fn), 'adapter exposes handleApi for the Worker entry-point');
ok(/api\/auth\/\[action\]\.js/.test(fn) && /api\/data\/\[action\]\.js/.test(fn) && /api\/account\/\[action\]\.js/.test(fn), 'adapter reuses all API handlers');
ok(/readJson\(\)|readJson/.test(fn) && /query:.*action/.test(fn), 'adapter preserves body and action semantics');
ok(/cf-connecting-ip/.test(fn) && /x-real-ip/.test(fn), 'adapter preserves the trusted client IP');
ok(!/Access-Control-Allow-Origin.*\*/.test(fn), 'adapter does not add wildcard CORS');

console.log(`cloudflare tests: ${passed} assertions passed`);
