/**
 * 直播 token 外部 store：16ms flush 只通知订阅者，不抬 ChatView。
 * 对标 Codex #22860：已画历史列不应跟每枚 token 重绘。
 * @see src/hooks/ARCH.md
 */
import { useCallback, useSyncExternalStore } from 'react'
import {
  EMPTY_LIVE_STREAM_UI,
  nextLiveStreamUi,
  type LiveStreamUiSnapshot
} from '../../shared/live-stream-ui'

let snapshot: LiveStreamUiSnapshot = EMPTY_LIVE_STREAM_UI
const listeners = new Set<() => void>()

/** 当前直播快照（渲染进程单例） */
export function getLiveStreamUi(): LiveStreamUiSnapshot {
  return snapshot
}

/** 写入直播快照；字段没变则不通知 */
export function publishLiveStreamUi(
  patch: Partial<LiveStreamUiSnapshot>
): LiveStreamUiSnapshot {
  const next = nextLiveStreamUi(snapshot, patch)
  if (next === snapshot) return snapshot
  snapshot = next
  for (const notify of listeners) notify()
  return snapshot
}

/** 清成空闲快照（收束 / 切对话） */
export function resetLiveStreamUi(): void {
  publishLiveStreamUi(EMPTY_LIVE_STREAM_UI)
}

/** 订阅直播快照 */
export function subscribeLiveStreamUi(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** 直播行 / 未读芯片：跟 token 走 */
export function useLiveStreamUi(): LiveStreamUiSnapshot {
  return useSyncExternalStore(subscribeLiveStreamUi, getLiveStreamUi, getLiveStreamUi)
}

/**
 * 仅在启用时订阅。查找关闭时不要跟 token 抬父树。
 */
export function useLiveStreamUiWhen(enabled: boolean): LiveStreamUiSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {}
      return subscribeLiveStreamUi(onStoreChange)
    },
    [enabled]
  )
  return useSyncExternalStore(subscribe, getLiveStreamUi, getLiveStreamUi)
}
