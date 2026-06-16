/**
 * Skill 仓库导入与管理
 * @see src/README.md
 */
import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import '../../pages/SettingsPage.css'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsRow,
  SettingsSection
} from './SettingsPrimitives'

/** SkillsSettings Props：设置草稿与保存回调 */
interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** Skill 仓库导入与管理面板 */
export function SkillsSettings({ draft, setDraft, onSave }: Props) {
  const [skillUrl, setSkillUrl] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const handleImport = async () => {
    if (!skillUrl.trim()) return
    setImportMsg('导入中…')
    try {
      const p = await window.sharker.importSkillRepo(skillUrl.trim())
      const url = skillUrl.trim()
      if (!draft.skillRepoUrls.includes(url)) {
        const next = { ...draft, skillRepoUrls: [...draft.skillRepoUrls, url] }
        setDraft(next)
        await onSave(next)
      }
      setImportMsg('已导入: ' + p)
      setSkillUrl('')
    } catch (e) {
      setImportMsg('失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <>
      <SettingsSection title="导入">
        <SettingsCard>
          <div className="st-skill-input-wrap">
            <label htmlFor="skill-repo">GitHub 仓库地址</label>
            <input
              id="skill-repo"
              type="url"
              value={skillUrl}
              onChange={(e) => setSkillUrl(e.target.value)}
              placeholder="https://github.com/user/skills-repo"
            />
            {importMsg && <p className="test-result">{importMsg}</p>}
          </div>
          <SettingsRow
            title="导入到本地"
            description="安装到 ~/.sharker/skills/，对话时按内容自动匹配。"
            last
          >
            <SettingsPillButton variant="primary" onClick={handleImport}>
              导入
            </SettingsPillButton>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {draft.skillRepoUrls.length > 0 && (
        <SettingsSection title="已导入">
          <SettingsCard>
            <ul className="skill-repo-list">
              {draft.skillRepoUrls.map((url) => (
                <li key={url}>{url}</li>
              ))}
            </ul>
          </SettingsCard>
        </SettingsSection>
      )}
    </>
  )
}
