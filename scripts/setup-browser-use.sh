#!/usr/bin/env bash
# Browser Use：安装 Chrome native messaging manifest，指向 codex-chrome-extension-host
# 路径约定改编自 codex-desktop-linux（MIT）· @see docs/computer-use-setup.md
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_NAME="com.openai.codexextension"
EXTENSION_ID="${SHARKER_BROWSER_EXTENSION_ID:-hehggadaopoacecdllhhajmbjkdcmajg}"

info() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

find_chrome_host_binary() {
  local candidate
  for candidate in \
    "${SHARKER_CHROME_EXTENSION_HOST:-}" \
    "${CODEX_CHROME_EXTENSION_HOST:-}" \
    "$REPO_DIR/../codex-desktop-linux-main/target/release/codex-chrome-extension-host" \
    "$HOME/codex-desktop-linux-main/target/release/codex-chrome-extension-host" \
    "$(command -v codex-chrome-extension-host 2>/dev/null || true)"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

native_host_dirs() {
  local home="${HOME:?}"
  printf '%s\n' \
    "$home/.config/google-chrome/NativeMessagingHosts" \
    "$home/.config/google-chrome-beta/NativeMessagingHosts" \
    "$home/.config/google-chrome-unstable/NativeMessagingHosts" \
    "$home/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" \
    "$home/.config/chromium/NativeMessagingHosts"
}

write_manifest() {
  local host_path="$1"
  local dest_dir="$2"
  local manifest="$dest_dir/${HOST_NAME}.json"
  mkdir -p "$dest_dir"
  cat >"$manifest" <<JSON
{
  "name": "${HOST_NAME}",
  "description": "Codex / Sharker Browser Use native messaging host",
  "path": "${host_path}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
JSON
  info "Wrote $manifest"
}

host_bin="$(find_chrome_host_binary 2>/dev/null || true)"
if [ -z "$host_bin" ]; then
  warn "codex-chrome-extension-host not found."
  warn "Build: cd codex-desktop-linux-main/computer-use-linux && cargo build --release -p codex-computer-use-linux --bin codex-chrome-extension-host"
  warn "Or set SHARKER_CHROME_EXTENSION_HOST=/absolute/path"
  exit 1
fi

info "Using native host: $host_bin"
info "Chrome extension ID: $EXTENSION_ID (Codex Browser Use extension)"
info ""

while IFS= read -r dir; do
  write_manifest "$host_bin" "$dir"
done < <(native_host_dirs)

info ""
info "Next steps:"
info "  1. Install Codex Browser Use Chrome extension (extension ID above) in Chrome/Chromium/Brave"
info "  2. Restart the browser"
info "  3. Sharker builtin browser_* (Playwright) works without the extension; extension path enables logged-in Chrome profile automation via Codex Browser Use stack"
info "  4. Optional MCP: configure @playwright/mcp in ~/.sharker/mcp.json (see tools/mcp.example.json)"
