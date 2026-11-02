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
npm test        # app flows, profile/API assertions and rate limiting
```

## Deploying the site

The published tree is staged in `.deploy-stage/` and deployed with the Vercel CLI:

```bash
cp -f app.js index.html styles.css vercel.json supabase.js boostcamp.js share.js legal.html legal.js update-check.js .deploy-stage/
cd .deploy-stage && npx vercel deploy --prod --yes --token="$VERCEL_TOKEN"
```

Environment variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`)
live in the Vercel project, never in this repository.

## Rate limiting

Every API route counts requests before doing any work. The policy per operation
lives in `api/_lib/rate-limit.js`:

| Operación | Límite | Ventana | Ámbito |
| --- | --- | --- | --- |
| Todas las rutas (`api:ip`) | 600 | 60 s | IP de plataforma |
| `GET /api/auth/session` | 120 | 60 s | IP |
| `POST /api/auth/signin` | 10 | 5 min | IP |
| `POST /api/auth/signup` | 5 | 1 h | IP |
| `POST /api/auth/recover` | 3 | 15 min | IP |
| `POST /api/auth/reset` | 5 | 15 min | IP |
| `POST /api/auth/signout` | 30 | 60 s | IP |
| `POST /api/auth/change-password` | 5 | 15 min | usuario |
| `GET /api/data/*` | 120 | 60 s | usuario |
| `PUT /api/data/*` | 60 | 60 s | usuario |
| `DELETE /api/data/*` | 5 | 1 h | usuario |
| `DELETE /api/account/*` | 3 | 1 h | usuario |

La identidad no se toma nunca de la URL ni del cuerpo: las rutas autenticadas usan
el id que devuelve Supabase para la cookie de sesión, y el resto la IP que escribe
la plataforma en `x-real-ip`. Los cubos se guardan como hash con sal.

Al pasarse responde `429` con `Retry-After` y un mensaje genérico; si el almacén
falla responde `503` en lugar de dejar pasar la operación.

**Almacenamiento.** Con `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`)
configurada, los contadores viven en Postgres y se comparten entre instancias de
Vercel: ejecuta `supabase/migrations/20261103_rate_limits.sql` y añade la clave
secreta de servidor en el proyecto. Sin esa clave el limitador usa memoria del
proceso: protege ráfagas, pero cada instancia cuenta por separado.

## Android APK

The APK is a thin client, so web changes need no rebuild. Signing, versioning and the
update feed are documented in [RELEASE.md](RELEASE.md); new builds come from `./release-apk.sh`.
