/**
 * Token 消耗设置：GitHub 风格蓝点热力图。
 */
import { useEffect, useMemo, useState } from 'react'
import type { DayUsage } from '../../../shared/token-usage-store'
import { SettingsCard, SettingsSection } from './SettingsPrimitives'
import './TokenUsageSettings.css'

/** Token 用量面板 */
export function TokenUsageSettings() {
  const [history, setHistory] = useState<DayUsage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!window.sharker?.getTokenUsage) {
      setLoading(false)
      return
    }
    void window.sharker
      .getTokenUsage(365)
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [])

  const maxTokens = useMemo(
    () => Math.max(1, ...history.map((d) => d.tokens)),
    [history]
  )

  const today = history[history.length - 1]
  const weekTotal = history.slice(-7).reduce((s, d) => s + d.tokens, 0)

  const level = (tokens: number): number => {
    if (tokens <= 0) return 0
    const r = tokens / maxTokens
    if (r < 0.25) return 1
    if (r < 0.5) return 2
    if (r < 0.75) return 3
    return 4
  }

  return (
    <>
      <SettingsSection title="概览">
        <SettingsCard>
          <div className="token-usage-summary">
            <div>
              <div className="token-usage-stat-label">今日（估算）</div>
              <div className="token-usage-stat-value">
                {loading ? '…' : (today?.tokens ?? 0).toLocaleString()} tokens
              </div>
            </div>
            <div>
              <div className="token-usage-stat-label">近 7 日</div>
              <div className="token-usage-stat-value">
                {loading ? '…' : weekTotal.toLocaleString()} tokens
              </div>
            </div>
          </div>
          <p className="token-usage-note">
            基于上下文 token 估算，非 API 账单。颜色越深消耗越多。
          </p>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="365 日">
        <SettingsCard>
          <div className="token-heatmap" aria-label="Token 消耗热力图">
            {history.map((d) => (
              <span
                key={d.date}
                className={`token-heatmap-cell token-heatmap-cell--l${level(d.tokens)}`}
                title={`${d.date}: ${d.tokens.toLocaleString()} tokens · ${d.turns} 轮`}
              />
            ))}
          </div>
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
