#!/usr/bin/env bash
# node-pty 预编译 spawn-helper 有时没有 +x，会导致 posix_spawnp failed。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PTY="$ROOT/node_modules/node-pty"
if [[ ! -d "$PTY" ]]; then
  echo "[fix-node-pty] node-pty not installed, skip"
  exit 0
fi
count=0
while IFS= read -r -d '' f; do
  chmod +x "$f"
  count=$((count + 1))
done < <(find "$PTY/prebuilds" -type f \( -name 'spawn-helper' -o -name 'spawn-helper.exe' \) -print0 2>/dev/null || true)

# 部分环境会装到 build/Release
if [[ -d "$PTY/build/Release" ]]; then
  while IFS= read -r -d '' f; do
    chmod +x "$f" 2>/dev/null || true
    count=$((count + 1))
  done < <(find "$PTY/build/Release" -type f -name 'spawn-helper' -print0 2>/dev/null || true)
fi

echo "[fix-node-pty] chmod +x on ${count} spawn-helper file(s)"
