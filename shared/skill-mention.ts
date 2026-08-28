/**
 * Composer `$` Skill 引用：对标 Codex `$skill-name`。
 * @see shared/ARCH.md
 */

/** 当前光标处的 $ 查询 */
export interface SkillMentionQuery {
  /** `$` 在全文中的下标 */
  start: number
  /** `$` 后到光标的查询（不含空格） */
  query: string
}

/** 列表里展示的 Skill 摘要（不含正文） */
export interface SkillListItem {
  name: string
  description: string
}

/**
 * 解析光标前最后一个 `$token`。
 * `$` 必须在行首或空白后，避免把 `foo$bar` 当成引用。
 */
export function parseSkillMention(text: string, cursor: number): SkillMentionQuery | null {
  const pos = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, pos)
  const m = /(?:^|[\s])\$([^\s$]*)$/.exec(before)
  if (!m) return null
  const start = before.lastIndexOf('$')
  if (start < 0) return null
  return { start, query: m[1] ?? '' }
}

/**
 * 用选中的 Skill 名替换当前 `$query`，并在后面补一个空格。
 */
export function insertSkillMention(
  text: string,
  cursor: number,
  skillName: string
): { text: string; cursor: number } {
  const mention = parseSkillMention(text, cursor)
  const token = `$${String(skillName || '').trim()}`
  if (!mention) {
    const insertAt = cursor
    const next = `${text.slice(0, insertAt)}${token} ${text.slice(insertAt)}`
    return { text: next, cursor: insertAt + token.length + 1 }
  }
  const after = text.slice(cursor)
  const next = `${text.slice(0, mention.start)}${token}${after.startsWith(' ') ? after : ` ${after}`}`
  return { text: next, cursor: mention.start + token.length + 1 }
}

/** 按名称 / 描述过滤 Skill 列表 */
export function filterSkillMentions(skills: SkillListItem[], query: string): SkillListItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  )
}
