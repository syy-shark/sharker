/**
 * 设置页壳：权限 / 模型 / 外观 / 键盘快捷键 / 已归档
 * 桌面 / 浏览器能力入口暂隐藏（`ComputerUseSettings` / `BrowserUseSettings` 仍保留）
 * @see src/ARCH.md
 */
import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../shared/types'
import type { SettingsTab } from '../types/navigation'
import { ModelsSettings } from '../components/settings/ModelsSettings'
import { PermissionsSettings } from '../components/settings/PermissionsSettings'
import { AppearanceSettings } from '../components/settings/AppearanceSettings'
import { ArchivedSettings } from '../components/settings/ArchivedSettings'
import { ShortcutSettings } from '../components/settings/ShortcutSettings'
import './SettingsPage.css'

const TAB_META: Record<SettingsTab, { title: string; desc: string }> = {
  permissions: {
    title: '权限',
    desc: '控制 AI 可访问的文件与系统范围、托管 worktree 保留数；高危操作仍会单独确认。'
  },
  models: {
    title: '模型',
    desc: '配置 OpenAI 兼容 API，并选择对话时使用的模型。'
  },
  appearance: {
    title: '外观',
    desc: '浅色苹果玻璃与深色金属；人格只改语气。'
  },
  shortcuts: {
    title: '键盘快捷键',
    desc: '搜索命令、改绑或重置。对标 Codex Settings → Keyboard Shortcuts。'
  },
  archived: {
    title: '已归档',
    desc: '已归档的对话。可回档到侧栏列表，或彻底删除。'
  }
}

/** SettingsPage Props：当前 Tab、设置草稿与保存回调 */
interface Props {
  tab: SettingsTab
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
  onNavigateTab?: (tab: SettingsTab) => void
}

/** 设置页：按 Tab 渲染权限/模型等子面板 */
export function SettingsPage({ tab, draft, setDraft, onSave }: Props) {
  const meta = TAB_META[tab]

  return (
    <div className="settings-page">
      <div className="settings-page-inner">
        <header key={`header-${tab}`} className="settings-page-header view-enter">
          <h1>{meta.title}</h1>
          {meta.desc ? <p>{meta.desc}</p> : null}
        </header>

        <div key={tab} className="settings-stack settings-panel view-enter">
          {tab === 'permissions' && (
            <PermissionsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'models' && (
            <ModelsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'appearance' && (
            <AppearanceSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'shortcuts' && (
            <ShortcutSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'archived' && <ArchivedSettings />}
        </div>
      </div>
    </div>
  )
}
