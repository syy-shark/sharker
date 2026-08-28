# Sharker Agent 能力全景

模型负责「想」，Harness 负责「能稳定做完」。工具不多，但覆盖桌面开发的主路径。

## 调用方式（Turn 管线）

```
handlePromptSubmit（接待：排队 / 插队 / 直接派发）
  → executeUserInput（主进程调度）
  → queryServe（占坑 turn_start）
  → processUserInput（斜杠命令 or 进入模型）
  → onQuery：@file 展开 + 压缩上下文 + system + 工作区快照 + 历史
  → queryLoop：
      模型流式回复
      → 若有 tool_calls：审批 → 执行（只读可并行）→ 结果塞回 messages → 再调模型（默认最多 40 轮）
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
| `/changes` | 打开右侧变更审查 |
| `/review` | 打开审查并派发只读评审；`/review branch` 相对基线 |
| `/personality` | 切换务实 / 共情 / 关闭（无参数则循环） |
| `/mention` | 打开 `@` 文件选择器 |
| `/skill` | 打开 `$` Skill 选择器 |
| `/files` `/terminal` `/browser` | 打开右侧对应面板 |

### @file 引用

输入 `@` 弹出工作区文件模糊搜索（↑↓/Enter/Tab）；也可手写 `@src/App.tsx` 或 `@/绝对路径`（sandbox 内）。Harness 自动读取并注入文件内容。

输入 `$` 弹出已安装 Skill（对标 Codex `$skill-name`）；选中后写入 `$name`，Harness 按名称匹配并注入该 Skill。`/skill` 与命令面板「引用 Skill」打开同一选择器。

### 审查行内评论

在右侧审查 diff 行上点 `+` 留下意见，再点「发送评论」：会把锚定到文件:行号的意见派发给当前对话，Agent 按最小范围修改。

### 审查对比与提交

审查面板对标 Codex Review：

- **未提交**：未暂存 / 已暂存；文件与 hunk 可暂存、取消暂存、还原
- **本轮**：只看上一轮助手写过、仍在工作区的文件
- **分支**：相对 `origin/HEAD` → `main` → `master` 的已提交变更（只读，仍可留行内评论）
- 填写提交说明后 **提交** 已暂存变更，可选 **推送** 当前分支
- **创建 PR**：调用本机 `gh pr create`（基线与分支对比相同）；成功后可打开链接
- 隔离 worktree 若仍是 detached HEAD，可在审查面板 **创建分支**（对标 Codex Create branch here）

### 线程内查找

`⌘F` 或命令面板「在对话中查找」：在当前线程消息里定位（大小写不敏感），Enter / ↑↓ 跳转。不注册为全局工作台快捷键，避免抢走普通输入框的查找。

### 人格

设置 → 外观，或 `/personality [pragmatic|empathetic|none]`。只改回复语气，不改工具与权限。默认务实。

### 自动化审查队列

定时任务到期后**新建对话**后台跑，结果进入侧栏 **审查队列**（未读徽标）。可 **接受**（只暂存该任务改过的文件并打开审查，预填提交说明）、**修订**（打开线程继续改）、**拒绝**（只还原该任务改过的文件并归档）。没有记录到路径时不碰工作区其它脏文件。不打断当前线程。对标 Codex Triage。

`/review` 结束时会解析 `review-findings` 围栏，把发现挂到审查 diff 对应行上（与人手评论一起发送）。

### 命令面板

`⌘K` / `⌘⇧P` 打开命令面板，可搜新对话、审查、查找、终端、设置、引用文件 / Skill 等。`⌘⇧[` / `⌘⇧]` 在当前项目的对话之间循环切换（对标 Codex）。

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
| `uninstall_application` | 完整卸载：停进程、brew cask、.app、~/Library 用户数据、验证（需审批） |
| `verify_removal` | 检查目录/cask/进程/.app 是否仍有残留；Harness 在误用 rm 卸载后会自动调用 |

### 跑 · 命令

| 工具 | 能做什么 |
|------|----------|
| `run_terminal_cmd` | bash 执行命令（`rm` 后自动验证路径；cwd 锁在工作区） |

### Git / Tasks / Sub-agents

见 `tools/ARCH.md` 完整列表。

### Web

| 工具 | 说明 |
|------|------|
| `web_fetch` | HTTP 抓取 + 粗略 HTML→文本 |
| `web_search` | DuckDuckGo Instant Answer |
| `open_url` | 在用户的系统浏览器 / Chrome 中可见地打开 URL（用户明确要求打开网站时） |
| `present_inline_demo` | 把自包含 HTML/CSS/JS **嵌进对话**做演示；教学/可视化请用此工具，不要写文件再开浏览器 |

### 内联可视化规范（强制）

完整规范见 **[inline-demo-spec.md](./inline-demo-spec.md)**。摘要：

- 嵌在聊天里，禁止写 html + 开浏览器当「演示」
- **无**超大空白、文字不溢出卡片、多栏不重叠
- 步骤按钮必须可点且有效
- 假终端只包日志块（三色灯由宿主加）；日志连续无空槽
- 提交历史用紧凑列表，不要空高 graph

### Browser（Playwright 可选）

| 工具 | 说明 |
|------|------|
| `browser_navigate` / `browser_snapshot` | 无头 Chromium 打开/快照 |
| `browser_click` / `browser_type` | 页面交互（需审批） |
| `browser_screenshot` / `browser_close` | 截图 / 关闭会话 |

用户说「打开网站」「用 Chrome 打开」时应使用 `open_url`；`browser_*` 只用于无头网页检查与自动化。`browser_*` 需 `npm install playwright && npx playwright install chromium`。

可选 Chrome native host：`bash scripts/setup-browser-use.sh`。设置 UI：**设置 → Browser Use**。

### Computer Use（桌面 · macOS）

| 工具 | 说明 |
|------|------|
| `desktop_doctor` | 检查 screencapture、cliclick、可选 cua-driver |
| `desktop_screenshot` | 全屏截图 → `.sharker/desktop/` |
| `desktop_list_windows` | osascript System Events 列窗口 |
| `desktop_get_ui_tree` | 窗口列表 + 工作流指引 |
| `desktop_click` / `desktop_type` / `desktop_key` / `desktop_scroll` | cliclick / osascript（需审批） |

需授权 **辅助功能** 与 **屏幕录制**。可选：`bash scripts/setup-cua-driver.sh`、`brew install cliclick`。

#### 视觉截图回灌

`desktop_screenshot` 执行后，若当前模型**支持视觉**（设置 → 模型 →「视觉」开启或自动识别 gpt-4o 等），Harness 将 PNG 作为多模态 `user` 消息回灌，模型可「看到」屏幕再决定坐标点击。

#### 推荐流程

1. 确保应用窗口在前台
2. 截图 → **视觉模型看图**
3. 坐标 `desktop_click` → 输入 → 再截图核对
4. 点击/打字需用户在审批块点「允许一次」

**模型建议**：桌面任务请用支持**原生工具调用 + 视觉**的模型（gpt-4o、Claude 3+、Gemini 等）。

**文本工具解析**：不支持 function calling 的模型若在正文输出伪工具调用，Harness 会解析并执行，同时从可见回复里隐藏该参数块。

### Voice（TTS MVP）

| 工具 | 说明 |
|------|------|
| `voice_read_aloud` | macOS `say` 朗读 |
| `voice_stop` | 停止朗读 |

可选 Kokoro TTS：`bash scripts/install-kokoro-runtime.sh`。

设置 UI：**设置 → Voice**；安装见 `docs/computer-use-setup.md`。

---

## 二、Harness 已启用的策略

| 策略 | 作用 |
|------|------|
| @file 注入 | 用户 @path 自动附文件内容 |
| 并行只读 | 同轮多个只读 tool_calls 用 Promise.all |
| 视觉截图回灌 | 截图工具后向视觉模型注入 PNG（需 Provider 开启视觉） |
| 文本 XML 工具解析 | 弱模型输出的 `<tool_call>` / `<function=name>` 自动转 tool_calls |
| 工作区快照 | 干活前注入 README、package.json、顶层目录 |
| 网络模式 | open / local_only / disabled |
| 上下文压缩 | 用量超 85% 自动摘要 |
| 自动验证 | 改代码后自动 test/build/lint |
| Plan/Build | enter_plan_mode → Build 按钮 → 全工具 |
| 续跑提醒 | 对可执行任务，若模型停在启动服务器/打开/检查等中间话术但没有工具调用，会继续 nudging 直到完成或遇到真实阻塞 |

---

## 三、与 Codex Desktop 对照（Gap Matrix）

| Codex 功能 | Sharker 状态 | 说明 |
|------------|--------------|------|
| Coding 看搜改跑 | **done** | read/write/grep/terminal/git/verify |
| Plan 模式 | **done** | enter_plan_mode + PlanBuildBar |
| @file 引用 | **done** | `@path` 注入 |
| 并行只读工具 | **done** | query-loop Promise.all |
| Computer Use 设置 UI | **done** | 设置 → Computer Use（环境检查） |
| Browser Use | **partial** | builtin browser_*（Playwright）；可选 native host |
| Computer Use macOS | **partial** | screencapture/cliclick `desktop_*` |
| 视觉截图回灌 | **done** | agent/vision-feedback.ts + Provider vision 开关 |
| Accessibility 窗口树 | **partial** | `desktop_get_ui_tree` / `desktop_list_windows` |
| Agent Workspace 隔离 | **partial** | networkMode MVP |
| Voice STT/TTS | **partial** | voice_* 本地 say；无 conversation-mode STT 循环 |
| Read Aloud / Kokoro | **deferred** | 可选 install-kokoro-runtime.sh |
| Chrome 扩展 + native host | **deferred** | 可选 scripts/setup-browser-use.sh |
| Remote Control / Mobile | **deferred** | 需 Secure Enclave 替代 + app-server 守护 |
| 编辑快照/撤销 | **missing** | 路线图 |
| `.sharker/AGENTS.md` | **missing** | 路线图 |

**Sharker 优势**：Harness 源码可控、自定义 API、git worktree、sub-agents、plan 模式。

---

## 四、外部依赖（用户安装）

| 用途 | 包/二进制 |
|------|-----------|
| 截图 | macOS `screencapture` |
| 坐标输入（可选） | `brew install cliclick` |
| 浏览器自动化 | `npm install playwright` + `npx playwright install chromium` |
| TTS（本地） | macOS `say` |
| TTS（高质量） | Kokoro — `bash scripts/install-kokoro-runtime.sh` |

---

## 五、你怎么用才最顺

1. **工作区选对**：写代码指到仓库根；整理桌面指到桌面或子文件夹。
2. **权限**：默认 sandbox + open 网络；敏感环境可 Closed 网络。
3. **Computer Use**：设置 → Computer Use 查看环境；桌面任务需视觉模型。
4. **说清楚目标**：「修 X 文件的 Y bug」比「看看」更省轮次。
5. **卸载软件**：说「删掉 Steam / 卸载 XX」时 Harness 会注入提示并优先走 `uninstall_application`；误用 `rm -rf` 时会自动跑 `verify_removal`，且删除后工具输出会标注 STILL EXISTS。
6. **提交/推送**：口头说清楚，否则会拦。
