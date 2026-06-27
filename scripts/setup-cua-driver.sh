#!/usr/bin/env bash
# cua-driver 安装与 ~/.sharker/mcp.json 配置（Sharker Computer Use 推荐后端）
# @see docs/computer-use-setup.md
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_CONFIG="${SHARKER_MCP_CONFIG:-$HOME/.sharker/mcp.json}"

info() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

find_cua_driver() {
  local candidate
  for candidate in \
    "${SHARKER_CUA_DRIVER_BIN:-}" \
    "$(command -v cua-driver 2>/dev/null || true)" \
    "$HOME/.local/bin/cua-driver" \
    "/usr/local/bin/cua-driver" \
    "/usr/bin/cua-driver"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

install_cua_driver() {
  if command -v cua-driver >/dev/null 2>&1; then
    info "cua-driver 已安装: $(command -v cua-driver)"
    return 0
  fi
  warn "未找到 cua-driver。请从 https://github.com/trycua/cua 安装："
  warn "  curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/scripts/install.sh | bash"
  warn "或: pip install cua-driver（若提供 wheel）"
  return 1
}

merge_mcp_config() {
  local binary="$1"
  mkdir -p "$(dirname "$MCP_CONFIG")"
  python3 - "$MCP_CONFIG" "$binary" <<'PY'
import json, sys, os
path, binary = sys.argv[1], sys.argv[2]
servers = []
if os.path.isfile(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
        servers = data.get('servers', [])
name = 'cua-driver'
entry = {'name': name, 'command': binary, 'args': ['mcp']}
idx = next((i for i, s in enumerate(servers) if s.get('name') == name), -1)
if idx >= 0:
    servers[idx] = entry
else:
    servers.append(entry)
with open(path, 'w', encoding='utf-8') as f:
    json.dump({'servers': servers}, f, indent=2, ensure_ascii=False)
    f.write('\n')
print(path)
PY
}

info "Sharker cua-driver setup"
info "Repository: $REPO_DIR"
info ""

if ! install_cua_driver; then
  exit 1
fi

BINARY="$(find_cua_driver)"
info "Binary: $BINARY"
info "Version: $($BINARY --version 2>/dev/null || echo unknown)"
info ""
info "Running doctor:"
"$BINARY" doctor 2>&1 || true
info ""

case "${1:-}" in
  --install-mcp|--apply)
    OUT="$(merge_mcp_config "$BINARY")"
    info "已写入 MCP 配置: $OUT"
    info '  { "name": "cua-driver", "command": "'"$BINARY"'", "args": ["mcp"] }'
    info "重启 Sharker 对话以使 MCP 工具池刷新。"
    ;;
  --help|-h)
    info "Usage: $0 [--install-mcp]"
    info "  (no args)     检测 cua-driver 并运行 doctor"
    info "  --install-mcp 合并 cua-driver 到 ~/.sharker/mcp.json"
    ;;
  *)
    info "Doctor 完成。写入 MCP 配置请运行:"
    info "  bash $0 --install-mcp"
    ;;
esac
