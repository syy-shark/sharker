/**
 * 主进程与渲染进程 IPC channel 名称常量。
 * 详见 shared/README.md
 */
/** 主进程与渲染进程 IPC channel 名称 */
export const IPC = {
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  TEST_PROVIDER: 'provider:test',
  SEND_MESSAGE: 'chat:send',
  ABORT_CHAT: 'chat:abort',
  APPROVAL_RESPONSE: 'approval:response',
  SELECT_WORKSPACE: 'workspace:select',
  PICK_WORKSPACE_FOLDER: 'workspace:pick',
  LIST_CONVERSATIONS: 'conversations:list',
  LOAD_CONVERSATION: 'conversations:load',
  SAVE_CONVERSATION: 'conversations:save',
  DELETE_CONVERSATION: 'conversations:delete',
  SET_ACTIVE_CONVERSATION: 'conversations:set-active',
  CREATE_CONVERSATION: 'conversations:create',
  GENERATE_TITLE: 'conversations:generate-title',
  IMPORT_SKILL_REPO: 'skills:import',
  RELOAD_SKILLS: 'skills:reload',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  OPEN_EXTERNAL: 'shell:open-external'
} as const
