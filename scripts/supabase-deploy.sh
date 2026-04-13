#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if command -v supabase >/dev/null 2>&1; then
  SUPABASE_CMD=(supabase)
  CLI_SOURCE="global"
else
  SUPABASE_CMD=(npx -y supabase)
  CLI_SOURCE="npx"
fi

echo "[supabase-deploy] root: $ROOT_DIR"
echo "[supabase-deploy] cli-source: $CLI_SOURCE"
"${SUPABASE_CMD[@]}" --version >/dev/null

if [[ -z "${SUPABASE_PROJECT_REF-}" && ! -f "supabase/config.toml" ]]; then
  echo "[supabase-deploy] ERROR: missing project link."
  echo "Set SUPABASE_PROJECT_REF or run: supabase link --project-ref <ref>"
  exit 1
fi

if [[ -n "${SUPABASE_PROJECT_REF-}" ]]; then
  echo "[supabase-deploy] linking project from SUPABASE_PROJECT_REF"
  "${SUPABASE_CMD[@]}" link --project-ref "$SUPABASE_PROJECT_REF"
fi

echo "[supabase-deploy] pushing migrations"
"${SUPABASE_CMD[@]}" db push --include-all

echo "[supabase-deploy] migration list"
"${SUPABASE_CMD[@]}" migration list

echo "[supabase-deploy] success"
