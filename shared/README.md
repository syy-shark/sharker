# shared — 主进程与前端共用

## 职责

- **类型定义**：`AppSettings`、`ChatMessage`、`ChatAttachment`、`StreamChunk` 等
- **纯逻辑**：无 Node/Electron/React 依赖，两侧可 import
- **IPC 常量**、对话模型、上下文估算与压缩

## 关键文件

| 文件 | 说明 |
|------|------|
| `types.ts` | 核心 TypeScript 类型 |
| `ipc.ts` | IPC channel 名称常量 |
| `workspace.ts` | 工作区列表、排序、归一化 |
| `conversation.ts` | 对话、标题推导、排序 |
| `needs-tools.ts` | 寒暄是否跳过 tools；`继续` / `接着` 这类续跑短句会保留 tools |
| `context-limit.ts` | 各模型 context 上限表 |
| `context-compress.ts` | 85% 阈值自动压缩 |
| `token-estimate.ts` | token 用量估算 |
| `process-steps.ts` | 过程时间线步骤构建（旧消息回退） |
| `process-phases.ts` | 从 `TurnSegment[]` 纯派生理解 / 探索 / 执行 / 验证阶段、统计与摘要 |
| `turn-segments.ts` | 流式 chunk → 有序 `TurnSegment[]` 归并（含 `status` 过渡状态、`toolCallId` / `fileDiff(s)` / 文件编辑预览统计） |
| `line-diff.ts` | 行级 diff 计算、`buildFileDiff`、`parseUnifiedDiff`（Markdown diff 块） |
| `turn-meta.ts` | 工具活动 label 格式化 |
| `provider-validate.ts` | API 配置校验 |

## 设计原则

- 新增跨进程契约（IPC payload、存储 JSON）**先改 types.ts**
- 用户图片附件只在 `ChatAttachment` 中保存稳定路径与元数据；不要把大图 base64 放进会话 JSON
- 算法类放 shared，避免 renderer 引入 electron
- `process-phases.ts` 只负责展示归组；不要把阶段写入 IPC、消息类型或持久化数据

## 扩展指南

- 新 `StreamChunk` 类型：改 `types.ts` + `App.tsx` stream handler + UI（`status` 用于模型/工具参数准备阶段的可见过渡，不代表工具已执行；`command` 供 `/clear` 等本地命令）
- 新 IPC：改 `ipc.ts` + `preload` + `main/index.ts`

## 文档

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
