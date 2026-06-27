/**
 * 功能就绪状态检查列表（Browser / Computer Use 等）。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsRow,
  SettingsSection
} from './SettingsPrimitives'
import './FeatureStatusPanel.css'

/** 单项检查结果 */
export interface StatusCheckItem {
  id: string
  label: string
  ok: boolean
  detail: string
}

interface Props {
  title: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  busy?: boolean
  description?: string
  checklist: StatusCheckItem[]
  onRefresh: () => Promise<void>
  showChecklist?: boolean
  toggleDescription?: string
  actions?: Array<{ label: string; onClick: () => void | Promise<void>; busy?: boolean }>
  footerNote?: string
}

/** 环境诊断 + 开关 */
export function FeatureStatusPanel({
  title,
  enabled,
  onToggle,
  busy,
  description,
  checklist,
  onRefresh,
  showChecklist = true,
  toggleDescription,
  actions,
  footerNote
}: Props) {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }, [onRefresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const readyCount = checklist.filter((c) => c.ok).length
  const rowDesc =
    toggleDescription ??
    (showChecklist && checklist.length > 0
      ? `${readyCount}/${checklist.length} 项检查通过`
      : undefined)

  return (
    <>
      <SettingsSection title={title}>
        <SettingsCard>
          {description ? (
            <p className="feature-status-intro">{description}</p>
          ) : null}
          <SettingsRow
            title={`启用 ${title}`}
            description={rowDesc}
            last={!showChecklist && !actions?.length && !footerNote}
          >
            <SettingsToggleWrap checked={enabled} onChange={onToggle} label={title} disabled={busy} />
          </SettingsRow>
          {!showChecklist && (actions?.length || footerNote) ? (
            <div className="feature-status-actions feature-status-actions--inline">
              {actions?.map((a) => (
                <SettingsPillButton key={a.label} onClick={() => void a.onClick()}>
                  {a.busy ? '处理中…' : a.label}
                </SettingsPillButton>
              ))}
              {footerNote ? <p className="feature-status-footer">{footerNote}</p> : null}
            </div>
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {showChecklist && checklist.length > 0 ? (
        <SettingsSection title="环境检查">
          <SettingsCard>
            <ul className="feature-status-list">
              {checklist.map((item) => (
                <li key={item.id} className="feature-status-item">
                  <span
                    className={`feature-status-dot ${item.ok ? 'feature-status-dot--ok' : 'feature-status-dot--fail'}`}
                    aria-hidden
                  />
                  <div className="feature-status-copy">
                    <div className="feature-status-label">{item.label}</div>
                    <div className="feature-status-detail">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="feature-status-actions">
              <SettingsPillButton onClick={() => void refresh()}>
                {refreshing ? '检测中…' : '重新检测'}
              </SettingsPillButton>
              {actions?.map((a) => (
                <SettingsPillButton key={a.label} onClick={() => void a.onClick()}>
                  {a.busy ? '处理中…' : a.label}
                </SettingsPillButton>
              ))}
            </div>
            {footerNote ? <p className="feature-status-footer">{footerNote}</p> : null}
          </SettingsCard>
        </SettingsSection>
      ) : null}
    </>
  )
}

/** 内联 Toggle，避免循环依赖 GlassFeaturePanel */
function SettingsToggleWrap({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`st-toggle ${checked ? 'st-toggle--on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="st-toggle-thumb" />
    </button>
  )
}
