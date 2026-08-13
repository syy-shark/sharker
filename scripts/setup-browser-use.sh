#!/usr/bin/env bash
# Browser Use：安装 Chrome native messaging manifest（macOS）
# @see docs/computer-use-setup.md
set -Eeuo pipefail

HOST_NAME="com.openai.codexextension"
EXTENSION_ID="${SHARKER_BROWSER_EXTENSION_ID:-hehggadaopoacecdllhhajmbjkdcmajg}"

info() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

find_chrome_host_binary() {
  local candidate
  for candidate in \
    "${SHARKER_CHROME_EXTENSION_HOST:-}" \
    "$HOME/.local/bin/codex-chrome-extension-host" \
    "/opt/homebrew/bin/codex-chrome-extension-host" \
    "/usr/local/bin/codex-chrome-extension-host" \
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
  local support="$home/Library/Application Support"
  printf '%s\n' \
    "$support/Google/Chrome/NativeMessagingHosts" \
    "$support/Google/Chrome Beta/NativeMessagingHosts" \
    "$support/Google/Chrome Canary/NativeMessagingHosts" \
    "$support/BraveSoftware/Brave-Browser/NativeMessagingHosts" \
    "$support/Chromium/NativeMessagingHosts" \
    "$support/Microsoft Edge/NativeMessagingHosts"
}

write_manifest() {
  local host_path="$1"
  local dest_dir="$2"
  local manifest="$dest_dir/${HOST_NAME}.json"
  mkdir -p "$dest_dir"
  cat >"$manifest" <<JSON
{
  "name": "${HOST_NAME}",
  "description": "Sharker Browser Use native messaging host",
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
  warn "chrome extension host not found."
  warn "Set SHARKER_CHROME_EXTENSION_HOST=/absolute/path"
  warn "Or use Playwright / in-app Browser panel (no native host required)."
  exit 1
fi

info "Using native host: $host_bin"
info "Chrome extension ID: $EXTENSION_ID"
info ""

while IFS= read -r dir; do
  write_manifest "$host_bin" "$dir"
done < <(native_host_dirs)

info ""
info "Next steps:"
info "  1. Install the Browser Use Chrome extension (ID above) if using native host path"
info "  2. Restart the browser"
info "  3. Prefer Playwright: enable Browser Use in Settings"
info "  4. npm install playwright && npx playwright install chromium"
