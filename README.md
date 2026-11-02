# DrakoTrack

Strength-training tracker: a static single-page app plus a small Vercel API layer,
with Supabase for cloud accounts. Ships on the web and as a sideloaded Android APK.

- **Web / app UI**: `index.html`, `app.js`, `styles.css`, `share.js`, `boostcamp.js`
- **Cloud client**: `supabase.js` (talks only to the same-origin API — no tokens in the browser)
- **API** (Vercel functions): `api/` — cookie sessions, rate limiting, `lib/security.js`
- **Programs**: `programs/` catalogue plus `apk/version.json`, the update feed (the APK binary lives in GitHub release assets)
- **Android**: a thin Capacitor shell that loads the live site — see [RELEASE.md](RELEASE.md)

## Local checks

```bash
npm ci
npm test        # app flows + profile/API assertions
```

## Deploying the site

The published tree is staged in `.deploy-stage/` and deployed with the Vercel CLI:

```bash
cp -f app.js index.html styles.css vercel.json supabase.js boostcamp.js share.js legal.html legal.js update-check.js .deploy-stage/
cd .deploy-stage && npx vercel deploy --prod --yes --token="$VERCEL_TOKEN"
```

Environment variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`)
live in the Vercel project, never in this repository.

## Android APK

The APK is a thin client, so web changes need no rebuild. Signing, versioning and the
update feed are documented in [RELEASE.md](RELEASE.md); new builds come from `./release-apk.sh`.
