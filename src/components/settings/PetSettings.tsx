/**
 * 小宠物开关设置。
 */
import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { SettingsCard, SettingsRow, SettingsSection, SettingsToggle } from './SettingsPrimitives'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 桌面宠物设置 */
export function PetSettings({ draft, setDraft, onSave }: Props) {
  const enabled = draft.petEnabled ?? false
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const toggle = (next: boolean) => {
    const updated = { ...draft, petEnabled: next }
    setDraft(updated)
    setBusy(true)
    setMessage('')
    void onSave(updated)
      .then(() => {
        setMessage(next ? '已开启小宠物' : '已关闭小宠物')
      })
      .catch((e) => {
        setMessage(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setBusy(false))
  }

  return (
    <SettingsSection title="小宠物">
      <SettingsCard>
        <SettingsRow
          title="显示桌面宠物"
          description={message || 'Codex 风格右下角浮动伙伴，点击可互动。'}
          last
        >
          <SettingsToggle checked={enabled} onChange={toggle} label="小宠物" disabled={busy} />
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
