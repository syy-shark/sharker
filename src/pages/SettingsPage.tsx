/**
 * 设置页壳：权限 / 模型 / MCP servers / General / Worktrees / Browser / Appearance / Notifications / Personalization / Suggested prompts / Keyboard Shortcuts / Archived chats / Profile
 * Computer Use / Browser Use 入口暂隐藏；`WorktreeSettings` 对标 Codex Settings → Worktrees
 * @see src/ARCH.md
 */
import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../shared/types'
import type { SettingsTab } from '../types/navigation'
import { ModelsSettings } from '../components/settings/ModelsSettings'
import { PermissionsSettings } from '../components/settings/PermissionsSettings'
import { AppearanceSettings } from '../components/settings/AppearanceSettings'
import { GeneralSettings } from '../components/settings/GeneralSettings'
import { PersonalizationSettings } from '../components/settings/PersonalizationSettings'
import { NotificationSettings } from '../components/settings/NotificationSettings'
import { SuggestedPromptSettings } from '../components/settings/SuggestedPromptSettings'
import { ArchivedSettings } from '../components/settings/ArchivedSettings'
import { ShortcutSettings } from '../components/settings/ShortcutSettings'
import { UsageSettings } from '../components/settings/UsageSettings'
import { McpSettings } from '../components/settings/McpSettings'
import { BrowserSettings } from '../components/settings/BrowserSettings'
import { WorktreeSettings } from '../components/settings/WorktreeSettings'
import {
  APPEARANCE_SETTINGS_LABEL,
  ARCHIVED_CHATS_INTRO,
  ARCHIVED_CHATS_LABEL,
  BROWSER_SETTINGS_LABEL,
  GENERAL_SETTINGS_INTRO,
  GENERAL_SETTINGS_LABEL,
  PROFILE_SETTINGS_LABEL,
  KEYBOARD_SHORTCUTS_INTRO,
  KEYBOARD_SHORTCUTS_LABEL,
  MCP_SERVERS_INTRO,
  MCP_SERVERS_LABEL,
  NOTIFICATIONS_SETTINGS_INTRO,
  NOTIFICATIONS_SETTINGS_LABEL,
  PERSONALIZATION_SETTINGS_INTRO,
  PERSONALIZATION_SETTINGS_LABEL,
  SUGGESTED_PROMPTS_INTRO,
  SUGGESTED_PROMPTS_SETTINGS_LABEL,
  WORKTREES_SETTINGS_INTRO,
  WORKTREES_SETTINGS_LABEL
} from '../../shared/reveal-in-folder'
import { PERMISSIONS_LABEL } from '../../shared/permission-mode'
import './SettingsPage.css'

const TAB_META: Record<SettingsTab, { title: string; desc: string }> = {
  permissions: {
    title: PERMISSIONS_LABEL,
    desc: '控制 AI 可访问的文件与系统范围与 Git 文案模板；高危操作仍会单独确认。Worktree root 在 Worktrees。/review 交付在通用。'
  },
  models: {
    title: '模型',
    desc: '配置 OpenAI 兼容 API，并选择对话时使用的模型。'
  },
  mcp: {
    title: MCP_SERVERS_LABEL,
    desc: MCP_SERVERS_INTRO
  },
  general: {
    title: GENERAL_SETTINGS_LABEL,
    desc: GENERAL_SETTINGS_INTRO
  },
  worktrees: {
    title: WORKTREES_SETTINGS_LABEL,
    desc: WORKTREES_SETTINGS_INTRO
  },
  browser: {
    title: BROWSER_SETTINGS_LABEL,
    desc: '内置浏览器自己的历史与下载：搜索、重新打开、删除，按时间清除历史 / Cookie / 缓存，以及下载目录与每次询问保存。对标 Codex Settings → Browser。不接系统 Chrome，不发明 @Browser。'
  },
  appearance: {
    title: APPEARANCE_SETTINGS_LABEL,
    desc: '浅色苹果玻璃与深色金属；界面与代码字体、弹出窗置顶。通知在通知页。'
  },
  notifications: {
    title: NOTIFICATIONS_SETTINGS_LABEL,
    desc: NOTIFICATIONS_SETTINGS_INTRO
  },
  personalization: {
    title: PERSONALIZATION_SETTINGS_LABEL,
    desc: PERSONALIZATION_SETTINGS_INTRO
  },
  suggested: {
    title: SUGGESTED_PROMPTS_SETTINGS_LABEL,
    desc: SUGGESTED_PROMPTS_INTRO
  },
  shortcuts: {
    title: KEYBOARD_SHORTCUTS_LABEL,
    desc: KEYBOARD_SHORTCUTS_INTRO
  },
  archived: {
    title: ARCHIVED_CHATS_LABEL,
    desc: ARCHIVED_CHATS_INTRO
  },
  usage: {
    title: PROFILE_SETTINGS_LABEL,
    desc: '本机 Token、峰值日与连续活跃。对标 Codex Settings → Profile，不假装供应商额度或最长任务。'
  }
}

/** SettingsPage Props：当前 Tab、设置草稿与保存回调 */
interface Props {
  tab: SettingsTab
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
  onNavigateTab?: (tab: SettingsTab) => void
  workspacePath?: string
}

/** 设置页：按 Tab 渲染权限/模型等子面板 */
export function SettingsPage({ tab, draft, setDraft, onSave, workspacePath = '' }: Props) {
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
          {tab === 'mcp' && <McpSettings workspacePath={workspacePath} />}
          {tab === 'general' && (
            <GeneralSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'worktrees' && (
            <WorktreeSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'browser' && (
            <BrowserSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'appearance' && (
            <AppearanceSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'notifications' && (
            <NotificationSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'personalization' && (
            <PersonalizationSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'suggested' && (
            <SuggestedPromptSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'shortcuts' && (
            <ShortcutSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {tab === 'archived' && <ArchivedSettings />}
          {tab === 'usage' && <UsageSettings />}
        </div>
      </div>
    </div>
  )
}
