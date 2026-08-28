# shared — 主进程与前端共用

## 职责

- **类型与契约**：`AppSettings`、`ChatMessage`、`StreamChunk`、IPC 常量等
- **纯逻辑**：上下文估算/压缩、过程阶段派生、diff、工作区归一化等（两侧可 import）
- **不管**：Electron IPC 注册（`electron/`）、React 组件（`src/`）、工具执行（`tools/`）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `types.ts` | 跨进程核心类型与默认设置（含 `worktreeKeepCount`、`uiFontScale`、`keyboardShortcuts`、`followUpBehavior` / `requireModEnter`、`turnNotifyMode` / `preventSleepWhileRunning` / `popoutAlwaysOnTop`、记忆注入/写入开关） |
| `ipc.ts` | IPC channel 名称常量（含永久 worktree / 归档清理 / MCP 状态 / AGENTS.md 初始化 / 记忆列表 / worktree 探活 / `/approve` 重试 / 对话元数据补丁 / 清未读 / 后台回合通知与 Dock 徽标 / 弹出窗 Always on top / `sharker://` 深链与应用菜单） |
| `workspace.ts` | 工作区列表、排序、设置归一化（含 `followUpBehavior` / `requireModEnter` / `turnNotifyMode` / 防休眠 / 弹出置顶）、全局工作区、⌘⌥⇧O 项目选择器过滤 |
| `workspace-tree.ts` | 工作区文件树节点（右侧面板 IPC） |
| `conversation.ts` | 对话模型、标题推导、侧栏排序（置顶优先）、⌘G Search chats 扩匹配（标题 / 正文摘要 / git 分支）、对话路径、进行中任务拆分、⌘⌥A 下一条进行中、侧栏 Chronological / 进行中 / 未读 / 置顶筛选、`/fork` 分叉标题与拷贝、`/rename` `/pin` 未读 |
| `conversation.test.ts` | 按标题 / 自定义标题 / id / 正文 / 分支过滤、进行中拆分、分叉标题、置顶排序、`/rename` |
| `workspace.test.ts` | 项目选择器按显示名 / 路径 / id 过滤 |
| `worktree-include.ts` | `.worktreeinclude` 解析 / 匹配、worktree 起点校验 |
| `worktree-include.test.ts` | 模式解析、glob、拒绝非法 baseRef |
| `needs-tools.ts` | 寒暄是否跳过 tools；续跑短句保留 tools |
| `context-limit.ts` | 各模型 context 上限与格式化 |
| `context-compress.ts` | 85% 阈值自动压缩历史 |
| `token-estimate.ts` | 上下文 token 粗估 |
| `token-usage-store.ts` | 每日 Token 消耗（蓝点热力图数据） |
| `token-usage-format.ts` | `/usage daily|weekly|cumulative` 文案（渲染进程可 import） |
| `token-usage-format.test.ts` | 用量窗口与汇总 |
| `process-steps.ts` | 旧消息回退：过程时间线步骤（含子 Agent 点开 id） |
| `live-display.ts` | 直播头标签/合成「规划下一步」/思考正文（去尾部 CSS）/演示可绘判断，与 TurnFlow 共用；`isNearLiveMessageRow` 标贴底窗口（不用 nth-last-child） |
| `streaming-markdown.ts` | 流式 Markdown 拆成稳定块 + 尾部，避免每 token 重解析全文 |
| `streaming-markdown.test.ts` | 流式拆分：段落收束、未闭合围栏、稳定 id |
| `git-change-diff.ts` | 工作区新旧文本 → 审查用 FileDiff |
| `git-change-diff.test.ts` | 新增 / 删除 / 修改三种 git 变更 diff |
| `git-status.ts` | porcelain 行解析：暂存 / 未暂存 / 未跟踪 |
| `git-status.test.ts` | porcelain XY / 重命名 / 未跟踪 |
| `git-review-actions.ts` | 审查动作：暂存、取消暂存、还原（路径锁工作区） |
| `git-review-actions.test.ts` | 临时仓库验证 stage / unstage / revert |
| `at-mention.ts` | Composer `@` 查询解析与插入 |
| `at-mention.test.ts` | `@` 边界与路径插入 |
| `chat-mention.ts` | Composer `@chat/<id>`：过滤其它线程、有界摘要 |
| `chat-mention.test.ts` | 解析 id、排除当前线程、截断摘要 |
| `workbench-shortcuts.ts` | 默认工作台快捷键与 `SHORTCUT_CATALOG`（设置页改绑；含 ⌘⌥⇧O 项目选择器、⌘⌥⇧C 对话路径、⌘Z / ⌘⇧Z 应用撤销、⌃⇧G 打开审查、⌃Tab / ⌃⇧Tab 切对话；终端聚焦 ⌘K 清屏判定） |
| `workbench-shortcuts.test.ts` | 默认和弦，含 ⌘⌥1–6 / ⌘⌥← / ⌘⌥⇧O / ⌘⌥⇧C / ⌘Z / ⌃⇧G（⌘⇧G 不打开审查）、⌃Tab / ⌃⇧Tab |
| `app-undo.ts` | 应用操作撤销栈（归档 / 置顶 / 重命名 / 未读）；输入框 / 浏览器 / 终端不拦截 |
| `app-undo.test.ts` | 撤销/重做栈与上限 |
| `keymap.ts` | 用户覆盖：编码和弦、先覆盖后默认、空串解绑 |
| `keymap.test.ts` | 改绑后默认失效 |
| `debug-config.ts` | `/debug-config` 本机设置摘要（不含 Key） |
| `debug-config.test.ts` | 密钥打码 |
| `ui-font-scale.ts` | 界面字号档位：0.85–1.35、0.05 步进 |
| `ui-font-scale.test.ts` | 夹取、步进、百分数 |
| `nav-history.ts` | 工作台前进 / 后退栈（最多 40 落点）；鼠标侧键 3/4 |
| `nav-history.test.ts` | 前进栈丢弃、往返 |
| `review-prompt.ts` | `/review` 未提交 / 基线提示词 |
| `diff-hunk.ts` | FileDiff 拆 hunk + unified patch |
| `diff-hunk.test.ts` | 远距变更拆成两块、patch 头 |
| `git-hunk-actions.ts` | hunk 级 `git apply` 暂存 / 还原 |
| `git-hunk-actions.test.ts` | 只暂存第一个 hunk |
| `git-commit.ts` | 审查面板提交已暂存 / 推送当前分支 |
| `git-commit.test.ts` | 只提交暂存、拒绝空说明、无远程推送失败 |
| `git-compare.ts` | 相对基线分支的 name-status + 本轮路径匹配 |
| `git-compare.test.ts` | 重命名解析、本轮命中、feature 相对 main |
| `git-pr.ts` | `gh pr create` 标题校验与 URL 解析 |
| `git-pr.test.ts` | 拒绝 flag 标题、解析 URL、缺 gh 报错 |
| `git-pr-context.ts` | 当前分支 PR + GitHub 行内评论（`gh pr view` / `gh api`）；顶栏芯片文案 |
| `git-pr-context.test.ts` | 解析 PR JSON、LEFT→old、缺 gh |
| `git-pr-review.ts` | 本地行内评论写回 GitHub PR |
| `git-pr-review.test.ts` | 跳过 gh- 导入评论、拼 api 参数 |
| `thread-window.ts` | 弹出线程窗 `#thread/<ws>/<id>` |
| `thread-window.test.ts` | hash 往返 |
| `subagent.ts` | 子 Agent 快照过滤 / 排序 / 主线程解析 id / 落盘中断（不进侧栏） |
| `subagent.test.ts` | 按父线程过滤、进行中优先、解析 spawn id、重启中断 |
| `git-branch-create.ts` | detached HEAD 上创建命名分支 |
| `git-branch-create.test.ts` | 拒绝非法名、临时仓库 checkout -b |
| `git-handoff.ts` | 本地 ↔ worktree 交接：快进/合并 HEAD 并拷脏文件 |
| `git-handoff.test.ts` | 脏文件拷到干净本地、拒绝脏目标 |
| `thread-search.ts` | 线程内查找（大小写不敏感） |
| `thread-search.test.ts` | 命中消息 id |
| `review-comment.ts` | 行内评论 → Agent 提示；解析 `/review` 的 `review-findings` 围栏 |
| `review-comment.test.ts` | 评论锚定路径与行号、围栏/标题解析 |
| `skill-mention.ts` | Composer `$` Skill 引用解析与插入 |
| `skill-mention.test.ts` | `$token` 边界与过滤 |
| `command-palette.ts` | ⌘K 命令面板目录（含查找、搜索对话、听写、语音、弹出窗、分叉、旁路、归档、重命名、置顶、未读、独立新对话、无项目 `/task`、选择模型、项目选择器、用量、复制工作目录 / 会话 ID / 对话路径 / 对话深链、撤销/重做应用操作、初始化 AGENTS.md、权限、记忆、状态、目标、打开 worktree、前进后退、字号、清终端） |
| `command-palette.test.ts` | 命令过滤 |
| `workspace-search.test.ts` | `@` 文件命中排序 |
| `process-phases.ts` | 过程阶段/步骤派生；读/列/改标题附目标末段；命令标题优先 `toolArgs` 且保留 shell 短选项/下划线；进度心跳与中止态不污染完成态详情；仅 kind=tool 且 done 的命令计入 totals（status 桥接/cancelled 不计）；直播派生从后往前扫、不拷数组 |
| `turn-segments.ts` | 流式 chunk → 有序 `TurnSegment[]` 状态机；token/think 只换改过的段（已完成工具保持引用）；其它事件浅拷贝片段（不复制 diff 行）；`extractFinalContent` / `findLastSegment` / 直播摘要从后往前扫、不拷数组；`tool_start` 保留 `toolArgs`；`finalizeSegments` 将未完成工具标为 `cancelled`；`hasProcessFlow` 完成后不计 `present_inline_demo` / 空过程 |
| `turn-segments.test.ts` | turn-segments / phases / token 不改旧对象 单测 |
| `thread-goal.ts` | `/goal` 解析、暂停/清除、system 注入块、进度行状态字 |
| `thread-goal.test.ts` | 设定 / 暂停 / 芯片文案 |
| `thread-status.ts` | `/status` Markdown 快照（对话 ID / 模型 / 权限 / 上下文） |
| `thread-status.test.ts` | 本地隐藏 worktree、隔离显示路径 |
| `worktree-prune.ts` | 托管 worktree 保留最近 15 个、受保护不删、永久名称清洗 |
| `worktree-prune.test.ts` | 保留最新、保护路径、目录名 |
| `live-process.test.ts` | 直播过程 seed / 审批等待 / 工具状态回写 / 工具间隙规划 单测 |
| `approval-session.ts` | 审批 once/session/deny 纯逻辑与会话授权表；拒绝记录 + `/approve` 一次性放行 |
| `approval-session.test.ts` | 审批决策、会话授权、`/approve` 一次重试 |
| `session-runtime.ts` | 多会话队列归属、Stop/done 门闩、commit 目标解析（纯逻辑）；held 时不自动出队；排队可编辑 / 重排 / 取出立刻发送 |
| `composer-submit.ts` | Composer Enter/Tab：空闲发送；忙时按 `followUpBehavior` 默认排队（对标 Codex 桌面）；⌘⇧Enter 反转单条；`requireModEnter` 时 ⌘Enter 才发送；Tab 仍排队；空输入 ↑ 恢复上一条；Ctrl+R 提示历史；空输入 Esc+Esc 就地回编上一条并分叉 |
| `composer-submit.test.ts` | Enter/Tab 与菜单/换行、默认排队、⌘⇧Enter 反转、⌘Enter 发送、恢复上一条、空输入 Esc+Esc 回编 |
| `composer-paste.ts` | 粘贴决策：text/plain（及 HTML 剥标签）优先于图片；超长收成 `Pasted text.txt`；空输入 / 空参斜杠折进正文 |
| `composer-paste.test.ts` | Word 双层剪贴板走文本、`/goal` 吃粘贴附件 |
| `turn-notify.ts` | 后台回合：系统通知档 never/background/always、未读、Dock 徽标、改文件数正文与芯片文案 |
| `turn-notify.test.ts` | 失焦通知、never/always、同会话不标未读、徽标计数、改文件文案 |
| `deeplink.ts` | `sharker://` 解析：新对话 / 打开线程 / 设置（含 notifications→外观） / Skills / 自动化（打开创建流）；不解析 plugins、pets、SSH |
| `deeplink.test.ts` | `new?` 必须带参、路径与 git remote 匹配、notifications 进外观、不支持的 host 为 noop |
| `composer-dictation.ts` | 听写快捷键（Ctrl+Shift+D）与转写拼接 |
| `composer-dictation.test.ts` | 不认 ⌘⇧D；空串/标点拼接 |
| `session-runtime.test.ts` | 队列隔离 / 编辑重排取出 / Stop-while-queued / persist 目标单测 |
| `turn-meta.ts` | 工具活动 label（含子 Agent prompt / id）；写盘工具相对路径（本轮审查） |
| `line-diff.ts` | 行级 diff、`buildFileDiff`、解析 unified diff |
| `patch.ts` | apply_patch 格式解析与应用 |
| `notebook.ts` | Jupyter .ipynb 读写辅助 |
| `provider-catalog.ts` | 内置接入预设（DeepSeek / xAI / OpenAI / Kimi / 智谱 / OpenCode Go）、主力型号展示名 `MODEL_LABELS` |
| `provider-validate.ts` | 当前 API 配置校验 |
| `provider-vision.ts` | 模型是否支持视觉（截图回灌） |
| `thinking-levels.ts` | 各厂商思考/推理水平与请求字段映射；`stepThinkingLevel` 供 ⌥, / ⌥.；`/reasoning` 解析与状态文案 |
| `oauth-gpt.ts` | ChatGPT 订阅凭据导入 |
| `oauth-xai.ts` | xAI SuperGrok 设备码 OAuth |
| `computer-use-status.ts` | Computer Use 环境检查聚合 |
| `browser-use-status.ts` | Browser Use 环境检查聚合 |
| `voice-status.ts` | Voice / Kokoro 状态 |
| `automation.ts` | 自动化任务类型 |
| `automation-queue.ts` | 自动化审查队列（Triage）；条目带工作区与改过的路径，接受/拒绝只动这些文件；接受成功后推送，无 PR 时再创建；`markAllQueueRead` 供 ⇧Esc |
| `automation-queue.test.ts` | 入队、未读计数、排序、路径回写、提交后推送 |
| `mcp-catalog-data.ts` | MCP 插件目录纯数据（渲染可 import） |
| `plugin-catalog.ts` | 汇总 MCP 目录导出与安装模板 |
| `slash-commands.ts` | 斜杠命令目录（菜单与 /help，含 /fork、/side、/project、/task、/model、/archive、/rename、/pin、/unread、/usage、/init、/permissions、/memories、/copy、/fast、/reasoning、/skills、/stop、/status、/diff、/goal、/plan-mode、/mcp、/feedback、/local、/worktree、/approve、/subagents）；`slashItemsWithSkills` 把已安装 Skill 并进 `/` 列表 |
| `bang-command.ts` | Composer 行首 `!` 直接执行 shell |
| `bang-command.test.ts` | 空 bang / 普通文本 |
| `fast-mode.ts` | `/fast` 解析与思考档位选择 |
| `fast-mode.test.ts` | on/off、off/low 优先 |
| `copy-output.ts` | `/copy` 取最近一条助手正文 |
| `copy-output.test.ts` | 跳过空助手行 |
| `skills-status.ts` | `/skills` 已安装列表 |
| `skills-status.test.ts` | 过滤 |
| `agents-md.ts` | AGENTS.md 发现优先级、根到 cwd 目录链、32KiB 合并与 `/init` 脚手架 |
| `agents-md.test.ts` | override 优先、目录链、截断 |
| `memory-command.ts` | `/memories` 开关解析与条目文案 |
| `memory-command.test.ts` | on/off、inject、空列表 |
| `mcp-status.ts` | `/mcp` 已配置 Server 文案 |
| `mcp-status.test.ts` | 空配置与 verbose 工具列表 |
| `feedback-bundle.ts` | `/feedback` 本地诊断包 |
| `feedback-bundle.test.ts` | 含状态且声明不外发 |
| `slash-commands.test.ts` | 斜杠目录含审查命令与过滤 |
| `personality.ts` | 务实 / 共情 / 关闭人格与 system 语气段 |
| `personality.test.ts` | 别名解析、循环、提示词 |
| `review-prompt.test.ts` | `/review branch` 解析 |
| `ARCH.md` | 本层架构说明 |

## 设计原则

- 新增跨进程契约 **先改 `types.ts`**
- 用户图片 / 超长粘贴文本附件只存稳定路径与元数据；粘贴文本可带 `text` 供预览回插，不把大图 base64 放进会话 JSON
- 算法类放 shared，避免 renderer 引入 electron
- `process-phases.ts` 只做展示归组，不写入 IPC/消息类型/持久化

## 扩展点

- 新 `StreamChunk`：`types.ts` + `App.tsx` + UI
- 新 IPC：`ipc.ts` + preload + main
