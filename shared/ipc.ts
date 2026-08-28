/**
 * 主进程与渲染进程 IPC channel 名称常量。
 * 详见 shared/ARCH.md
 */
/** 主进程与渲染进程 IPC channel 名称 */
export const IPC = {
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  TEST_PROVIDER: 'provider:test',
  LIST_PROVIDER_MODELS: 'provider:list-models',
  IMPORT_CHATGPT_SUBSCRIPTION: 'provider:import-chatgpt-sub',
  /** xAI SuperGrok：设备码 OAuth（完整跑完申请码→打开浏览器→轮询） */
  IMPORT_XAI_SUBSCRIPTION: 'provider:import-xai-sub',
  /** 主进程推送：请在浏览器确认的 user_code */
  XAI_DEVICE_CODE: 'provider:xai-device-code',
  SEND_MESSAGE: 'chat:send',
  SAVE_ATTACHMENT: 'chat:save-attachment',
  READ_ATTACHMENT_DATA_URL: 'chat:read-attachment-data-url',
  ABORT_CHAT: 'chat:abort',
  APPROVAL_RESPONSE: 'approval:response',
  SELECT_WORKSPACE: 'workspace:select',
  PICK_WORKSPACE_FOLDER: 'workspace:pick',
  LIST_CONVERSATIONS: 'conversations:list',
  LOAD_CONVERSATION: 'conversations:load',
  SAVE_CONVERSATION: 'conversations:save',
  DELETE_CONVERSATION: 'conversations:delete',
  ARCHIVE_CONVERSATION: 'conversations:archive',
  LIST_ARCHIVED_CONVERSATIONS: 'conversations:list-archived',
  SET_ACTIVE_CONVERSATION: 'conversations:set-active',
  CREATE_CONVERSATION: 'conversations:create',
  GENERATE_TITLE: 'conversations:generate-title',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  OPEN_EXTERNAL: 'shell:open-external',
  OPEN_PATH: 'shell:open-path',
  GET_COMPUTER_USE_STATUS: 'computer-use:status',
  GET_BROWSER_USE_STATUS: 'browser-use:status',
  INSTALL_BROWSER_USE_MANIFEST: 'browser-use:install-manifest',
  COMPRESS_CONTEXT: 'chat:compress-context',
  GET_TOKEN_USAGE: 'usage:token-history',
  WORKSPACE_TREE: 'workspace:tree',
  READ_TEXT_FILE: 'workspace:read-text-file',
  /** 小文件转 data URL（内联图片预览） */
  READ_FILE_DATA_URL: 'workspace:read-file-data-url',
  GIT_BRANCH_INFO: 'git:branch-info',
  GIT_LIST_BRANCHES: 'git:list-branches',
  GIT_CHECKOUT: 'git:checkout',
  /** 工作区 git 变更文件列表（Changes 面板） */
  GIT_STATUS_CHANGES: 'git:status-changes',
  /** 单个变更文件相对 HEAD 的审查 diff */
  GIT_FILE_DIFF: 'git:file-diff',
  /** 审查面板：暂存 / 取消暂存 / 还原 */
  GIT_REVIEW_ACTION: 'git:review-action',
  /** Composer `@` 工作区文件模糊搜索 */
  WORKSPACE_SEARCH_FILES: 'workspace:search-files',
  /** 为会话准备隔离 Git worktree */
  WORKSPACE_PREPARE_WORKTREE: 'workspace:prepare-worktree',
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  LIST_AUTOMATIONS: 'automations:list',
  SAVE_AUTOMATIONS: 'automations:save'
} as const
