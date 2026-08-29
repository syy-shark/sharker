# agent — Harness 核心

## 职责

- **Turn 管线**：用户消息进入后的占坑、命令解析、上下文组装、模型循环与工具执行
- System prompt 组装、改后自动验证、斜杠命令、@file、多模态附件、子 Agent 编排
- **不管**：具体工具实现（在 `tools/`）、模型 HTTP（在 `providers/`）、UI 渲染（在 `src/`）

## 同级目录

| 目录 | 说明 |
|------|------|
| [memory/](./memory/ARCH.md) | PGlite 长期记忆：会话、记忆 CRUD、检索与写入 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `pipeline.ts` | 用户输入入口与多会话 turn 队列；入槽后可 `chat:steer`；成功收束把未排空注入在 `done` 前写成 `steer_consumed`（对标 Codex leftover pending input at task finish），中止/失败或未采样（`!` 本地命令）才 `steer_restored`；新输入会清掉该会话 `cancelledBeforeStart`；可选 `worktreePath` 按会话覆盖工具 cwd；可选 `threadGoal` 注入 system；可选 `providerId` / `thinkingLevel` 只覆盖本轮（对标 Codex scheduled model）；`/plan` 空参不走模型，`harness_mode` 同步芯片；达阈值自动压缩前先发「正在自动压缩上下文…」status（对标 Codex Automatically compacting context），不把准备中卡到摘要结束 |
| `pending-steer-mailbox.ts` | 主进程当前回合注入信箱：`acceptTurnSteer` / 边界排空 / 出槽交还（成功收成用户气泡，中止还原排队） |
| `commands.ts` | 斜杠命令注册表（本地处理，不走模型；空 `/plan` 切换计划模式，带参开一轮规划） |
| `commands.test.ts` | `/plan-mode` 与 `/plan` 同义；空参切换按会话隔离 |
| `pipeline-plan.test.ts` | `processUserInput` 空 `/plan` 不查询、带参规划、Build 关芯片 |
| `pipeline-abort.test.ts` | 按会话 abort 归属单测 |
| `query-loop.ts` | 核心循环：流式问模型 ↔ 工具（只读可并行）↔ 审批（once/session/deny + 会话授权表 + 拒绝记录供 `/approve`）↔ verify；首轮采样后再排空 `chat:steer`（对标 Codex pending input，不中止直播）；工具批次后发「规划下一步」status 保直播连续性；把 provider `status`（含正在重新连接… n/5）原样推到直播行；计划阶段按 conversationId 过滤工具；`present_inline_demo` 与写入/补丁 `tool_status` 转 `tool_preview` |
| `loop.ts` | `buildSystemPrompt`（含人格语气、Git commit/PR 文案模板、AGENTS.md 链、本会话计划模式约束）、`generateTitle`；含内联演示规范摘要（全文见 `docs/inline-demo-spec.md`） |
| `agents-md.ts` | 加载全局 `~/.sharker` + 仓库根到 cwd 的 AGENTS.md；`/init` 写脚手架；设置页读写个人 `~/.sharker/AGENTS.md` |
| `agents-md.test.ts` | 全局 override、init 只写一次、个人说明不碰 override |
| `file-refs.ts` | 解析 `@path` 并注入文件内容（跳过 `@chat/`） |
| `chat-refs.ts` | 解析 `@chat/<id>` 并注入有界对话摘要 |
| `chat-refs.test.ts` | 跳过当前线程、未解析则原样返回 |
| `message-attachments.ts` | 用户图片 / 粘贴文本附件 → OpenAI 兼容多模态 content（文本附件折进正文） |
| `message-attachments.test.ts` | 粘贴文本折进 prompt、无图时保持纯文本 |
| `verify.ts` | 改后自动验证：按 package.json scripts 选 test/build/lint 等 |
| `workspace-bootstrap.ts` | 注入 README、package.json、顶层目录快照 |
| `tool-definitions.ts` | re-export `tools/schemas` 的 `TOOL_DEFINITIONS` |
| `text-tool-fallback.ts` | 弱模型把工具调用打进正文时的解析与回退执行 |
| `vision-feedback.ts` | Computer Use 截图视觉回灌（多模态 user 消息） |
| `coordinator.ts` | 子 Agent：spawn、转向、停止、按父线程快照；直播 token 节流广播；`~/.sharker/subagents.json` 重启恢复（进行中标中断） |
| `coordinator.test.ts` | 父线程归组、停止、落盘与重启中断 |
| `approval-bridge.ts` | 父 turn 审批桥，供子 Agent 工具调用复用 |
| `ARCH.md` | 本层架构说明 |

## Turn 管线（一次用户消息）

```
executeUserInput
  → queryServe（占坑：turn_start + AbortController + 超时）
  → processUserInput（斜杠命令 or 普通文本 → shouldQuery）
  → shouldQuery=false：本地回复 / command chunk → done
  → onQuery：校验提供商、@file、附件、压缩上下文、组装 system
  → queryLoop：流式模型 ↔ 工具 → done
```

## 对外接口

- `executeUserInput(ctx)` → `Promise<void>`（主进程 `chat:send` 唯一入口）
- `abortActiveTurn()` — 中止当前 turn
- `processUserInput(userText, conversationId?)` → `{ shouldQuery, userText, localReply?, command?, harnessPhase? }`
- `queryLoop(...)` → `AsyncGenerator<StreamChunk>`
- `generateTitle(settings, messages)` → `Promise<string>`

## 依赖

- `providers/openai` — 流式聊天
- `tools/executor`、`tools/registry`、`tools/harness-state` — 执行与权限
- `shared/*` — 类型、上下文压缩、token、校验等

## 扩展点

- 新斜杠命令：`commands.ts` + `shared/slash-commands.ts`
- 新 Harness 策略：`pipeline.ts` / `query-loop.ts`
- 新工具：在 `tools/` 注册，不必改本目录（`tool-definitions` 已 re-export）
- 验证命令顺序：`verify.ts` 的 `VERIFY_SCRIPT_ORDER`

## 直播过程

- 工具执行经 `runToolWithLiveStatus` 中途 yield `status`，前端步骤详情持续更新，避免长命令期间 UI 静止。
- 写入/补丁参数流先 yield `tool_preview` 再 `status`，live diff 槽先于「正在生成」出现。
