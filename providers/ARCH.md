# providers — 模型 API

## 职责

- OpenAI 兼容 **Chat Completions** 流式调用
- 工具调用（tools + 失败时无 tools 重试）
- 连接/首包超时、URL 规范化、设置页测试连接与拉模型列表
- **不管**：Turn 调度、工具执行、UI

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `openai.ts` | OpenAI 兼容流式；读 SSE 时响应 AbortSignal，Stop 立即打断；`listProviderModels` 会按预设剔除 Chat Completions 调不了的 id；写入/补丁参数流抽出 `partialToolArgs`（`extractPartialWriteToolArgs`），首个 path 立刻推 `tool_status` |
| `openai.test.ts` | 未闭合 write / replace / patch JSON 抽出 path 与内容片段，不把读文件当写入 |
| `ARCH.md` | 本层架构说明 |

## 对外接口

- `streamChat(settings, messages, signal?, options?)` — 异步生成 delta / reasoning / tool_calls
- `simpleCompletion` — 非流式（标题、压缩）
- `testProviderConfig(provider)` — 设置里「测试」
- `listProviderModels(provider)` — `GET …/models`
- 请求体合并 `buildThinkingRequestFields`（`shared/thinking-levels.ts`）

## 配置来源

`AppSettings.providers` + `activeProviderId`。内置预设见 [shared/provider-catalog.ts](../shared/provider-catalog.ts)（含 OpenCode Go 套餐，Base `https://opencode.ai/zen/go/v1`）。

## 扩展点

- 新厂商预设：`shared/provider-catalog.ts`，必要时改 URL 解析 / `context-limit`
- 新 reasoning 字段：`extractReasoning` / `extractDeltaContent`
