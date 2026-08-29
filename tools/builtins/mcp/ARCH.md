# tools/builtins/mcp — MCP 工具入口

## 职责

- 模型侧 `mcp_list_tools` / `mcp_call_tool` 等，对接 `tools/services/mcp-*`
- 过程区文案走 `shared/mcp-activity.ts` 的 Calling / Called `server.tool`，不在本层发明直播 UI

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | MCP list / call ToolHandler |
| `ARCH.md` | 本层架构说明 |
