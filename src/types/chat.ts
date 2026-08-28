/**
 * 聊天相关 UI 类型
 * @see src/ARCH.md
 */
import type { ChatAttachment } from '../../shared/types'
import type { SessionQueuedPrompt } from '../../shared/session-runtime'

/** 发送模式：直接发送、排队、注入当前回合（对标 Codex Steer） */
export type PromptSubmitMode = 'send' | 'queue' | 'jump'

/** 排队中的用户消息（尚未派发 IPC；归属 conversationId） */
export type QueuedPrompt = SessionQueuedPrompt

/** 兼容再导出 */
export type { ChatAttachment }
