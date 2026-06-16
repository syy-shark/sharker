/**
 * 聊天相关 UI 类型
 * @see src/README.md
 */

/** 发送模式：直接发送、排队、插队 */
export type PromptSubmitMode = 'send' | 'queue' | 'jump'

/** 排队中的用户消息（尚未派发 IPC） */
export interface QueuedPrompt {
  id: string
  text: string
}
