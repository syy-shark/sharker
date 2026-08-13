/**
 * 弹层进出动画 Hook：关闭时保留 DOM 播放退出动画
 * @see src/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 退出卸载等待：对齐 history / model-picker 的 popover-exit（约 150–180ms）。
 * 进入动画由 CSS 控制；这里只决定何时真正卸载 DOM。
 */
const DEFAULT_MS = 180

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
    // 双 rAF 确保先挂载再进入；同时同步置 open，避免只 mounted 未 open 的卡死态
    setOpen(true)
  }, [clearTimer])

  const hide = useCallback(() => {
    setOpen(false)
    setExiting(true)
    // 若已在退出计时中，重置为完整退出时长，保证最终会卸载
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
