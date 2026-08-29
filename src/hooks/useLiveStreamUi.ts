/**
 * 直播 token / 回合元信息外部 store：16ms flush 与工具心跳只通知订阅者，不抬 ChatView。
 * `useLiveStreamUiSelectWhen` 给查找只订 `streaming`，并给历史列在预留行入列后才订直播体布尔（对标 Codex #22860 / #33907）。
 * 对标 Codex #22860：已画历史列不应跟每枚 token / 工具心跳重绘。
 * @see src/hooks/ARCH.md
 */
import { useCallback, useRef, useSyncExternalStore } from 'react'
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
 * 只订切片。getSnapshot 返回同一引用则不重绘（过程区不跟 token）。
 * select 第二参是上一帧选中值，便于 reuseAnswerParts。
 */
export function useLiveStreamUiSelect<T>(
  select: (snap: LiveStreamUiSnapshot, prev: T | undefined) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
): T {
  const selectRef = useRef(select)
  const equalRef = useRef(isEqual)
  selectRef.current = select
  equalRef.current = isEqual
  const cache = useRef<{ snap: LiveStreamUiSnapshot; value: T } | null>(null)

  const getSelected = () => {
    const snap = getLiveStreamUi()
    const hit = cache.current
    if (hit && hit.snap === snap) return hit.value
    const next = selectRef.current(snap, hit?.value)
    if (hit && equalRef.current(hit.value, next)) {
      cache.current = { snap, value: hit.value }
      return hit.value
    }
    cache.current = { snap, value: next }
    return next
  }

  return useSyncExternalStore(subscribeLiveStreamUi, getSelected, getSelected)
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

/**
 * 启用时只订切片。查找开着也不要跟思考 / 过程片段抬对话柱（对标 Codex #22860 / #33907）。
 */
export function useLiveStreamUiSelectWhen<T>(
  enabled: boolean,
  select: (snap: LiveStreamUiSnapshot, prev: T | undefined) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
): T {
  const selectRef = useRef(select)
  const equalRef = useRef(isEqual)
  selectRef.current = select
  equalRef.current = isEqual
  const cache = useRef<{ enabled: boolean; snap: LiveStreamUiSnapshot; value: T } | null>(null)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {}
      return subscribeLiveStreamUi(onStoreChange)
    },
    [enabled]
  )

  const getSelected = () => {
    const snap = enabled ? getLiveStreamUi() : EMPTY_LIVE_STREAM_UI
    const hit = cache.current
    if (hit && hit.enabled === enabled && hit.snap === snap) return hit.value
    const prev = hit && hit.enabled === enabled ? hit.value : undefined
    const next = selectRef.current(snap, prev)
    if (hit && hit.enabled === enabled && equalRef.current(hit.value, next)) {
      cache.current = { enabled, snap, value: hit.value }
      return hit.value
    }
    cache.current = { enabled, snap, value: next }
    return next
  }

  return useSyncExternalStore(subscribe, getSelected, getSelected)
}
