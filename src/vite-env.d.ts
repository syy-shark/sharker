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
import type { AutomationQueueItem } from '../shared/automation-queue'
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
  createConversation: (
    workspaceId: string,
    options?: { activate?: boolean }
  ) => Promise<Conversation>
  patchConversationMeta: (
    workspaceId: string,
    conversationId: string,
    patch: import('../shared/conversation').ConversationMetaPatch
  ) => Promise<import('../shared/conversation').ConversationSummary | null>
  clearConversationUnread: (workspaceId: string) => Promise<number>
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
    options?: { worktreePath?: string | null; goal?: string | null }
  ) => Promise<void>
  saveAttachment: (input: {
    name: string
    mimeType: string
    dataUrl: string
  }) => Promise<ChatAttachment>
  readAttachmentDataUrl: (filePath: string) => Promise<string>
  requestNotifyPermission: () => Promise<{ ok: boolean; permission: string }>
  notifyTurnComplete: (payload: {
    title: string
    body: string
    conversationId: string
    workspaceId: string
  }) => Promise<boolean>
  setDockBadge: (count: number) => Promise<void>
  onNotifyTurnClick: (
    cb: (payload: { conversationId: string; workspaceId: string }) => void
  ) => () => void
  takePendingDeeplink: () => Promise<string | null>
  pathIsDirectory: (target: string) => Promise<boolean>
  onDeeplink: (cb: (url: string) => void) => () => void
  onMenuAction: (cb: (action: string) => void) => () => void
  abortChat: (conversationId?: string) => Promise<void>
  respondApproval: (
    id: string,
    decision: import('../shared/approval-session').ApprovalDecision | boolean
  ) => Promise<void>
  onStream: (cb: (chunk: StreamChunk) => void) => () => void
  onApproval: (cb: (req: ApprovalRequest) => void) => () => void
  approveDeniedRetry: (conversationId?: string | null) => Promise<{
    ok: boolean
    denial: { toolName: string; description: string } | null
  }>
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
  listSkills: (
    workspace: string
  ) => Promise<Array<{ name: string; description: string }>>
  readTextFile: (
    filePath: string
  ) => Promise<{ ok: true; path: string; content: string } | { ok: false; error: string }>
  readFileDataUrl: (
    filePath: string
  ) => Promise<{ ok: true; path: string; dataUrl: string } | { ok: false; error: string }>
  getGitBranchInfo: (
    cwd: string
  ) => Promise<{ isRepo: boolean; branch: string; dirty: boolean; remoteUrl?: string }>
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
  getPullRequestContext: (
    cwd: string
  ) => Promise<
    | { ok: true; context: import('../shared/git-pr-context').PullRequestContext }
    | { ok: false; error: string }
  >
  postPullRequestReview: (
    cwd: string,
    comments: unknown
  ) => Promise<{ ok: true; posted: number } | { ok: false; error: string; posted: number }>
  openThreadWindow: (
    workspaceId: string,
    conversationId: string,
    title?: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  setWindowAlwaysOnTop: (flag: boolean) => Promise<boolean>
  getWindowAlwaysOnTop: () => Promise<boolean>
  createGitBranch: (
    cwd: string,
    name: string
  ) => Promise<{ ok: true; branch: string } | { ok: false; error: string }>
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
  getGitCommitChanges: (
    cwd: string,
    sha?: string
  ) => Promise<{
    commits: { sha: string; subject: string }[]
    sha: string
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
    scope?: 'unstaged' | 'staged' | 'branch' | 'commit',
    rev?: string
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
    conversationId: string,
    opts?: { baseRef?: string; keep?: number }
  ) => Promise<{ ok: true; path: string; branch: string } | { ok: false; error: string }>
  createPermanentWorktree: (
    cwd: string,
    name: string,
    opts?: { baseRef?: string }
  ) => Promise<{ ok: true; path: string; branch: string } | { ok: false; error: string }>
  removeManagedWorktree: (
    cwd: string,
    conversationId: string
  ) => Promise<{ ok: true; removed: boolean } | { ok: false; error: string }>
  listMcpStatus: (
    workspace: string,
    verbose?: boolean
  ) => Promise<
    Array<{ name: string; command: string; args?: string[]; tools?: string[]; error?: string }>
  >
  initAgentsMd: (
    workspace: string
  ) => Promise<{ ok: true; path: string; created: boolean } | { ok: false; error: string }>
  getPersonalAgentsMd: () => Promise<{
    path: string
    content: string
    exists: boolean
    overrideActive: boolean
  }>
  savePersonalAgentsMd: (
    content: string
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
  getPlanMode: (conversationId: string) => Promise<'normal' | 'plan' | 'build'>
  setPlanMode: (
    conversationId: string,
    enabled: boolean
  ) => Promise<'normal' | 'plan' | 'build'>
  listMemories: (
    workspaceId: string
  ) => Promise<Array<{ id: string; scope: string; kind: string; content: string }>>
  inspectWorktree: (dest: string) => Promise<{ exists: boolean; hasSnapshot: boolean }>
  handoffThread: (payload: {
    direction: 'to_local' | 'to_worktree'
    localCwd: string
    worktreePath: string
  }) => Promise<{ ok: true; applied: string[] } | { ok: false; error: string }>
  createTerminal: (cwd: string) => Promise<{ id: string }>
  writeTerminal: (id: string, data: string) => Promise<void>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
  killTerminal: (id: string) => Promise<void>
  killAllTerminals: () => Promise<void>
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void
  onTerminalExit: (cb: (payload: { id: string }) => void) => () => void
  listAutomations: () => Promise<AutomationJob[]>
  saveAutomations: (jobs: AutomationJob[]) => Promise<boolean>
  listAutomationQueue: () => Promise<AutomationQueueItem[]>
  saveAutomationQueue: (queue: AutomationQueueItem[]) => Promise<boolean>
  onAutomationRun: (cb: (job: AutomationJob) => void) => () => void
  listSubAgents: (
    parentConversationId?: string
  ) => Promise<import('../shared/subagent').SubAgentSnapshot[]>
  stopSubAgent: (id: string) => Promise<boolean>
  steerSubAgent: (
    id: string,
    message: string
  ) => Promise<{ ok: true; note: string } | { ok: false; error: string }>
  onSubAgentUpdate: (cb: (snapshot: import('../shared/subagent').SubAgentSnapshot) => void) => () => void
}

declare global {
  interface Window {
    sharker: SharkerApi
  }
}

export {}
