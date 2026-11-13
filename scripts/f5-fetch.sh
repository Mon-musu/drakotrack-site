#!/usr/bin/env bash
# Descarga las partes de la referencia F5 desde URLs y reconstruye el ZIP.
#
#   ./scripts/f5-fetch.sh URL1 URL2 URL3 URL4
#
# Sirve cualquier URL directa (raw.githubusercontent.com, Gist, bucket…).
# Cada URL se guarda como f5/f5-parte-NN.txt y después se concatenan.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$#" -ge 1 ] || { echo "Uso: $0 URL [URL...]" >&2; exit 2; }
rm -rf f5 && mkdir -p f5
i=0
for url in "$@"; do
  i=$((i + 1))
  name=$(printf 'f5/f5-parte-%02d.txt' "$i")
  echo "descargando $((i))/$#: $url"
  curl -fL --retry 3 --retry-delay 2 -o "$name" "$url"
  echo "  $(wc -c < "$name") bytes"
done
node scripts/f5-unpack.mjs --dir f5 --out drakotrack-visual-refresh-f5.zip
unzip -t drakotrack-visual-refresh-f5.zip | tail -2
