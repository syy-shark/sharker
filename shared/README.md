# shared — 主进程与前端共用

## 职责

- **类型定义**：`AppSettings`、`ChatMessage`、`StreamChunk` 等
- **纯逻辑**：无 Node/Electron/React 依赖，两侧可 import
- **IPC 常量**、对话模型、上下文估算与压缩

## 关键文件

| 文件 | 说明 |
|------|------|
| `types.ts` | 核心 TypeScript 类型 |
| `ipc.ts` | IPC channel 名称常量 |
| `workspace.ts` | 工作区列表、排序、归一化 |
| `conversation.ts` | 对话、标题推导、排序 |
| `needs-tools.ts` | 寒暄是否跳过 tools |
| `context-limit.ts` | 各模型 context 上限表 |
| `context-compress.ts` | 85% 阈值自动压缩 |
| `token-estimate.ts` | token 用量估算 |
| `process-steps.ts` | 过程时间线步骤构建（旧消息回退） |
| `turn-segments.ts` | 流式 chunk → 有序 `TurnSegment[]` 归并（含 `toolCallId` / `fileDiff`） |
| `line-diff.ts` | 行级 diff 计算、`buildFileDiff`、`parseUnifiedDiff`（Markdown diff 块） |
| `turn-meta.ts` | 工具活动 label 格式化 |
| `provider-validate.ts` | API 配置校验 |

## 设计原则

- 新增跨进程契约（IPC payload、存储 JSON）**先改 types.ts**
- 算法类放 shared，避免 renderer 引入 electron

## 扩展指南

- 新 `StreamChunk` 类型：改 `types.ts` + `App.tsx` stream handler + UI（已有 `command` 供 `/clear` 等本地命令）
- 新 IPC：改 `ipc.ts` + `preload` + `main/index.ts`

## 文档

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
