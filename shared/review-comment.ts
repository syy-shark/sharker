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

/** 把评论收成只读修改指令（对标 Codex：评论后回线程发送） */
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
