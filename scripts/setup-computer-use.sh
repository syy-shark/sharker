#!/usr/bin/env bash
# Computer Use 环境诊断与安装提示（改编自 codex-desktop-linux bootstrap-wizard.sh，MIT）
# @see docs/computer-use-setup.md · third_party/codex/NOTICE.md
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UINPUT_PATH="${SHARKER_UINPUT_PATH:-/dev/uinput}"

info() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

command_status() {
  if command -v "$1" >/dev/null 2>&1; then
    printf 'found (%s)' "$(command -v "$1")"
  else
    printf 'missing'
  fi
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then echo apt; return; fi
  if command -v dnf5 >/dev/null 2>&1; then echo dnf5; return; fi
  if command -v dnf >/dev/null 2>&1; then echo dnf; return; fi
  if command -v pacman >/dev/null 2>&1; then echo pacman; return; fi
  if command -v zypper >/dev/null 2>&1; then echo zypper; return; fi
  echo unknown
}

install_command_for_packages() {
  local packages="$1"
  case "$(detect_package_manager)" in
    apt) printf 'sudo apt install %s' "$packages" ;;
    dnf5) printf 'sudo dnf5 install %s' "$packages" ;;
    dnf) printf 'sudo dnf install %s' "$packages" ;;
    pacman) printf 'sudo pacman -S %s' "$packages" ;;
    zypper) printf 'sudo zypper install %s' "$packages" ;;
    *) printf 'Use your distro package manager to install: %s' "$packages" ;;
  esac
}

computer_use_portal_packages() {
  local desktop="${XDG_CURRENT_DESKTOP:-} ${DESKTOP_SESSION:-}"
  desktop="${desktop,,}"
  if [[ "$desktop" == *kde* || "$desktop" == *plasma* ]]; then
    printf 'xdg-desktop-portal xdg-desktop-portal-kde'
  elif [[ "$desktop" == *hyprland* || "$desktop" == *sway* || "$desktop" == *wlroots* ]]; then
    printf 'xdg-desktop-portal xdg-desktop-portal-wlr'
  elif [[ "$desktop" == *gnome* ]]; then
    printf 'xdg-desktop-portal xdg-desktop-portal-gnome'
  else
    printf 'xdg-desktop-portal'
  fi
}

computer_use_ydotool_packages() {
  case "$(detect_package_manager)" in
    apt) printf 'ydotool ydotoold' ;;
    *) printf 'ydotool' ;;
  esac
}

uinput_summary() {
  if [ ! -e "$UINPUT_PATH" ]; then
    printf 'missing'
    return
  fi
  local access="no read/write access"
  if [ -r "$UINPUT_PATH" ] && [ -w "$UINPUT_PATH" ]; then
    access="read/write access"
  elif [ -r "$UINPUT_PATH" ]; then
    access="read-only access"
  elif [ -w "$UINPUT_PATH" ]; then
    access="write-only access"
  fi
  local stat_output=""
  if command -v stat >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
    stat_output="$(timeout 1 stat -c '%A %U:%G' "$UINPUT_PATH" 2>/dev/null || true)"
  fi
  printf '%s%s' "$access" "${stat_output:+ ($stat_output)}"
}

input_group_summary() {
  if id -nG 2>/dev/null | tr ' ' '\n' | grep -qx 'input'; then
    printf 'yes'
  else
    printf 'no'
  fi
}

window_backend_hint() {
  local desktop="${XDG_CURRENT_DESKTOP:-} ${DESKTOP_SESSION:-} ${XDG_SESSION_DESKTOP:-}"
  desktop="${desktop,,}"
  if [[ "$desktop" == *hyprland* ]]; then
    printf 'Hyprland -> hyprctl backend'
  elif [[ "$desktop" == *i3* ]]; then
    printf 'i3 -> i3 IPC backend'
  elif [[ "$desktop" == *cosmic* ]]; then
    printf 'COSMIC -> bundled COSMIC helper backend'
  elif [[ "$desktop" == *kde* || "$desktop" == *plasma* ]]; then
    printf 'KDE/Plasma -> KWin scripting backend'
  elif [[ "$desktop" == *gnome* ]]; then
    printf 'GNOME -> Shell Introspect + optional GNOME extension (setup_window_targeting)'
  else
    printf 'unknown desktop -> screenshots, AT-SPI, ydotool may still work'
  fi
}

find_computer_use_binary() {
  local candidate
  for candidate in \
    "${SHARKER_COMPUTER_USE_BIN:-}" \
    "${CODEX_COMPUTER_USE_BIN:-}" \
    "$REPO_DIR/../codex-desktop-linux-main/target/release/codex-computer-use-linux" \
    "$HOME/codex-desktop-linux-main/target/release/codex-computer-use-linux" \
    "$(command -v codex-computer-use-linux 2>/dev/null || true)"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

install_gnome_extension() {
  local ext_src="$REPO_DIR/third_party/codex/gnome-shell-extension"
  local ext_dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/codex-window-control@openai.com"
  if [ ! -f "$ext_src/metadata.json" ]; then
    warn "GNOME extension source missing: $ext_src"
    return 1
  fi
  mkdir -p "$ext_dest"
  cp "$ext_src/metadata.json" "$ext_src/extension.js" "$ext_dest/"
  if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions enable codex-window-control@openai.com 2>/dev/null || true
    info "GNOME extension installed to $ext_dest — log out and back in if window API is unavailable."
  else
    info "GNOME extension copied to $ext_dest — install gnome-shell-extension-tool and enable manually."
  fi
}

install_uinput_udev() {
  local rule_src="$REPO_DIR/third_party/codex/udev/99-uinput.rules"
  if [ ! -f "$rule_src" ]; then
    warn "udev rule missing: $rule_src"
    return 1
  fi
  info "To install uinput udev rule:"
  info "  sudo cp $rule_src /etc/udev/rules.d/"
  info "  sudo udevadm control --reload-rules"
  info "  sudo usermod -aG input \"$USER\"  # then log out/in"
}

info "Sharker Computer Use setup"
info "Repository: $REPO_DIR"
info "Session: XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-unknown} XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-unknown}"
info ""
info "Dependencies:"
info "  ydotool=$(command_status ydotool)"
info "  ydotoold=$(command_status ydotoold)"
info "  grim/scrot=$(command_status grim) / $(command_status scrot)"
info "  wmctrl=$(command_status wmctrl)"
info "  uinput=$(uinput_summary)"
info "  user in input group=$(input_group_summary)"
info "  Window backend: $(window_backend_hint)"
info ""
info "Suggested installs:"
info "  $(install_command_for_packages "$(computer_use_ydotool_packages)")"
info "  $(install_command_for_packages "$(computer_use_portal_packages)")"
info "  sudo systemctl enable --now ydotoold.service  # or ydotoold &"
info ""
info "MCP config (~/.sharker/mcp.json): see tools/mcp.example.json (transport: ndjson)"

doctor="$(find_computer_use_binary 2>/dev/null || true)"
if [ -n "$doctor" ]; then
  info ""
  info "Running: $doctor doctor"
  "$doctor" doctor || true
  info ""
  info "Other CLI checks:"
  info "  $doctor setup"
  info "  $doctor setup-window-targeting  # or MCP setup_window_targeting"
else
  warn "codex-computer-use-linux not found. Build in codex-desktop-linux:"
  warn "  cd computer-use-linux && cargo build --release"
fi

case "${1:-}" in
  --install-gnome-extension)
    install_gnome_extension
    ;;
  --print-udev)
    install_uinput_udev
    ;;
  --help|-h)
    info "Usage: $0 [--install-gnome-extension] [--print-udev]"
    ;;
esac
