/**
 * 展开用户消息里的 @chat/<id>，附加有界对话摘要。
 * @see agent/ARCH.md
 */
import { loadConversation } from './memory/conversations'
import { resolveConversationTitle } from '../shared/conversation'
import {
  parseChatMentionIds,
  summarizeMentionedChat
} from '../shared/chat-mention'
import type { ChatMessage } from '../shared/types'

export type ChatMentionLoader = (
  id: string
) => Promise<{ title: string; messages: ChatMessage[] } | null>

export function workspaceChatLoader(
  workspacePath: string,
  workspaceId: string
): ChatMentionLoader {
  return async (id) => {
    const conv = await loadConversation(workspacePath, workspaceId, id)
    if (!conv) return null
    return { title: resolveConversationTitle(conv), messages: conv.messages }
  }
}

/** 附加最多 2 条其它对话的截断摘要；跳过当前线程 */
export async function expandChatReferences(
  userText: string,
  load: ChatMentionLoader,
  currentConversationId?: string
): Promise<string> {
  if (!userText.includes('@chat/')) return userText
  const ids = parseChatMentionIds(userText).filter((id) => id !== currentConversationId)
  if (!ids.length) return userText

  const blocks: string[] = []
  for (const id of ids) {
    try {
      const conv = await load(id)
      if (!conv) continue
      blocks.push(summarizeMentionedChat({ id, title: conv.title, messages: conv.messages }))
    } catch {
      // 单条失败不影响其余引用
    }
  }
  if (!blocks.length) return userText
  return `${userText}\n\n---\n**Attached chats (${blocks.length}):**\n\n${blocks.join('\n\n')}`
}
