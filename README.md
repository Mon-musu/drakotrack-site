# DrakoTrack

Strength-training tracker: a static single-page app plus a small serverless API layer
(Vercel functions, or Cloudflare Pages Functions), with Supabase for cloud accounts.
Ships on the web and as a sideloaded Android APK.

- **Web / app UI**: `index.html`, `app.js`, `styles.css`, `share.js`, `boostcamp.js`
- **Cloud client**: `supabase.js` (talks only to the same-origin API — no tokens in the browser)
- **Sync**: `sync.js`, three-way merge by stable id with a server revision (see below)
- **API** (Vercel functions): `api/` — cookie sessions, rate limiting, `lib/security.js`
- **Programs**: `programs/` catalogue plus `apk/version.json`, the update feed (the APK binary lives in GitHub release assets)
- **Android**: a thin Capacitor shell that loads the live site — see [RELEASE.md](RELEASE.md)

## Local checks

```bash
npm ci
npm test                  # app flows, profile/API assertions and rate limiting
npm run test:cloudflare   # build de dist/ + contrato de Cloudflare Pages
```

## Deploying the site

The published tree is built by `scripts/publish.sh --deploy-only`, which stages it
in a temporary directory and uploads it with the Vercel CLI:

```bash
export VERCEL_TOKEN=...   # never commit it
./scripts/publish.sh --deploy-only
```

Environment variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`)
live in the Vercel project, never in this repository.

## Cloudflare Pages (alternativa, Vercel sigue siendo el respaldo)

El mismo frontend y la misma API pueden servirse desde Cloudflare Pages. El
build genera `dist/` (solo assets públicos) y `functions/api/[[path]].js`
reutiliza los handlers de `api/`; Supabase no cambia. Pasos, variables,
pruebas ejecutadas y rollback: [CLOUDFLARE.md](CLOUDFLARE.md).

```bash
npm run build:cloudflare   # genera dist/ con _headers y _routes.json
npm run preview:cloudflare # Wrangler local
```

## Sincronización entre dispositivos

Cada fila de `app_data` lleva una revisión (`rev`). El dispositivo envía el
documento junto con la revisión en la que se basa y un identificador de
operación; el servidor aplica la escritura **solo si la revisión coincide**, en
una sola sentencia (`dt_save_app_data`). Si otro dispositivo guardó antes,
responde `409` y `sync.js` combina los dos documentos por identificador estable
en lugar de reemplazar el perfil entero:

- Rutinas, ejercicios, sesiones, series, PR, pesos e historial se unen por su
  `id`; los cambios independientes se conservan.
- Si los dos dispositivos cambiaron **el mismo** elemento (o la misma serie) de
  forma distinta, se conserva la versión local, la otra queda guardada y la app
  muestra «Revisar cambios en conflicto» para decidir. Nunca se pisa en silencio.
- Borrar un elemento se propaga cuando el otro lado no lo tocó; si lo había
  modificado, gana el cambio y aparece como conflicto.
- Los cambios pendientes y el estado de sincronización viven en `localStorage`
  (`draktrack_sync_v1`): sobreviven a cerrar la app y se reintentan al volver la
  red, con el mismo identificador de operación para no duplicar nada.
- Antes de aplicar una combinación remota se guarda una copia local (una sola,
  se reemplaza). En el servidor, `app_data_history` conserva las **10 últimas**
  versiones por cuenta y el menú de usuario permite recuperar una.
- Una respuesta vacía del servidor nunca se interpreta como perfil vacío: no se
  borra nada local por una lectura incompleta.

Un solo `PUT /api/data/profile` concurrente no puede sobrescribir al otro: la
función bloquea la fila y compara revisiones dentro de la misma transacción.

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
