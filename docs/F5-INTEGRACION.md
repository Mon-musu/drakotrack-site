# Integración del rediseño visual F5 · auditoría y plan

Estado: **auditoría del proyecto actual completada**; la integración de los archivos de F5 está
pendiente de recibir la referencia completa (`drakotrack-visual-refresh-f5.zip`).

## 1. Referencia F5

El archivo adjunto `drakotrack-visual-refresh-f5-comprimido.json` llegó truncado: 1 000 000 de
caracteres de un payload Base64 de 2 187 372 (JSON interno de 5 564 508 bytes). Con ese fragmento el
gzip no se puede descomprimir, y en el proyecto no hay ninguna copia del ZIP. No se ha reconstruido
ningún archivo de F5 a partir de datos parciales.

## 2. Qué hay hoy en el proyecto (auditoría)

| Elemento | Estado actual | Cambio F5 | Acción |
|---|---|---|---|
| Sistema de diseño | `styles.css` (98 KB, 859 selectores). Capa semántica con `--bg:#111318`, `--surface:#1c222b`, `--surface-2:#242c38`, `--text:#f2f4f7`, `--muted:#9ba4b4`, `--accent:#f28c28`, `--accent-strong`, `--accent-deep`, `--accent-rgb`, estados `--ok/--warn/--danger`, escalas de espacio, radio y tipografía, alias heredados (`--panel`, `--orange`…) | Renovado | La paleta F5 **ya está integrada**; falta comparar contra el CSS de F5 |
| Acento turquesa `#19D3C5` | 0 apariciones en `styles.css`, `index.html`, `app.js` y `manifest.webmanifest`; solo existe como patrón prohibido en `test-design.js` | Eliminado | Ya resuelto y protegido por prueba |
| Tema claro | `:root[data-theme="light"]` define colores propios y hereda escalas | Mantener | Comparar con F5 |
| Componentes | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm/lg/block/group`, tarjetas, modales, inputs, barra offline | Renovados | Comparar clase por clase; no reemplazar bloques con lógica asociada |
| Iconografía | 9 SVG inline en `index.html`, 6 en `app.js`; sin Lucide ni librería de iconos | Lucide + Lucide Animated | Pendiente; requiere el código F5 |
| Anatomía 3D | No existe visor; el mapa muscular actual es 2D | Visor interactivo (Sketchfab) | Pendiente; requiere CSP y licencia (ver §3) |
| Navegación | Barra inferior + cabecera ya maquetadas y probadas en `test-design.js` | Mejorada | Comparar |
| PWA / Service Worker | `sw.js` en `drakotrack-v36`; precachea `app.js?v=62` y `sync.js?v=3`; estrategia `staleWhileRevalidate` para estáticos y `networkFirstNavigation` para navegación | Ajustes | Revisar el lista de precache al integrar |
| Cloudflare | `scripts/build-cloudflare.mjs` genera `dist/` con `_headers` y `_routes.json`; Workers Builds despliega desde `main` | Mantener | No tocar el despliegue |
| Supabase | Auth, RLS y RPC de datos intactos (`dt_save_app_data`, historial, restauración) | Sin cambios | No modificar |
| Pruebas | `test-design.js` (tokens, turquesa, foco, objetivos táctiles, navegación), `test-sync.js` (104 aserciones), `test-sync-auth.js` (19), `test-flows.js`, API, Cloudflare (116) | Añadir pruebas F5 | Extender, nunca debilitar |

## 3. Decisiones tomadas

1. **CSP y visor 3D.** La política actual no declara `frame-src` y `default-src` es `'self'`, así que
   un iframe de Sketchfab queda bloqueado. Decisión del usuario: **abrir `frame-src` únicamente a
   Sketchfab**, sin tocar el resto de la política (ni `script-src`, ni `img-src`, ni `object-src`).
   La CSP está definida en tres sitios que deben cambiar a la vez:
   - `scripts/build-cloudflare.mjs` línea 50 (`const csp = ...`, la que se publica en `dist/_headers`).
   - `vercel.json` (bloque de cabeceras de `/(.*)`).
   - `index.js` (servidor Node).
   Además `test-flows.js` comprueba la CSP de `vercel.json` y `test-cloudflare.js` la de
   `dist/_headers`: ambas pruebas deben seguir en verde y ampliarse para fijar el nuevo `frame-src`.
2. **Nada se sobrescribe sin comparar.** Los archivos con lógica más reciente (sincronización,
   seguridad, PWA, datos) se combinan a mano; nunca se sustituye el proyecto entero por el ZIP.

## 4. Plan por fases

| Fase | Contenido | Criterio de cierre |
|---|---|---|
| F5.0 | Auditoría archivo por archivo contra el ZIP real | Tabla de nuevos/modificados/conflictos |
| F5.1 | Tokens y componentes base (botones, tarjetas, formularios, modales) | `test-design.js` ampliado y verde; build |
| F5.2 | Iconografía Lucide y animaciones de feedback | Iconos accesibles y sin animaciones permanentes |
| F5.3 | Pantallas: dashboard, entrenamiento, rutinas, historial, progreso, perfil, ajustes | Sin regresiones funcionales; `npm test` verde |
| F5.4 | Visor anatómico + `frame-src https://sketchfab.com` + licencia y atribución | Carga bajo demanda, alternativa si falla el servicio |
| F5.5 | Responsive y PWA | Sin desbordes; `sw` versionado; offline intacto |
| F5.6 | Informe, ZIP e instrucciones de despliegue | Entregable revisado |

## 5. Pendiente

- Recibir `drakotrack-visual-refresh-f5.zip` completo (o el payload Base64 en fragmentos).
- Confirmar autor y licencia del modelo 3D de F5 antes de publicarlo.
- Revisar si F5 trae su propia CSP y qué orígenes añade, para contrastar con la decisión de §3.
