# DISEÑO.md — base visual y estado de partida (F0)

Documento de trabajo del encargo de rediseño y Arena. **F0 no cambia nada visible**: fija el
punto de partida, el inventario de lo que ya existe y las medidas reales sobre las que se va a
trabajar. Las fases siguientes actualizan sus propias secciones.

- Repositorio: `Mon-musu/drakotrack-site`
- Commit de partida: `98c0240` («Añade el diccionario muscular actualizado»), `main` del remoto
- Rama de trabajo: `fase/rediseno-arena`
- Fecha de la medición: 8 de noviembre de 2026

## 1. Cómo se reproduce

```sh
npm ci                     # única dependencia: jsdom
npm test                   # 11 suites + build de Cloudflare + test-cloudflare
node scripts/capturas.mjs  # capturas "antes" en artifacts/antes/ (requiere CHROME_BIN)
```

`scripts/capturas.mjs` sirve el repositorio en local, abre Chrome headless por CDP, crea una
cuenta **local** de usar y tirar (`cap_xxxx`, contraseña `secret123`), siembra un entrenamiento,
una sesión en curso y una sesión terminada, y recorre todas las rutas a 375 px y 1440 px. Bloquea
las peticiones a fuentes y a Supabase: las capturas no tocan datos reales ni la red.

Las imágenes quedan en `artifacts/antes/` (ignorado por Git, como el resto de `artifacts/`).
La salida completa de la suite queda en `artifacts/linea-base-test.log`.

## 2. Línea base de pruebas

| Comprobación | Resultado real |
|---|---|
| `npm ci` | correcto, `jsdom 30.1.3` |
| `npm test` (exit code) | **0** |
| Aserciones `ok` en las 11 suites | **950** |
| Fallos (`FAIL`) | **0** |
| `scripts/build-cloudflare.mjs` | `dist ready (20 files, 4 directories)` |
| `test-cloudflare.js` | **111 aserciones**, todas correctas |

Seis suites imprimen su recuento explícito (79, 75, 74, 121, 13 y 100 aserciones); las demás
publican una línea de resumen distinta. El total de aserciones correctas es 950 y no hay ninguna
fallida en el commit de partida.

## 3. Tokens actuales (`styles.css`)

33 tokens en `:root` y 27 sobrescrituras en `:root[data-theme="light"]`. Los nombres son los
mismos en ambos temas salvo los seis marcados como «solo oscuro».

| Token | Oscuro | Claro | Uso actual |
|---|---|---|---|
| `--bg` | `#0a0a0c` | `#f4f5f7` | fondo de la página |
| `--bg-2` | `#0e0e11` | `#ffffff` | fondo secundario |
| `--panel` | `#15151a` | `#ffffff` | tarjetas y paneles |
| `--panel-2` | `#1b1b21` | `#eceef2` | panel elevado, campos |
| `--border` | `rgba(255,255,255,.08)` | `rgba(15,15,25,.08)` | bordes discretos |
| `--border-strong` | `rgba(255,255,255,.14)` | `rgba(15,15,25,.14)` | bordes marcados |
| `--text` | `#f5f5f6` | `#17171c` | texto principal |
| `--muted` | `#9c9ca6` | `#5c5c68` | texto secundario |
| `--muted-2` | `#8d8d97` | `#666672` | texto secundario pequeño (AA) |
| `--orange` | `#ff7a00` | `#f05f00` | acento (relleno) |
| `--orange-hi` | `#ffa040` | `#e8640b` | acento claro |
| `--accent-text` | `#ffa040` | `#a83f00` | acento para texto |
| `--danger-text` | `#fca5a5` | `#b3261e` | texto de error |
| `--focus` | `#ffb36b` | `#a83f00` | anillo de foco |
| `--control-border` | `rgba(255,255,255,.5)` | `rgba(15,15,25,.48)` | borde de campos (3:1) |
| `--orange-grad` | `linear-gradient(135deg,#ffa040,#ff7a00 55%,#f05100)` | — (solo oscuro) | degradado de acento |
| `--green` | `#34d399` | — (solo oscuro) | éxito |
| `--red` | `#f87171` | — (solo oscuro) | error |
| `--radius` / `--radius-sm` | `16px` / `10px` | — (solo oscuro) | radios |
| `--shadow` | `0 10px 30px rgba(0,0,0,.45)` | `0 10px 30px rgba(20,20,35,.12)` | sombra de tarjeta |
| `--font` | `'Outfit',system-ui,…` | — (solo oscuro) | tipografía |
| `--color-scheme` | `dark` | `light` | `color-scheme` |
| `--topbar-bg`, `--sidebar-bg`, `--bottomnav-bg` | `rgba(10,10,12,.82)`, `rgba(14,14,17,.5)`, `rgba(10,10,12,.92)` | equivalentes claros | barras |
| `--hero-grad`, `--modal-grad` | degradados oscuros | degradados claros | portada y modales |
| `--ghost-hover`, `--thumb`, `--thumb-hover` | `#23232b`, `#26262d`, `#34343d` | `#e2e4ea`, `#c6c9d1`, `#b4b7c0` | hover y carrusel |
| `--ring-track`, `--chart-grid` | `rgba(255,255,255,.12)`, `rgba(255,255,255,.07)` | `rgba(0,0,0,.14)`, `rgba(0,0,0,.09)` | anillos y rejillas de gráfica |

Comprobaciones hechas sobre el estado actual:

- **El turquesa ya no existe**: no hay ninguna aparición de `#19D3C5` (ni en mayúsculas ni en
  minúsculas) en `styles.css`, `index.html`, `app.js`, `manifest.webmanifest` ni el resto de JS.
  El acento es naranja. La parte «sustituir el turquesa» de F1 está, por tanto, ya cubierta; lo
  que falta es la capa semántica.
- **No hay capa semántica**: no existen `--surface`, `--surface-2`, `--accent`, `--accent-ink`,
  `--danger`, `--warn`, `--ok`, ni escalas `--space-*`, `--radius-*` (solo hay dos radios),
  `--font-size-*`. Los estados se escriben hoy con `--green`, `--red`, `--danger-text` y valores
  sueltos (`rgba(255,255,255,.04)` aparece repetido en decenas de reglas).
- El tema claro no redefine `--orange-grad`, `--green`, `--red` ni los radios: los degradados y
  los estados de éxito/error son los mismos que en oscuro.

## 4. Componentes reutilizables

`styles.css` declara **502 clases**. Agrupadas por familia, lo que ya existe y se puede reutilizar:

- **Estructura**: `.screen`, `.topbar`, `.brand`, `.user-chip`, `.user-menu`, `.sidebar`, `.nav-btn`,
  `.bottomnav`, `.main`, `.page-head`, `.section`, `.section-head`, `.sec-toggle`, `.btn-group`,
  `.site-footer`, `.skip-link`, `.sr-only`.
- **Botones**: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-lg`, `.btn-sm`,
  `.btn-block`, `.icon-btn`, `.linklike`.
- **Tarjetas y datos**: `.card`, `.hero-card`, `.stat-card`, `.stats-grid`, `.streak-card`,
  `.dash-card`, `.prog-card`, `.cmp-card`, `.mv-card`, `.hist-card`, `.summary-card`,
  `.continue-card`.
- **Formularios**: `.field`, `.form-row`, `.mini-field`, `.mini-select`, `.check`, `.checkmark`,
  `.seg-row`, `.seg-btn`, `.consent-box`.
- **Modales y avisos**: `.modal-backdrop`, `.modal`, `.modal-body`, `.modal-actions`, `.toast`
  (`success`/`error`/`info`), `.update-banner`, `.offline-bar`, `.empty-state`.
- **Sesión y series**: `.session-head`, `.session-title`, `.set-block`, `.set-head`, `.set-row`,
  `.set-item`, `.set-n`, `.set-check`, `.set-tools`, `.set-extra`, `.set-prev`, `.set-type-tag`,
  `.rest-slot`, `.rest-bar`, `.rest-progress`, `.session-clock`, `.session-nav-chips`,
  `.ex-chip`, `.summary-*`, `.legacy-*`.
- **Historial**: `.hist-list`, `.hist-item`, `.hist-head`, `.hist-ex`, `.hist-*`.
- **Progreso y gráficas**: `.chart-card`, `.linechart`, `.bar`, `.barchart`, `.pr-list`,
  `.pr-row`, `.grid-2`, `.five`.
- **Plan y programas**: `.plan-card`, `.plan-day`, `.plan-entry`, `.plan-week`, `.plan-seg`,
  `.plan-goal-row`, `.cal-head`, `.cal-grid`, `.cal-cell`, `.cal-dot`, `.cal-legend`.
  (ya existe un calendario de plan; F3 pedirá el anual de actividad, distinto).
- **Análisis**: `.ana-*` (`.ana-kpi`, `.ana-table`, `.ana-row`, `.ana-split`, `.ana-bar-row`…).
- **Ajustes, cuenta y legal**: `.settings-card`, `.cloud-extra`, `.sb-status`, `.auth-*`,
  `.legal-*`.
- **Portada**: `.auth-grid`, `.auth-swiper`, `.glow-card`, `.swiper-*`, `.auth-features`.
- **Estados**: `is-active`, `is-current`, `is-done`, `is-pending`, `is-progress`, `is-missed`,
  `is-rest`, `is-cancelled`, `is-completed`, `is-archived`, `is-offline`, `is-error`, `is-update`,
  `is-syncing`.

Lo que **no** existe y habrá que crear en F1/F2/F3/F4: primitivas de botón con variante
«secundaria» explícita (hoy `btn-ghost`), esqueleto de carga reutilizable, tarjeta con cabecera y
acción normalizada, insignia de estado unificada, y la capa de tokens semánticos.

## 5. Rutas y capturas de partida

| Ruta | Vista | Captura |
|---|---|---|
| sin sesión | portada / acceso | `portada-375.png`, `portada-1440.png` |
| `#/workouts` | Entrenamientos (inicio) | `inicio-375.png`, `inicio-1440.png` |
| `#/plan` | Plan | `plan-375.png` |
| `#/program` | Programa | — (ver nota) |
| `#/library` | Biblioteca | `biblioteca-375.png` |
| `#/history` | Historial | `historial-375.png`, `historial-1440.png` |
| `#/progress` | Progreso | `progreso-375.png`, `progreso-1440.png` |
| `#/analytics` | Análisis | `analitica-375.png` |
| `#/weight` | Peso | `peso-375.png` |
| `#/settings` | Ajustes | `ajustes-375.png` |
| `#/session/:id` | Entrenamiento en curso | `sesion-375.png` |
| `#/editor/:id` | Editar entrenamiento | `editor-375.png` |

**Nota sobre `#/program`**: al navegar a esa ruta el enrutador vuelve a `#/workouts` con una
cuenta sin programa activo. La vista existe en `VIEW_TITLES` pero no se pudo capturar en ese
estado; queda pendiente comprobarla con un programa asignado (lo hará F2/F3).

No hay rutas de **perfil** ni de **Arena**, como ya advertía el encargo.

## 6. Medidas reales del estado actual

Tomadas con Chrome headless a 375 × 812 y 1440 × 900, cuenta local nueva, sin fuentes externas.

| Vista | Ancho del documento | Alto | Observación |
|---|---|---|---|
| `#/workouts` | **469 px** | **68.305 px** | desborda en horizontal; el documento mide 68 mil px de alto |
| `#/analytics` | **615 px** | 4.958 px | desborda; filas `.ana-row` de 416 px de ancho mínimo |
| `#/plan` | 365 px | 1.610 px | sin desbordamiento |
| `#/history` | 375 px | 812 px | correcto (vacío) |
| `#/library` | 375 px | 4.478 px | correcto |
| `#/settings` | 375 px | 2.463 px | correcto |
| `#/session/:id` | 375 px | 2.655 px | correcto |
| portada | **545 px** | 1.178 px | desborda en horizontal |

En 320 px el inicio mide también 469 px de ancho y Análisis 615 px, es decir, el desbordamiento
no depende del ancho de la ventana. La única caja que declara más ancho que la ventana en Análisis
es `.ana-row` (416 px, `grid-template-columns` con mínimos de 140 px + 3 × 70 px). En Inicio no
hay ninguna caja con `getBoundingClientRect().width > innerWidth`, así que el origen es un
contenido de ancho fijo o un texto sin puntos de corte dentro de un contenedor con
`overflow: visible`; **queda por localizar en F1**, junto con la portada.

Dato añadido: con una cuenta recién creada y cero entrenamientos guardados, `#/workouts` pinta
**261 tarjetas `.wcard`** (la biblioteca de plantillas), y de ahí el alto de 68.305 px. No es un
error de datos (el usuario tiene 0 entrenamientos, `dataFor(...).workouts.length` es 0), pero
hoy la portada interna es prácticamente una lista infinita.

## 7. Activos que ya están en el repositorio

- `data/muscles.json` — **v2, 606 ejercicios, 16 grupos, 10 patrones**, con `primary`,
  `secondary` y `pattern` por ejercicio, más normalización. F4 no parte de cero: hay que
  comprobar cobertura y honestidad del «sin clasificar», no inventar el diccionario.
- `vendor/swiper/` — Swiper 11 servido desde el propio sitio (sin CDN), usado en la portada.
- `icons/`, `sounds/`, `programs/`, `manifest.webmanifest`, `sw.js` (caché `drakotrack-v16`).
- `supabase/migrations/` con el historial de migraciones y sus `README.md`.
- `api/` con los handlers actuales (auth, data, account) como patrón para F5.

## 8. Riesgos detectados para F1

1. Desbordamiento horizontal ya existente en Inicio y Análisis (469 y 615 px) y en la portada
   (545 px). F1 tiene que dejarlos a 0 a 320, 375, 768 y 1440 px, no solo no empeorarlos.
2. Inicio pinta 261 tarjetas de plantilla con la cuenta vacía: cualquier trabajo de «tarjetas»
   (F2/F4) debe decidir qué se muestra sin datos reales.
3. `--orange-grad`, `--green` y `--red` no tienen variante clara; el tema claro ya se apoya hoy
   en un degradado pensado para fondo oscuro.
4. La capa de tokens no tiene escala de espaciado ni de tamaños de fuente, así que los valores
   están dispersos en las reglas: F1 introduce la escala y convierte sin cambiar el resultado
   visual.

## 9. Lo que no se ha probado en F0

- Nada de la app en un dispositivo móvil real ni en Safari.
- Sincronización real con Supabase (las capturas bloquean la red externa).
- El despliegue en `https://drakotrack-app.mn-manzur.workers.dev`: F0 no publica. La rama de
  trabajo no se ha subido al remoto todavía.
- La vista `#/program` con un programa activo.

---

# F1 — Sistema de diseño, acento naranja y navegación

- Rama: `fase/rediseno-arena`
- Base: `325bda5` (cierre de F0)
- Alcance real de esta entrega: capa semántica de tokens, unificación del acento, primitivas
  compartidas, mínimos de accesibilidad y los desbordamientos horizontales que F0 dejó medidos.

## 10. Qué cambia

**Tokens.** `styles.css` pasa a tener una capa semántica explícita, manteniendo los 33 nombres
anteriores como alias para no romper ninguna regla existente:

| Grupo | Tokens nuevos |
|---|---|
| Superficies | `--surface` (`#1c222b`), `--surface-2` (`#242c38`), `--bg` (`#111318`), `--bg-2` (`#0d0f14`) |
| Texto | `--text` (`#f2f4f7`), `--muted`, `--muted-2` con contraste AA sobre panel |
| Acento | `--accent` (`#f28c28`), `--accent-strong`, `--accent-deep`, `--accent-ink`, `--accent-text`, `--accent-rgb` |
| Estados | `--ok`, `--warn`, `--danger`, `--danger-text`, `--focus` |
| Escalas | `--space-1…8`, `--radius-xs/sm/md/lg/pill`, `--font-size-xs…2xl` |

Los alias (`--panel`, `--orange`, `--orange-grad`, `--green`, `--red`, `--radius`, `--shadow`)
siguen existiendo y apuntan a la capa nueva, así que las 502 clases actuales no cambian de
significado. El tema claro redefine todos los colores y estados; las escalas se comparten desde
`:root` y se heredan.

**Acento.** El naranja anterior (`#ff7a00`, `#ffa040`, `#f05100`) desaparece de `styles.css` y de
`app.js`: 0 apariciones de esos literales. Los tintes `rgba(255,122,0,α)` pasan a
`rgba(var(--accent-rgb),α)` y los degradados a `--accent-strong → --accent → --accent-deep`.
El turquesa `#19D3C5` no existía ya en ningún archivo y sigue sin aparecer.

**Primitivas nuevas** (al final de `styles.css`, sin reescribir reglas previas): `.btn-secondary`,
`.card-head`, `.badge` con `.badge-ok/.badge-warn/.badge-danger/.badge-accent`, `.alert` con sus
cuatro tonos y `.skeleton` (respeta `prefers-reduced-motion`).

**Accesibilidad.** `min-height:44px` en `.btn`, `.nav-btn`, `.theme-btn` y `.user-chip`; anillo de
foco explícito también en `.icon-btn` y en la barra inferior (`outline-offset:-3px`); ningún
`font-size` declarado por debajo de 12 px (se subieron los valores de 10–11,5 px a 12 px).

**Color del navegador.** `theme-color` de `index.html` y `theme_color`/`background_color` del
manifest pasan de `#0a0a0c` a `#111318`, el mismo valor que `--bg` oscuro.

**Versiones.** `styles.css?v=37`, `app.js?v=49`, caché del service worker `drakotrack-v22`, con
`ESSENTIAL` y `SHELL` apuntando a las versiones que sirve `index.html`.

## 11. Desbordamiento horizontal (medido, no estimado)

`scripts/medidas.mjs` (nuevo) sirve el sitio, siembra una cuenta local de usar y tirar, bloquea
fuentes y Supabase y mide `scrollWidth` frente a `clientWidth` en 320, 375, 768 y 1440 px,
señalando la caja que se sale cuando la hay.

| Vista | F0 (375 px) | F1 (320 / 375 / 768 / 1440) |
|---|---|---|
| portada | 545 px | 320 / 375 / 768 / 1440 — sin desbordamiento |
| `#/workouts` | 469 px | sin desbordamiento en los cuatro anchos |
| `#/analytics` | 615 px | sin desbordamiento (filas con `minmax(0,…)`) |
| `#/editor/:id` | — | 320 px corregido (acciones del editor con `flex-wrap`) |
| resto de rutas | correctas | correctas |

Causas corregidas: `.auth-wrap`/`.auth-brand` no encogían como ítems de rejilla (`.ana-row` tenía
mínimos fijos de 140 + 3 × 70 px) y las acciones del editor no admitían salto de línea.

## 12. Pruebas ejecutadas

| Comprobación | Resultado real |
|---|---|
| `npm test` | **exit 0**, 0 `FAIL` |
| `test-design.js` (nuevo, en la cadena de `npm test`) | **92 ok, 0 fallos** |
| `test-offline.js` | **101 ok, 0 fallos** (las versiones ahora se comparan con `index.html`, no con un número fijo) |
| `build-cloudflare` | `dist ready (20 files, 4 directories)` |
| `test-cloudflare.js` | **111 aserciones**, todas correctas |
| `scripts/medidas.mjs` | «Ninguna vista desborda» en 320/375/768/1440 |

`test-design.js` comprueba: ausencia de turquesa, tokens semánticos en ambos temas, acento
`#f28c28`, ausencia de los naranjas anteriores, `:focus-visible` y sustituto de `outline:none`,
suelo de 12 px, los 5 destinos de navegación con `aria-current`, coherencia `theme-color`/manifest,
44 px de objetivo táctil, movimiento reducido y existencia de las primitivas.

## 13. Lo que esta fase no incluye o no se ha verificado

- **No se añadió «Arena» ni «Perfil»** a la navegación: el encargo prohíbe inventar pantallas antes
  de que existan sus fases (F2 y F6). Los 5 destinos siguen siendo Entrenamientos, Plan, Historial,
  Progreso y Peso.
- **No hay despliegue ni push**: publicar en producción requiere autorización explícita del usuario.
  Todo está verificado en local y en el build de `dist/`.
- **Recorrido con teclado**: la prueba automática verifica que existe foco visible y objetivos de
  44 px, pero no se hizo una pasada manual con Tab en navegador real ni en móvil físico.
- **Tema claro**: no se revisó visualmente cada componente en `data-theme="light"`; el contraste de
  los tokens de texto está cubierto por `test-flows.js` (AA ≥ 4,5:1 sobre panel y fondo).
- **Animaciones**: `prefers-reduced-motion` sigue desactivando transiciones y animaciones, pero no se
  midió en un dispositivo de gama baja.

---

# F2 — Inicio con datos reales y perfil deportivo

## 14. Inicio

- Cabecera con saludo, nombre del perfil y fecha local; botón principal «Empezar entrenamiento»
  (`#/start`) y acceso directo a «Mi perfil».
- Tres tarjetas de resumen calculadas con datos reales (`workoutStats()`): entrenamientos de la
  semana con su volumen, último entrenamiento terminado (nombre, fecha y duración) y récords
  vigentes. Cada tarjeta navega a Progreso o Historial y es un `button`, así que responde al teclado.
- **Cuenta nueva**: la tarjeta de último entrenamiento se sustituye por un estado vacío explícito
  («Aún no hay sesiones») con la acción «Empezar ahora»; no se inventan ceros ni marcas.
- Se retiró la rejilla duplicada de cinco estadísticas: los mismos números ya aparecen en las
  tarjetas nuevas y en el panel de progreso.

## 15. Perfil

- `d.profile.pub` se guarda en el mismo documento (dentro de `d.profile`, que ya usaba el planificador) `app_data`, que ya viaja a la nube: la
  sincronización lo trata como objeto por clave (`sync.js` ya lo tenía en `KEYED_OBJECTS`), sin
  tocar el nombre de la cuenta ni `profiles.display_name`.
- Campos admitidos y únicos que se renderizan: `displayName` (máx. 24 caracteres), `avatar`
  (PNG/JPEG/WebP en data URL, ≤ 400 000 caracteres), `joinedAt` y `visibility`. Cualquier otro
  campo se descarta en `normalizeProfile()`.
- Avatar opcional con iniciales por defecto; sin imagen se muestran las iniciales del apodo.
- **Nunca** aparecen peso, medidas, correo ni foto de progreso.
- Visibilidad con tres interruptores (entrenamientos y récords, rutina activa, fecha de alta), por
  defecto **todos apagados**: la vista pública muestra solo el apodo salvo que el usuario active
  algo. El interruptor de rutina solo se pinta si el planificador expone una rutina activa real.
- Los cambios se guardan con `saveDB()`, de modo que entran en la revisión de sincronización.

## 16. Pruebas de F2

- `test-profile.js` (nuevo, dentro de `npm test`): perfil mínimo por defecto, normalización que
  descarta campos desconocidos y avatares inválidos, recorte del apodo a 24 caracteres, iniciales,
  persistencia en `localStorage` tras guardar, visibilidad apagada por defecto y encendida tras el
  cambio, y comprobación de que el HTML del perfil no contiene ni el peso ni la foto de progreso.
- `npm test` completo en verde (exit 0) y `scripts/medidas.mjs` sin desbordamiento en 320/375/768/1440 px.

## F3 · Calendario anual de actividad

**Estado**: desplegado en `main` (`60a599b15fa035f67bf3fe4b22a620741b5fff2f`) y verificado en
producción el 11 de noviembre de 2026.

### Comprobaciones en producción

- La home sirve los tres archivos de F3 con cache-buster: `app.js?v=51`, `styles.css?v=40` y
  `activity.js?v=1`; el service worker publica `drakotrack-v25`.
- `#/activity` responde con los **12 meses**, 441 celdas, filtro de mes que conserva el foco y
  actualiza el resumen, y **0 errores de consola / 0 peticiones fallidas**.
- Cabeceras intactas tras el despliegue: `content-security-policy`, `strict-transport-security`,
  `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy` y
  `permissions-policy`.
- `/api/auth/session` responde **200**, así que las sesiones siguen funcionando.
- `#/program/<slug>` con un programa real del catálogo: 15 semanas, 3 días y sin desbordamiento a
  375 ni 1440 px.

### Qué se añadió

- **Módulo puro `activity.js`**: agrupa las sesiones terminadas por día (una sesión por día cuenta
  una vez), descarta canceladas y calentamientos, calcula minutos y volumen con la misma regla que
  el resto de la app (peso externo > 0 y repeticiones > 0), asigna un nivel de intensidad de 0 a 4
  y construye la cuadrícula mensual con semanas que empiezan en lunes.
- **Vista `#/activity`** («Calendario de actividad») con:
  - filtros de **año** y **mes** (solo lectura: no se guardan en el documento, así que no hay
    migración ni campos nuevos en `lib/security.js`);
  - resumen del período (días entrenados, sesiones, tiempo y volumen) que se recalcula con el filtro;
  - los doce meses del año en tarjetas, o un único mes cuando se filtra;
  - leyenda de intensidad y marcas distintas para el día de hoy y el descanso planificado;
  - estado vacío honesto cuando todavía no hay sesiones terminadas.
- **Racha que no penaliza el descanso**: se cuentan días consecutivos con sesión; los días de
  descanso planificados en el calendario del plan se saltan (ni suman ni rompen) y los días
  posteriores al último entrenamiento tampoco cortan la racha. Cualquier otro hueco sí la reinicia.
  Es una racha en días; la tarjeta de Progreso mantiene la racha en semanas que ya existía.
- **Entrada desde Progreso**: tarjeta «Calendario de actividad» con la racha actual, encima del
  volumen por grupo muscular. La barra de navegación sigue con sus **5 destinos**.
- Accesibilidad: cada día lleva `aria-label` con fecha, sesiones, minutos y volumen; las
  cuadrículas no son interactivas (no se añaden 365 controles al tabulador); el anillo de foco de
  `#main` aparece solo al navegar con teclado.

### Correcciones de F1/F2 incluidas

- Las tarjetas de «Panel de rendimiento» usaban `var(--card)` y `var(--line)`, que no existen, con
  respaldos oscuros: en tema claro se veían negras con texto negro. Ahora usan `--surface`,
  `--border`, `--ok`, `--danger` y `--accent-text`.
- El `outline` de `#main` dibujaba un marco naranja alrededor de toda la página en cada navegación,
  también con ratón o dedo. Ahora solo se muestra al navegar con teclado (`data-kbd`).

### Pruebas

`test-activity.js` (**45 aserciones**): agrupación por día, volumen sin calentamientos, niveles,
cuadrícula de febrero de 2026, racha con y sin descanso planificado, racha con hueco real, filtros
de año y mes, año vacío y vista completa en jsdom (doce meses, filtros, estado vacío y enlace desde
Progreso). Se añadió a la cadena de `npm test`.

Resultado: **82 / 75 / 74 / 123 / 13 / 101 / 11** + perfil **34** + actividad **45** + diseño **92**,
build `dist ready (21 files, 5 directories)` y Cloudflare **116**.

### Capturas

`artifacts/f3/actividad-375-oscuro.png`, `actividad-375-claro.png`, `actividad-1440-oscuro.png`,
`actividad-1440-claro.png`, `actividad-1440-mes.png` (filtro de noviembre), `inicio-1440-claro.png`
(panel corregido) y `perfil-375-oscuro.png` (sin marco de foco).

### Versiones

`app.js?v=51`, `styles.css?v=40`, `activity.js?v=1`, service worker `drakotrack-v25`.

---

# F4 — Diccionario muscular: cobertura y «sin clasificar»

## Qué cambia

- **Músculos por ejercicio en la biblioteca**: cada entrada de la lista (y del selector de
  ejercicios) muestra los grupos que publica `data/muscles.json`, con el primario destacado y los
  secundarios en insignia neutra. Si el diccionario no tiene el ejercicio, la fila dice **«Sin
  clasificar»** con insignia de aviso: no se deduce del grupo antiguo de ocho categorías, que no
  distingue cuádriceps de glúteo.
- **Panel de cobertura en la biblioteca**: versión del diccionario, número de grupos y de
  ejercicios, cuántos de los ejercicios del usuario (catálogo + propios) están clasificados, el
  porcentaje y un desplegable con los que quedan sin clasificar. Con el diccionario cargando se
  muestra un estado, y si falla la red hay un botón de reintento en vez de una lista vacía.
- **Mapa semanal más honesto**: las series de un ejercicio sin clasificar ya no solo se cuentan,
  también se pueden ver por nombre en un desplegable («Ver los ejercicios sin clasificar»). Siguen
  sin repartirse entre músculos.
- El reparto no cambia: primario 1, secundario 0,5, normalizado para que cada serie sume una vez.

## Cobertura real (medida, no estimada)

`node scripts/muscle-coverage.mjs` sobre el diccionario v2:

| Ámbito | Cobertura |
|---|---|
| Catálogo de 256 programas, por uso | **89,4 %** (21 083 de 23 574 apariciones) |
| Catálogo de programas, solo fuerza | **94,4 %** (20 647 de 21 878) |
| Nombres distintos de programas | **35,1 %** (576 de 1642); el resto son cardio, movilidad, calentamientos o marcadores que no son ejercicios de fuerza |
| Biblioteca local (`app.js`) | **100 %** por uso |

La interfaz no promete más de lo que hay: enseña el porcentaje de la biblioteca del usuario y la
lista de lo que falta.

## Pruebas

`test-muscle-ui.js` (nuevo, **20 aserciones**, dentro de `npm test`): chips de press de banca y
sentadilla, «Sin clasificar» para un nombre desconocido, cobertura que suma clasificados + sin
clasificar, panel de cobertura con versión y lista, insignia en la fila del ejercicio propio, y
mapa semanal que cuenta las series sin clasificar sin repartirlas y muestra el nombre concreto.

## Versiones

`app.js?v=52`, `styles.css?v=41`, service worker `drakotrack-v26`.
