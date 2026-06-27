# electron — 主进程与持久化

## 职责

- 应用入口、窗口、**全部 IPC handler**
- 设置读写（含 API Key 加密）
- 工作区对话 **落盘**
- 调用 `executeUserInput`（Turn 管线），转发流式 chunk 到渲染进程

## 目录结构

```
electron/
├── main/index.ts       # 入口、IPC、chat:send
├── preload/index.ts    # contextBridge → window.sharker
├── settings-store.ts   # settings.json + safeStorage
├── conversations-store.ts  # 委托 agent/memory/conversations（PGlite）
└── linux-desktop.ts    # Linux 桌面集成
```

## 关键 IPC（完整列表见 shared/ipc.ts）

| Channel | 作用 |
|---------|------|
| `chat:send` | 跑 Turn 管线一轮（`executeUserInput`） |
| `chat:abort` | 中止 |
| `settings:*` | 读写设置 |
| `conversations:*` | 对话 CRUD |
| `approval:response` | 高危操作确认 |

## 数据流

`chat:send` → `executeUserInput` → `queryServe` → `processUserInput` → `onQuery` → `queryLoop` → `event.sender.send('chat:stream')`

## 扩展指南

- 新 IPC：main 注册 + preload 暴露 + `src/vite-env.d.ts` 类型
- 新持久化：优先放 `electron/*-store.ts`，格式写入 [ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## 依赖

- `agent/`、`providers/`、`tools/`、`shared/`、`skills/`
