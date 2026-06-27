# Computer Use / Browser Use / Voice 安装指南

Sharker 在 **Windows** 上以 [Cua Driver](https://github.com/trycua/cua)（UIA 后台自动化）+ **Playwright** 为主要路径；Linux 仍支持 ydotool 内置回退与 Codex 备选 MCP。

## Windows 快速开始

### Computer Use（Cua Driver）

```powershell
# 1. 安装 Cua Driver（官方脚本，含 PATH 与可选 daemon 计划任务）
irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex

# 2. 诊断
cua-driver doctor

# 3. 写入 Sharker MCP 配置
powershell -ExecutionPolicy Bypass -File scripts/setup-cua-driver.ps1 -InstallMcp
```

或在 Sharker **设置 → Computer Use**：复制安装命令 →「启用 cua-driver MCP」→ 重新检测。

MCP 工具前缀：`mcp_cua_driver__*`（`get_window_state`、`click`、`type_text`、`scroll` 等）。

参考：[Cua Driver 文档](https://cua.ai/docs/cua-driver) · [Windows 实现说明](https://cua.ai/blog/inside-windows-computer-use)

### Browser Use（Playwright）

```powershell
npm install playwright
npx playwright install chromium
```

在 **设置 → Browser Use** 打开开关会自动写入 MCP `@playwright/mcp`；也可使用内置 `browser_*` 工具。右侧 **Browser** 面板可内嵌打开网页（无需 Playwright）。

---

## 快速脚本

| 脚本 | 作用 |
|------|------|
| `scripts/setup-cua-driver.ps1` / `.cmd` | **Windows**：检测 cua-driver、doctor、`-InstallMcp` 写 mcp.json |
| `bash scripts/setup-cua-driver.sh` | **Linux/macOS**：检测 cua-driver、运行 doctor |
| `bash scripts/setup-cua-driver.sh --install-mcp` | 写入 `~/.sharker/mcp.json`（`cua-driver mcp`） |
| `bash scripts/setup-computer-use.sh` | 诊断 ydotool/uinput/portal，运行 codex `doctor`（备选） |
| `bash scripts/setup-computer-use.sh --install-gnome-extension` | 安装 GNOME 窗口扩展（`setup_window_targeting`） |
| `bash scripts/setup-computer-use.sh --print-udev` | 打印 uinput udev 规则安装说明 |
| `bash scripts/setup-browser-use.sh` | 写入 Chrome native messaging manifest |
| `bash scripts/install-kokoro-runtime.sh` | 安装 Kokoro TTS venv + 模型 |

设置 UI：**Computer Use** Tab →「启用 cua-driver」一键写入 MCP；或 **MCP** Tab 手动开关。

## cua-driver（推荐）

[cua-driver](https://github.com/trycua/cua) 提供后台 AT-SPI 自动化：元素级 `click`、`get_window_state`、`scroll`、`zoom`，不抢焦点。

```bash
bash scripts/setup-cua-driver.sh --install-mcp
cua-driver doctor
```

MCP 工具前缀：`mcp_cua_driver__*`（如 `get_window_state`、`click`）。

## Rust 二进制（Codex 备选，不随 Sharker 分发）

在 codex-desktop-linux 仓库根或子 crate 编译：

```bash
cd /path/to/codex-desktop-linux-main/computer-use-linux

# Computer Use MCP
cargo build --release -p codex-computer-use-linux

# Browser Use native host（Chrome 扩展桥）
cargo build --release -p codex-computer-use-linux --bin codex-chrome-extension-host

# Read Aloud MCP（read-aloud-linux crate）
cd ../read-aloud-linux
cargo build --release -p codex-read-aloud-linux
```

二进制通常在 `../target/release/`。

## ~/.sharker/mcp.json

示例见 `tools/mcp.example.json`。**computer-use 与 read-aloud 必须** `"transport": "ndjson"`。

```json
{
  "servers": [
    {
      "name": "computer-use",
      "command": "/path/to/codex-computer-use-linux",
      "args": ["mcp"],
      "transport": "ndjson"
    }
  ]
}
```

CLI 自检：

```bash
codex-computer-use-linux doctor
codex-computer-use-linux setup          # 启用 AT-SPI
codex-computer-use-linux setup-window-targeting   # GNOME 扩展
codex-read-aloud-linux doctor
```

## Ubuntu 依赖

### ydotool（内置 desktop_*）

```bash
sudo apt install ydotool ydotoold
sudo systemctl enable --now ydotoold
```

### uinput（MCP 绝对指针）

```bash
sudo cp third_party/codex/udev/99-uinput.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo usermod -aG input "$USER"
# 注销后重新登录
```

### Portal 截图/输入

- GNOME：`xdg-desktop-portal-gnome`
- KDE：`xdg-desktop-portal-kde`
- Hyprland/sway：`xdg-desktop-portal-hyprland` / `xdg-desktop-portal-wlr`

### AT-SPI

```bash
gsettings set org.gnome.desktop.a11y.applications screen-reader-enabled true
# 或 MCP setup_accessibility
```

### GNOME 窗口列表（可选）

```bash
bash scripts/setup-computer-use.sh --install-gnome-extension
# 注销后重新登录
```

扩展文件来源：`third_party/codex/gnome-shell-extension/`（MIT，见 NOTICE.md）。

## Browser Use

两种路径：

| 路径 | 说明 |
|------|------|
| **内置** | `browser_*` + Playwright（`npm install playwright`） |
| **Codex 扩展** | Chrome 扩展 + `codex-chrome-extension-host` + native messaging |

```bash
bash scripts/setup-browser-use.sh
```

或在设置 → **Browser Use** →「安装 manifest」。

扩展 ID（Codex 官方）：`hehggadaopoacecdllhhajmbjkdcmajg`

## Voice / Read Aloud

| 层级 | 说明 |
|------|------|
| 内置 | `voice_read_aloud` / `voice_stop`（spd-say / espeak-ng） |
| Kokoro | `bash scripts/install-kokoro-runtime.sh` |
| MCP | `codex-read-aloud-linux` → `mcp_read_aloud__read_aloud` |

## 与 Codex 差异（刻意未移植）

| Codex 特性 | Sharker 状态 |
|------------|--------------|
| conversation-mode（语音对话 UI） | **Deferred** — 依赖 Codex webview 补丁 |
| remote-control-ui / remote-mobile-control | **Deferred** — 上游 Codex 功能门 |
| agent-workspace-linux 设置页 | **Deferred** — 独立 npm 包 `@agent-sh/agent-workspace-linux`；networkMode 已在 Sharker 权限页 |
| Chrome 插件 browser-client.mjs 整包 | **Partial** — native host + manifest；无 Node REPL 桥 |
| Codex 打包/asar 补丁 | **N/A** — Sharker 原生 Electron |

完整对照见 `docs/codex-port-gap-matrix.md`。

## 许可

复制文件见 `third_party/codex/NOTICE.md`（MIT）。
