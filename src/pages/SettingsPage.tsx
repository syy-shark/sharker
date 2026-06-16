/**
 * 设置页壳：权限 / 模型 / Skills 分页切换
 * @see src/README.md
 */
import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../shared/types'
import type { SettingsTab } from '../types/navigation'
import { ModelsSettings } from '../components/settings/ModelsSettings'
import { PermissionsSettings } from '../components/settings/PermissionsSettings'
import { SkillsSettings } from '../components/settings/SkillsSettings'
import './SettingsPage.css'

const TAB_META: Record<SettingsTab, { title: string; desc: string }> = {
  permissions: {
    title: '权限',
    desc: '控制 AI 可访问的文件与系统范围；高危操作仍会单独确认。'
  },
  models: {
    title: '模型',
    desc: '配置 OpenAI 兼容 API，并选择对话时使用的模型。'
  },
  skills: {
    title: 'Skill',
    desc: '从 GitHub 导入技能仓库，对话时按内容自动匹配注入。'
  }
}

/** SettingsPage Props：当前 Tab、设置草稿与保存回调 */
interface Props {
  tab: SettingsTab
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 设置页：按 Tab 渲染权限/模型/Skill 子面板 */
export function SettingsPage({ tab, draft, setDraft, onSave }: Props) {
  const meta = TAB_META[tab]

  return (
    <div className="settings-page">
      <div className="settings-page-inner">
        <header key={`header-${tab}`} className="settings-page-header view-enter">
          <h1>{meta.title}</h1>
          <p>{meta.desc}</p>
        </header>

        <div key={tab} className="settings-stack settings-panel view-enter">
          {tab === 'permissions' && (
            <PermissionsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'models' && (
            <ModelsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'skills' && (
            <SkillsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
        </div>
      </div>
    </div>
  )
}
