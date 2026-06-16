/** window.sharker IPC 类型声明 @see src/README.md */
/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}

import type { Conversation, WorkspaceConversationsState } from '../shared/conversation'
import type { AppSettings, ApprovalRequest, ChatMessage, StreamChunk } from '../shared/types'

/** preload 暴露的 window.sharker IPC API */
export interface SharkerApi {
  platform: NodeJS.Platform
  getSettings: () => Promise<AppSettings>
  saveSettings: (s: AppSettings) => Promise<boolean>
  testProvider: (
    providerId: string,
    draft?: AppSettings
  ) => Promise<{ ok: boolean; message: string }>
  selectWorkspace: () => Promise<string | null>
  pickWorkspaceFolder: () => Promise<string | null>
  listConversations: (workspaceId: string) => Promise<WorkspaceConversationsState>
  loadConversation: (
    workspaceId: string,
    conversationId: string
  ) => Promise<Conversation | null>
  saveConversation: (workspaceId: string, conversation: Conversation) => Promise<Conversation>
  createConversation: (workspaceId: string) => Promise<Conversation>
  deleteConversation: (workspaceId: string, conversationId: string) => Promise<boolean>
  setActiveConversation: (
    workspaceId: string,
    conversationId: string | null
  ) => Promise<boolean>
  importSkillRepo: (url: string) => Promise<string>
  sendMessage: (text: string, history: ChatMessage[]) => Promise<void>
  abortChat: () => Promise<void>
  respondApproval: (id: string, approved: boolean) => Promise<void>
  onStream: (cb: (chunk: StreamChunk) => void) => () => void
  onApproval: (cb: (req: ApprovalRequest) => void) => () => void
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  openExternal: (url: string) => Promise<boolean>
}

declare global {
  interface Window {
    sharker: SharkerApi
  }
}

export {}
