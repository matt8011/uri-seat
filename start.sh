#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

#: "${GOOGLE_CLIENT_ID:asd?Set GOOGLE_CLIENT_ID before running start.sh}"
#: "${SESSION_SECRET:asd?Set SESSION_SECRET before running start.sh}"
#: "${ADMIN_EMAILS:michael.tedeschi99@gmail.com?Set ADMIN_EMAILS before running start.sh}"

GOOGLE_CLIENT_ID="567656009387-tugrmd5339ro0pl8ub34gnkgi53srlpk.apps.googleusercontent.com"
SESSION_SECRET="A/BJQN6CJtGE2w/2SGiZeg+JRaa/NxWjf4nkPz7XGqE="
ADMIN_EMAILS="michael.tedeschi99@gmail.com"

export GOOGLE_CLIENT_ID
export SESSION_SECRET
export ADMIN_EMAILS

PORT="${PORT:-3000}"

cd "$ROOT_DIR"
exec node server.js
