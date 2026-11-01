#!/usr/bin/env bash
# Rebuilds the derived session index from app_data.
#
# Safe to run at any time: it only writes rows whose source hash changed and
# deletes rows whose session no longer exists in the JSON. app_data is never
# modified.
#
# Usage:
#   ./scripts/reindex-sessions.sh               # every account
#   ./scripts/reindex-sessions.sh --user <uuid> # one account
#
# Reads the direct Postgres connection string from SUPABASE_DB_URL
# (Supabase → Settings → Database). The value is never printed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Falta SUPABASE_DB_URL (cadena de conexión de Postgres del proyecto)." >&2
  exit 2
fi

case "${1:-}" in
  "")
    sql="select * from public.dt_reindex_all_sessions();"
    ;;
  --user)
    if [[ ! "${2:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
      echo "Uso: $0 [--user <uuid>]" >&2
      exit 2
    fi
    sql="select * from public.dt_reindex_sessions('${2}'::uuid);"
    ;;
  *)
    echo "Uso: $0 [--user <uuid>]" >&2
    exit 2
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "Falta psql: instala el cliente de PostgreSQL para usar este script." >&2
  exit 2
fi

if [[ ! -f "$repo_root/supabase/migrations/20261101_trainer_index.sql" ]]; then
  echo "No encuentro la migración del índice; ejecútalo desde el repositorio." >&2
  exit 2
fi

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "$sql"
