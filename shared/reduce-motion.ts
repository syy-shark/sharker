/**
 * 官方桌面 Settings → Appearance Reduce Motion（对标 Codex #16857 / #22787）。
 * 关掉直播思考扫光，减轻 GPU；进度圈仍转。
 * @see shared/ARCH.md
 */

/** 官方设置项名 */
export const REDUCE_MOTION_LABEL = 'Reduce Motion'

/** 只认布尔 true；缺省与官方一样关 */
export function parseReduceMotion(raw: unknown): boolean {
  return raw === true
}
