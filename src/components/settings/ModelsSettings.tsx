/**
 * 模型与 API 提供商配置表单
 * @see src/README.md
 */
import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ProviderConfig } from '../../../shared/types'
import '../../pages/SettingsPage.css'
import './ModelsSettings.css'
import { SettingsSelect } from './SettingsSelect'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsRow,
  SettingsSection
} from './SettingsPrimitives'

/** ModelsSettings Props：设置草稿与保存回调 */
interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 创建空白 Provider 配置 */
function newProvider(): ProviderConfig {
  return {
    id: crypto.randomUUID(),
    name: '新 API',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini'
  }
}

/** 模型与 API 提供商配置面板 */
export function ModelsSettings({ draft, setDraft, onSave }: Props) {
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<Record<string, string>>({})
  const skipAutosaveRef = useRef(true)

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void onSave(draft)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, onSave])

  const updateProvider = (id: string, field: keyof ProviderConfig, value: string) => {
    setDraft((d) => {
      const next = {
        ...d,
        providers: d.providers.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      }
      if (field === 'apiKey' || field === 'baseUrl' || field === 'model' || field === 'name') {
        void onSave(next)
      }
      return next
    })
  }

  const updateContextWindow = (id: string, raw: string) => {
    const n = raw.trim() === '' ? undefined : Math.max(0, parseInt(raw, 10) || 0)
    setDraft((d) => ({
      ...d,
      providers: d.providers.map((p) =>
        p.id === id ? { ...p, contextWindow: n || undefined } : p
      )
    }))
  }

  const addProvider = () => {
    const p = newProvider()
    const next = {
      ...draft,
      providers: [...draft.providers, p],
      activeProviderId: draft.activeProviderId || p.id
    }
    setDraft(next)
    void onSave(next)
  }

  const setActiveProvider = (id: string) => {
    const next = { ...draft, activeProviderId: id }
    setDraft(next)
    void onSave(next)
  }

  const removeProvider = async (id: string) => {
    const providers = draft.providers.filter((p) => p.id !== id)
    let activeProviderId = draft.activeProviderId
    if (activeProviderId === id) {
      activeProviderId = providers[0]?.id ?? ''
    }
    const next = { ...draft, providers, activeProviderId }
    setDraft(next)
    await onSave(next)
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestMsg((m) => ({ ...m, [id]: '测试中…' }))
    await onSave(draft)
    const r = await window.sharker.testProvider(id, draft)
    setTestMsg((m) => ({
      ...m,
      [id]: r.ok ? '✓ ' + r.message : '✗ ' + r.message
    }))
    setTestingId(null)
  }

  const activeLabel =
    draft.providers.find((p) => p.id === draft.activeProviderId)?.name ?? '暂不使用'

  return (
    <>
      <SettingsSection title="对话">
        <SettingsCard>
          <SettingsRow
            title="默认模型"
            description={`当前：${activeLabel}`}
            last
          >
            <SettingsSelect
              id="active-provider"
              value={draft.activeProviderId}
              onChange={setActiveProvider}
              placeholder="暂不使用"
              options={[
                { value: '', label: '暂不使用' },
                ...draft.providers.map((p) => ({
                  value: p.id,
                  label: p.model?.trim() || p.name || '未命名'
                }))
              ]}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="API 配置">
        {draft.providers.length === 0 ? (
          <SettingsCard>
            <p className="provider-empty">还没有 API，点击下方添加。</p>
          </SettingsCard>
        ) : (
          <div className="provider-list">
            {draft.providers.map((p) => {
              const isActive = p.id === draft.activeProviderId
              return (
                <div key={p.id} className={`provider-card ${isActive ? 'active' : ''}`}>
                  <div className="provider-card-head">
                    <input
                      className="provider-name-input"
                      value={p.name}
                      onChange={(e) => updateProvider(p.id, 'name', e.target.value)}
                      placeholder="配置名称"
                    />
                    {isActive && <span className="provider-active-tag">使用中</span>}
                  </div>
                  <div className="provider-fields">
                    <label>
                      <span>Base URL</span>
                      <input
                        value={p.baseUrl}
                        onChange={(e) => updateProvider(p.id, 'baseUrl', e.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                    </label>
                    <label>
                      <span>API Key</span>
                      <input
                        type="password"
                        value={p.apiKey}
                        onChange={(e) => updateProvider(p.id, 'apiKey', e.target.value)}
                        placeholder="sk-..."
                      />
                    </label>
                    <label>
                      <span>模型 ID</span>
                      <input
                        value={p.model}
                        onChange={(e) => updateProvider(p.id, 'model', e.target.value)}
                        placeholder="gpt-4o-mini / deepseek-v4"
                      />
                    </label>
                    <label>
                      <span>上下文上限</span>
                      <input
                        type="number"
                        min={0}
                        step={1024}
                        value={p.contextWindow ?? ''}
                        onChange={(e) => updateContextWindow(p.id, e.target.value)}
                        placeholder="留空自动识别"
                      />
                    </label>
                  </div>
                  <div className="provider-card-actions">
                    {!isActive && (
                      <SettingsPillButton onClick={() => setActiveProvider(p.id)}>
                        设为当前
                      </SettingsPillButton>
                    )}
                    <SettingsPillButton onClick={() => handleTest(p.id)}>
                      {testingId === p.id ? '测试中…' : '测试'}
                    </SettingsPillButton>
                    <button
                      type="button"
                      className="btn-danger-ghost"
                      onClick={() => removeProvider(p.id)}
                    >
                      删除
                    </button>
                  </div>
                  {testMsg[p.id] && (
                    <p
                      className={`test-result ${testMsg[p.id].startsWith('✓') ? 'ok' : 'err'}`}
                    >
                      {testMsg[p.id]}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button type="button" className="btn-add-provider" onClick={addProvider}>
          + 添加 API
        </button>
      </SettingsSection>
    </>
  )
}
