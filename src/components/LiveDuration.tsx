/**
 * 直播耗时：独立计时，避免 500ms tick 拖着整条助手消息 / Markdown 重绘。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'

/** 秒数 → 显示用耗时文案 */
export function formatLiveDuration(seconds: number): string {
  if (seconds < 1) return '<1s'
  return `${seconds}s`
}

/** 仅刷新自身的直播秒表 */
export const LiveDuration = memo(function LiveDuration({
  startedAt,
  className,
  fallback = '0s'
}: {
  startedAt?: number | null
  className?: string
  fallback?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt == null) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [startedAt])
  const text =
    startedAt == null
      ? fallback
      : formatLiveDuration(Math.max(0, Math.round((now - startedAt) / 1000)))
  return <span className={className}>{text}</span>
})
