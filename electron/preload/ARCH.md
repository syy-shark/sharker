# electron/preload — 预加载桥

## 职责

- 在隔离的 preload 环境中用 `contextBridge` 暴露安全 API
- 渲染进程只通过 `window.sharker` 访问主进程能力，不直接碰 `ipcRenderer` 细节

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | 全部 `window.sharker.*` 方法与事件订阅（与 `shared/ipc.ts` / `src/vite-env.d.ts` 对齐；含 `captureAppshot` / `onAppshotTrigger`） |
| `ARCH.md` | 本层架构说明 |

## 扩展点

新 IPC：在此暴露方法 → `src/vite-env.d.ts` 补类型 → `electron/main` 注册 handler。
