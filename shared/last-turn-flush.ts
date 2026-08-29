/**
 * 审查「本轮」路径刷到 React 的时机。
 * 直播写盘只更新 ref + 直播 store；审查列表跟 `bumpChangesSoon` 一样节流，避免每文件抬 App。
 * @see shared/ARCH.md
 */

export const LAST_TURN_UI_FLUSH_MS = 400

/** 进行中的写盘推迟审查列表；收束 / 切会话立刻刷 */
export function shouldDeferLastTurnUi(live: boolean, immediate?: boolean): boolean {
  return live && immediate !== true
}
