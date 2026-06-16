#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NO_SANDBOX=1
if [[ -z "${CHOKIDAR_USEPOLLING:-}" ]] && [[ "$(sysctl -n fs.inotify.max_user_watches 2>/dev/null || echo 0)" -lt 524288 ]]; then
  export CHOKIDAR_USEPOLLING=true
fi
exec npm run dev
