/**
 * 设置页壳：权限 / 模型 / MCP / 通用 / 浏览器 / 外观 / 通知 / 个性化 / 建议提示 / 键盘快捷键 / 已归档 / 用量
 * Computer Use / Browser Use 入口暂隐藏；`BrowserSettings` 对标 Codex Settings → Browser
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
import './SettingsPage.css'

const TAB_META: Record<SettingsTab, { title: string; desc: string }> = {
  permissions: {
    title: '权限',
    desc: '控制 AI 可访问的文件与系统范围、托管 worktree 保留数与 Git 文案模板；高危操作仍会单独确认。/review 交付在通用。'
  },
  models: {
    title: '模型',
    desc: '配置 OpenAI 兼容 API，并选择对话时使用的模型。'
  },
  mcp: {
    title: 'MCP 服务器',
    desc: '添加 STDIO 或 Streamable HTTP Server，开关后 Restart。对标 Codex Settings → MCP servers。OAuth 登录未接。对话里 /mcp 打开 MCP 状态；未配置时打开本页。'
  },
  general: {
    title: '通用',
    desc: '后续排队或注入、Enter 发送、文件引用打开位置、上下文用量环、/review 交付与审查模型、运行防休眠。对标 Codex Settings → General。建议提示在单独一页。'
  },
  browser: {
    title: '浏览器',
    desc: '内置浏览器自己的历史与下载：搜索、重新打开、删除，按时间清除历史 / Cookie / 缓存，以及下载目录与每次询问保存。对标 Codex Settings → Browser。不接系统 Chrome，不发明 @Browser。'
  },
  appearance: {
    title: '外观',
    desc: '浅色苹果玻璃与深色金属；界面与代码字体、弹出窗置顶。通知在通知页。'
  },
  notifications: {
    title: '通知',
    desc: '回合完成何时弹系统通知，以及是否申请通知权限。对标 Codex Settings → Notifications。'
  },
  personalization: {
    title: '个性化',
    desc: '启用记忆（官方默认关）、人格与个人 AGENTS.md。对标 Codex Settings → Personalization。单对话用 /memories。'
  },
  suggested: {
    title: '建议提示',
    desc: '空对话显示要继续的任务、审查或目标。对标 Codex Settings → Suggested prompts。'
  },
  shortcuts: {
    title: '键盘快捷键',
    desc: '搜索命令、改绑或重置。对标 Codex Settings → Keyboard Shortcuts。'
  },
  archived: {
    title: '已归档',
    desc: '已归档的对话。可回档到侧栏列表，或彻底删除。'
  },
  usage: {
    title: '用量',
    desc: '本机 Token、峰值日与连续活跃。对标 Codex Profile，不假装供应商额度或最长任务。'
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
