# providers — 模型 API

## 职责

- OpenAI 兼容 **Chat Completions** 流式调用
- 工具调用（tools + 失败重试无 tools）
- 连接/首包超时、DeepSeek URL 规范化
- 设置页 **测试连接**（真实 chat 请求）

## 关键文件

| 文件 | 说明 |
|------|------|
| `openai.ts` | `streamChat`、`simpleCompletion`、`testProviderConfig`、`getActiveProvider` |

## 对外接口

- `streamChat(settings, messages, signal?, options?)` — 异步生成 delta / reasoning / tool_calls
- `simpleCompletion` — 非流式（标题生成、上下文压缩）
- `testProviderConfig(provider)` — 设置里「测试」

## 配置来源

`AppSettings.providers` + `activeProviderId`，主进程 `loadSettings` 后使用。

## 扩展指南

- 新厂商适配：优先改 `resolveChatCompletionsUrl` 与错误解析
- 新模型特性（reasoning 字段）：改 `extractReasoning` / `extractDeltaContent`

## 相关

- [shared/context-limit.ts](../shared/context-limit.ts) — 模型上下文上限
- [shared/provider-validate.ts](../shared/provider-validate.ts) — 设置校验
