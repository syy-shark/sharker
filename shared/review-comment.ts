/**
 * 审查行内评论：锚定到 diff 行，再派发给 Agent。
 * @see shared/ARCH.md
 */

/** 一条行内审查评论 */
export interface ReviewLineComment {
  id: string
  path: string
  /** 新文件行号（add/ctx）或旧行号（del） */
  line: number
  side: 'old' | 'new'
  content: string
  text: string
}

/** 从助手 `/review` 正文解析行内发现（对标 Codex 写回 diff） */
export function parseReviewFindings(markdown: string): ReviewLineComment[] {
  const text = String(markdown || '')
  const findings: ReviewLineComment[] = []
  const seen = new Set<string>()
  const push = (row: {
    path?: unknown
    line?: unknown
    side?: unknown
    content?: unknown
    text?: unknown
    message?: unknown
  }) => {
    const path = String(row.path || '').trim().replaceAll('\\', '/')
    const line = Number(row.line)
    const note = String(row.text || row.message || '').trim()
    if (!path || path.includes('..') || !Number.isFinite(line) || line < 1 || !note) return
    const key = `${path}:${line}:${note}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push({
      id: `finding-${findings.length}-${path}:${line}`,
      path,
      line,
      side: row.side === 'old' ? 'old' : 'new',
      content: String(row.content || ''),
      text: note
    })
  }

  const fence = /```review-findings\s*([\s\S]*?)```/i.exec(text)
  if (fence) {
    try {
      const data = JSON.parse(fence[1].trim()) as unknown
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row && typeof row === 'object') push(row as Record<string, unknown>)
        }
      }
    } catch {
      // 围栏损坏时再试标题格式
    }
  }

  const heading = /^###\s+(\S+):(\d+)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = heading.exec(text))) {
    const after = text.slice(m.index + m[0].length)
    const next = after.split(/\n###\s+/)[0] ?? ''
    const note = next
      .split('\n')
      .map((l) => l.replace(/^>\s?/, '').trim())
      .filter((l) => l && !l.startsWith('```'))
      .join(' ')
      .trim()
    push({ path: m[1], line: Number(m[2]), text: note })
  }
  return findings
}

/** 把评论收成跟进草稿（对标 Codex：评论留在 diff，用户再发消息，不自动开一轮） */
export function formatReviewCommentsPrompt(comments: ReviewLineComment[]): string {
  const body = comments
    .map((c) => {
      const loc = `${c.path}:${c.line}`
      const snippet = c.content.trim() ? `\n> ${c.content.trim()}` : ''
      return `### ${loc}\n${c.text.trim()}${snippet}`
    })
    .join('\n\n')
  return `请根据审查行内评论修改，保持范围最小，不要改评论未提到的地方。\n\n${body}`
}
