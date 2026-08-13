# Computer Use / Browser Use / Voice 安装（macOS）

Sharker 以内置 `desktop_*`（screencapture / osascript / cliclick）与 **Playwright** `browser_*` 为主要路径。

## 快速开始

```bash
# 可选：检测 cua-driver 并运行 doctor
bash scripts/setup-cua-driver.sh
```

或在应用内：**设置 → Computer Use → 启用**。

## 系统权限

在 **系统设置 → 隐私与安全性** 中授权：

| 权限 | 用途 |
|------|------|
| **辅助功能** | cliclick / osascript 控制 UI |
| **屏幕录制** | `screencapture` 截图 |

开发模式下需授权运行中的 Electron / 终端（如 Terminal、iTerm、Cursor）。

## 脚本一览

| 脚本 | 作用 |
|------|------|
| `bash scripts/setup-cua-driver.sh` | 可选：检测 cua-driver、运行 doctor |
| `bash scripts/setup-browser-use.sh` | 可选：Chrome native messaging manifest |
| `bash scripts/install-kokoro-runtime.sh` | 可选：Kokoro TTS 运行时 |

## 内置 desktop_* 

| 能力 | 实现 |
|------|------|
| 截图 | `screencapture` |
| 窗口列表 | `osascript` System Events |
| 点击 / 打字 | 可选 `cliclick`（`brew install cliclick`） |
| 按键 / 滚动 | `osascript` System Events |

工作流：

1. `desktop_screenshot` / `desktop_list_windows`
2. `desktop_click` / `desktop_type` / `desktop_key` / `desktop_scroll`
3. 需视觉时开启模型「视觉」开关，截图会回灌给模型

诊断：对话中调用 `desktop_doctor`，或设置页 Computer Use 检查清单。

## Browser Use

推荐路径：

1. **设置 → Browser Use → 启用**
2. 或手动：`npm install playwright && npx playwright install chromium`
3. 可见浏览：工具 `open_url`（系统默认浏览器 / Google Chrome）

可选 Chrome native host：`bash scripts/setup-browser-use.sh`（需自备 host 二进制，见 `SHARKER_CHROME_EXTENSION_HOST`）。

## Voice

- 内置：macOS `say`
- 可选高质量：Kokoro — `bash scripts/install-kokoro-runtime.sh`
