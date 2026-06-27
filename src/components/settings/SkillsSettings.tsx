/**
 * Skill 设置：内置 Skill + 可安装市场。
 * @see skills/README.md
 */
import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  BUNDLED_SKILL_CATALOG,
  MARKETPLACE_SKILL_CATALOG
} from '../../../shared/skill-catalog-data'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsSection
} from './SettingsPrimitives'
import './PluginCatalog.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** Skill 插件目录设置面板 */
export function SkillsSettings({ draft, setDraft, onSave }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const installed = new Set(draft.installedSkillIds ?? [])

  const handleInstall = async (id: string, repoUrl: string) => {
    setBusyId(id)
    setMsg(null)
    try {
      const p = await window.sharker.importSkillRepo(repoUrl)
      const ids = draft.installedSkillIds ?? []
      const urls = draft.skillRepoUrls.includes(repoUrl)
        ? draft.skillRepoUrls
        : [...draft.skillRepoUrls, repoUrl]
      const nextIds = ids.includes(id) ? ids : [...ids, id]
      const next = { ...draft, skillRepoUrls: urls, installedSkillIds: nextIds }
      setDraft(next)
      await onSave(next)
      setMsg(`已安装 · ${p}`)
    } catch (e) {
      setMsg(`失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <SettingsSection title="内置 Skill">
        <SettingsCard>
          <ul className="plugin-catalog-list">
            {BUNDLED_SKILL_CATALOG.map((skill) => (
              <li key={skill.id} className="plugin-catalog-item">
                <div className="plugin-catalog-copy">
                  <div className="plugin-catalog-title">
                    {skill.title}
                    {skill.tags?.map((t) => (
                      <span key={t} className="plugin-catalog-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="plugin-catalog-desc">{skill.description}</p>
                </div>
                <span className="plugin-catalog-installed">已启用</span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Skill 市场">
        <SettingsCard>
          <ul className="plugin-catalog-list">
            {MARKETPLACE_SKILL_CATALOG.map((skill) => {
              const isInstalled = installed.has(skill.id)
              return (
                <li key={skill.id} className="plugin-catalog-item">
                  <div className="plugin-catalog-copy">
                    <div className="plugin-catalog-title">
                      {skill.title}
                      {skill.tags?.map((t) => (
                        <span key={t} className="plugin-catalog-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="plugin-catalog-desc">{skill.description}</p>
                  </div>
                  {isInstalled ? (
                    <span className="plugin-catalog-installed">已安装</span>
                  ) : (
                    <SettingsPillButton
                      variant="primary"
                      onClick={() => void handleInstall(skill.id, skill.repoUrl!)}
                    >
                      {busyId === skill.id ? '安装中…' : '安装'}
                    </SettingsPillButton>
                  )}
                </li>
              )
            })}
          </ul>
          {msg ? <p className="plugin-catalog-msg">{msg}</p> : null}
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
