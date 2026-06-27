# Sharker 功能路线图（2026-06 更新）

## 已落地

| 功能 | 说明 |
|------|------|
| 斜杠命令菜单 | 命令列表在输入框**内部**顶部展开，与输入区同一卡片 |
| 右上角面板按钮 | Codex 风格展开/收起；内含文件 / 终端 / 浏览器 |
| 侧栏左上角 | 仅「自动」+「工作区」标签 |
| 集成终端 | xterm.js + node-pty，cwd 跟随工作区 |
| 文件树 | 工作区目录浏览（IPC `workspace:tree`） |
| 内置浏览器 | Electron `<webview>` |
| Git 分支栏 | 聊天区顶栏显示当前分支 |
| 自动化 | 独立页面 + cron 调度 + 触发 Agent |
| 小宠物 | 设置 → 宠物；右下角浮动组件 |
| Hooks | `~/.sharker/hooks.json` + turn_start/done 触发 |
| OAuth GPT | 设置 → 扩展 → 连接（OpenCode 风格入口） |
| 远程协作 | 创建房间 + shareCode |
| LSP | 启动 typescript-language-server |
| Token 热力图 | 设置 → Token |
| Memory（PGlite） | 会话 + 长期记忆 PostgreSQL；Writer 自动写入；Retriever 注入上下文 |

## 可继续深化

- Memory 代码片段自动提取（`code_snippets` 表）
- OAuth 完整 callback 服务器与 token 刷新
- 远程协作 WebSocket relay 实连
- LSP 诊断结果注入 Agent 上下文
- 文件树点击打开编辑器
- Computer Use 与 CUA 项目更深整合
