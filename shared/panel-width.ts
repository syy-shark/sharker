/**
 * 右侧面板 / 文件树宽度：按窗口比例记忆，窗口缩放后仍占相近比例。
 * 对标 Codex changelog percentage-based file tree resizing。
 * @see shared/ARCH.md
 */

export function clampPanelWidth(
  px: number,
  viewport: number,
  min: number,
  max: number
): number {
  const view = Math.max(1, viewport)
  const cap = Math.min(max, Math.max(min, view - 1))
  return Math.min(cap, Math.max(min, Math.round(px)))
}

export function panelWidthToRatio(px: number, viewport: number): number {
  const view = Math.max(1, viewport)
  return Math.min(0.8, Math.max(0.12, px / view))
}

export function panelWidthFromRatio(
  ratio: number,
  viewport: number,
  min: number,
  max: number
): number {
  const r = Number.isFinite(ratio) ? ratio : 0
  return clampPanelWidth(r * viewport, viewport, min, max)
}

/** 同键兼容旧像素：`<= 1` 当比例，否则当像素再换成比例。 */
export function parseStoredPanelWidth(
  saved: string | null,
  viewport: number,
  min: number,
  max: number,
  fallbackPx: number
): number {
  const n = Number(saved)
  if (!Number.isFinite(n) || n <= 0) {
    return clampPanelWidth(fallbackPx, viewport, min, max)
  }
  if (n <= 1) return panelWidthFromRatio(n, viewport, min, max)
  return clampPanelWidth(n, viewport, min, max)
}

export function serializePanelWidthRatio(px: number, viewport: number): string {
  return String(panelWidthToRatio(px, viewport))
}
