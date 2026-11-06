# DrakoTrack en Cloudflare Pages + Workers

Migración de la capa web a Cloudflare Pages conservando **Supabase** como base de
datos y **Vercel** como respaldo. No se ha desplegado nada: todos los resultados
de este documento son de ejecuciones locales en Wrangler.

## Qué cambia y qué no

| Área | Estado |
| --- | --- |
| Datos, tablas, RLS, usuarios y sesiones (Supabase) | **Sin cambios**. No se ha tocado ningún proyecto, tabla ni política. |
| API (`api/`) | **Sin duplicar**. Pages invoca los mismos handlers mediante un adaptador. |
| Frontend | **Sin cambios de arquitectura**: HTML/CSS/JS estático y rutas por hash. |
| PWA / Service Worker / cola offline | Mismo código; se sirve desde Pages con los mismos encabezados. |
| Vercel | **Intacto**. Sigue siendo el despliegue de producción y el rollback. |

El único código nuevo es la capa de plataforma:

- `wrangler.toml` — proyecto Pages, salida `dist/` y `compatibility_date = "2026-08-04"`.
- `functions/api/[[path]].js` — adapta `Request`/`Response` de Workers al contrato
  `req`/`res` que ya usan `api/auth`, `api/data` y `api/account`. Conserva
  `query.action`, cuerpo JSON, cabeceras, cookies, IP de Cloudflare y errores.
- `functions/_middleware.js` — devuelve **404 real** para `.env`, `.git/*`,
  `package.json`, `vercel.json`, `wrangler.toml` y similares, en lugar de dejar
  que el fallback SPA conteste `index.html` con 200.
- `scripts/build-cloudflare.mjs` — genera `dist/` solo con los archivos públicos,
  más `_headers` y `_routes.json`. No copia `api/`, `lib/`, `functions/`,
  pruebas, configuración, `.env` ni dependencias.
- `test-cloudflare.js` — 90 aserciones sobre el artefacto publicado y el contrato
  de rutas/encabezados. El recuento es fijo: no depende de los ZIP o APK que haya
  sueltos en la raíz.

### Por qué Pages Functions solo para `/api/*`

`dist/_routes.json` incluye únicamente:

```
/api/*  /.env  /.env.example  /.env.local  /.env.production  /.git/*
/package.json  /package-lock.json  /vercel.json  /index.js
/drakotrack-manifest.json  /wrangler.toml
```

Todo lo demás (HTML, JS, CSS, iconos, sonidos, programas, APK) se sirve como
asset estático: no consume invocaciones de Functions y mantiene la caché y el
Service Worker igual que en Vercel. No hay catch-all que pueda capturar `/api/*`
y romper la API.

## Requisitos

- Node.js 22 o superior (probado con 26.13.0) y npm.
- Cuenta de Cloudflare con Pages habilitado.
- `npx wrangler@latest` (no hace falta instalar Wrangler en el proyecto).

## Comprobaciones locales

```bash
npm ci
npm test                      # suites de app + build de dist + contrato de Cloudflare
npm run build:cloudflare      # solo genera dist/
npm audit --omit=dev          # 0 vulnerabilidades
```

Para ver la app en local con las Functions reales:

```bash
npm run preview:cloudflare
# equivale a: node scripts/build-cloudflare.mjs && wrangler pages dev dist
```

Sin variables de entorno la API responde `503 server_auth_not_configured`, que es
el comportamiento esperado. Para probar el login en local se pasa la config:

```bash
npx wrangler pages dev dist \
  --binding SUPABASE_URL=https://<proyecto>.supabase.co \
  --binding SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Las cookies seguras (`__Host-dt_access`, `Secure`) solo se emiten sobre HTTPS. Para
probarlas en local sin desplegar:

```bash
npx wrangler pages dev dist --local-protocol https \
  --binding SUPABASE_URL=http://127.0.0.1:8791 \
  --binding SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only
```

El adaptador deduce producción del protocolo de la petición (`https:`), no de
`NODE_ENV`, porque Wrangler sustituye `NODE_ENV` durante el build.

## Despliegue en Cloudflare Pages

Elegir **una** de las dos vías. Ninguna requiere escribir secretos en el
repositorio ni en `wrangler.toml`: allí solo viven los valores públicos
(`APP_ORIGIN` y la clave publicable de Supabase, en `[vars]`).

### Opción A — integración Git (recomendada)

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Repositorio `Mon-musu/drakotrack-site` y rama de producción (en este repo, `release/v2`).
3. Configuración de build:
   - Framework preset: **None**
   - Build command: `npm ci && node scripts/build-cloudflare.mjs`
   - Build output directory: `dist`
   - Root directory: `/`
4. Variables de entorno (Production **y** Preview):
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (recomendada, solo servidor)

   `APP_ORIGIN` y `SUPABASE_PUBLISHABLE_KEY` ya vienen de `[vars]` en
   `wrangler.toml`. No las dupliques en el panel: si algún día cambia el dominio
   o se rota la clave, se toca un único sitio. Si ya las habías creado en el
   panel, bórralas después del primer despliegue correcto.
5. Guardar y desplegar. El dominio `*.pages.dev` queda disponible al terminar.

### Opción B — Wrangler desde local

```bash
npx wrangler login
npm run build:cloudflare
npx wrangler pages project create drakotrack --production-branch <rama>
npx wrangler pages deploy dist --project-name drakotrack
```

Los secretos se cargan una sola vez, fuera del repositorio:

```bash
npx wrangler pages secret put SUPABASE_URL --project-name drakotrack
npx wrangler pages secret put SUPABASE_SECRET_KEY --project-name drakotrack
```

Repetir para el entorno de preview si se quiere probar allí el login.

### Variables (solo nombres)

| Nombre | Uso | Obligatoria |
| --- | --- | --- |
| `SUPABASE_URL` | Endpoint del proyecto Supabase | Sí |
| `SUPABASE_PUBLISHABLE_KEY` | Clave publicable usada por el servidor para Auth/REST | Sí |
| `SUPABASE_SECRET_KEY` | Rate limiting compartido (`rate_limit_hit`) | Recomendada |
| `APP_ORIGIN` | Origen canónico para los enlaces de recuperación de contraseña | Sí en Pages (`[vars]`) |

`APP_ORIGIN` y `SUPABASE_PUBLISHABLE_KEY` se declaran en `wrangler.toml`; el
resto, en el panel (secretos). `APP_ORIGIN` debe ser el dominio público final: si se deja el valor por defecto,
los correos de recuperación apuntarían a `drakotrack.vercel.app`.

## Supabase

No hay que ejecutar ninguna migración ni cambiar tablas, RLS o políticas por esta
migración. Solo hay que permitir el nuevo origen en la recuperación de contraseña:

1. Supabase Dashboard → Authentication → URL Configuration.
2. `Site URL`: el dominio de producción (por ejemplo `https://drakotrack.pages.dev`
   o el dominio propio).
3. `Redirect URLs`: añadir `https://<dominio>/` (y el dominio de Vercel si se
   mantiene la recuperación desde el respaldo).

Esto no altera datos ni sesiones: los usuarios existentes siguen entrando con las
mismas credenciales porque la autenticación la sigue resolviendo Supabase.

> Nota: la migración `supabase/migrations/20261104_data_deletion_hardening.sql`
> sigue pendiente de aplicar. Es independiente de Cloudflare y no bloquea el
> despliegue web, pero debe revisarse antes de dar por cerrado el borrado de datos.

## Lista de comprobación antes de publicar

Antes del primer despliegue, en este orden:

1. `npm ci && npm test` en verde (incluye el build y el contrato de Cloudflare).
2. `npm run build:cloudflare` termina con `dist ready (19 files, 3 directories)`.
3. Si el proyecto de Supabase cambia de ref, actualizar el host del `connect-src`
   en `scripts/build-cloudflare.mjs`; el resto de la CSP no debería tocarse.
4. Fijar el dominio final (pages.dev o propio) y usar exactamente ese valor, sin
   barra final, en `APP_ORIGIN` y en Supabase.
5. Configurar `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en **Production** y en
   **Preview** por separado; `APP_ORIGIN` y la clave publicable ya están en
   `wrangler.toml`.
6. Añadir el dominio a `Site URL` y `Redirect URLs` en Supabase.
7. Confirmar que no se sube `.env`, `dist/`, `.wrangler/` ni ninguna clave
   privada al repositorio (la publicable de Supabase es pública por diseño).

Después de publicar, comprobar en el dominio real (no basta con que el despliegue
termine bien):

1. `GET /` responde 200 con CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`.
2. `/.env` y `/api/nope/x` devuelven 404 (el segundo en JSON), y `/api/auth/session`
   sin cookie responde 200 con `{"user":null}` (no es un error: así distingue la
   app entre «sin sesión» y «servidor mal configurado»).
3. Login real → cookie `__Host-dt_access` con `Secure`, sesión 200 y logout que borra.
4. Recuperación de contraseña: el correo llega y el enlace vuelve al dominio nuevo.
5. Dos cuentas reales no ven datos de la otra (RLS intacto).
6. La PWA instala, `/sw.js` se registra y la cola offline sincroniza al reconectar.
7. `/apk/version.json` responde `no-store` y el APK apunta al dominio correcto.
8. Rollback listo: Vercel sigue publicado y el DNS se puede revertir.

## Resultados de las pruebas ejecutadas

Ejecutado en este entorno (Wrangler 4.157.0, workerd local). La suite completa se
volvió a ejecutar sobre el árbol extraído del ZIP entregado, con `dist/` generado
desde cero: también pasa.

| Comprobación | Resultado |
| --- | --- |
| `npm test` (todas las suites + build + contrato Cloudflare) | Pasa |
| `test-cloudflare.js` | 90/90 aserciones |
| `test-offline.js` | 100/100 aserciones |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `dist/` generado | 19 archivos + 3 directorios |
| Reglas de `_headers` parseadas por Wrangler | 22 |
| `GET /` | 200 con CSP, HSTS, nosniff, X-Frame-Options: DENY, Referrer-Policy |
| `POST /api/auth/signin` con Supabase simulado | 200 |
| Cookies emitidas sobre HTTPS | `__Host-dt_access` y `__Host-dt_refresh`, `Secure`, `HttpOnly`, `SameSite=Strict` |
| `GET /api/auth/session` con cookie | 200 con el usuario |
| `POST /api/auth/signout` | 200 y cookies de sesión borradas |
| `POST /api/auth/signin` sin `Origin` | 403 `origin_not_allowed` |
| Método incorrecto | 405 |
| `/api/nope/x` | 404 JSON `{"error":"not_found"}` |
| `Cache-Control` en API | `private, no-store` |
| `/.env`, `/.env.example`, `/.git/config`, `/package.json`, `/vercel.json`, `/wrangler.toml` | 404 |
| `/sw.js` | 200 con `Service-Worker-Allowed: /` |
| `/manifest.webmanifest` | 200 `application/manifest+json` |

La prueba de login/sesión/logout usó un Supabase simulado local (`/auth/v1/token`,
`/auth/v1/user`, `/auth/v1/logout`), no el proyecto real. Demuestra el adaptador,
las cookies y el flujo de sesión, **no** la integración con el Supabase real.

### Comportamiento esperado que no es un fallo

- Rutas desconocidas como `/does-not-exist` devuelven `index.html` con 200: es el
  fallback de la SPA, que usa rutas por hash. La API y los archivos sensibles
  responden 404 explícito.
- Sin `SUPABASE_SECRET_KEY`, el rate limiting vive en memoria de cada instancia de
  Workers; protege ráfagas, pero no es global. Con la clave usa Postgres.

## Pruebas pendientes (no ejecutadas aquí)

No hay navegador ni credenciales reales en este entorno, así que quedan pendientes:

1. Despliegue real en Cloudflare Pages (no se ha creado ni publicado ningún proyecto).
2. Login, registro, recuperación y cambio de contraseña contra el Supabase real,
   incluido el correo de recuperación con el nuevo `Site URL`.
3. Aislamiento de datos entre dos cuentas reales y comportamiento de RLS.
4. Instalación de la PWA, Service Worker y cola offline en Chrome Android y Safari iOS.
5. Cabeceras y CSP en el dominio real (incluido que no bloqueen fuentes, iconos ni
   el manifest).
6. APK thin-client apuntando al nuevo dominio y feed de actualización.
7. Carga sostenida / límites de Pages Functions y del rate limiting compartido.

## Rollback a Vercel

Vercel no se ha modificado, así que el rollback es inmediato y no toca datos:

1. Mantener el dominio en Vercel (o volver a apuntar el DNS si se movió a Cloudflare).
2. Si se usó un dominio propio en Cloudflare, restaurar el registro anterior en el DNS.
3. Despublicar o eliminar el proyecto de Pages cuando ya no haga falta; las tablas,
   RLS y usuarios de Supabase no se ven afectados.
4. Las cookies son `__Host-` por dominio, así que no hay sesiones cruzadas entre
   ambos despliegues: cada usuario vuelve a iniciar sesión en el origen que use.

## Archivos que conviene revisar antes del primer despliegue

- `wrangler.toml` — nombre del proyecto y `compatibility_date`.
- `scripts/build-cloudflare.mjs` — lista de archivos públicos y la CSP. El
  `connect-src` incluye el host actual de Supabase; si el proyecto cambia de ref,
  hay que actualizarlo ahí.
- `functions/api/[[path]].js` — tamaño máximo de cuerpo (2 MiB + 32 KiB) y mapeo de IP.
- `dist/_routes.json` y `dist/_headers` — se generan en cada build; no editarlos a mano.
