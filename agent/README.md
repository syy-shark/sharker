# agent — Harness 核心

## 职责

- **Turn 管线**：接待后的调度、占坑、命令解析、上下文组装、核心循环
- System prompt 组装（工作区、纪律、快照、Skills）
- **改后自动验证**（`verify.ts`）
- 工具 schema 定义（`tool-definitions.ts`）
- 斜杠命令（`commands.ts`）

## 关键文件

| 文件 | 说明 |
|------|------|
| `pipeline.ts` | `executeUserInput`、`processUserInput`、`onQuery`（MCP 池 + @file）、`abortActiveTurn` |
| `query-loop.ts` | `queryLoop` — 流式问模型 ↔ 工具（只读并行）↔ 审批 ↔ verify |
| `file-refs.ts` | 解析 `@path` 并注入文件内容 |
| `loop.ts` | `buildSystemPrompt`、`generateTitle` |
| `commands.ts` | `/help`、`/clear` 等本地命令 |
| `verify.ts` | 选择 `npm run test/build/lint`，跳过关键词 |
| `workspace-bootstrap.ts` | 注入 README、package.json、顶层目录快照 |
| `memory/` | PGlite 记忆：Writer / Retriever / Assembler / 会话存储 |
| `tool-definitions.ts` | re-export `tools/registry` 的 `TOOL_DEFINITIONS` |

## Turn 管线（一次用户消息）

```
executeUserInput
  → queryServe（占坑：turn_start + AbortController + 120s 超时）
  → processUserInput（斜杠命令 or 普通文本 → shouldQuery）
  → shouldQuery=false：本地回复 / command chunk → done
  → onQuery：校验提供商、MCP 动态池、@file 展开、压缩上下文、组装 system + skills
  → queryLoop：流式模型 ↔ 工具（只读可并行，默认最多 25 轮）→ done
```

## 对外接口

- `executeUserInput(ctx)` → `Promise<void>`（主进程 `chat:send` 唯一入口）
- `abortActiveTurn()` — 中止当前 turn
- `processUserInput(userText)` → `{ shouldQuery, userText, localReply?, command? }`
- `queryLoop(settings, messages, onApproval, signal, opts)` → `AsyncGenerator<StreamChunk>`
- `generateTitle(settings, messages)` → `Promise<string>`

## 依赖

- `providers/openai` — 流式聊天
- `tools/executor` — 执行工具
- `tools/registry` — 高危审批（`isHighRiskTool`）
- `skills/loader` — Skill 注入
- `shared/needs-tools` — 是否附带 tools

## 扩展指南

- 新斜杠命令：改 `commands.ts` 注册表
- 新 Harness 策略：改 `pipeline.ts` 的 `onQuery` 或 `query-loop.ts`
- 新工具：在 `tools/schemas.ts` 加 schema，在 `tools/builtins/` 实现 `ToolHandler` 并在 `tools/registry.ts` 注册
- 验证命令：改 `verify.ts` 的 `VERIFY_SCRIPT_ORDER`

## 文档

- [docs/agent-capabilities.md](../docs/agent-capabilities.md)
- [docs/computer-use-setup.md](../docs/computer-use-setup.md) — Codex Computer/Browser/Voice 安装
- [docs/codex-port-gap-matrix.md](../docs/codex-port-gap-matrix.md) — 移植对照
- [docs/roadmap-harness.md](../docs/roadmap-harness.md)
