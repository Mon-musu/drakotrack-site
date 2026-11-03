#!/usr/bin/env bash
# Actualizar el árbol de staging de despliegue con los activos web actuales.
# Usar esto antes de desplegar en Vercel y antes de empaquetar la APK.
set -euo pipefail

cd "$(dirname "$0")"

SRC="."
DST=".deploy-stage"
mkdir -p "$DST"

WEB_FILES=(
  index.html
  app.js
  sync.js
  styles.css
  share.js
  supabase.js
  boostcamp.js
  legal.html
  legal.js
  update-check.js
  sw.js
  vercel.json
)

for f in "${WEB_FILES[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp -f "$SRC/$f" "$DST/$f"
    echo "copied: $f"
  else
    echo "missing source: $f"
    exit 1
  fi
done

echo "deploy stage текущий:"
ls -1 "$DST"
