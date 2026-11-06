# Despliegue de DrakoTrack (Prompt 8)

Esta guía corresponde a la versión con PWA, Service Worker y cola offline.
No contiene credenciales: los valores reales van en Vercel o en el entorno
local, nunca en el repositorio ni en el ZIP.

> **Cloudflare Pages (opcional).** La app también puede publicarse en Cloudflare
> Pages sin tocar Supabase ni retirar Vercel; ver [CLOUDFLARE.md](CLOUDFLARE.md)
> para el build `dist/`, las variables, las pruebas locales y el rollback. Los
> pasos de este documento siguen siendo la vía Vercel.

## 1. Revisar y probar antes de publicar

```bash
npm ci
npm test
npm run test:cloudflare   # solo si se va a publicar en Cloudflare Pages
node --check app.js
node --check offline.js
node --check sw.js
bash -n scripts/publish.sh
```

La suite debe terminar sin fallos. En esta entrega: 925 comprobaciones OK.

## 2. Publicar el código

Opción A — integración Git de Vercel:

1. Confirmar que la rama que Vercel monitorea es la correcta.
2. Revisar `git status` y `git diff`.
3. Hacer commit y push de la rama.
4. Vercel construye y publica automáticamente.

Opción B — script del proyecto:

```bash
# El token se exporta en la terminal; no se pega en el chat ni se escribe en el repo.
export VERCEL_TOKEN=...
./scripts/publish.sh
```

El script ejecuta las pruebas, comprueba que no haya cambios sin commitear,
hace push y despliega a producción con Vercel CLI. También admite:

```bash
./scripts/publish.sh --deploy-only   # solo despliegue
./scripts/publish.sh --push-only     # solo push
```

## 3. Variables de entorno

Configurar en Vercel → Project → Settings → Environment Variables los nombres
de `.env.example`:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (recomendada para rate limiting compartido; solo servidor)

No subir `.env`, tokens ni claves al repositorio. El ZIP de entrega excluye
`.env`; solo incluye `.env.example` con marcadores.

## 4. Verificación posterior

1. Abrir la URL de producción y confirmar que carga la app.
2. Comprobar que `/manifest.webmanifest` y `/sw.js` responden correctamente.
3. En Chrome Android (o Chrome de escritorio con DevTools):
   - recargar una vez con red para instalar el shell;
   - activar “Offline” en Network y recargar;
   - abrir una rutina, iniciar entrenamiento y registrar una serie;
   - recargar sin red y confirmar que la sesión sigue ahí;
   - volver a conectar y comprobar que la barra pasa a sincronizado.
4. Probar “Instalar aplicación” y abrirla en modo standalone.
5. Si hay una versión anterior abierta, verificar el aviso de actualización y
   que no se aplica durante un entrenamiento activo.
6. En Safari iOS, comprobar “Compartir → Añadir a pantalla de inicio”; iOS no
   soporta Background Sync, pero la app reintenta al abrir o volver a primer plano.

Estas comprobaciones de navegador real no se pudieron ejecutar en el sandbox
sin navegador; quedan pendientes de validación manual tras el despliegue.
