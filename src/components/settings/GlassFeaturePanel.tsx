/**
 * 液态玻璃风格：单功能开关卡片。
 * @see src/components/settings/SettingsPrimitives.tsx
 */
import { SettingsCard, SettingsRow, SettingsToggle } from './SettingsPrimitives'

interface Props {
  title: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  busy?: boolean
}

/** 单开关功能面板（Computer Use / Browser Use 等） */
export function GlassFeaturePanel({ title, description, enabled, onChange, busy }: Props) {
  return (
    <SettingsCard>
      <SettingsRow title={title} description={description} last>
        <SettingsToggle
          checked={enabled}
          onChange={onChange}
          label={title}
          disabled={busy}
        />
      </SettingsRow>
    </SettingsCard>
  )
}
