/**
 * Composer `@` 文件引用：从光标处解析正在输入的 mention。
 * @see shared/ARCH.md
 */

/** Official developer-commands: Type `@` to search for a file in the workspace. */
export const TYPE_AT_TO_SEARCH_LABEL =
  'Type @ to search for a file in the workspace and add its path to the prompt.'

export type ComposerMentionKind = 'file' | 'skill' | 'chat'

/**
 * Official `@` search surfaces files before threads (Codex #31230 expected).
 * Skills stay between files and recent chats.
 */
export function orderComposerMentionHits<T extends { kind: ComposerMentionKind }>(
  files: T[],
  skills: T[],
  chats: T[]
): T[] {
  return [...files, ...skills, ...chats]
}

/** 当前光标处的 @ 查询 */
export interface AtMentionQuery {
  /** `@` 在全文中的下标 */
  start: number
  /** `@` 后到光标的查询（不含空格） */
  query: string
}

/**
 * 解析光标前最后一个 `@token`。
 * `@` 必须在行首或空白后，避免把 `user@host` 当成引用。
 */
export function parseAtMention(text: string, cursor: number): AtMentionQuery | null {
  const pos = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, pos)
  const m = /(?:^|[\s])@([^\s@]*)$/.exec(before)
  if (!m) return null
  const start = before.lastIndexOf('@')
  if (start < 0) return null
  return { start, query: m[1] ?? '' }
}

/**
 * 用选中的相对路径替换当前 `@query`，并在后面补一个空格。
 */
export function insertAtMention(
  text: string,
  cursor: number,
  relativePath: string
): { text: string; cursor: number } {
  const mention = parseAtMention(text, cursor)
  const token = `@${relativePath.replaceAll('\\', '/')}`
  if (!mention) {
    const insertAt = cursor
    const next = `${text.slice(0, insertAt)}${token} ${text.slice(insertAt)}`
    return { text: next, cursor: insertAt + token.length + 1 }
  }
  const after = text.slice(cursor)
  const next = `${text.slice(0, mention.start)}${token}${after.startsWith(' ') ? after : ` ${after}`}`
  return { text: next, cursor: mention.start + token.length + 1 }
}
