# tools/builtins/agent — 子 Agent 工具

## 职责

- 向模型暴露 spawn / 通信类工具，内部对接 `agent/coordinator.ts` 与 task-manager；spawn 带父 `conversationId`，审批走父 turn

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | `agent_spawn` 等 ToolHandler 导出 |
| `ARCH.md` | 本层架构说明 |
