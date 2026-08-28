/**
 * 预加载脚本：通过 contextBridge 将 IPC 能力暴露为 window.sharker。
 * @see electron/ARCH.md
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'
import type { Conversation } from '../../shared/conversation'
import type {
  AppSettings,
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  StreamChunk
} from '../../shared/types'

/** 向渲染进程暴露类型安全的 IPC 桥接 API。 */
contextBridge.exposeInMainWorld('sharker', {
  platform: process.platform,
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  saveSettings: (s: AppSettings): Promise<boolean> => ipcRenderer.invoke(IPC.SAVE_SETTINGS, s),
  testProvider: (
    providerId: string,
    draft?: AppSettings
  ): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.TEST_PROVIDER, providerId, draft),
  listProviderModels: (
    providerId: string,
    draft?: AppSettings
  ): Promise<{ ok: boolean; models: Array<{ id: string; ownedBy?: string }>; message: string }> =>
    ipcRenderer.invoke(IPC.LIST_PROVIDER_MODELS, providerId, draft),
  importChatgptSubscription: (): Promise<{
    ok: boolean
    message: string
    settings: AppSettings | null
  }> => ipcRenderer.invoke(IPC.IMPORT_CHATGPT_SUBSCRIPTION),
  importXaiSubscription: (
    mode?: 'device' | 'hermes'
  ): Promise<{
    ok: boolean
    message: string
    settings: AppSettings | null
    userCode?: string
    verificationUri?: string
  }> => ipcRenderer.invoke(IPC.IMPORT_XAI_SUBSCRIPTION, mode ?? 'device'),
  onXaiDeviceCode: (
    cb: (info: { userCode?: string; verificationUri?: string }) => void
  ): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      info: { userCode?: string; verificationUri?: string }
    ) => cb(info)
    ipcRenderer.on(IPC.XAI_DEVICE_CODE, handler)
    return () => ipcRenderer.removeListener(IPC.XAI_DEVICE_CODE, handler)
  },
  selectWorkspace: (): Promise<string | null> => ipcRenderer.invoke(IPC.SELECT_WORKSPACE),
  pickWorkspaceFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.PICK_WORKSPACE_FOLDER),
  listConversations: (workspaceId: string) =>
    ipcRenderer.invoke(IPC.LIST_CONVERSATIONS, workspaceId),
  loadConversation: (workspaceId: string, conversationId: string) =>
    ipcRenderer.invoke(IPC.LOAD_CONVERSATION, workspaceId, conversationId),
  saveConversation: (workspaceId: string, conversation: Conversation) =>
    ipcRenderer.invoke(IPC.SAVE_CONVERSATION, workspaceId, conversation),
  createConversation: (workspaceId: string) =>
    ipcRenderer.invoke(IPC.CREATE_CONVERSATION, workspaceId),
  deleteConversation: (workspaceId: string, conversationId: string) =>
    ipcRenderer.invoke(IPC.DELETE_CONVERSATION, workspaceId, conversationId),
  archiveConversation: (workspaceId: string, conversationId: string, archived: boolean) =>
    ipcRenderer.invoke(IPC.ARCHIVE_CONVERSATION, workspaceId, conversationId, archived),
  listArchivedConversations: () => ipcRenderer.invoke(IPC.LIST_ARCHIVED_CONVERSATIONS),
  setActiveConversation: (workspaceId: string, conversationId: string | null) =>
    ipcRenderer.invoke(IPC.SET_ACTIVE_CONVERSATION, workspaceId, conversationId),
  generateTitle: (messages: ChatMessage[]): Promise<string> =>
    ipcRenderer.invoke(IPC.GENERATE_TITLE, messages),
  sendMessage: (
    text: string,
    history: ChatMessage[],
    attachments?: ChatAttachment[],
    conversationId?: string,
    options?: { worktreePath?: string | null }
  ): Promise<void> =>
    ipcRenderer.invoke(IPC.SEND_MESSAGE, text, history, attachments, conversationId, options),
  saveAttachment: (input: {
    name: string
    mimeType: string
    dataUrl: string
  }): Promise<ChatAttachment> => ipcRenderer.invoke(IPC.SAVE_ATTACHMENT, input),
  readAttachmentDataUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.READ_ATTACHMENT_DATA_URL, filePath),
  abortChat: (conversationId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.ABORT_CHAT, conversationId),
  respondApproval: (
    id: string,
    decision: import('../../shared/approval-session').ApprovalDecision | boolean
  ): Promise<void> => ipcRenderer.invoke(IPC.APPROVAL_RESPONSE, id, decision),
  onStream: (cb: (chunk: StreamChunk) => void): (() => void) => {
    const handler = (_: unknown, chunk: StreamChunk): void => cb(chunk)
    ipcRenderer.on('chat:stream', handler)
    return () => ipcRenderer.removeListener('chat:stream', handler)
  },
  onApproval: (cb: (req: ApprovalRequest) => void): (() => void) => {
    const handler = (_: unknown, req: ApprovalRequest): void => cb(req)
    ipcRenderer.on('chat:approval', handler)
    return () => ipcRenderer.removeListener('chat:approval', handler)
  },
  windowMinimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  windowMaximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
  windowClose: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openPath: (targetPath: string) => ipcRenderer.invoke(IPC.OPEN_PATH, targetPath),
  getComputerUseStatus: (workspace: string) =>
    ipcRenderer.invoke(IPC.GET_COMPUTER_USE_STATUS, workspace),
  getBrowserUseStatus: (workspace: string) =>
    ipcRenderer.invoke(IPC.GET_BROWSER_USE_STATUS, workspace),
  installBrowserUseManifest: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.INSTALL_BROWSER_USE_MANIFEST),
  compressContext: (history: ChatMessage[]) =>
    ipcRenderer.invoke(IPC.COMPRESS_CONTEXT, history),
  getTokenUsage: (days?: number) => ipcRenderer.invoke(IPC.GET_TOKEN_USAGE, days),
  getWorkspaceTree: (workspace: string, directoriesOnly?: boolean) =>
    ipcRenderer.invoke(IPC.WORKSPACE_TREE, workspace, directoriesOnly),
  searchWorkspaceFiles: (workspace: string, query: string) =>
    ipcRenderer.invoke(IPC.WORKSPACE_SEARCH_FILES, workspace, query),
  listSkills: (workspace: string) => ipcRenderer.invoke(IPC.SKILLS_LIST, workspace),
  readTextFile: (filePath: string) => ipcRenderer.invoke(IPC.READ_TEXT_FILE, filePath),
  readFileDataUrl: (filePath: string) =>
    ipcRenderer.invoke(IPC.READ_FILE_DATA_URL, filePath),
  getGitBranchInfo: (cwd: string) => ipcRenderer.invoke(IPC.GIT_BRANCH_INFO, cwd),
  listGitBranches: (cwd: string) => ipcRenderer.invoke(IPC.GIT_LIST_BRANCHES, cwd),
  gitCheckout: (cwd: string, branch: string) =>
    ipcRenderer.invoke(IPC.GIT_CHECKOUT, cwd, branch),
  getGitStatusChanges: (cwd: string) => ipcRenderer.invoke(IPC.GIT_STATUS_CHANGES, cwd),
  getGitFileDiff: (
    cwd: string,
    filePath: string,
    status?: string,
    scope?: 'unstaged' | 'staged' | 'branch'
  ) => ipcRenderer.invoke(IPC.GIT_FILE_DIFF, cwd, filePath, status, scope),
  commitGitChanges: (cwd: string, message: string) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT, cwd, message),
  pushGitBranch: (cwd: string) => ipcRenderer.invoke(IPC.GIT_PUSH, cwd),
  getGitBranchChanges: (cwd: string) => ipcRenderer.invoke(IPC.GIT_BRANCH_CHANGES, cwd),
  createGitPullRequest: (
    cwd: string,
    payload: { title: string; body?: string; base?: string }
  ) => ipcRenderer.invoke(IPC.GIT_CREATE_PR, cwd, payload),
  getPullRequestContext: (cwd: string) => ipcRenderer.invoke(IPC.GIT_PR_CONTEXT, cwd),
  createGitBranch: (cwd: string, name: string) =>
    ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, cwd, name),
  applyGitHunkAction: (
    cwd: string,
    payload: {
      action: 'stage' | 'unstage' | 'revert'
      path: string
      patch: string
      scope?: 'unstaged' | 'staged'
    }
  ) => ipcRenderer.invoke(IPC.GIT_HUNK_ACTION, cwd, payload),
  applyGitReviewAction: (
    cwd: string,
    action: 'stage' | 'unstage' | 'revert',
    paths?: string[]
  ) => ipcRenderer.invoke(IPC.GIT_REVIEW_ACTION, cwd, action, paths),
  prepareWorktree: (cwd: string, conversationId: string) =>
    ipcRenderer.invoke(IPC.WORKSPACE_PREPARE_WORKTREE, cwd, conversationId),
  handoffThread: (payload: {
    direction: 'to_local' | 'to_worktree'
    localCwd: string
    worktreePath: string
  }) => ipcRenderer.invoke(IPC.GIT_HANDOFF, payload),
  createTerminal: (cwd: string) => ipcRenderer.invoke(IPC.TERMINAL_CREATE, cwd),
  writeTerminal: (id: string, data: string) =>
    ipcRenderer.invoke(IPC.TERMINAL_WRITE, id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.TERMINAL_RESIZE, id, cols, rows),
  killTerminal: (id: string) => ipcRenderer.invoke(IPC.TERMINAL_KILL, id),
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => {
    const handler = (_: unknown, payload: { id: string; data: string }) => cb(payload)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (cb: (payload: { id: string }) => void) => {
    const handler = (_: unknown, payload: { id: string }) => cb(payload)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  listAutomations: () => ipcRenderer.invoke(IPC.LIST_AUTOMATIONS),
  saveAutomations: (jobs: unknown) => ipcRenderer.invoke(IPC.SAVE_AUTOMATIONS, jobs),
  listAutomationQueue: () => ipcRenderer.invoke(IPC.LIST_AUTOMATION_QUEUE),
  saveAutomationQueue: (queue: unknown) => ipcRenderer.invoke(IPC.SAVE_AUTOMATION_QUEUE, queue),
  onAutomationRun: (cb: (job: unknown) => void) => {
    const handler = (_: unknown, job: unknown) => cb(job)
    ipcRenderer.on('automation:run', handler)
    return () => ipcRenderer.removeListener('automation:run', handler)
  }
})
