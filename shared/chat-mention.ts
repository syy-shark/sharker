/**
 * Composer `@chat/<id>` 引用其它对话（对标 Codex @ chats）。
 * 只注入截断摘要，避免整段大对话拖垮上下文。
 * @see shared/ARCH.md
 */
import { filterChatList } from './conversation'

export const CHAT_MENTION_PREFIX = 'chat/'
export const MAX_CHAT_MENTIONS = 2
export const MAX_CHAT_MENTION_MESSAGES = 6
export const MAX_CHAT_MENTION_CHARS = 4000
const MAX_CHAT_MENTION_LINE = 600
const MAX_CHAT_PICKS = 5

/** `@chat/<id>` */
export function chatMentionToken(id: string): string {
  return `${CHAT_MENTION_PREFIX}${String(id || '').trim()}`
}

/** 从用户输入收集对话引用（最多 2 条） */
export function parseChatMentionIds(text: string): string[] {
  const ids: string[] = []
  const re = /@chat\/([A-Za-z0-9_-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(text || ''))) !== null) {
    const id = m[1]
    if (!id || ids.includes(id)) continue
    ids.push(id)
    if (ids.length >= MAX_CHAT_MENTIONS) break
  }
  return ids
}

/** 提及菜单：排除当前线程，query 可带 `chat/` 前缀 */
export function filterChatMentions<T extends { id: string; title?: string }>(
  items: T[],
  query: string,
  excludeId?: string | null
): T[] {
  const raw = String(query || '').trim()
  const q = raw.replace(/^chat\/?/i, '')
  return filterChatList(items, q)
    .filter((c) => c.id !== excludeId)
    .slice(0, MAX_CHAT_PICKS)
}

/** 给模型的有界摘要：最近若干条 user/assistant，总长封顶 */
export function summarizeMentionedChat(options: {
  id: string
  title: string
  messages: Array<{ role: string; content: string }>
}): string {
  const title = String(options.title || '').replace(/\s+/g, ' ').trim() || '对话'
  const lines = [`### Chat ${title} (${options.id})`]
  let used = lines[0].length
  const recent = options.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_CHAT_MENTION_MESSAGES)
  for (const m of recent) {
    const body = String(m.content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CHAT_MENTION_LINE)
    if (!body) continue
    const line = `- ${m.role}: ${body}`
    if (used + line.length + 1 > MAX_CHAT_MENTION_CHARS) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}
