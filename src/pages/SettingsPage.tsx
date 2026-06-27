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
import { McpSettings } from '../components/settings/McpSettings'
import { TokenUsageSettings } from '../components/settings/TokenUsageSettings'
import { PetSettings } from '../components/settings/PetSettings'
import { ExtensionsSettings } from '../components/settings/ExtensionsSettings'
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
    desc: '内置 Skill 开箱即用；市场可安装 Anthropic / Claude Code 生态合集。'
  },
  mcp: {
    title: 'MCP',
    desc: ''
  },
  computerUse: { title: 'MCP', desc: '' },
  browserUse: { title: 'MCP', desc: '' },
  usage: {
    title: 'Token 消耗',
    desc: '查看每日上下文 token 估算与近一年热力图。'
  },
  pet: {
    title: '小宠物',
    desc: 'Codex 风格桌面伙伴。'
  },
  extensions: {
    title: '扩展',
    desc: 'Hooks、OAuth GPT、远程协作与 LSP。'
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

/** 设置页：按 Tab 渲染权限/模型/Skill 子面板 */
export function SettingsPage({ tab, draft, setDraft, onSave }: Props) {
  const effectiveTab: SettingsTab =
    tab === 'computerUse' || tab === 'browserUse' ? 'mcp' : tab
  const meta = TAB_META[effectiveTab]

  return (
    <div className="settings-page">
      <div className="settings-page-inner">
        <header key={`header-${effectiveTab}`} className="settings-page-header view-enter">
          <h1>{meta.title}</h1>
          {meta.desc ? <p>{meta.desc}</p> : null}
        </header>

        <div key={effectiveTab} className="settings-stack settings-panel view-enter">
          {effectiveTab === 'permissions' && (
            <PermissionsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {effectiveTab === 'models' && (
            <ModelsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {effectiveTab === 'skills' && (
            <SkillsSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {effectiveTab === 'mcp' && <McpSettings draft={draft} />}
          {effectiveTab === 'usage' && <TokenUsageSettings />}
          {effectiveTab === 'pet' && (
            <PetSettings draft={draft} setDraft={setDraft} onSave={onSave} />
          )}
          {effectiveTab === 'extensions' && <ExtensionsSettings draft={draft} />}
        </div>
      </div>
    </div>
  )
}
