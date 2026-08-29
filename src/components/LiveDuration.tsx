/**
 * 直播耗时：独立计时，只在官方时钟文案会变时重绘秒表。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState } from 'react'
import {
  elapsedClockSeconds,
  formatElapsedClock,
  nextElapsedClockDelayMs
} from '../../shared/live-display'

/** 秒数 → 显示用耗时文案（长回合对标 Codex 1h 9m） */
export function formatLiveDuration(seconds: number): string {
  return formatElapsedClock(seconds)
}

function liveClockLabel(startedAt: number | null | undefined, fallback: string, now: number): string {
  if (startedAt == null) return fallback
  return formatElapsedClock(elapsedClockSeconds(startedAt, now))
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
  const [label, setLabel] = useState(() => liveClockLabel(startedAt, fallback, Date.now()))
  useEffect(() => {
    if (startedAt == null) {
      setLabel(fallback)
      return
    }
    let id = 0
    const schedule = () => {
      const now = Date.now()
      const seconds = elapsedClockSeconds(startedAt, now)
      const next = formatElapsedClock(seconds)
      setLabel((prev) => (prev === next ? prev : next))
      id = window.setTimeout(schedule, nextElapsedClockDelayMs(seconds))
    }
    schedule()
    return () => window.clearTimeout(id)
  }, [fallback, startedAt])
  return <span className={className}>{label}</span>
})
