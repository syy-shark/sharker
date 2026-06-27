/**
 * 工具分组与计划模式白名单。
 * @see tools/README.md
 */

/** 计划模式允许的只读 / 规划类工具 */
export const PLAN_MODE_TOOL_NAMES = new Set([
  'read_file',
  'read_image',
  'read_pdf',
  'read_notebook',
  'read_graph',
  'list_dir',
  'glob_file_search',
  'grep',
  'git_status',
  'git_diff',
  'git_log',
  'git_show',
  'list_skills',
  'read_skill',
  'web_fetch',
  'web_search',
  'task_list',
  'task_get',
  'task_output',
  'agent_list',
  'agent_get_result',
  'mcp_list_tools',
  'desktop_doctor',
  'desktop_screenshot',
  'desktop_list_windows',
  'desktop_get_ui_tree',
  'browser_navigate',
  'browser_snapshot',
  'browser_screenshot',
  'browser_close',
  'voice_read_aloud',
  'voice_stop',
  'enter_plan_mode',
  'exit_plan_mode'
])

/** 会修改文件系统的写工具 */
export const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'search_replace',
  'apply_patch',
  'edit_notebook',
  'delete_path',
  'uninstall_application',
  'move_path',
  'create_directory',
  'run_terminal_cmd',
  'run_background_shell',
  'git_add',
  'git_commit',
  'git_pull',
  'git_push',
  'git_worktree_add',
  'git_worktree_remove',
  'run_skill_script',
  'task_create',
  'task_update',
  'task_stop',
  'shell_send_input',
  'shell_kill',
  'agent_spawn',
  'agent_send_message',
  'mcp_call_tool',
  'desktop_click',
  'desktop_type',
  'desktop_key',
  'desktop_scroll',
  'browser_click',
  'browser_type'
])

/** 内置 Computer Use 工具名（设置 UI 展示） */
export const COMPUTER_USE_BUILTIN_TOOLS = [
  'desktop_doctor',
  'desktop_screenshot',
  'desktop_list_windows',
  'desktop_get_ui_tree',
  'desktop_click',
  'desktop_type',
  'desktop_key',
  'desktop_scroll'
] as const

/** Computer Use 写操作工具（需审批） */
export const COMPUTER_USE_WRITE_TOOLS = new Set([
  'desktop_click',
  'desktop_type',
  'desktop_key',
  'desktop_scroll'
])

/** Computer Use 工具分组标签（权限/设置 UI） */
export const COMPUTER_USE_GROUP = {
  id: 'computerUse',
  title: 'Computer Use（桌面自动化）',
  description:
    '内置 desktop_* 工具始终并入 Agent；完整 AT-SPI / portal 能力需配置 codex-computer-use-linux MCP。'
} as const

/** 判断工具在计划模式下是否可用 */
export function isToolAllowedInPlanMode(toolName: string): boolean {
  return PLAN_MODE_TOOL_NAMES.has(toolName)
}

/** 是否为内置 Computer Use 工具 */
export function isComputerUseBuiltinTool(toolName: string): boolean {
  return (COMPUTER_USE_BUILTIN_TOOLS as readonly string[]).includes(toolName)
}
