/**
 * 直播 token 快照：引用没变则复用同一对象，供外部 store 订阅。
 * @see shared/ARCH.md
 */
import type { TurnSegment } from './types'

/** 对话柱直播行当前可画内容（不含回合开关） */
export interface LiveStreamUiSnapshot {
  streaming: string
  liveSegments: TurnSegment[]
  turnThinking: string
  activeTool: string | null
}

/** 空闲快照：收束 / 切走对话后写回 */
export const EMPTY_LIVE_STREAM_UI: LiveStreamUiSnapshot = {
  streaming: '',
  liveSegments: [],
  turnThinking: '',
  activeTool: null
}

/** 四字段都相同则视为同一帧（片段用引用比较） */
export function sameLiveStreamUi(
  left: LiveStreamUiSnapshot,
  right: LiveStreamUiSnapshot
): boolean {
  return (
    left.streaming === right.streaming &&
    left.liveSegments === right.liveSegments &&
    left.turnThinking === right.turnThinking &&
    left.activeTool === right.activeTool
  )
}

/** 合并补丁；没有变化则退回 prev，避免订阅者无意义重绘 */
export function nextLiveStreamUi(
  prev: LiveStreamUiSnapshot,
  patch: Partial<LiveStreamUiSnapshot>
): LiveStreamUiSnapshot {
  const next: LiveStreamUiSnapshot = {
    streaming: patch.streaming ?? prev.streaming,
    liveSegments: patch.liveSegments ?? prev.liveSegments,
    turnThinking: patch.turnThinking ?? prev.turnThinking,
    activeTool: patch.activeTool !== undefined ? patch.activeTool : prev.activeTool
  }
  return sameLiveStreamUi(prev, next) ? prev : next
}
