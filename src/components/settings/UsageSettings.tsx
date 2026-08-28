/**
 * 设置 → 用量：对标 Codex Profile 的本机洞察。
 * 只展示日 Token / 回合能推导的字段，不假装最长任务或供应商额度。
 * @see src/components/settings/ARCH.md
 */
import { useEffect, useMemo, useState } from 'react'
import type { DayUsage } from '../../../shared/token-usage-format'
import {
  summarizeUsageInsights,
  usageSparkRatios
} from '../../../shared/token-usage-format'
import { SettingsCard, SettingsRow, SettingsSection } from './SettingsPrimitives'
import './UsageSettings.css'

const HISTORY_DAYS = 365
const SPARK_DAYS = 14

function formatCount(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** 本机用量洞察与近 14 日 Token 火花图 */
export function UsageSettings() {
  const [days, setDays] = useState<DayUsage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = window.sharker.getTokenUsage
          ? await window.sharker.getTokenUsage(HISTORY_DAYS)
          : []
        if (!cancelled) setDays(next)
      } catch {
        if (!cancelled) setDays([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const insights = useMemo(() => summarizeUsageInsights(days), [days])
  const spark = useMemo(() => {
    const slice = days.slice(-SPARK_DAYS)
    const ratios = usageSparkRatios(days, SPARK_DAYS)
    return slice.map((day, i) => ({
      date: day.date,
      tokens: day.tokens,
      ratio: ratios[i] ?? 0
    }))
  }, [days])

  if (loading) {
    return <p className="usage-empty">加载中…</p>
  }

  return (
    <div className="usage-settings">
      <SettingsSection title="本机洞察">
        <SettingsCard>
          <SettingsRow title="终身 Token" description="本机按日累加的估算值，不是供应商额度。">
            <span className="usage-metric">{formatCount(insights.lifetimeTokens)}</span>
          </SettingsRow>
          <SettingsRow title="终身回合" description="本机记录过的对话回合数。">
            <span className="usage-metric">{formatCount(insights.lifetimeTurns)}</span>
          </SettingsRow>
          <SettingsRow
            title="峰值日 Token"
            description={insights.peakDate ? `发生在 ${insights.peakDate}` : '还没有峰值日。'}
          >
            <span className="usage-metric">{formatCount(insights.peakTokens)}</span>
          </SettingsRow>
          <SettingsRow title="当前连续活跃" description="今天没用量时仍接着算昨天的连续天数。">
            <span className="usage-metric">{insights.currentStreak} 天</span>
          </SettingsRow>
          <SettingsRow title="最长连续活跃" description="本机记录里最长的连续有用量天数。">
            <span className="usage-metric">{insights.longestStreak} 天</span>
          </SettingsRow>
          <SettingsRow title="活跃天数" description="至少有 Token 或回合的日期数。" last>
            <span className="usage-metric">{insights.activeDays} 天</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="近 14 日 Token">
        <SettingsCard>
          <div className="usage-spark-card">
            {spark.length === 0 || spark.every((d) => !d.tokens) ? (
              <p className="usage-empty usage-empty--inset">暂无本机用量。跑一轮对话后会出现柱形。</p>
            ) : (
              <div
                className="usage-spark"
                role="img"
                aria-label={`近 ${spark.length} 日 Token 活动`}
              >
                {spark.map((day) => (
                  <span
                    key={day.date}
                    className="usage-spark-col"
                    title={`${day.date} · ${formatCount(day.tokens)} Token`}
                  >
                    <span
                      className="usage-spark-bar"
                      style={{ height: `${Math.max(day.ratio * 100, day.tokens > 0 ? 8 : 2)}%` }}
                    />
                  </span>
                ))}
              </div>
            )}
            <p className="usage-spark-note">
              单色柱形按本机日 Token，不是供应商热力图。没有最长任务时长：本机只记每日 Token 与回合。
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
