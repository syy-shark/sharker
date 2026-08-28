/**
 * 界面字号缩放（对标 Codex 桌面端 ⌘+ / ⌘-）。
 * @see shared/ARCH.md
 */

export const UI_FONT_SCALE_MIN = 0.85
export const UI_FONT_SCALE_MAX = 1.35
export const UI_FONT_SCALE_STEP = 0.05
export const UI_FONT_SCALE_DEFAULT = 1

/** 夹到合法档位（0.05 步进） */
export function clampUiFontScale(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return UI_FONT_SCALE_DEFAULT
  const snapped = Math.round(n / UI_FONT_SCALE_STEP) * UI_FONT_SCALE_STEP
  return Math.min(UI_FONT_SCALE_MAX, Math.max(UI_FONT_SCALE_MIN, Number(snapped.toFixed(2))))
}

/** 放大 / 缩小一档 */
export function stepUiFontScale(current: number, delta: 1 | -1): number {
  return clampUiFontScale(current + delta * UI_FONT_SCALE_STEP)
}

/** 设置里展示的百分数 */
export function formatUiFontScale(scale: number): string {
  return `${Math.round(clampUiFontScale(scale) * 100)}%`
}
