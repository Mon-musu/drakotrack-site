# Integración del rediseño visual F5 · auditoría y plan

Estado: **auditoría del proyecto actual completada**; la integración de los archivos de F5 está
pendiente de recibir la referencia completa (`drakotrack-visual-refresh-f5.zip`).

## 1. Referencia F5 recibida

- Cuatro partes de texto Base64 (`drakotrack-f5-parte-0N-de-04.txt`, 800 000 + 800 000 + 800 000 + 679 900
  caracteres) alojadas en el repositorio privado `Mon-musu/DrakoF5`.
- Reconstrucción con `scripts/f5-fetch.sh` + `scripts/f5-unpack.mjs`: 3 079 900 caracteres Base64 →
  **2 309 924 bytes**, **355 archivos**, `unzip -t`: *No errors detected*.
- F5 resultó ser **este mismo proyecto con una capa visual encima**: 343 archivos idénticos, 9 modificados
  y 3 nuevos. No hubo que elegir entre versiones: F5 ya contenía el trabajo de sincronización
  (fila heredada rev 0, 409, avisos con acción, comprobación de versión).

## 2. Comparación archivo por archivo

| Archivo | Actual | F5 | Acción |
|---|---|---|---|
| `styles.css` | 98 885 B, 836 selectores | 112 131 B, 866 selectores | **Integrado**: 0 selectores perdidos, 30 nuevos (iconos de navegación, botones con icono, tarjeta y visor anatómico) |
| `app.js` | 445 698 B | 447 812 B | **Integrado**: sprite de iconos, botones con icono, sección «Anatomía muscular en 3D» y acción `anatomy-load` (iframe bajo demanda) |
| `index.html` | 15 576 B | 17 694 B | **Integrado**: sprite SVG local (10 símbolos), iconos en navegación lateral e inferior, `frame-src` en la CSP del meta |
| `legal.html` | 28 399 B | 29 811 B | **Integrado**: avisos de terceros y licencias |
| `sw.js` | v36 | v37 | **Integrado**: precache de `app.js?v=63` y `styles.css?v=42` |
| `scripts/build-cloudflare.mjs` | CSP sin `frame-src` | `frame-src https://sketchfab.com` | **Integrado**: cambio mínimo y acotado, como se acordó |
| `test-design.js` | 92 aserciones | 108 | **Integrado**: comprobaciones del sistema visual y paridad de CSP en los cuatro archivos |
| `test-cloudflare.js` | 116 | 117 | **Integrado**: la CSP publicada debe incluir `frame-src` |
| `DISENO.md` | 30 371 B | 33 815 B | **Integrado**: conserva nuestras secciones del 409 y del rev 0 |
| `THIRD_PARTY_NOTICES.md` | — | 1 886 B | **Nuevo**, integrado |
| `_headers`, `_routes.json` | generados en `dist/` | incluidos en el ZIP | **No copiados**: son salida de `build-cloudflare.mjs` y no deben vivir en el código fuente |
| 61 archivos solo del proyecto | capturas de `artifacts/`, `apk-build/` | no están en F5 | **Conservados** |

## 3. Licencias y terceros

- Iconos: sprite SVG propio inspirado en Lucide (línea), sin dependencia ni petición externa.
- Modelo 3D: «Male Body Muscular System — Anatomy Study» de Ruslan Gadzhiev, **CC BY 4.0**, con autor,
  enlace y licencia visibles junto al visor y en `THIRD_PARTY_NOTICES.md`.
- El visor **no se descarga al abrir la app**: solo se crea el iframe al pulsar «Cargar modelo 3D».

## 4. Seguridad

- CSP: se añade únicamente `frame-src https://sketchfab.com`. `script-src`, `object-src`,
  `frame-ancestors 'none'` y `form-action` quedan igual; el resto de la política no se relaja.
- Sin secretos nuevos: el único recurso externo es el iframe del modelo.
- La CSP vive en cuatro sitios y los cuatro están alineados: `scripts/build-cloudflare.mjs`,
  `index.html` (meta), `vercel.json` e `index.js`. `test-design.js` compara los cuatro y exige que
  `frame-src` sea exactamente `https://sketchfab.com` en todos.

## 5. Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| `test-design.js` | 108 ok, 0 fallos |
| `test-cloudflare.js` | 117 aserciones |
| `test-sync.js` | 104 aserciones |
| `test-sync-auth.js` | 19 ok |
| `test-flows.js` y API | 82 / 75 / 74 / 123 / 13 / 101 / 12, 0 fallos |
| `build:cloudflare` | `dist ready (21 files, 5 directories)` |
| `npm test` (completo) | **exit 0** |

## 6. Pendiente

- Revisión visual real en navegador (no se ha abierto la app para mirar las pantallas).
- Publicar: el commit está en la rama local `fase/rediseno-arena`, sin push.
