# tools — 看 · 搜 · 改 · 跑

## 职责

- **执行** 模型发起的所有 tool calls
- **权限**：工作区沙箱、路径检查、高危命令识别
- **输出卫生**：过长结果截断，避免撑爆上下文

## 架构（模块化）

参考 Claude Code 的 Tool 系统：每个 Tool 自包含 **Schema + 执行 + 权限钩子**，由注册表统一汇总。

```
tools/
├── types.ts          # SharkerTool 接口、toolSchema 辅助
├── schemas.ts        # OpenAI JSON Schema（纯数据，渲染进程可 import）
├── registry.ts       # handler + schema 组装、分发执行
├── executor.ts       # 对外 executeTool / executeToolWithMeta
├── context.ts        # assertAccess、toolCwd、ok
├── permissions.ts    # 沙箱路径、高危 shell 模式
├── builtins/         # 各 Tool 模块（一工具一文件，git 一组）
│   ├── list-dir.ts
│   ├── read-file.ts
│   ├── write-file.ts
│   ├── run-terminal-cmd.ts
│   ├── git.ts
│   └── ...
└── shared/           # 跨工具复用（glob、grep、git-runner）
```

| 层级 | Claude Code | Sharker |
|------|-------------|---------|
| 接口 | `Tool.ts` + `buildTool()` | `types.ts` + `SharkerTool` |
| 注册 | `tools.ts` → `getAllBaseTools()` | `registry.ts` → `getAllBuiltinTools()` |
| 实现 | `src/tools/{Name}/` | `tools/builtins/{name}.ts` |
| Schema | 与实现同模块 | `definition` 字段内联 |

## 关键文件

| 文件 | 说明 |
|------|------|
| `registry.ts` | 注册表：`TOOL_DEFINITIONS`、MCP 动态池合并、按名查找、执行分发、高危评估 |
| `services/mcp-tool-pool.ts` | MCP tools/list → `mcp_<server>__<tool>` 动态并入模型 |
| `services/mcp-client.ts` | stdio JSON-RPC MCP 客户端 |
| `services/mcp-registry.ts` | 配置加载、list/call |
| `services/mcp-config-io.ts` | mcp.json 读写（设置 UI） |
| `network-policy.ts` | networkMode 限制 web/shell |
| `executor.ts` | 对外入口，截断输出 |
| `shell-runner.ts` | 可中止 shell、开发服务器就绪探测后放后台 |
| `permissions.ts` | `checkPathAccess`、`resolveCommandCwd` |
| `truncate.ts` | `truncateToolOutput`、`truncateLines` |

## 已有工具一览

**看搜**：`list_dir`、`glob_file_search`、`grep`、`read_file`  
**改**：`write_file`、`search_replace`、`apply_patch`、`delete_path`、`move_path`、`create_directory`  
**系统**：`uninstall_application`（停进程 + pkexec 卸 apt 包 + 清用户数据 + 验证）、`verify_removal`（检查残留；Harness 在误用 rm 卸载后会自动调用）  
**跑**：`run_terminal_cmd`（`rm -rf` 后自动验证路径是否消失）、全套 `git_*`、`run_skill_script`  
**Web/Browser**：`web_fetch`、`web_search`、`browser_*`（Playwright 可选）  
**Desktop**：`desktop_*`（ydotool 轻量回退）；完整见 MCP **`cua-driver`**（推荐）或 `codex-computer-use-linux`  
**MCP**：动态池 + `mcp_list_tools` / `mcp_call_tool`  
**Voice**：`voice_read_aloud` / `voice_stop`（spd-say/espeak）；Kokoro + MCP 见 `docs/computer-use-setup.md`  
**Browser native host**：`tools/services/browser-native-host.ts` · `scripts/setup-browser-use.sh`

## 开发服务器行为

- 不再对 `npm run` 强塞 `--port`；优先 `PORT`/`VITE_PORT` 环境变量
- 从 stdout/stderr 解析 `http://localhost:<port>` 等监听地址
- TCP 探测端口就绪后提前返回可打开链接
- 后台化时持续排空管道，避免子进程因 EPIPE 退出

## 对外接口

- `executeTool(name, args, settings): Promise<string>` — 仅文本输出（给模型上下文）
- `executeToolWithMeta(...): Promise<ToolRunResult>` — 含 `fileDiff`（`write_file` / `search_replace` 行级 diff，供 UI 绿加红删）

## 扩展指南（新增 Tool）

1. 在 `tools/schemas.ts` 增加 OpenAI schema
2. 在 `tools/builtins/` 新建 handler 模块，实现 `ToolHandler` 接口
3. 在 `registry.ts` 的 `getAllToolHandlers()` 中注册
3. 若涉及路径或危险操作，实现 `assessRisk` / `extractPaths`
4. 更新 [docs/agent-capabilities.md](../docs/agent-capabilities.md)

无需再改 `executor.ts` 或 `agent/tool-definitions.ts`（后者 re-export 注册表）。

## 依赖

- `shared/workspace` — 当前工作区路径
- Node `fs`、`child_process`

## MCP（stdio JSON-RPC）

| 工具 | 说明 |
|------|------|
| `mcp_list_tools` | 连接 `~/.sharker/mcp.json` 或 `<工作区>/.sharker/mcp.json` 中的 Server，列出 `tools/list` |
| `mcp_call_tool` | 调用 `tools/call`（高危，需审批） |

配置示例见 `tools/mcp.example.json`。工作区配置覆盖全局。传输：子进程 stdio + Content-Length JSON-RPC，会话按 server 名缓存。

## Computer Use（Ubuntu 背景输入）

### 两种路径

| | 内置 `desktop_*` | MCP **`cua-driver`**（推荐） / `codex-computer-use-linux` |
|--|------------------|--------------------------------|
| 输入 | ydotool 虚拟键鼠 | uinput 绝对指针 + portal remote desktop |
| 截图 | grim / scrot / gnome-screenshot | XDG Desktop Portal / GNOME Shell |
| UI 树 | `desktop_get_ui_tree` 占位 | `mcp_cua_driver__get_window_state`（推荐） |
| 窗口 | wmctrl / hyprctl | `list_windows` / `bring_to_front` |
| 滚动 | `desktop_scroll`（按键回退） | `mcp_cua_driver__scroll` / `zoom` |

### cua-driver MCP（推荐）

```bash
bash scripts/setup-cua-driver.sh --install-mcp
cua-driver doctor
```

工具前缀：`mcp_cua_driver__*`。设置 → Computer Use →「启用 cua-driver」可一键写入 MCP。

### 内置工具

| 工具 | 说明 |
|------|------|
| `desktop_doctor` | 诊断 ydotool、socket、截图 CLI、/dev/uinput、AT-SPI、MCP 配置 |
| `desktop_screenshot` | 全屏截图 → `.sharker/desktop/` |
| `desktop_list_windows` | wmctrl / hyprctl 列窗口 |
| `desktop_get_ui_tree` | AT-SPI 状态 + 指向 MCP |
| `desktop_click` | ydotool 虚拟指针点击（不占用物理鼠标） |
| `desktop_type` / `desktop_key` / `desktop_scroll` | 虚拟键盘 / 滚动 |

### MCP 完整版（Codex 对齐）

```bash
# 在 codex-desktop-linux 仓库根或 computer-use-linux 子目录
cargo build --release
# 二进制通常在 ../target/release/codex-computer-use-linux（workspace 根 target/）
```

`~/.sharker/mcp.json` 示例：

```json
{
  "servers": [
    {
      "name": "computer-use",
      "command": "/path/to/codex-desktop-linux-main/target/release/codex-computer-use-linux",
      "args": ["mcp"],
      "transport": "ndjson"
    }
  ]
}
```

CLI 自检：`codex-computer-use-linux doctor`。Sharker 每轮 query 前自动 `tools/list` 合并为 `mcp_computer_use__*`。

### Ubuntu 手动配置

完整安装指南见 [docs/computer-use-setup.md](../docs/computer-use-setup.md)。快速诊断：

```bash
bash scripts/setup-computer-use.sh
bash scripts/setup-computer-use.sh --install-gnome-extension
bash scripts/setup-browser-use.sh
bash scripts/install-kokoro-runtime.sh
```

1. **ydotool**：`sudo apt install ydotool`，启动 `ydotoold &`（或 user systemd 单元）
2. **uinput 权限**：用户加入 `input` 组；可选 udev 规则 `/etc/udev/rules.d/99-uinput.rules`：`KERNEL=="uinput", MODE="0660", GROUP="input"`
3. **socket**：Ubuntu 24.04+ 常用 `$XDG_RUNTIME_DIR/.ydotool_socket`（内置已自动探测）
4. **GNOME 辅助功能**（MCP AT-SPI）：运行 MCP `setup_accessibility` 或 `gsettings set org.gnome.desktop.a11y.applications screen-reader-enabled true`
5. **GNOME 窗口列表**（可选）：MCP `setup_window_targeting` 安装 Shell 扩展后重新登录
6. **内置截图 CLI**（可选）：`sudo apt install grim`（Wayland）或 `scrot`
- `apply_patch`、编辑快照、Office/视频 封装 → 见 [roadmap-harness.md](../docs/roadmap-harness.md)
