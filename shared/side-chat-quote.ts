/**
 * 对话划选 → 旁路提问：对标 Codex desktop「Ask in side chat」。
 * @see shared/ARCH.md
 */

export const SIDE_CHAT_SELECTION_MAX = 2000

/** 去掉首尾空白，折叠多余空行，超长截断 */
export function normalizeTranscriptSelection(text: string): string {
  const trimmed = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!trimmed) return ''
  if (trimmed.length <= SIDE_CHAT_SELECTION_MAX) return trimmed
  return `${trimmed.slice(0, SIDE_CHAT_SELECTION_MAX).trimEnd()}\n…`
}

export const SIDE_CHAT_COMPOSER_SEL =
  'textarea, input, [contenteditable="true"], .composer-box, .chat-find'
export const SIDE_CHAT_LIVE_ROW_SEL = '.message-row--live'
export const SIDE_CHAT_TRANSCRIPT_SEL =
  '.message-row, .message-body, .streaming-markdown, .live-prose-tail'

/** 用 closest 判定：输入框 / 查找栏 / 直播行不要条，历史消息行要 */
export function shouldOfferSideChat(closest: (selector: string) => unknown): boolean {
  if (closest(SIDE_CHAT_COMPOSER_SEL)) return false
  if (closest(SIDE_CHAT_LIVE_ROW_SEL)) return false
  return Boolean(closest(SIDE_CHAT_TRANSCRIPT_SEL))
}

/** 划选是否落在对话正文（不要输入框 / 查找栏 / 直播行） */
export function isTranscriptSelectionRange(range: AbstractRange, root: ParentNode): boolean {
  const node = range.commonAncestorContainer
  if (!root.contains(node)) return false
  const el = node instanceof Element ? node : node.parentElement
  if (!el) return false
  return shouldOfferSideChat((selector) => el.closest(selector))
}

/**
 * 旁路线程首条提示：摘录作上下文。
 * 有问题时把问题放在前面；无问题则请模型概括并指出风险，先不改仓库。
 */
export function formatSideChatPrompt(selection: string, question = ''): string {
  const excerpt = normalizeTranscriptSelection(selection)
  if (!excerpt) return question.trim()
  const quoted = excerpt
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  const ask = question.trim()
  if (ask) return `${ask}\n\n对话摘录：\n\n${quoted}`
  return `关于这段对话摘录：\n\n${quoted}\n\n请说明要点并指出明显风险。先不要改文件。`
}
