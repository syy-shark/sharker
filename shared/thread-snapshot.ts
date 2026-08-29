/**
 * 只读线程快照（对标 Codex 桌面 Share / `/share` 与 Copy as Markdown）。
 * 收录用户可见消息、思考摘要、改文件 diff；不含工具调用 / shell / 工具 I/O。
 * 复制前走已知密钥脱敏；内联 `data:image` 换成占位（对标 Codex #22894）。
 * 不上传。
 * @see shared/ARCH.md
 */
import { redactKnownSecrets } from './secret-redact'
import type { ChatAttachment, ChatMessage, FileDiff, TurnSegment } from './types'
import { extractFinalContent } from './turn-segments'

/** 快照输入：当前已加载尾页 + 可选直播可见段 */
export interface ThreadSnapshotInput {
  title?: string
  conversationId?: string
  messages: ChatMessage[]
  liveSegments?: TurnSegment[]
  /** 尾页之前还有未加载历史（不把头页拼进 messages） */
  truncatedBefore?: boolean
  capturedAt?: string
}

/** 生成结果：可复制 Markdown 与脱敏计数 */
export interface ThreadSnapshotResult {
  markdown: string
  redactedCount: number
  messageCount: number
}

const INLINE_IMAGE_DATA_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

/** Copy as Markdown 不内嵌截图 base64，避免贴到别处卡死（对标 Codex #22894） */
export function replaceInlineImageDataUris(text: string): string {
  return String(text ?? '').replace(INLINE_IMAGE_DATA_RE, '[Image]')
}

/** 从过程段抽出改文件 diff（只要路径与行，不要命令输出） */
export function snapshotFileDiffs(segments: TurnSegment[] | undefined): FileDiff[] {
  if (!segments?.length) return []
  const out: FileDiff[] = []
  const seen = new Set<string>()
  for (const segment of segments) {
    if (segment.kind !== 'tool') continue
    const diffs = [
      ...(segment.fileDiffs ?? []),
      ...(segment.fileDiff ? [segment.fileDiff] : [])
    ]
    for (const diff of diffs) {
      const key = `${diff.path}\0${diff.lines.length}\0${diff.stats.added}\0${diff.stats.removed}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(diff)
    }
  }
  return out
}

function formatDiff(diff: FileDiff): string {
  const lines = [`\`\`\`diff`, `--- ${diff.path}`, `+++ ${diff.path}`]
  for (const row of diff.lines) {
    const mark = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '
    lines.push(`${mark}${row.content}`)
  }
  lines.push('```')
  return lines.join('\n')
}

function attachmentLines(attachments: ChatAttachment[] | undefined): string[] {
  if (!attachments?.length) return []
  const lines: string[] = []
  for (const item of attachments) {
    if (item.kind === 'image') lines.push(`- image: ${item.name}`)
    else lines.push(`- file: ${item.name}`)
  }
  return lines
}

function reasoningSummary(message: ChatMessage): string | null {
  const preview = message.meta?.thinkingPreview?.trim()
  if (preview) return preview
  if (message.meta?.hadThinking) return 'Reasoning summary available in the original thread.'
  const thinking = message.meta?.segments?.find((s) => s.kind === 'thinking' && s.content?.trim())
  if (thinking?.content?.trim()) {
    const clipped = thinking.content.trim().slice(0, 400)
    return clipped.length < thinking.content.trim().length ? `${clipped}…` : clipped
  }
  return null
}

function assistantBody(message: ChatMessage): string {
  const fromSegments = extractFinalContent(message.meta?.segments ?? [])
  const text = (fromSegments || message.content || '').trim()
  return text
}

function formatUser(message: ChatMessage): string {
  const parts = ['### User', '', message.content?.trim() || '']
  const extras = attachmentLines(message.attachments)
  if (extras.length) parts.push('', extras.join('\n'))
  return parts.join('\n').trim()
}

function formatAssistant(message: ChatMessage): string {
  const parts = ['### Assistant']
  const reason = reasoningSummary(message)
  if (reason) {
    parts.push('', '**Reasoning**', '', reason)
  }
  const body = assistantBody(message)
  if (body) parts.push('', body)
  const diffs = snapshotFileDiffs(message.meta?.segments)
  if (diffs.length) {
    parts.push('', '**File changes**', '')
    parts.push(...diffs.map(formatDiff))
  }
  const images = attachmentLines(message.attachments)
  if (images.length) parts.push('', images.join('\n'))
  return parts.join('\n').trim()
}

function formatLive(segments: TurnSegment[]): string | null {
  const thinking = segments.some((s) => s.kind === 'thinking')
  const body = extractFinalContent(segments, { isStreaming: true }).trim()
  const diffs = snapshotFileDiffs(segments)
  if (!thinking && !body && !diffs.length) return null
  const parts = ['### Assistant (live)']
  if (thinking) {
    parts.push('', '**Reasoning**', '', 'Reasoning summary in progress.')
  }
  if (body) parts.push('', body)
  if (diffs.length) {
    parts.push('', '**File changes**', '')
    parts.push(...diffs.map(formatDiff))
  }
  return parts.join('\n').trim()
}

/** 把当前可见线程收成只读 Markdown，并脱敏已知密钥 */
export function formatThreadSnapshot(input: ThreadSnapshotInput): ThreadSnapshotResult {
  const capturedAt = input.capturedAt ?? new Date().toISOString()
  const blocks: string[] = [
    `# ${input.title?.trim() || 'Thread snapshot'}`,
    '',
    input.conversationId ? `- conversation: \`${input.conversationId}\`` : '- conversation: (none)',
    `- captured: ${capturedAt}`,
    '- note: read-only local copy; tool calls, shell commands, and tool I/O are omitted.',
    ''
  ]
  if (input.truncatedBefore) {
    blocks.push(
      '_Older turns are not loaded in this window and are not included._',
      ''
    )
  }

  const live = formatLive(input.liveSegments ?? [])

  let messageCount = 0
  for (const message of input.messages) {
    if (message.role === 'tool') continue
    if (
      live &&
      message.role === 'assistant' &&
      !assistantBody(message) &&
      !reasoningSummary(message) &&
      snapshotFileDiffs(message.meta?.segments).length === 0
    ) {
      continue
    }
    if (message.role === 'user') {
      blocks.push(formatUser(message), '')
      messageCount += 1
      continue
    }
    if (message.role === 'assistant') {
      blocks.push(formatAssistant(message), '')
      messageCount += 1
    }
  }

  if (live) {
    blocks.push(live, '')
    messageCount += 1
  }

  const raw = replaceInlineImageDataUris(blocks.join('\n').trim() + '\n')
  const { text, redactedCount } = redactKnownSecrets(raw)
  return { markdown: text, redactedCount, messageCount }
}
