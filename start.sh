#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in the environment or .env before running start.sh}"
export SESSION_SECRET="${SESSION_SECRET:?Set SESSION_SECRET in the environment or .env before running start.sh}"
export ADMIN_EMAILS="${ADMIN_EMAILS:?Set ADMIN_EMAILS in the environment or .env before running start.sh}"
export SUPERADMIN_EMAILS="${SUPERADMIN_EMAILS:?Set SUPERADMIN_EMAILS in the environment or .env before running start.sh}"
export NODE_ENV="${NODE_ENV:-development}"

PORT="${PORT:-3000}"
export PORT

cd "$ROOT_DIR"
exec node server.js
