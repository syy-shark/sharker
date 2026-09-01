# src/lib — 前端工具函数

## 职责

- 无 React 依赖的纯函数小工具

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `format-time.ts` | 侧栏 recents last-active（`6 min` / `3 days ago`，对标 Codex #21960；用 updatedAt，无 1s 心跳） |
| `format-time.test.ts` | last-active 分桶与「不同线程不同时间」 |
| `open-workspace-file.ts` | 对话文件引用、审查文件名/⌘单击行、Files changed 卡：默认 App 开文件树；工作区 HTML 无行号改走内置浏览器 `file://`（对标 Codex #32773）；`file_opener` 非 none 时改走外部 URI；`sharker:reveal-file` 按对话 cwd 在访达中显示；`sharker:copy-file-path` 复制解析后的本机路径 |
| `browser-history-store.ts` | 内置浏览历史读写 localStorage，并派发打开 URL（设置页重新打开与对话点链，对标 Codex Settings → Browser / clicking a URL） |
| `find-highlight.ts` | 对话查找当前命中：CSS Highlight `sharker-find` 标可见文本（只扫气泡正文，不改 React 树，以免直播过程区每 token 走树）；Add to chat 回跳另用 `sharker-selection` 标段落（对标 Codex #41391），不盖查找高亮 |
| `find-highlight.test.ts` | 高亮选择器只对准助手正文 / 用户气泡；划选回跳用独立 Highlight 名 |
| `thread-runtime.ts` | 会话线程模式（本地 / Worktree）本机记忆；交接后仍记住关联 worktree 与起点分支；后台 turn 按 conversationId 取模式 |
| `thread-runtime.test.ts` | 当前会话用内存态、后台会话读落盘 |
| `thread-goal.ts` | 会话 `/goal` 本机记忆（含 `startedAt` / `pausedAt`）；后台 turn 读落盘、仅 active 注入 |
| `thread-goal.test.ts` | 读写、`startedAt` / `pausedAt` 与注入开关 |
| `maka-bridge.ts` | Sharker 对话 / StreamChunk ↔ Maka SessionSummary / StoredMessage / LiveTurn 事件 |
| `ARCH.md` | 本层架构说明 |
