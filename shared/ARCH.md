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
| `types.ts` | 跨进程核心类型与默认设置 |
| `ipc.ts` | IPC channel 名称常量 |
| `workspace.ts` | 工作区列表、排序、设置归一化、全局工作区 |
| `workspace-tree.ts` | 工作区文件树节点（右侧面板 IPC） |
| `conversation.ts` | 对话模型、标题推导、侧栏排序 |
| `needs-tools.ts` | 寒暄是否跳过 tools；续跑短句保留 tools |
| `context-limit.ts` | 各模型 context 上限与格式化 |
| `context-compress.ts` | 85% 阈值自动压缩历史 |
| `token-estimate.ts` | 上下文 token 粗估 |
| `token-usage-store.ts` | 每日 Token 消耗（蓝点热力图数据） |
| `process-steps.ts` | 旧消息回退：过程时间线步骤 |
| `live-display.ts` | 直播头标签/合成「规划下一步」/思考正文（去尾部 CSS）/演示可绘判断，与 TurnFlow 共用 |
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
| `workbench-shortcuts.ts` | Codex 式工作台快捷键匹配 |
| `workbench-shortcuts.test.ts` | ⌘B / ⌘⌥B / ⌘J / ⌘N / ⌘, / ⌘K |
| `review-prompt.ts` | `/review` 只读审查提示词 |
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
| `git-branch-create.ts` | detached HEAD 上创建命名分支 |
| `git-branch-create.test.ts` | 拒绝非法名、临时仓库 checkout -b |
| `thread-search.ts` | 线程内查找（大小写不敏感） |
| `thread-search.test.ts` | 命中消息 id |
| `review-comment.ts` | 行内评论 → Agent 提示 |
| `review-comment.test.ts` | 评论锚定路径与行号 |
| `command-palette.ts` | ⌘K 命令面板目录（含查找） |
| `command-palette.test.ts` | 命令过滤 |
| `workspace-search.test.ts` | `@` 文件命中排序 |
| `process-phases.ts` | 过程阶段/步骤派生；读/列/改标题附目标末段；命令标题优先 `toolArgs` 且保留 shell 短选项/下划线；进度心跳与中止态不污染完成态详情；仅 kind=tool 且 done 的命令计入 totals（status 桥接/cancelled 不计） |
| `turn-segments.ts` | 流式 chunk → 有序 `TurnSegment[]` 状态机；`tool_start` 保留 `toolArgs`；`finalizeSegments` 将未完成工具标为 `cancelled`；`hasProcessFlow` 完成后不计 `present_inline_demo` / 空过程 |
| `turn-segments.test.ts` | turn-segments / phases 单测 |
| `live-process.test.ts` | 直播过程 seed / 审批等待 / 工具状态回写 / 工具间隙规划 单测 |
| `approval-session.ts` | 审批 once/session/deny 纯逻辑与会话授权表 |
| `approval-session.test.ts` | 审批决策与会话授权单测 |
| `session-runtime.ts` | 多会话队列归属、Stop/done 门闩、commit 目标解析（纯逻辑） |
| `session-runtime.test.ts` | 队列隔离 / Stop-while-queued / persist 目标单测 |
| `turn-meta.ts` | 工具活动 label；写盘工具相对路径（本轮审查） |
| `line-diff.ts` | 行级 diff、`buildFileDiff`、解析 unified diff |
| `patch.ts` | apply_patch 格式解析与应用 |
| `notebook.ts` | Jupyter .ipynb 读写辅助 |
| `provider-catalog.ts` | 内置接入预设（DeepSeek / xAI / OpenAI / Kimi / 智谱 / OpenCode Go）、主力型号展示名 `MODEL_LABELS` |
| `provider-validate.ts` | 当前 API 配置校验 |
| `provider-vision.ts` | 模型是否支持视觉（截图回灌） |
| `thinking-levels.ts` | 各厂商思考/推理水平与请求字段映射 |
| `oauth-gpt.ts` | ChatGPT 订阅凭据导入 |
| `oauth-xai.ts` | xAI SuperGrok 设备码 OAuth |
| `computer-use-status.ts` | Computer Use 环境检查聚合 |
| `browser-use-status.ts` | Browser Use 环境检查聚合 |
| `voice-status.ts` | Voice / Kokoro 状态 |
| `automation.ts` | 自动化任务类型 |
| `mcp-catalog-data.ts` | MCP 插件目录纯数据（渲染可 import） |
| `plugin-catalog.ts` | 汇总 MCP 目录导出与安装模板 |
| `slash-commands.ts` | 斜杠命令目录（菜单与 /help） |
| `slash-commands.test.ts` | 斜杠目录含审查命令与过滤 |
| `ARCH.md` | 本层架构说明 |

## 设计原则

- 新增跨进程契约 **先改 `types.ts`**
- 用户图片附件只存稳定路径与元数据，不把大图 base64 放进会话 JSON
- 算法类放 shared，避免 renderer 引入 electron
- `process-phases.ts` 只做展示归组，不写入 IPC/消息类型/持久化

## 扩展点

- 新 `StreamChunk`：`types.ts` + `App.tsx` + UI
- 新 IPC：`ipc.ts` + preload + main
