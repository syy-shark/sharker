/**
 * 跨进程核心 TypeScript 类型与默认设置。
 * 详见 shared/README.md
 */
/** 文件访问权限：沙箱（仅工作区）或完整访问 */
export type PermissionMode = 'sandbox' | 'full'

/** OpenAI 兼容 API 提供商配置 */
export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  /** 上下文 token 上限；不填则按模型 ID 自动识别 */
  contextWindow?: number
}

/** 侧栏工作区条目 */
export interface WorkspaceItem {
  id: string
  path: string
  label: string
  isHome?: boolean
  pinned?: boolean
}

/** 应用全局设置（工作区、模型、权限、Skill） */
export interface AppSettings {
  /** @deprecated 由 workspaces + activeWorkspaceId 派生，保存时同步 */
  workspacePath: string
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  permissionMode: PermissionMode
  providers: ProviderConfig[]
  activeProviderId: string
  skillRepoUrls: string[]
}

/** 聊天消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** 单轮助手活动记录（技能/工具/压缩） */
export interface TurnActivity {
  kind: 'skill' | 'tool' | 'compress'
  label: string
}

/** 一回合有序片段类型：思考 / 旁白文字 / 工具步骤 */
export type TurnSegmentKind = 'thinking' | 'text' | 'tool'

/** 片段状态（工具步骤进行中/完成/失败） */
export type TurnSegmentStatus = 'active' | 'done' | 'error'

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

/** 工具执行结果：文本输出 + 可选 diff 元数据 */
export interface ToolRunResult {
  output: string
  fileDiff?: FileDiff
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
  /** tool: 文件名 / 命令摘要 */
  toolDetail?: string
  status?: TurnSegmentStatus
  /** text: 中途旁白 vs 最终回答 */
  role?: TurnTextRole
  /** skill / compress 等元片段标题 */
  metaTitle?: string
  /** 编辑类工具完成后的行级 diff */
  fileDiff?: FileDiff
}

/** 助手消息的元信息（耗时、浏览文件、活动列表） */
export interface AssistantMeta {
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
}

/** 单条聊天消息 */
export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
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
    | 'done'
    | 'error'
    | 'approval_needed'
    | 'context_compress'
    | 'command'
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolCallId?: string
  fileDiff?: FileDiff
  skillNames?: string[]
  error?: string
  approval?: ApprovalRequest
  contextCompress?: ContextCompressInfo
  /** 本地命令：如 clear 清空当前对话 */
  command?: string
}

/** 已加载 Skill 的元数据与正文 */
export interface SkillInfo {
  name: string
  description: string
  path: string
  body: string
}

/** 首次启动时的默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  workspacePath: '',
  workspaces: [],
  activeWorkspaceId: '',
  permissionMode: 'sandbox',
  providers: [
    {
      id: 'default',
      name: 'OpenAI Compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini'
    }
  ],
  activeProviderId: 'default',
  skillRepoUrls: []
}
