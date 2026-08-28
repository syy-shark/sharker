/**
 * Composer `!command`：直接跑 shell（对标 Codex TUI / 桌面端）。
 * @see shared/ARCH.md
 */

/** 行首 `!` 后的命令；空或非 bang 返回 null */
export function parseBangCommand(text: string): string | null {
  const raw = text.trim()
  if (!raw.startsWith('!')) return null
  const cmd = raw.slice(1).trim()
  return cmd || null
}
