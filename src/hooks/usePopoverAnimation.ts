/**
 * 弹层进出动画 Hook：关闭时保留 DOM 播放退出动画
 * @see src/README.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_MS = 280

/** 弹层开合动画：mounted/open/exiting 与 surfaceClass */
export function usePopoverAnimation(duration = DEFAULT_MS) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const show = useCallback(() => {
    clearTimer()
    setExiting(false)
    setMounted(true)
    requestAnimationFrame(() => setOpen(true))
  }, [clearTimer])

  const hide = useCallback(() => {
    setOpen(false)
    setExiting(true)
    clearTimer()
    timerRef.current = setTimeout(() => {
      setMounted(false)
      setExiting(false)
      timerRef.current = null
    }, duration)
  }, [clearTimer, duration])

  const toggle = useCallback(() => {
    if (exiting) return
    if (open) hide()
    else show()
  }, [open, exiting, hide, show])

  const setOpenAnimated = useCallback(
    (next: boolean) => {
      if (next) show()
      else hide()
    },
    [show, hide]
  )

  const surfaceClass = exiting ? 'popover-exit' : open ? 'popover-enter' : ''

  return {
    open,
    mounted,
    exiting,
    show,
    hide,
    toggle,
    setOpen: setOpenAnimated,
    surfaceClass,
    expanded: open || exiting
  }
}
