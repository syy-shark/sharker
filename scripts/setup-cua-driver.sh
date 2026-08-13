#!/usr/bin/env bash
# cua-driver 安装检测与 doctor（可选桌面自动化后端）
# @see docs/computer-use-setup.md
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

info() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

find_cua_driver() {
  local candidate
  for candidate in \
    "${SHARKER_CUA_DRIVER_BIN:-}" \
    "$(command -v cua-driver 2>/dev/null || true)" \
    "$HOME/.local/bin/cua-driver" \
    "/opt/homebrew/bin/cua-driver" \
    "/usr/local/bin/cua-driver" \
    "$HOME/.cua-driver/bin/cua-driver"; do
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
info "Doctor 完成。Sharker 使用内置 desktop_* 工具；cua-driver 仅作可选诊断。"
