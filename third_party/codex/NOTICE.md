# Third-party notices

以下文件自 [codex-desktop-linux](https://github.com/ilysenko/codex-desktop-linux)（MIT License, Copyright (c) 2025 ilysenko）复制或改编：

| 路径 | 说明 |
|------|------|
| `third_party/codex/gnome-shell-extension/` | GNOME Shell 窗口列表/聚焦扩展（MCP `setup_window_targeting`） |
| `third_party/codex/udev/99-uinput.rules` | uinput 设备权限 udev 规则 |
| `scripts/install-kokoro-runtime.sh` | Kokoro TTS 运行时安装（原 `linux-features/read-aloud/install-kokoro-runtime.sh`） |
| `scripts/setup-computer-use.sh` | 改编自 `scripts/bootstrap-wizard.sh` Computer Use 诊断段 |
| `scripts/setup-browser-use.sh` | 改编自 Codex Chrome native messaging 路径约定 |

Rust 二进制（**未复制源码**，需自行编译）：

- `codex-computer-use-linux` — Computer Use MCP
- `codex-chrome-extension-host` — Browser Use native messaging
- `codex-read-aloud-linux` — Read Aloud MCP

构建见 `docs/computer-use-setup.md`。
