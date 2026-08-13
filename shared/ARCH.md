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
| `process-phases.ts` | 过程阶段/步骤派生；读/列/改标题附目标末段；命令标题优先 `toolArgs` 且保留 shell 短选项/下划线；进度心跳与中止态不污染完成态详情；仅 kind=tool 且 done 的命令计入 totals（status 桥接/cancelled 不计） |
| `turn-segments.ts` | 流式 chunk → 有序 `TurnSegment[]` 状态机；`tool_start` 保留 `toolArgs`；`finalizeSegments` 将未完成工具标为 `cancelled`；`hasProcessFlow` 完成后不计 `present_inline_demo` / 空过程 |
| `turn-segments.test.ts` | turn-segments / phases 单测 |
| `live-process.test.ts` | 直播过程 seed / 审批等待 / 工具状态回写 / 工具间隙规划 单测 |
| `approval-session.ts` | 审批 once/session/deny 纯逻辑与会话授权表 |
| `approval-session.test.ts` | 审批决策与会话授权单测 |
| `session-runtime.ts` | 多会话队列归属、Stop/done 门闩、commit 目标解析（纯逻辑） |
| `session-runtime.test.ts` | 队列隔离 / Stop-while-queued / persist 目标单测 |
| `turn-meta.ts` | 工具活动 label 格式化 |
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
| `ARCH.md` | 本层架构说明 |

## 设计原则

- 新增跨进程契约 **先改 `types.ts`**
- 用户图片附件只存稳定路径与元数据，不把大图 base64 放进会话 JSON
- 算法类放 shared，避免 renderer 引入 electron
- `process-phases.ts` 只做展示归组，不写入 IPC/消息类型/持久化

## 扩展点

- 新 `StreamChunk`：`types.ts` + `App.tsx` + UI
- 新 IPC：`ipc.ts` + preload + main
