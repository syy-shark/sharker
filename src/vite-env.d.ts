/** window.sharker IPC 类型声明 @see src/README.md */
/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}

import type { Conversation, WorkspaceConversationsState } from '../shared/conversation'
import type { ComputerUseStatus } from '../shared/computer-use-status'
import type { BrowserUseStatus } from '../shared/browser-use-status'
import type { AutomationJob } from '../shared/automation'
import type { HookEntry } from '../agent/hooks/runner'
import type { OAuthGptConfig } from '../shared/oauth-gpt'
import type { RemoteCollabRoom } from '../shared/remote-collab'
import type { WorkspaceTreeNode } from '../shared/workspace-tree'
import type { LspStatus } from '../tools/services/lsp-client'
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
  getMcpConfig: (workspace: string) => Promise<{ raw: string; path: string }>
  saveMcpConfig: (targetPath: string, raw: string) => Promise<boolean>
  testMcpConfig: (workspace: string) => Promise<{ ok: boolean; message: string }>
  getComputerUseStatus: (workspace: string) => Promise<ComputerUseStatus>
  getBrowserUseStatus: (workspace: string) => Promise<BrowserUseStatus>
  installBrowserUseManifest: () => Promise<{ ok: boolean; message: string }>
  listMcpPlugins: (
    workspace: string
  ) => Promise<
    Array<{
      id: string
      title: string
      description: string
      installed: boolean
      feature?: 'computerUse' | 'browserUse'
      category?: 'recommended' | 'more'
    }>
  >
  toggleMcpPlugin: (
    workspace: string,
    pluginId: string,
    enabled: boolean
  ) => Promise<
    Array<{
      id: string
      title: string
      description: string
      installed: boolean
      feature?: 'computerUse' | 'browserUse'
      category?: 'recommended' | 'more'
    }>
  >
  compressContext: (history: ChatMessage[]) => Promise<import('../shared/context-compress').ContextCompressResult>
  getTokenUsage: (days?: number) => Promise<import('../shared/token-usage-store').DayUsage[]>
  getWorkspaceTree: (workspace: string, directoriesOnly?: boolean) => Promise<WorkspaceTreeNode[]>
  readTextFile: (
    filePath: string
  ) => Promise<{ ok: true; path: string; content: string } | { ok: false; error: string }>
  getGitBranchInfo: (
    cwd: string
  ) => Promise<{ isRepo: boolean; branch: string; dirty: boolean }>
  listGitBranches: (
    cwd: string
  ) => Promise<{ isRepo: boolean; branches: string[] }>
  gitCheckout: (cwd: string, branch: string) => Promise<string>
  createTerminal: (cwd: string) => Promise<{ id: string }>
  writeTerminal: (id: string, data: string) => Promise<void>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
  killTerminal: (id: string) => Promise<void>
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void
  onTerminalExit: (cb: (payload: { id: string }) => void) => () => void
  listAutomations: () => Promise<AutomationJob[]>
  saveAutomations: (jobs: AutomationJob[]) => Promise<boolean>
  onAutomationRun: (cb: (job: AutomationJob) => void) => () => void
  listHooks: () => Promise<HookEntry[]>
  saveHooks: (hooks: HookEntry[]) => Promise<boolean>
  getOAuthGptMeta: () => Promise<OAuthGptConfig>
  startOAuthGpt: () => Promise<{ ok: boolean; message: string; email?: string }>
  getRemoteCollab: () => Promise<{ rooms: RemoteCollabRoom[]; activeRoomId?: string }>
  createRemoteRoom: (name: string) => Promise<RemoteCollabRoom>
  startLsp: (workspace: string) => Promise<LspStatus>
  getLspStatus: () => Promise<LspStatus>
  stopLsp: () => Promise<boolean>
}

declare global {
  interface Window {
    sharker: SharkerApi
  }
}

export {}
