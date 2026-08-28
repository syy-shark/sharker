/**
 * 直播耗时：独立计时，避免 500ms tick 拖着整条助手消息 / Markdown 重绘。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'
import { formatElapsedClock } from '../../shared/live-display'

/** 秒数 → 显示用耗时文案（长回合对标 Codex 1h 9m） */
export function formatLiveDuration(seconds: number): string {
  return formatElapsedClock(seconds)
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
