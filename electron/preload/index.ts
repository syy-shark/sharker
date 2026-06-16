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
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url)
})
