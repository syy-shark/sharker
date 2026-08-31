/**
 * 直播耗时：独立计时，只在官方时钟文案会变时重绘秒表。
 * Goal 行可传入预留宽，避免跨日换文案挤 composer-stage。
 * @see src/components/ARCH.md
 */
import { memo, useEffect, useState, type CSSProperties } from 'react'
import {
  elapsedClockSeconds,
  formatElapsedClock,
  nextElapsedClockDelayMs
} from '../../shared/live-display'

/** 秒数 → 显示用耗时文案（长回合对标 Codex 1h 9m） */
export function formatLiveDuration(seconds: number): string {
  return formatElapsedClock(seconds)
}

function liveClockLabel(
  startedAt: number | null | undefined,
  endedAt: number | null | undefined,
  fallback: string,
  now: number
): string {
  if (startedAt == null) return fallback
  return formatElapsedClock(elapsedClockSeconds(startedAt, endedAt ?? now))
}

/** 仅刷新自身的直播秒表；`endedAt` / `paused` 冻结（对标 Codex #29370） */
export const LiveDuration = memo(function LiveDuration({
  startedAt,
  endedAt,
  paused = false,
  className,
  style,
  fallback = '0s'
}: {
  startedAt?: number | null
  endedAt?: number | null
  paused?: boolean
  className?: string
  style?: CSSProperties
  fallback?: string
}) {
  const frozen = paused || endedAt != null
  const [label, setLabel] = useState(() =>
    liveClockLabel(startedAt, endedAt, fallback, Date.now())
  )
  useEffect(() => {
    if (startedAt == null) {
      setLabel(fallback)
      return
    }
    if (frozen) {
      setLabel(liveClockLabel(startedAt, endedAt, fallback, Date.now()))
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
  }, [endedAt, fallback, frozen, startedAt])
  return (
    <span className={className} style={style}>
      {label}
    </span>
  )
})
