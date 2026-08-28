/**
 * 集成终端快照：去 ANSI、环形缓冲、给模型看的文案。
 * 对标 Codex read_thread_terminal / “Let Codex inspect terminal output”。
 * @see shared/ARCH.md
 */

export const TERMINAL_BUFFER_LIMIT = 64 * 1024
export const DEFAULT_TERMINAL_READ_CHARS = 8000

/** 去掉 CSI / 单字符 ESC 序列，方便模型读日志 */
export function stripAnsi(text: string): string {
  return String(text ?? '').replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

export function appendTerminalBuffer(
  prev: string,
  chunk: string,
  limit = TERMINAL_BUFFER_LIMIT
): string {
  const next = `${prev}${chunk}`
  const cap = limit > 0 ? limit : TERMINAL_BUFFER_LIMIT
  if (next.length <= cap) return next
  const cut = next.slice(next.length - cap)
  const nl = cut.indexOf('\n')
  return nl > 0 && nl < 256 ? cut.slice(nl + 1) : cut
}

export function formatThreadTerminalSnapshot(options: {
  attached: boolean
  cwd?: string
  tabs?: Array<{ title: string; active: boolean }>
  output?: string
  maxChars?: number
}): string {
  if (!options.attached || !options.tabs?.length) {
    return '当前对话还没有打开集成终端。用户可在右侧打开终端，或用 run_terminal_cmd 执行命令。'
  }
  const active = options.tabs.find((tab) => tab.active) ?? options.tabs[0]
  const names = options.tabs
    .map((tab) => (tab.active ? `「${tab.title}」` : tab.title))
    .join(' · ')
  const raw = options.maxChars
  const max =
    raw != null && Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_TERMINAL_READ_CHARS
  const body = stripAnsi(options.output ?? '').replace(/\s+$/g, '')
  const clipped = body.length > max ? body.slice(-max) : body
  const head = [
    `集成终端 · 当前 ${active?.title ?? '终端'}（共 ${options.tabs.length} 个：${names}）`,
    options.cwd ? `cwd: ${options.cwd}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  return clipped ? `${head}\n\n${clipped}` : `${head}\n\n（尚无输出）`
}
