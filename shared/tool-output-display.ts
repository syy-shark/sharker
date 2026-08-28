/**
 * 对话里命令/工具输出展示量（对标 Codex developer-settings「how much command output」）。
 * @see shared/ARCH.md
 */

/** 简要：不展开；标准：折叠 + 短尾；详细：完成后默认展开、更长尾 */
export type ToolOutputDisplay = 'brief' | 'standard' | 'verbose'

/** 规范化设置值；缺省或非法为 standard */
export function parseToolOutputDisplay(raw: unknown): ToolOutputDisplay {
  return raw === 'brief' || raw === 'verbose' ? raw : 'standard'
}

const LIMITS: Record<Exclude<ToolOutputDisplay, 'brief'>, { maxChars: number; maxLines: number }> = {
  standard: { maxChars: 1_200, maxLines: 12 },
  verbose: { maxChars: 12_000, maxLines: 80 }
}

/** 截取输出尾部（单段文本，不按行拆节点）；brief 不展示正文 */
export function clipToolOutput(
  text: string,
  mode: ToolOutputDisplay
): { text: string; clipped: boolean } {
  if (mode === 'brief') return { text: '', clipped: Boolean(String(text || '').trim()) }
  const src = String(text || '')
  if (!src) return { text: '', clipped: false }
  const { maxChars, maxLines } = LIMITS[mode]
  const lines = src.split('\n')
  let out = src
  let clipped = false
  if (lines.length > maxLines) {
    out = lines.slice(-maxLines).join('\n')
    clipped = true
  }
  if (out.length > maxChars) {
    out = out.slice(-maxChars)
    clipped = true
  }
  return { text: out, clipped }
}

/** 详细档且步骤已结束时默认展开；直播中仍折叠以免贴底跳动 */
export function shouldExpandToolOutput(
  mode: ToolOutputDisplay,
  status: string,
  opts?: { isStreaming?: boolean }
): boolean {
  if (opts?.isStreaming) return false
  return mode === 'verbose' && status !== 'active'
}

/**
 * 直播中不挂「查看输出」：工具一完成就冒出 summary 会顶过程区，
 * 正文上屏后又被藏掉（对标 Codex Desktop 把 command output 收在展开控件后，
 * developer-settings「how much command output」/ #19260）。
 */
export function shouldMountToolOutputDetails(options: {
  mode: ToolOutputDisplay
  hasDistinctOutput: boolean
  isStreaming?: boolean
}): boolean {
  if (!options.hasDistinctOutput) return false
  if (options.mode === 'brief') return false
  if (options.isStreaming) return false
  return true
}

/** 直播中不挂退出码：工具一结束就多一行会顶过程区，收束后点开「工作了」再看 */
export function shouldMountToolExitCode(options: {
  exitCode: number | null | undefined
  isStreaming?: boolean
}): boolean {
  if (options.exitCode == null) return false
  if (options.isStreaming) return false
  return true
}

const PROGRESS_SUMMARY =
  /^(已启动|执行中|运行中|处理中)|执行中…\s*\d+s|·\s*\d+s$/

/** 「执行中… Ns」一类秒表心跳：只走预留宽时钟，不进过程行 / 直播头 */
export function isToolProgressSummary(text: string | null | undefined): boolean {
  const value = String(text || '').trim()
  return Boolean(value) && PROGRESS_SUMMARY.test(value)
}

/**
 * 直播中不挂结果摘要：「执行中… Ns」每秒更新还会另起一行顶过程区。
 * 进度只留在直播头秒表；收束后点开「工作了」再看真正摘要。
 */
export function shouldMountToolResultSummary(options: {
  summary?: string | null
  detail?: string | null
  status?: string
  isStreaming?: boolean
  isDemo?: boolean
}): boolean {
  if (options.isDemo || options.status === 'error') return false
  const summary = String(options.summary || '').trim()
  if (!summary) return false
  if (summary === String(options.detail || '').trim()) return false
  if (/^(L\d+:|[{}\[\]]|```)/.test(summary)) return false
  if (options.isStreaming) return false
  return !isToolProgressSummary(summary)
}

/**
 * 过程行 / 直播头 detail：秒表心跳与标题里已有的 path/command 都不另起一行
 * （对标 Codex #19260：进度只留预留宽时钟，不闪第二行）。
 */
export function shouldMountToolStepDetail(options: {
  detail?: string | null
  title?: string | null
  isStreaming?: boolean
}): boolean {
  const detail = String(options.detail || '').trim()
  if (!detail) return false
  if (isToolProgressSummary(detail)) return false
  const title = String(options.title || '')
  if (title && title.includes(detail)) return false
  return true
}
