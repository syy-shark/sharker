/**
 * `/review` 派发给 Agent 的只读审查提示（对标 Codex /review）。
 * @see shared/ARCH.md
 */

/** 要求模型把发现写成可挂到 diff 行上的围栏 */
const REVIEW_FINDINGS_TAIL =
  '最后必须单独输出一个围栏（不要套在其它代码块里），没有问题则输出空数组：\n\n```review-findings\n[{"path":"相对路径","line":12,"side":"new","text":"一条优先发现"}]\n```\n\n正文仍用中文写给人看的评审。'

/** 审查未提交工作区变更：只读、不改文件、不 commit */
export const REVIEW_WORKING_TREE_PROMPT =
  `请审查当前工作区未提交的 git 变更（含未跟踪文件）。只做只读审查：指出问题、风险、遗漏测试与可改进处。不要修改文件，不要 commit。先用 git 工具查看 status 与 diff，再给出结构化评审。\n\n${REVIEW_FINDINGS_TAIL}`

/** 审查相对基线分支的已提交变更（对标 Codex Review against a base branch） */
export const REVIEW_BRANCH_PROMPT =
  `请审查当前分支相对基线（origin/HEAD，否则 main/master）的已提交变更（git diff base...HEAD）。只做只读审查：指出问题、风险、遗漏测试与可改进处。不要修改文件，不要 commit。先确认基线再看 name-status 与关键 diff，再给出结构化评审。\n\n${REVIEW_FINDINGS_TAIL}`

/** 审查指定 commit（对标 Codex Review a commit）；默认 HEAD */
export function reviewCommitPrompt(sha?: string): string {
  const target = (sha || 'HEAD').trim() || 'HEAD'
  return `请审查 git commit ${target} 的变更（git show ${target}）。只做只读审查：指出问题、风险、遗漏测试与可改进处。不要修改文件，不要 commit。先看 name-status 与关键 diff，再给出结构化评审。\n\n${REVIEW_FINDINGS_TAIL}`
}

/** Settings → Git → Review delivery（对标 Codex：Inline 当前对话 / Detached 新线程） */
export type ReviewDelivery = 'inline' | 'detached'

export function parseReviewDelivery(raw: unknown): ReviewDelivery {
  return raw === 'inline' ? 'inline' : 'detached'
}

/** `/review` 参数：范围 + 是否独立线程（设置默认，here/detached 单次覆盖） */
export function parseReviewRequest(
  args: string,
  options?: { delivery?: unknown }
): {
  scope: 'uncommitted' | 'branch' | 'commit'
  commit?: string
  detached: boolean
} {
  const tokens = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  let detached = parseReviewDelivery(options?.delivery) === 'detached'
  if (tokens.includes('here') || tokens.includes('inline')) detached = false
  if (tokens.includes('detached') || tokens.includes('new')) detached = true
  const sha = tokens.find((t) => /^[0-9a-f]{7,40}$/i.test(t))
  if (tokens.includes('commit') || sha) {
    return { scope: 'commit', commit: sha, detached }
  }
  const scope = tokens.some((t) => t === 'branch' || t === 'base' || t === 'against-base')
    ? 'branch'
    : 'uncommitted'
  return { scope, detached }
}

/** `/review` 范围：空/uncommitted → 未提交；branch/base → 相对基线；commit → 指定提交 */
export function parseReviewScope(args: string): 'uncommitted' | 'branch' | 'commit' {
  return parseReviewRequest(args).scope
}
