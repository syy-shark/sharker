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

/** Settings → Git → Review delivery（对标 Codex：默认 Inline 当前对话 / Detached 新线程） */
export type ReviewDelivery = 'inline' | 'detached'

/** 未写或未知值按官方默认 Inline（当前对话） */
export function parseReviewDelivery(raw: unknown): ReviewDelivery {
  return raw === 'detached' ? 'detached' : 'inline'
}

/**
 * `/review` 怎么开下一轮：官方默认当前对话；直播中不 abort。
 * Detached（设置或 `/review detached`）才新开审查线程。
 */
export function reviewSubmitMode(options: {
  detached: boolean
  busy: boolean
  followUp?: unknown
}): 'detach' | 'send' | 'queue' | 'jump' {
  if (options.detached) return 'detach'
  if (!options.busy) return 'send'
  return options.followUp === 'steer' ? 'jump' : 'queue'
}

const REVIEW_INLINE_TOKENS = new Set(['here', 'inline'])
const REVIEW_DETACHED_TOKENS = new Set(['detached', 'new'])
const REVIEW_BRANCH_TOKENS = new Set(['branch', 'base', 'against-base'])
/** 对标 Codex `/review Focus on …`；与 `/goal` 同上限 */
const REVIEW_INSTRUCTIONS_MAX = 4000

/** `/review` 参数：范围 + 是否独立线程 + 剩余自定义关注（设置默认，here/detached 单次覆盖） */
export function parseReviewRequest(
  args: string,
  options?: { delivery?: unknown }
): {
  scope: 'uncommitted' | 'branch' | 'commit'
  commit?: string
  detached: boolean
  instructions: string
} {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  let detached = parseReviewDelivery(options?.delivery) === 'detached'
  let scope: 'uncommitted' | 'branch' | 'commit' = 'uncommitted'
  let commit: string | undefined
  const leftover: string[] = []
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (REVIEW_INLINE_TOKENS.has(lower)) {
      detached = false
      continue
    }
    if (REVIEW_DETACHED_TOKENS.has(lower)) {
      detached = true
      continue
    }
    if (/^[0-9a-f]{7,40}$/i.test(token)) {
      scope = 'commit'
      commit = token
      continue
    }
    if (lower === 'commit') {
      scope = 'commit'
      continue
    }
    if (REVIEW_BRANCH_TOKENS.has(lower)) {
      scope = 'branch'
      continue
    }
    if (lower === 'uncommitted') continue
    leftover.push(token)
  }
  const instructions = leftover.join(' ').slice(0, REVIEW_INSTRUCTIONS_MAX)
  return { scope, commit, detached, instructions }
}

/** 把官方自定义关注接到只读审查提示后面 */
export function withReviewInstructions(base: string, instructions?: string): string {
  const text = String(instructions || '').trim()
  if (!text) return base
  return `${base}\n\n额外关注：${text}`
}

/** 按 `/review` 解析结果拼完整提示（范围 + 可选关注点） */
export function formatReviewPrompt(
  review: ReturnType<typeof parseReviewRequest>
): string {
  const base =
    review.scope === 'commit'
      ? reviewCommitPrompt(review.commit)
      : review.scope === 'branch'
        ? REVIEW_BRANCH_PROMPT
        : REVIEW_WORKING_TREE_PROMPT
  return withReviewInstructions(base, review.instructions)
}

/** `/review` 范围：空/uncommitted → 未提交；branch/base → 相对基线；commit → 指定提交 */
export function parseReviewScope(args: string): 'uncommitted' | 'branch' | 'commit' {
  return parseReviewRequest(args).scope
}
