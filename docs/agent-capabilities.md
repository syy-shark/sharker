# Sharker Agent 能力全景

模型负责「想」，Harness 负责「能稳定做完」。工具不多，但覆盖桌面开发的主路径。

## 调用方式（Turn 管线）

```
handlePromptSubmit（接待：排队 / 插队 / 直接派发）
  → executeUserInput（主进程调度）
  → queryServe（占坑 turn_start）
  → processUserInput（斜杠命令 or 进入模型）
  → onQuery：MCP 动态池刷新 + @file 展开 + 压缩上下文 + system + 工作区快照 + Skills + 历史
  → queryLoop：
      模型流式回复
      → 若有 tool_calls：审批 → 执行（只读可并行）→ 结果塞回 messages → 再调模型（最多 25 轮）
      → 若本轮改过代码：自动 npm run test/build（一次）
      → 纯文本则结束
  → UI 展示思考 / 工具时间线
```

权限：`sandbox` 仅限工作区；`full` 可访问整机。网络：`open` / `local_only` / `disabled`。高危操作弹窗确认。

### 斜杠命令（不走模型）

| 命令 | 作用 |
|------|------|
| `/help` | 显示能力与命令列表 |
| `/clear` | 清空当前对话 |

### @file 引用

在消息中写 `@src/App.tsx` 或 `@/绝对路径`（sandbox 内），Harness 自动读取并注入文件内容。

### 排队与插队

- Agent 忙时 **Enter** 默认将消息**排队**（UI 显示「排队中」，可取消）
- 当前 turn 结束后**自动按序**执行下一条
- **插队**：中止当前任务，将新消息置队首并立即执行

---

## 一、已有工具（现在就能用）

### 看 · 搜

| 工具 | 能做什么 |
|------|----------|
| `list_dir` | 列目录（可指定深度） |
| `glob_file_search` | 按文件名模式找文件 |
| `grep` | 在目录下搜文本（结果截断 200 行） |
| `read_file` | 读文件（支持 offset/limit） |

### 改 · 整理文件

| 工具 | 能做什么 |
|------|----------|
| `write_file` | 新建或整文件覆盖 |
| `search_replace` | 精确替换片段（改 bug 首选） |
| `apply_patch` | 多 hunk patch |
| `delete_path` | 删文件/目录（递归删需确认；删后 Harness 自动验证路径是否消失） |
| `move_path` | 移动/重命名 |
| `create_directory` | 建目录 |

### 卸载 · 系统应用

| 工具 | 能做什么 |
|------|----------|
| `uninstall_application` | 完整卸载：停进程、pkexec 卸 apt 包、清用户数据、删快捷方式、验证（需审批） |
| `verify_removal` | 检查目录/apt 包/进程/快捷方式是否仍有残留；Harness 在误用 rm 卸载后会自动调用 |

### 跑 · 命令

| 工具 | 能做什么 |
|------|----------|
| `run_terminal_cmd` | bash 执行命令（`rm` 后自动验证路径；cwd 锁在工作区） |

### Git / Skills / Tasks / Sub-agents

见 `tools/README.md` 完整列表。

### Web

| 工具 | 说明 |
|------|------|
| `web_fetch` | HTTP 抓取 + 粗略 HTML→文本 |
| `web_search` | DuckDuckGo Instant Answer |
| `open_url` | 在用户的系统浏览器 / Chrome 中可见地打开 URL |

### Browser（Playwright 可选）

| 工具 | 说明 |
|------|------|
| `browser_navigate` / `browser_snapshot` | 无头 Chromium 打开/快照 |
| `browser_click` / `browser_type` | 页面交互（需审批） |
| `browser_screenshot` / `browser_close` | 截图 / 关闭会话 |

用户说「打开网站」「用 Chrome 打开」时应使用 `open_url`；`browser_*` 只用于无头网页检查与自动化。`browser_*` 需 `npm install playwright && npx playwright install chromium`，或使用 MCP `@playwright/mcp`。

**Codex 扩展路径**（已登录 Chrome 配置）：`codex-chrome-extension-host` + native messaging — `bash scripts/setup-browser-use.sh`。设置 UI：**设置 → Browser Use**。

### MCP

| 能力 | 说明 |
|------|------|
| **动态 Tool 池** | `~/.sharker/mcp.json` 中 Server 的 tools/list 自动并入模型，命名 `mcp_<server>__<tool>` |
| `mcp_list_tools` / `mcp_call_tool` | 手动列出/调用（兼容旧流程） |
| 设置 UI | 设置 → MCP Tab 编辑 JSON、测试连接 |
| Computer Use 设置 UI | **设置 → Computer Use** / **Browser Use** / **Voice** |

配置：工作区 `.sharker/mcp.json` 优先于 `~/.sharker/mcp.json`。示例见 `tools/mcp.example.json`。Codex `codex-computer-use-linux` 需 `"transport": "ndjson"`。

### Computer Use（桌面）

两种路径：

| 路径 | 工具 | 能力 |
|------|------|------|
| **(A) 内置** | `desktop_*` | ydotool 虚拟点击/打字/按键/滚动（按键回退）、本地 CLI 截图、wmctrl 列窗口 |
| **(B) MCP** | `mcp_computer_use__*` | Codex `codex-computer-use-linux`：AT-SPI 树、portal 截图、绝对坐标指针、窗口聚焦、scroll/drag |

| 工具 | 说明 |
|------|------|
| `desktop_doctor` | 检查 ydotool、socket、截图、uinput、AT-SPI、MCP 配置 |
| `desktop_screenshot` | 全屏截图 → `.sharker/desktop/`（无 CLI 时提示走 MCP） |
| `desktop_list_windows` | wmctrl / hyprctl 列窗口 |
| `desktop_get_ui_tree` | AT-SPI 占位；指向 MCP `get_app_state` |
| `desktop_click` / `desktop_type` / `desktop_key` / `desktop_scroll` | ydotool 虚拟输入（需审批） |

**完整 Codex 级**：编译 `codex-computer-use-linux` 写入 `~/.sharker/mcp.json`（见 `tools/mcp.example.json`）。MCP 工具名形如 `mcp_computer_use__doctor`、`mcp_computer_use__get_app_state`。

#### 视觉截图回灌

截图类工具（`mcp_computer_use__screenshot`、`get_app_state`、`desktop_screenshot`）执行后，若当前模型**支持视觉**（设置 → 模型 →「视觉」开启或自动识别 gpt-4o 等），Harness 将 PNG 作为多模态 `user` 消息回灌，模型可「看到」屏幕再决定 `click(x,y)` 坐标。

#### 微信 / 无 AT-SPI 应用（Linux 实测）

国产 Linux 微信（`/opt/wechat`，RadiumWMPF/XWeb 内核）**主界面 AT-SPI 树为空**，无法靠 `get_app_state` 树导航。推荐流程：

1. 若微信在托盘未映射窗口：先 `/usr/bin/wechat` 或手动点开，再 `mcp_computer_use__activate_window`（title 含「微信」）
2. `mcp_computer_use__screenshot` → **视觉模型看图**
3. `mcp_computer_use__click` 点搜索框 → `type_text` 群名「先赚1M」→ Enter
4. 点聊天输入框 → `type_text` 消息 → Enter → 再截图核对
5. 点击/打字需用户在审批弹窗点「允许」

**模型建议**：微信/桌面任务请用支持**原生工具调用 + 视觉**的模型（gpt-4o、Claude 3+、Gemini 等）。轻量纯文本模型（如 step-*-flash）易在正文输出 `<tool_call>` XML 而卡住；Harness 会尝试解析 XML，但视觉与多步稳定性仍依赖强模型。

**文本工具解析**：不支持 function calling 的模型若在正文输出 `<tool_call><function=...>`，Harness 会解析并执行（含无参 MCP 工具如 `get_app_state`）。

### Voice（TTS MVP）

| 工具 | 说明 |
|------|------|
| `voice_read_aloud` | spd-say / espeak-ng 朗读 |
| `voice_stop` | 停止朗读 |

完整 Kokoro TTS：配置 `codex-read-aloud-linux` MCP（Codex read-aloud-linux 特性）。

设置 UI：**设置 → Voice**；安装见 `docs/computer-use-setup.md`、`bash scripts/install-kokoro-runtime.sh`。

---

## 二、Harness 已启用的策略

| 策略 | 作用 |
|------|------|
| MCP 动态池 | 每轮 query 前 tools/list 合并进 tool definitions |
| @file 注入 | 用户 @path 自动附文件内容 |
| 并行只读 | 同轮多个只读 tool_calls 用 Promise.all |
| 视觉截图回灌 | 截图工具后向视觉模型注入 PNG（需 Provider 开启视觉） |
| 文本 XML 工具解析 | 弱模型输出的 `<tool_call>` / `<function=name>` 自动转 tool_calls |
| 工作区快照 | 干活前注入 README、package.json、顶层目录 |
| 网络模式 | open / local_only / disabled |
| 上下文压缩 | 用量超 85% 自动摘要 |
| 自动验证 | 改代码后自动 test/build/lint |
| Plan/Build | enter_plan_mode → Build 按钮 → 全工具 |

---

## 三、与 Codex Desktop 对照（Gap Matrix）

| Codex 功能 | Sharker 状态 | 说明 |
|------------|--------------|------|
| Coding 看搜改跑 | **done** | read/write/grep/terminal/git/verify |
| Plan 模式 | **done** | enter_plan_mode + PlanBuildBar |
| @file 引用 | **done** | `@path` 注入 |
| 并行只读工具 | **done** | query-loop Promise.all |
| MCP stdio 客户端 | **done** | mcp-client.ts |
| MCP 动态 Tool 池 | **done** | mcp-tool-pool.ts |
| MCP 设置 UI | **done** | 设置 → MCP |
| Computer Use 设置 UI | **done** | 设置 → Computer Use（环境检查 + MCP 状态） |
| Browser Use 插件 | **partial** | builtin browser_* + MCP @playwright/mcp；无 Chrome 扩展 + node_repl |
| Computer Use Windows | **partial** | Cua Driver MCP（UIA 后台）；设置 → Computer Use 安装检测 |
| Computer Use Linux | **partial** | Cua Driver MCP + ydotool `desktop_*` 回退 |
| 视觉截图回灌 | **done** | agent/vision-feedback.ts + Provider vision 开关 |
| AT-SPI 窗口树 | **partial** | `desktop_get_ui_tree` 占位 + MCP `get_app_state` |
| Agent Workspace 隔离 | **partial** | networkMode MVP；无 GPUI viewer / 独立 profile VM |
| Voice STT/TTS | **partial** | voice_* 本地 TTS；无 conversation-mode STT 循环 |
| Read Aloud MCP | **deferred** | 配置模板在 mcp.example.json；需编译 read-aloud-linux |
| Chrome 扩展 + native host | **deferred** | 需 codex-chrome-extension-host + 上游插件 |
| Remote Control / Mobile | **deferred** | 需 Secure Enclave 替代 + app-server 守护 |
| 编辑快照/撤销 | **missing** | 路线图 |
| `.sharker/AGENTS.md` | **missing** | 路线图 |

**Sharker 优势**：Harness 源码可控、自定义 API、git worktree、sub-agents、plan 模式、本地 Skills。

---

## 四、外部依赖（用户安装）

| 用途 | 包/二进制 |
|------|-----------|
| **Windows 桌面自动化（推荐）** | [Cua Driver](https://github.com/trycua/cua) — `irm …/cua-driver/scripts/install.ps1 \| iex` |
| Linux 桌面虚拟输入（回退） | `ydotool` + `ydotoold` |
| 截图（Linux 回退） | `grim` / `scrot` / `gnome-screenshot` |
| 窗口列表（Linux 回退） | `wmctrl` 或 Hyprland `hyprctl` |
| Codex Computer Use（备选） | 自编译 `codex-computer-use-linux`（Rust） |
| 浏览器自动化 | `npm install playwright` + `npx playwright install chromium`，或 MCP `@playwright/mcp` |
| TTS（本地） | `speech-dispatcher` / `espeak-ng` |
| TTS（高质量） | `codex-read-aloud-linux` + Kokoro 模型 |
| MCP filesystem 示例 | `npx @modelcontextprotocol/server-filesystem` |

---

## 五、你怎么用才最顺

1. **工作区选对**：写代码指到仓库根；整理桌面指到桌面或子文件夹。
2. **权限**：默认 sandbox + open 网络；敏感环境可 Closed 网络。
3. **MCP**：设置 → MCP 粘贴 `tools/mcp.example.json`，改 computer-use 路径，点测试连接。
4. **Computer Use**：设置 → Computer Use 查看环境与模型建议；微信任务需视觉模型 + MCP computer-use。
5. **说清楚目标**：「修 X 文件的 Y bug」比「看看」更省轮次。
6. **卸载软件**：说「删掉 Steam / 卸载 XX」时 Harness 会注入提示并优先走 `uninstall_application`；误用 `rm -rf` 时会自动跑 `verify_removal`，且删除后工具输出会标注 STILL EXISTS。
7. **提交/推送**：口头说清楚，否则会拦。
