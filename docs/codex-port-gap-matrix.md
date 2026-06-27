# Codex Desktop Linux → Sharker 移植对照

参考仓库：`codex-desktop-linux-main`（MIT, ilysenko）。Last audit: 2026-06-22。

## Gap Matrix

| Codex 特性 | Sharker 状态 | 说明 |
|------------|--------------|------|
| **computer-use-linux MCP** | **Wired** | ndjson MCP 池、`desktop_*` 内置、Computer Use 设置 UI |
| **setup / doctor / udev / GNOME ext** | **Copied + Wired** | `scripts/setup-computer-use.sh`、`third_party/codex/gnome-shell-extension/`、`udev/99-uinput.rules` |
| **Browser Use Playwright** | **Wired** | `tools/builtins/browser/*` |
| **codex-chrome-extension-host** | **Copied setup + Wired detect** | `scripts/setup-browser-use.sh`、`tools/services/browser-native-host.ts`、Browser Use 设置 UI |
| **Chrome 插件 browser-client.mjs** | **Deferred** | 属 Codex 打包插件；Sharker 用 Playwright + 可选扩展路径 |
| **read-aloud-linux MCP** | **Wired** | `mcp.example.json`、`voice_*` 内置、Voice 设置 UI |
| **Kokoro install script** | **Copied** | `scripts/install-kokoro-runtime.sh`（Sharker venv 路径） |
| **Voice UI / conversation-mode** | **Partial / Deferred** | Voice 设置 Tab；无 composer 语音对话（需 Codex webview 补丁） |
| **MCP stdio / dynamic pool** | **Wired** | `tools/services/mcp-client.ts`（content-length + ndjson） |
| **networkMode (agent-workspace 三档)** | **Wired** | `tools/network-policy.ts` + 权限设置 |
| **agent-workspace-linux** | **Deferred** | 独立 GPUI 二进制 + 大型设置 UI；见 Codex README |
| **remote-control-ui** | **Deferred** | Codex 上游 UI 门控补丁 |
| **remote-mobile-control** | **Deferred** | 移动端远程控制 |
| **read-aloud UI 按钮** | **Deferred** | Codex webview 补丁 |
| **thorium-chrome-plugin** | **Partial** | manifest 路径含 Brave/Chromium（browser-native-host） |
| **x11-ewmh-computer-use** | **Deferred** | 可选 X11 后端特性 |
| **Cosmic helper** | **Documented** | 使用 Codex 二进制 `codex-computer-use-cosmic`（不复制 Rust） |
| **Canvas / docs 对比** | **Done**（前序会话） | CompareBlock 等 |

## 从 Codex 复制的文件

| Codex 源路径 | Sharker 目标路径 |
|--------------|------------------|
| `computer-use-linux/gnome-shell-extension/*` | `third_party/codex/gnome-shell-extension/` |
| `linux-features/read-aloud/install-kokoro-runtime.sh` | `scripts/install-kokoro-runtime.sh` |
| `scripts/bootstrap-wizard.sh`（Computer Use 段） | `scripts/setup-computer-use.sh` |
| `patch-chrome-plugin.js`（manifest 路径约定） | `tools/services/browser-native-host.ts` + `scripts/setup-browser-use.sh` |
| docs/linux-computer-use.md（节选） | `docs/computer-use-setup.md` |

## Sharker 新建/修改（本批次）

**新建**

- `scripts/setup-computer-use.sh`
- `scripts/setup-browser-use.sh`
- `scripts/install-kokoro-runtime.sh`
- `third_party/codex/`（NOTICE、udev、gnome-shell-extension）
- `tools/services/browser-native-host.ts`
- `shared/browser-use-status.ts`
- `shared/voice-status.ts`
- `src/components/settings/BrowserUseSettings.tsx` + `.css`
- `src/components/settings/VoiceSettings.tsx` + `.css`
- `docs/computer-use-setup.md`
- `docs/codex-port-gap-matrix.md`

**修改**

- `tools/mcp.example.json`
- `shared/ipc.ts`
- `electron/main/index.ts`
- `electron/preload/index.ts`
- `src/vite-env.d.ts`
- `src/types/navigation.ts`
- `src/pages/SettingsPage.tsx`
- `src/components/Sidebar.tsx`
- `tools/README.md`
- `docs/agent-capabilities.md`
- `agent/README.md`

## 用户 setup 步骤（摘要）

1. **Computer Use MCP**：编译 `codex-computer-use-linux` → 写入 `~/.sharker/mcp.json`（`transport: ndjson`）→ `bash scripts/setup-computer-use.sh`
2. **Browser**：`npm install playwright` 或 `bash scripts/setup-browser-use.sh`（扩展路径）
3. **Voice**：`sudo apt install speech-dispatcher` 或 `bash scripts/install-kokoro-runtime.sh` + read-aloud MCP
4. 打开 Sharker **设置** 对应 Tab 确认就绪
