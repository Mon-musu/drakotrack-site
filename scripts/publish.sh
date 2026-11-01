#!/usr/bin/env bash
# ============================================================
#  DrakoTrack — publicar una versión
#  Sube la rama actual a GitHub y despliega a producción en Vercel.
#
#  Requisitos (una sola vez, en tu máquina):
#    export VERCEL_TOKEN=...     # token de Vercel del proyecto "drakotrack"
#    git remote set-url origin https://github.com/Mon-musu/drakotrack-site.git
#    # el push usa tu sesión de git/gh habitual (SSH o credential helper)
#
#  Uso:
#    ./scripts/publish.sh               # pruebas -> push -> deploy a producción
#    ./scripts/publish.sh --deploy-only # solo deploy (no toca git)
#    ./scripts/publish.sh --push-only   # solo push (no despliega)
#
#  No imprime ni escribe ningún secreto: VERCEL_TOKEN se lee del entorno.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="all"
case "${1:-}" in
  --deploy-only) MODE="deploy" ;;
  --push-only)   MODE="push" ;;
  "")            ;;
  *)             echo "uso: $0 [--deploy-only|--push-only]" >&2; exit 2 ;;
esac

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Identificadores públicos del proyecto (no son secretos).
PROJECT_ID="prj_rEB2WWP9rt05s4C5GbnQZXHBYDAr"
ORG_ID="team_5zE5VdibdNrlZ66x9Ites1Am"
SITE="https://drakotrack.vercel.app"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Archivos que forman el despliegue: la web, las funciones de api/ y su código.
DEPLOY_FILES=(
  index.html app.js styles.css share.js supabase.js boostcamp.js
  legal.html legal.js logo.png altcha.js altcha-setup.js update-check.js
  vercel.json package.json package-lock.json api lib programs apk/version.json
)

# ---------- 1. pruebas ------------------------------------------------------
if [ "$MODE" != "deploy" ] || [ "${SKIP_TESTS:-0}" != "1" ]; then
  say "Pruebas"
  [ -d node_modules/jsdom ] || npm ci --no-audit --no-fund
  npm test
fi

# ---------- 2. push ---------------------------------------------------------
if [ "$MODE" != "deploy" ]; then
  say "Push de $BRANCH a origin"
  git remote get-url origin >/dev/null 2>&1 \
    || die "no hay remoto 'origin'. Añadilo: git remote add origin https://github.com/Mon-musu/drakotrack-site.git"
  [ -z "$(git status --porcelain --untracked-files=no)" ] \
    || die "hay cambios sin commitear; haz commit antes de publicar"
  git push -u origin "$BRANCH"
  echo "rama publicada: $(git remote get-url origin) → $BRANCH"
fi

# ---------- 3. deploy -------------------------------------------------------
if [ "$MODE" != "push" ]; then
  say "Despliegue a producción"
  [ -n "${VERCEL_TOKEN:-}" ] \
    || die "falta VERCEL_TOKEN. Exportalo en esta terminal: export VERCEL_TOKEN=... (no lo pegues en el chat)"

  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  for f in "${DEPLOY_FILES[@]}"; do
    [ -e "$f" ] || die "falta $f: no se despliega un árbol incompleto"
    cp -r "$f" "$STAGE"/
  done
  mkdir -p "$STAGE/.vercel"
  printf '{"projectId":"%s","orgId":"%s"}\n' "$PROJECT_ID" "$ORG_ID" > "$STAGE/.vercel/project.json"

  OUT="$(npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" --cwd "$STAGE" 2>&1)"
  printf '%s\n' "$OUT" | tail -6
  URL="$(printf '%s\n' "$OUT" | grep -Eo 'https://[a-z0-9-]+\.vercel\.app' | tail -1 || true)"
  [ -n "$URL" ] || die "Vercel no devolvió una URL de despliegue (revisa la salida de arriba)"

  say "Comprobación de $SITE"
  CODE="$(curl -sS -A 'Mozilla/5.0' -o /tmp/drakotrack-index.html -w '%{http_code}' "$SITE/" || true)"
  echo "HTTP $CODE"
  case "$CODE" in
    200) grep -q 'app\.js?v=' /tmp/drakotrack-index.html && echo "índice servido con cache-buster: $(grep -o 'app\.js?v=[0-9]*' /tmp/drakotrack-index.html | head -1)" ;;
    429) echo "aviso: el cortafuegos de Vercel está desafiando a curl (x-vercel-mitigated). Abrí la web en el navegador para confirmar." ;;
    *)   echo "aviso: la home respondió $CODE; revisá el despliegue en el panel de Vercel." ;;
  esac
  echo "desplegado: $URL"
fi

say "Listo"
