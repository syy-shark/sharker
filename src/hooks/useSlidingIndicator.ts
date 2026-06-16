/**
 * 滑动高亮指示器定位 Hook（侧栏导航、对话列表）
 * @see src/README.md
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from 'react'

/** 滑动指示器的定位矩形 */
export type SlideRect = {
  top: number
  left: number
  width: number
  height: number
  ready: boolean
}

/** useSlidingIndicator 可选配置 */
type SlidingIndicatorOptions = {
  /** 侧栏展开/收起等布局动画期间：每帧重测、不做 CSS 过渡 */
  animating?: boolean
  /** 为 false 时不测量（例如当前视图未挂载对应导航） */
  enabled?: boolean
}

/** 跟踪 activeKey 对应元素位置，供滑动高亮指示器使用 */
export function useSlidingIndicator(
  activeKey: string,
  containerRef: RefObject<HTMLElement | null>,
  getItemEl: (key: string) => HTMLElement | null | undefined,
  layoutDeps: unknown[] = [],
  options: SlidingIndicatorOptions = {}
): SlideRect {
  const { animating = false, enabled = true } = options
  const [rect, setRect] = useState<SlideRect>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    ready: false
  })
  const rafRef = useRef<number | null>(null)

  const measure = useCallback(() => {
    if (!enabled) return
    const container = containerRef.current
    const el = getItemEl(activeKey)
    if (!container || !el) {
      setRect((r) => (r.ready ? { ...r, ready: false } : r))
      return
    }
    const c = container.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    setRect({
      top: e.top - c.top + container.scrollTop,
      left: e.left - c.left + container.scrollLeft,
      width: e.width,
      height: e.height,
      ready: true
    })
  }, [activeKey, containerRef, getItemEl, enabled])

  const scheduleMeasure = useCallback(() => {
    if (!enabled) return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      measure()
    })
  }, [measure, enabled])

  useLayoutEffect(() => {
    if (!enabled) {
      setRect((r) => (r.ready ? { ...r, ready: false } : r))
      return
    }
    scheduleMeasure()
  }, [enabled, scheduleMeasure, activeKey, ...layoutDeps])

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(scheduleMeasure)
    ro.observe(container)

    const el = getItemEl(activeKey)
    if (el) ro.observe(el)

    window.addEventListener('resize', scheduleMeasure)
    container.addEventListener('scroll', scheduleMeasure, { passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      container.removeEventListener('scroll', scheduleMeasure)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, activeKey, containerRef, getItemEl, scheduleMeasure, ...layoutDeps])

  useEffect(() => {
    if (!enabled || !animating) return
    let frame = 0
    const tick = () => {
      measure()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, animating, measure])

  return rect
}
