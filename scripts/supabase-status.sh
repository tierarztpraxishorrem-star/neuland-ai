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

echo "[supabase-status] root: $ROOT_DIR"
echo "[supabase-status] cli-source: $CLI_SOURCE"
"${SUPABASE_CMD[@]}" --version >/dev/null

echo "[supabase-status] cli-ok: yes"

if [[ -n "${SUPABASE_PROJECT_REF-}" ]]; then
  echo "[supabase-status] project-link: present (SUPABASE_PROJECT_REF)"
elif [[ -s "supabase/.temp/project-ref" ]]; then
  echo "[supabase-status] project-link: present (supabase/.temp/project-ref)"
elif [[ -f "supabase/config.toml" ]]; then
  echo "[supabase-status] project-link: present (supabase/config.toml)"
else
  echo "[supabase-status] project-link: missing"
fi

for var_name in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [[ -n "${!var_name-}" ]]; then
    echo "[supabase-status] $var_name=SET"
  else
    echo "[supabase-status] $var_name=MISSING"
  fi
done

echo "[supabase-status] done"
