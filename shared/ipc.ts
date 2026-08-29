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
  /** 复制对话渲染图到剪贴板（对标 Codex Save or copy rendered images） */
  COPY_CHAT_IMAGE: 'chat:copy-image',
  /** 另存对话渲染图 */
  SAVE_CHAT_IMAGE: 'chat:save-image',
  /** 后台回合完成：系统通知 */
  NOTIFY_TURN_COMPLETE: 'app:notify-turn',
  /** 设置页主动请求系统通知权限（对标 Codex Notifications permission prompt） */
  REQUEST_NOTIFY_PERMISSION: 'app:request-notify-permission',
  /** 点击系统通知 → 打开对应对话 */
  NOTIFY_TURN_CLICK: 'app:notify-turn-click',
  /** macOS Dock 未读数字（本机对话，不拉 Cloud） */
  SET_DOCK_BADGE: 'app:set-dock-badge',
  /** `sharker://` 深链推送到渲染进程 */
  DEEPLINK_OPEN: 'app:deeplink',
  /** 取走启动时尚未投递的深链 */
  DEEPLINK_TAKE: 'app:deeplink-take',
  /** 路径是否为本地目录（深链 path=） */
  PATH_IS_DIRECTORY: 'fs:is-directory',
  /** 应用菜单点击（无加速键注册，避免与渲染进程快捷键双触发） */
  MENU_ACTION: 'app:menu-action',
  ABORT_CHAT: 'chat:abort',
  /** 忙时注入当前回合（对标 Codex Steer，不中止直播） */
  STEER_CHAT: 'chat:steer',
  STEER_CHAT_CANCEL: 'chat:steer-cancel',
  STEER_CHAT_UPDATE: 'chat:steer-update',
  APPROVAL_RESPONSE: 'approval:response',
  /** `/approve`：最近一次拒绝排队一次重试 */
  APPROVE_DENIED_RETRY: 'approval:approve-denied',
  SELECT_WORKSPACE: 'workspace:select',
  PICK_WORKSPACE_FOLDER: 'workspace:pick',
  LIST_CONVERSATIONS: 'conversations:list',
  /** `tail` 尾页；`slim` 揭开已瘦身全线程；都不传则全文给模型 */
  LOAD_CONVERSATION: 'conversations:load',
  /** 上滑取更早一页（对标 Codex thread/turns/list） */
  LOAD_OLDER_CONVERSATION: 'conversations:load-older',
  /** 点开瘦身后的命令输出 / 思考，取一条完整消息 */
  LOAD_CONVERSATION_MESSAGE: 'conversations:load-message',
  /** 分页线程查找（对标 Codex thread/searchOccurrences） */
  SEARCH_CONVERSATION: 'conversations:search',
  /** 查找跳到未加载命中时取 [fromSeq, beforeSeq) */
  LOAD_CONVERSATION_RANGE: 'conversations:load-range',
  SAVE_CONVERSATION: 'conversations:save',
  DELETE_CONVERSATION: 'conversations:delete',
  ARCHIVE_CONVERSATION: 'conversations:archive',
  LIST_ARCHIVED_CONVERSATIONS: 'conversations:list-archived',
  SET_ACTIVE_CONVERSATION: 'conversations:set-active',
  CREATE_CONVERSATION: 'conversations:create',
  /** 只改标题 / 置顶 / 未读，不重写消息 */
  PATCH_CONVERSATION_META: 'conversations:patch-meta',
  /** 清掉工作区对话未读（⇧Esc） */
  CLEAR_CONVERSATION_UNREAD: 'conversations:clear-unread',
  GENERATE_TITLE: 'conversations:generate-title',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  /** 弹出独立线程窗（对标 Codex Open in Popup Window） */
  OPEN_THREAD_WINDOW: 'window:open-thread',
  /** 当前窗 Always on top（对标 Codex 弹出对话置顶） */
  SET_WINDOW_ALWAYS_ON_TOP: 'window:set-always-on-top',
  GET_WINDOW_ALWAYS_ON_TOP: 'window:get-always-on-top',
  /** 把本地行内评论发到当前 GitHub PR */
  GIT_PR_REVIEW: 'git:pr-review',
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
  /** 审查面板：项目还不是仓库时 `git init` */
  GIT_INIT: 'git:init',
  /** 工作区 git 变更文件列表（Changes 面板） */
  GIT_STATUS_CHANGES: 'git:status-changes',
  /** 单个变更文件相对 HEAD 的审查 diff */
  GIT_FILE_DIFF: 'git:file-diff',
  /** 审查面板：暂存 / 取消暂存 / 还原 */
  GIT_REVIEW_ACTION: 'git:review-action',
  /** 审查面板：单个 hunk 暂存 / 取消暂存 / 还原 */
  GIT_HUNK_ACTION: 'git:hunk-action',
  /** 审查面板：提交已暂存变更 */
  GIT_COMMIT: 'git:commit',
  /** 审查面板：推送当前分支 */
  GIT_PUSH: 'git:push',
  /** 相对基线分支的已提交变更 */
  GIT_BRANCH_CHANGES: 'git:branch-changes',
  /** 指定 commit 的已提交变更（审查栏 Commit） */
  GIT_COMMIT_CHANGES: 'git:commit-changes',
  /** 审查面板：用 gh 创建 Pull Request */
  GIT_CREATE_PR: 'git:create-pr',
  /** 当前分支 PR 与 GitHub 行内审查评论 */
  GIT_PR_CONTEXT: 'git:pr-context',
  /** 隔离 worktree：在 HEAD 上创建命名分支 */
  GIT_CREATE_BRANCH: 'git:create-branch',
  /** 本地 ↔ 隔离 worktree 交接（Hand off） */
  GIT_HANDOFF: 'git:handoff',
  /** Composer `@` 工作区文件模糊搜索 */
  WORKSPACE_SEARCH_FILES: 'workspace:search-files',
  /** Composer `$` Skill 列表（名称 + 描述） */
  SKILLS_LIST: 'skills:list',
  /** 为会话准备隔离 Git worktree */
  WORKSPACE_PREPARE_WORKTREE: 'workspace:prepare-worktree',
  /** 项目菜单：创建永久 worktree */
  WORKSPACE_CREATE_PERMANENT_WORKTREE: 'workspace:create-permanent-worktree',
  /** 归档时移除会话托管 worktree */
  WORKSPACE_REMOVE_WORKTREE: 'workspace:remove-worktree',
  /** `/mcp` 已配置 Server 列表 */
  MCP_STATUS: 'mcp:status',
  /** `/init`：没有说明文件时写入仓库根 AGENTS.md */
  INIT_AGENTS_MD: 'workspace:init-agents-md',
  /** 设置 → 自定义说明：读写 `~/.sharker/AGENTS.md` */
  GET_PERSONAL_AGENTS_MD: 'agents-md:get-personal',
  SAVE_PERSONAL_AGENTS_MD: 'agents-md:save-personal',
  /** 按会话读/写计划模式（输入框芯片，不发消息） */
  GET_PLAN_MODE: 'harness:get-plan-mode',
  SET_PLAN_MODE: 'harness:set-plan-mode',
  /** `/memories`：列出当前工作区相关记忆 */
  MEMORY_LIST: 'memory:list',
  /** 隔离 worktree 是否还在、有无快照 */
  WORKSPACE_INSPECT_WORKTREE: 'workspace:inspect-worktree',
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_BIND: 'terminal:bind',
  TERMINAL_ACTIVATE: 'terminal:activate',
  /** `/stop`：关掉全部集成终端 PTY */
  TERMINAL_KILL_ALL: 'terminal:kill-all',
  LIST_AUTOMATIONS: 'automations:list',
  SAVE_AUTOMATIONS: 'automations:save',
  LIST_AUTOMATION_QUEUE: 'automations:queue-list',
  SAVE_AUTOMATION_QUEUE: 'automations:queue-save',
  AGENTS_LIST: 'agents:list',
  AGENTS_STOP: 'agents:stop',
  AGENTS_STEER: 'agents:steer'
} as const
