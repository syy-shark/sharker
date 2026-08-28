# tools/services — 工具侧长驻服务

## 职责

- MCP 连接与工具池、后台任务进程、Browser native host、LSP、功能一键就绪
- 被 builtins 与 electron IPC 调用，不直接面向模型 schema（schema 在 schemas/registry）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `mcp-client.ts` | MCP stdio JSON-RPC 会话（list/call） |
| `mcp-registry.ts` | 从配置加载 Server，对外 list/call |
| `mcp-config-io.ts` | `~/.sharker/mcp.json` / 工作区 mcp 配置读写 |
| `mcp-plugin-store.ts` | 插件目录安装状态、一键写入 mcp.json |
| `mcp-tool-pool.ts` | 动态 Tool 池：tools/list 并入模型工具列表 |
| `task-manager.ts` | 后台任务（shell/脚本/子 Agent）生命周期 |
| `browser-native-host.ts` | Chrome native messaging manifest / host 二进制 |
| `feature-use-setup.ts` | Computer / Browser Use 开关触发的一键就绪 |
| `lsp-client.ts` | 语言服务器 spawn 与 diagnostics 摘要 |
| `thread-terminal-store.ts` | 集成终端输出尾（按对话）；PTY 写入，`read_thread_terminal` 读取 |
| `thread-terminal-store.test.ts` | 绑定对话、当前标签、无会话 |
| `ARCH.md` | 本层架构说明 |
