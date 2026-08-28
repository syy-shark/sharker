/**
 * 跨进程核心 TypeScript 类型与默认设置。
 * 详见 shared/ARCH.md
 */
import { builtinProviders } from './provider-catalog'

/** 文件访问权限：沙箱（仅工作区）或完整访问 */
export type PermissionMode = 'sandbox' | 'full'

/** Agent 网络隔离模式（对标 Codex agent-workspace network.mode） */
export type NetworkMode = 'open' | 'local_only' | 'disabled'

/**
 * 接入鉴权方式：
 * - api_key：官方 API Key（DeepSeek / Kimi / 智谱 Coding Plan / OpenCode Go 套餐等）
 * - subscription：订阅登录导入（ChatGPT Plus/Pro、SuperGrok / X Premium+），不是 API Key
 */
export type ProviderAuthMode = 'api_key' | 'subscription'

/** OpenAI 兼容 API 提供商配置 */
export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  /**
   * API Key 或订阅 access token。
   * subscription 模式下由「导入订阅」写入，UI 不展示为 API Key。
   */
  apiKey: string
  model: string
  /** 上下文 token 上限；不填则按模型 ID 自动识别 */
  contextWindow?: number
  /** 是否支持视觉（Computer Use 截图回灌）；不填则按模型名启发 */
  vision?: boolean
  /** 鉴权方式；默认 api_key */
  authMode?: ProviderAuthMode
  /** 订阅已连接时展示用（邮箱等） */
  subscriptionLabel?: string
  /**
   * 思考 / 推理水平（仅当该模型官方支持时有效）。
   * 取值见 shared/thinking-levels.ts（如 off/low/medium/high/max/on…）。
   */
  thinkingLevel?: string
}

/** 侧栏工作区条目 */
export interface WorkspaceItem {
  id: string
  path: string
  label: string
  isHome?: boolean
  pinned?: boolean
}

/** 应用全局设置（工作区、模型、权限） */
export interface AppSettings {
  /** @deprecated 由 workspaces + activeWorkspaceId 派生，保存时同步 */
  workspacePath: string
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  permissionMode: PermissionMode
  /** 出站网络策略；默认 open（继承主机） */
  networkMode?: NetworkMode
  /** 可选工作区 profile 标签（MVP，便于多环境区分） */
  workspaceProfile?: string
  providers: ProviderConfig[]
  activeProviderId: string
  /** 桌面自动化（desktop_*）；默认开启 */
  computerUseEnabled?: boolean
  /** 浏览器自动化（browser_*）；默认开启 */
  browserUseEnabled?: boolean
  /**
   * 历史字段：玻璃透明度。现已固定材质，浅色=0.82、深色=0，仅兼容旧设置。
   */
  uiGlass?: number
  /** 外观主题：light=苹果玻璃，dark=深金属 */
  uiTheme?: 'light' | 'dark'
  /** 界面字号缩放（对标 Codex ⌘+ / ⌘-）；默认 1 */
  uiFontScale?: number
  /** Codex 式人格：只改语气 */
  personality?: import('./personality').AgentPersonality
  /** 托管 worktree 保留个数；0 表示不自动删。默认 15 */
  worktreeKeepCount?: number
  /** 是否把检索到的记忆注入 system（对标 Codex /memories inject） */
  memoryInjection?: boolean
  /** 是否在回合结束提炼并写入记忆（对标 Codex /memories generate） */
  memoryGeneration?: boolean
  /** 快捷键覆盖（对标 Codex Settings → Keyboard Shortcuts） */
  keyboardShortcuts?: import('./keymap').KeymapOverrides
  /**
   * 忙时后续行为（对标 Codex Settings → General → Follow-up behavior）。
   * 默认 queue：Enter 排队；steer：Enter 注入当前回合。⌘⇧Enter 反转单条。
   */
  followUpBehavior?: 'queue' | 'steer'
  /** 用 ⌘/Ctrl+Enter 发送，Enter 换行（对标 Codex Require Cmd+Enter） */
  requireModEnter?: boolean
  /** 空对话显示上下文建议（对标 Codex Suggested prompts） */
  suggestedPrompts?: boolean
  /**
   * `/review` 默认交付（对标 Codex Settings → Git → Review delivery）。
   * detached（默认）：新开审查线程；inline：能在当前对话跑就在当前对话。
   */
  reviewDelivery?: 'inline' | 'detached'
  /** 生成 commit message 时使用的用户模板（对标 Codex Git commit prompt） */
  gitCommitPrompt?: string
  /** 生成 PR 描述时使用的用户模板（对标 Codex Git pull request prompt） */
  gitPrPrompt?: string
  /**
   * 回合完成通知（对标 Codex Settings → Notifications）。
   * never / background（默认） / always
   */
  turnNotifyMode?: 'never' | 'background' | 'always'
  /** 有回合在跑时阻止系统休眠（对标 Codex Prevent sleep while running） */
  preventSleepWhileRunning?: boolean
  /** 新弹出对话窗默认置顶（对标 Codex Always on top） */
  popoutAlwaysOnTop?: boolean
  /** 高危操作审批通知（对标 Codex permission / question notifications） */
  approvalNotify?: boolean
}

/** 聊天消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 用户消息附件种类：图片或超长粘贴文本 */
export type ChatAttachmentKind = 'image' | 'text'

/** 用户消息附件（粘贴/拖拽会先复制到 Sharker 稳定目录） */
export interface ChatAttachment {
  id: string
  name: string
  mimeType: string
  path: string
  size: number
  kind: ChatAttachmentKind
  /** 粘贴正文：预览 / 回插 / 折进 `/goal`；大文件可不带，读 path */
  text?: string
}

/** 单轮助手活动记录（工具/压缩） */
export interface TurnActivity {
  kind: 'tool' | 'compress'
  label: string
}

/** 一回合有序片段类型：思考 / 状态过渡 / 旁白文字 / 工具步骤 */
export type TurnSegmentKind = 'thinking' | 'status' | 'text' | 'tool'

/** 片段状态（工具步骤进行中/完成/失败） */
export type TurnSegmentStatus = 'active' | 'done' | 'error' | 'cancelled'

/** 文字片段角色：中途旁白 vs 最终回答 */
export type TurnTextRole = 'narration' | 'final'

/** diff 行类型：新增 / 删除 / 上下文 */
export type DiffLineKind = 'add' | 'del' | 'ctx'

/** 单行 diff */
export interface FileDiffLine {
  kind: DiffLineKind
  /** 源文件行号（del/ctx） */
  oldLine?: number
  /** 新文件行号（add/ctx） */
  newLine?: number
  content: string
}

/** 文件编辑 diff（供 UI 绿加红删展示） */
export interface FileDiff {
  path: string
  language?: string
  lines: FileDiffLine[]
  stats: { added: number; removed: number }
}

/** 文件编辑进行中的安全预览：只存路径与统计，不保存完整内容 */
export interface FileEditPreview {
  path: string
  stats: { added: number; removed: number }
}

/** 工具执行结果：文本输出 + 可选 diff / 计划就绪元数据 */
export interface ToolRunResult {
  output: string
  fileDiff?: FileDiff
  fileDiffs?: FileDiff[]
  /** 命令类工具真实退出码；后台化时未知。 */
  exitCode?: number
  /** exit_plan_mode 后置 true，触发 UI Build 按钮 */
  planReady?: boolean
  planDocument?: string
  planFilePath?: string
}

/** 一回合按时间顺序排列的片段（思考→旁白→工具→…） */
export interface TurnSegment {
  id: string
  kind: TurnSegmentKind
  /** thinking / text 的累积内容 */
  content?: string
  /** tool: 原始工具名 */
  toolName?: string
  /** tool: 与 tool_calls 对应的 id */
  toolCallId?: string
  /** tool: 中文步骤标题 */
  toolTitle?: string
  /** tool: 原始参数（标题/详情回退用，避免进度心跳冲掉命令摘要） */
  toolArgs?: Record<string, unknown>
  /** tool: 文件名 / 命令摘要 */
  toolDetail?: string
  status?: TurnSegmentStatus
  startedAt?: number
  endedAt?: number
  resultSummary?: string
  /** 按需展开的截断工具输出。 */
  resultOutput?: string
  errorMessage?: string
  exitCode?: number
  isVerification?: boolean
  approval?: ApprovalRequest
  /** text: 中途旁白 vs 最终回答 */
  role?: TurnTextRole
  /** compress 等元片段标题 */
  metaTitle?: string
  /** 编辑类工具完成后的行级 diff */
  fileDiff?: FileDiff
  /** 编辑类工具完成后的多文件 diff */
  fileDiffs?: FileDiff[]
  /** 编辑类工具执行中可展示的文件名和估算行数 */
  editPreview?: FileEditPreview[]
}

/** 助手消息的元信息（耗时、浏览文件、活动列表） */
export interface AssistantMeta {
  /** Turn completion state used by the renderer for semantic feedback. */
  outcome?: 'success' | 'error' | 'aborted'
  /** User message that may be replayed when this turn failed. */
  retryOfUserMessageId?: string
  durationSec?: number
  browsedFiles: string[]
  activities: TurnActivity[]
  /** 本轮是否经过模型推理（reasoning） */
  hadThinking?: boolean
  /** 思考内容摘要（完成后可展开查看） */
  thinkingPreview?: string
  /** 回复所用模型 ID */
  model?: string
  /** 有序过程流（持久化，历史可重看） */
  segments?: TurnSegment[]
  /** 本轮写盘的相对路径（对标 Codex 完成后的 changed-file summary） */
  changedFiles?: string[]
}

/** 单条聊天消息 */
export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  attachments?: ChatAttachment[]
  toolCallId?: string
  toolName?: string
  meta?: AssistantMeta
}

/** 高危工具执行前的用户审批请求 */
export interface ApprovalRequest {
  id: string
  title: string
  description: string
  toolName: string
  args: Record<string, unknown>
  /** 归属会话（多会话隔离时 UI 只展示当前会话的审批） */
  conversationId?: string
}

/** 上下文自动压缩结果摘要 */
export interface ContextCompressInfo {
  removedCount: number
  beforeTokens: number
  afterTokens: number
  limit: number
  messages: ChatMessage[]
}

/** 主进程 → 渲染进程的流式事件块 */
export interface StreamChunk {
  type:
    | 'token'
    | 'think'
    | 'status'
    | 'turn_start'
    | 'tool_start'
    | 'tool_done'
    /** 工具参数流式预览（如 present_inline_demo 的 html 边生成边出） */
    | 'tool_preview'
    | 'done'
    | 'error'
    | 'approval_needed'
    | 'approval_resolved'
    | 'turn_cancelled'
    | 'context_compress'
    | 'command'
    | 'plan_ready'
    | 'harness_mode'
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolCallId?: string
  fileDiff?: FileDiff
  fileDiffs?: FileDiff[]
  timestamp?: number
  resultSummary?: string
  resultOutput?: string
  exitCode?: number
  toolStatus?: 'done' | 'error'
  isVerification?: boolean
  approved?: boolean
  error?: string
  approval?: ApprovalRequest
  contextCompress?: ContextCompressInfo
  /** 本地命令：如 clear 清空当前对话 */
  command?: string
  /** 计划模式完成，用户可 Build */
  planDocument?: string
  planFilePath?: string
  /** 当前 Harness 阶段 */
  harnessPhase?: 'normal' | 'plan' | 'build'
  /**
   * 流归属会话。渲染层仅当与 activeConversationId 一致时更新可见 UI，
   * 否则写入该会话缓冲，避免切换会话污染 transcript。
   */
  conversationId?: string
}

/** 首次启动时的默认设置（含内置接入预设，Key 为空待填写） */
export const DEFAULT_SETTINGS: AppSettings = {
  workspacePath: '',
  workspaces: [],
  activeWorkspaceId: '',
  permissionMode: 'sandbox',
  networkMode: 'open',
  workspaceProfile: '',
  providers: builtinProviders(),
  /** 不预选：避免空 Key 被当成当前模型 */
  activeProviderId: '',
  computerUseEnabled: true,
  browserUseEnabled: true,
  uiGlass: 0.82,
  uiTheme: 'light',
  uiFontScale: 1,
  personality: 'pragmatic',
  worktreeKeepCount: 15,
  memoryInjection: true,
  memoryGeneration: true,
  keyboardShortcuts: {},
  followUpBehavior: 'queue',
  requireModEnter: false,
  suggestedPrompts: true,
  reviewDelivery: 'detached',
  gitCommitPrompt: '',
  gitPrPrompt: '',
  turnNotifyMode: 'background',
  preventSleepWhileRunning: false,
  popoutAlwaysOnTop: false,
  approvalNotify: true
}
