/**
 * 直播行滚出视口时停扫光（对标 Codex #16857 屏外思考指示器仍占 GPU）。
 * @see src/hooks/ARCH.md
 */
import { useEffect, useRef } from 'react'
import { observeOffscreenLiveShimmer } from '../../shared/live-shimmer-pause'

/** 挂在直播过程容器上；`active` 为假时不观察 */
export function useOffscreenLiveShimmer<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    return observeOffscreenLiveShimmer(el)
  }, [active])
  return ref
}
