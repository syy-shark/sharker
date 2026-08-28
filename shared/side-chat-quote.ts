/**
 * 对话 / 终端 / 文件预览划选 → 旁路提问或插入输入框。
 * 对标 Codex desktop「Ask in side chat」与「Send transcript selections to the composer」。
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
export const FILE_PREVIEW_SEL =
  '.file-tree-viewer-body, .file-tree-viewer-line, .file-tree-viewer-text'

/** 用 closest 判定：输入框 / 查找栏 / 直播行不要条，历史消息行要 */
export function shouldOfferSideChat(closest: (selector: string) => unknown): boolean {
  if (closest(SIDE_CHAT_COMPOSER_SEL)) return false
  if (closest(SIDE_CHAT_LIVE_ROW_SEL)) return false
  return Boolean(closest(SIDE_CHAT_TRANSCRIPT_SEL))
}

/** 文件预览正文划选（对标 Codex Project Preview selection actions） */
export function shouldOfferFilePreviewSelection(closest: (selector: string) => unknown): boolean {
  if (closest(SIDE_CHAT_COMPOSER_SEL)) return false
  return Boolean(closest(FILE_PREVIEW_SEL))
}

/** 划选是否落在对话正文（不要输入框 / 查找栏 / 直播行） */
export function isTranscriptSelectionRange(range: AbstractRange, root: ParentNode): boolean {
  const node = range.commonAncestorContainer
  if (!root.contains(node)) return false
  const el = node instanceof Element ? node : node.parentElement
  if (!el) return false
  return shouldOfferSideChat((selector) => el.closest(selector))
}

/** 划选是否落在文件预览正文 */
export function isFilePreviewSelectionRange(range: AbstractRange, root: ParentNode): boolean {
  const node = range.commonAncestorContainer
  if (!root.contains(node)) return false
  const el = node instanceof Element ? node : node.parentElement
  if (!el) return false
  return shouldOfferFilePreviewSelection((selector) => el.closest(selector))
}

export type SideChatSource = 'transcript' | 'terminal' | 'file'

function excerptLabel(source: SideChatSource): string {
  if (source === 'terminal') return '终端输出'
  if (source === 'file') return '文件摘录'
  return '对话摘录'
}

function quoteExcerpt(excerpt: string): string {
  return excerpt
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

/**
 * 旁路线程首条提示：摘录作上下文。
 * 有问题时把问题放在前面；无问题则请模型概括并指出风险，先不改仓库。
 */
export function formatSideChatPrompt(
  selection: string,
  question = '',
  source: SideChatSource = 'transcript'
): string {
  const excerpt = normalizeTranscriptSelection(selection)
  if (!excerpt) return question.trim()
  const quoted = quoteExcerpt(excerpt)
  const ask = question.trim()
  const label = excerptLabel(source)
  if (ask) return `${ask}\n\n${label}：\n\n${quoted}`
  return `关于这段${label}：\n\n${quoted}\n\n请说明要点并指出明显风险。先不要改文件。`
}

/** 当前输入框：只塞引用块，不带旁路指令（对标 Codex send selection to composer） */
export function formatComposerInsert(
  selection: string,
  source: SideChatSource = 'transcript'
): string {
  const excerpt = normalizeTranscriptSelection(selection)
  if (!excerpt) return ''
  return `${excerptLabel(source)}：\n\n${quoteExcerpt(excerpt)}`
}

/** 划选插入：接在现有草稿后面，不覆盖未发送内容 */
export function mergeComposerInsert(existing: string, insert: string): string {
  const cur = String(existing ?? '').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '')
  const add = String(insert ?? '').trim()
  if (!add) return String(existing ?? '')
  if (!cur) return add
  return `${cur}\n\n${add}`
}

/** 浮动条贴在划选下方，给双按钮留左右边距 */
export function placeSelectionAskBar(
  rect: { top: number; bottom: number; left: number; width: number },
  box: { top: number; bottom: number; left: number; right: number }
): { top: number; left: number } {
  return {
    top: Math.min(rect.bottom + 8, box.bottom - 36),
    left: Math.min(Math.max(rect.left + rect.width / 2, box.left + 72), box.right - 72)
  }
}
