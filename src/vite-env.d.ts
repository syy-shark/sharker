/** window.sharker IPC 类型声明 @see src/ARCH.md */
/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}

import type { Conversation, WorkspaceConversationsState } from '../shared/conversation'
import type { ComputerUseStatus } from '../shared/computer-use-status'
import type { BrowserUseStatus } from '../shared/browser-use-status'
import type { AutomationJob } from '../shared/automation'
import type { WorkspaceTreeNode } from '../shared/workspace-tree'
import type {
  AppSettings,
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  StreamChunk
} from '../shared/types'

/** preload 暴露的 window.sharker IPC API */
export interface SharkerApi {
  platform: NodeJS.Platform
  getSettings: () => Promise<AppSettings>
  saveSettings: (s: AppSettings) => Promise<boolean>
  testProvider: (
    providerId: string,
    draft?: AppSettings
  ) => Promise<{ ok: boolean; message: string }>
  listProviderModels: (
    providerId: string,
    draft?: AppSettings
  ) => Promise<{
    ok: boolean
    models: Array<{ id: string; ownedBy?: string }>
    message: string
  }>
  importChatgptSubscription: () => Promise<{
    ok: boolean
    message: string
    settings: AppSettings | null
  }>
  importXaiSubscription: (mode?: 'device' | 'hermes') => Promise<{
    ok: boolean
    message: string
    settings: AppSettings | null
    userCode?: string
    verificationUri?: string
  }>
  onXaiDeviceCode: (
    cb: (info: { userCode?: string; verificationUri?: string }) => void
  ) => () => void
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
  archiveConversation: (
    workspaceId: string,
    conversationId: string,
    archived: boolean
  ) => Promise<boolean>
  listArchivedConversations: () => Promise<
    import('../shared/conversation').ConversationSummary[]
  >
  setActiveConversation: (
    workspaceId: string,
    conversationId: string | null
  ) => Promise<boolean>
  sendMessage: (
    text: string,
    history: ChatMessage[],
    attachments?: ChatAttachment[],
    conversationId?: string,
    options?: { worktreePath?: string | null }
  ) => Promise<void>
  saveAttachment: (input: {
    name: string
    mimeType: string
    dataUrl: string
  }) => Promise<ChatAttachment>
  readAttachmentDataUrl: (filePath: string) => Promise<string>
  abortChat: (conversationId?: string) => Promise<void>
  respondApproval: (
    id: string,
    decision: import('../shared/approval-session').ApprovalDecision | boolean
  ) => Promise<void>
  onStream: (cb: (chunk: StreamChunk) => void) => () => void
  onApproval: (cb: (req: ApprovalRequest) => void) => () => void
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  openExternal: (url: string) => Promise<boolean>
  openPath: (targetPath: string) => Promise<boolean>
  getComputerUseStatus: (workspace: string) => Promise<ComputerUseStatus>
  getBrowserUseStatus: (workspace: string) => Promise<BrowserUseStatus>
  installBrowserUseManifest: () => Promise<{ ok: boolean; message: string }>
  compressContext: (history: ChatMessage[]) => Promise<import('../shared/context-compress').ContextCompressResult>
  getTokenUsage: (days?: number) => Promise<import('../shared/token-usage-store').DayUsage[]>
  getWorkspaceTree: (workspace: string, directoriesOnly?: boolean) => Promise<WorkspaceTreeNode[]>
  searchWorkspaceFiles: (
    workspace: string,
    query: string
  ) => Promise<Array<{ name: string; path: string; relativePath: string }>>
  readTextFile: (
    filePath: string
  ) => Promise<{ ok: true; path: string; content: string } | { ok: false; error: string }>
  readFileDataUrl: (
    filePath: string
  ) => Promise<{ ok: true; path: string; dataUrl: string } | { ok: false; error: string }>
  getGitBranchInfo: (
    cwd: string
  ) => Promise<{ isRepo: boolean; branch: string; dirty: boolean }>
  listGitBranches: (
    cwd: string
  ) => Promise<{ isRepo: boolean; branches: string[] }>
  gitCheckout: (cwd: string, branch: string) => Promise<string>
  getGitStatusChanges: (cwd: string) => Promise<{
    isRepo: boolean
    branch: string
    files: {
      status: string
      path: string
      raw: string
      staged?: boolean
      unstaged?: boolean
      untracked?: boolean
    }[]
  }>
  applyGitReviewAction: (
    cwd: string,
    action: 'stage' | 'unstage' | 'revert',
    paths?: string[]
  ) => Promise<{ ok: boolean; error?: string }>
  applyGitHunkAction: (
    cwd: string,
    payload: {
      action: 'stage' | 'unstage' | 'revert'
      path: string
      patch: string
      scope?: 'unstaged' | 'staged'
    }
  ) => Promise<{ ok: boolean; error?: string }>
  commitGitChanges: (
    cwd: string,
    message: string
  ) => Promise<{ ok: true; sha: string } | { ok: false; error: string }>
  pushGitBranch: (cwd: string) => Promise<{ ok: true } | { ok: false; error: string }>
  createGitPullRequest: (
    cwd: string,
    payload: { title: string; body?: string; base?: string }
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
  getGitBranchChanges: (cwd: string) => Promise<{
    base: string | null
    files: {
      status: string
      path: string
      raw: string
      staged?: boolean
      unstaged?: boolean
      untracked?: boolean
    }[]
  }>
  getGitFileDiff: (
    cwd: string,
    filePath: string,
    status?: string,
    scope?: 'unstaged' | 'staged' | 'branch'
  ) => Promise<{
    ok: boolean
    path: string
    status: string
    binary?: boolean
    error?: string
    diff?: import('../shared/types').FileDiff
  }>
  prepareWorktree: (
    cwd: string,
    conversationId: string
  ) => Promise<{ ok: true; path: string; branch: string } | { ok: false; error: string }>
  createTerminal: (cwd: string) => Promise<{ id: string }>
  writeTerminal: (id: string, data: string) => Promise<void>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
  killTerminal: (id: string) => Promise<void>
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void
  onTerminalExit: (cb: (payload: { id: string }) => void) => () => void
  listAutomations: () => Promise<AutomationJob[]>
  saveAutomations: (jobs: AutomationJob[]) => Promise<boolean>
  onAutomationRun: (cb: (job: AutomationJob) => void) => () => void
}

declare global {
  interface Window {
    sharker: SharkerApi
  }
}

export {}
