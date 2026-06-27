/**
 * 预加载脚本：通过 contextBridge 将 IPC 能力暴露为 window.sharker。
 * @see electron/README.md
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'
import type { Conversation } from '../../shared/conversation'
import type { AppSettings, ApprovalRequest, ChatMessage, StreamChunk } from '../../shared/types'

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
  setActiveConversation: (workspaceId: string, conversationId: string | null) =>
    ipcRenderer.invoke(IPC.SET_ACTIVE_CONVERSATION, workspaceId, conversationId),
  importSkillRepo: (url: string): Promise<string> => ipcRenderer.invoke(IPC.IMPORT_SKILL_REPO, url),
  generateTitle: (messages: ChatMessage[]): Promise<string> =>
    ipcRenderer.invoke(IPC.GENERATE_TITLE, messages),
  sendMessage: (text: string, history: ChatMessage[]): Promise<void> =>
    ipcRenderer.invoke(IPC.SEND_MESSAGE, text, history),
  abortChat: (): Promise<void> => ipcRenderer.invoke(IPC.ABORT_CHAT),
  respondApproval: (id: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.APPROVAL_RESPONSE, id, approved),
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
  getMcpConfig: (workspace: string): Promise<{ raw: string; path: string }> =>
    ipcRenderer.invoke(IPC.GET_MCP_CONFIG, workspace),
  saveMcpConfig: (targetPath: string, raw: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SAVE_MCP_CONFIG, targetPath, raw),
  testMcpConfig: (workspace: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.TEST_MCP_CONFIG, workspace),
  getComputerUseStatus: (workspace: string) =>
    ipcRenderer.invoke(IPC.GET_COMPUTER_USE_STATUS, workspace),
  getBrowserUseStatus: (workspace: string) =>
    ipcRenderer.invoke(IPC.GET_BROWSER_USE_STATUS, workspace),
  installBrowserUseManifest: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.INSTALL_BROWSER_USE_MANIFEST),
  listMcpPlugins: (workspace: string) => ipcRenderer.invoke(IPC.LIST_MCP_PLUGINS, workspace),
  toggleMcpPlugin: (workspace: string, pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC.TOGGLE_MCP_PLUGIN, workspace, pluginId, enabled),
  compressContext: (history: ChatMessage[]) =>
    ipcRenderer.invoke(IPC.COMPRESS_CONTEXT, history),
  getTokenUsage: (days?: number) => ipcRenderer.invoke(IPC.GET_TOKEN_USAGE, days),
  getWorkspaceTree: (workspace: string, directoriesOnly?: boolean) =>
    ipcRenderer.invoke(IPC.WORKSPACE_TREE, workspace, directoriesOnly),
  readTextFile: (filePath: string) => ipcRenderer.invoke(IPC.READ_TEXT_FILE, filePath),
  getGitBranchInfo: (cwd: string) => ipcRenderer.invoke(IPC.GIT_BRANCH_INFO, cwd),
  listGitBranches: (cwd: string) => ipcRenderer.invoke(IPC.GIT_LIST_BRANCHES, cwd),
  gitCheckout: (cwd: string, branch: string) =>
    ipcRenderer.invoke(IPC.GIT_CHECKOUT, cwd, branch),
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
  onAutomationRun: (cb: (job: unknown) => void) => {
    const handler = (_: unknown, job: unknown) => cb(job)
    ipcRenderer.on('automation:run', handler)
    return () => ipcRenderer.removeListener('automation:run', handler)
  },
  listHooks: () => ipcRenderer.invoke(IPC.LIST_HOOKS),
  saveHooks: (hooks: unknown) => ipcRenderer.invoke(IPC.SAVE_HOOKS, hooks),
  getOAuthGptMeta: () => ipcRenderer.invoke(IPC.OAUTH_GPT_META),
  startOAuthGpt: () =>
    ipcRenderer.invoke(IPC.OAUTH_GPT_START) as Promise<{
      ok: boolean
      message: string
      email?: string
    }>,
  getRemoteCollab: () => ipcRenderer.invoke(IPC.REMOTE_COLLAB_GET),
  createRemoteRoom: (name: string) => ipcRenderer.invoke(IPC.REMOTE_COLLAB_CREATE, name),
  startLsp: (workspace: string) => ipcRenderer.invoke(IPC.LSP_START, workspace),
  getLspStatus: () => ipcRenderer.invoke(IPC.LSP_STATUS),
  stopLsp: () => ipcRenderer.invoke(IPC.LSP_STOP)
})
