/**
 * 模型与 API 提供商配置：下拉选择官方模型 + /models 自动刷新
 * @see shared/provider-catalog.ts
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, ProviderConfig } from '../../../shared/types'
import {
  PROVIDER_PRESETS,
  configuredProviders,
  getProviderPreset,
  isProviderConfigured,
  knownModelsForProvider,
  mergeModelLists,
  presetToProvider
} from '../../../shared/provider-catalog'
import {
  defaultThinkingLevel,
  resolveThinkingOptions
} from '../../../shared/thinking-levels'
import '../../pages/SettingsPage.css'
import './ModelsSettings.css'
import { SettingsSelect } from './SettingsSelect'
import {
  SettingsCard,
  SettingsPillButton,
  SettingsRow,
  SettingsSection
} from './SettingsPrimitives'
import { ProviderBrandIcon } from '../ProviderBrandIcon'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

function newProvider(): ProviderConfig {
  return {
    id: crypto.randomUUID(),
    name: '新 API',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: ''
  }
}

function canListModels(): boolean {
  return typeof window.sharker?.listProviderModels === 'function'
}

/** 模型与 API 提供商配置面板 */
export function ModelsSettings({ draft, setDraft, onSave }: Props) {
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<Record<string, string>>({})
  /** 各 provider 下拉选项（已知 + 官方拉取合并） */
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({})
  const [listingId, setListingId] = useState<string | null>(null)
  const [listMsg, setListMsg] = useState<Record<string, string>>({})
  const skipAutosaveRef = useRef(true)
  const autoFetchedRef = useRef<Set<string>>(new Set())

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

  /** 进入页 / providers 变化：先用已知官方模型填满下拉 */
  useEffect(() => {
    setModelOptions((prev) => {
      const next = { ...prev }
      for (const p of draft.providers) {
        const known = knownModelsForProvider(p.id, p.model)
        const existing = next[p.id] ?? []
        next[p.id] = mergeModelLists(existing, known, p.model)
      }
      return next
    })
  }, [draft.providers])

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

  const refreshModels = useCallback(
    async (
      id: string,
      opts?: { selectIfMissing?: boolean; settingsSnapshot?: AppSettings }
    ) => {
      const snapshot = opts?.settingsSnapshot ?? draft
      const provider = snapshot.providers.find((p) => p.id === id)
      if (!provider) return

      const known = knownModelsForProvider(id, provider.model)
      // 无 API 能力时仍保证下拉有官方已知项
      if (!canListModels()) {
        setModelOptions((prev) => ({
          ...prev,
          [id]: mergeModelLists([], known, provider.model)
        }))
        setListMsg((m) => ({
          ...m,
          [id]: '请完全重启 Sharker 后刷新模型（preload 未加载 listProviderModels）'
        }))
        return
      }

      if (!provider.apiKey?.trim()) {
        setModelOptions((prev) => ({
          ...prev,
          [id]: mergeModelLists([], known, provider.model)
        }))
        setListMsg((m) => ({
          ...m,
          [id]: provider.authMode === 'subscription'
            ? '已显示内置官方模型；请先完成订阅登录后再同步账号模型列表'
            : '已显示内置官方模型；填写 API Key 后可同步账号可用列表'
        }))
        return
      }

      setListingId(id)
      setListMsg((m) => ({ ...m, [id]: '正在从官方拉取模型列表…' }))
      try {
        const r = await window.sharker.listProviderModels(id, snapshot)
        if (!r.ok) {
          setModelOptions((prev) => ({
            ...prev,
            [id]: mergeModelLists(prev[id] ?? [], known, provider.model)
          }))
          setListMsg((m) => ({
            ...m,
            [id]: `✗ ${r.message}（已保留内置官方模型可选）`
          }))
          return
        }
        const fetched = r.models.map((x) => x.id)
        const merged = mergeModelLists(fetched, known, provider.model)
        setModelOptions((prev) => ({ ...prev, [id]: merged }))
        setListMsg((m) => ({
          ...m,
          [id]: `✓ 已同步 ${fetched.length} 个官方模型`
        }))

        const current = provider.model?.trim() ?? ''
        if (opts?.selectIfMissing && merged[0] && (!current || !merged.includes(current))) {
          updateProvider(id, 'model', merged[0])
        }
      } catch (e) {
        setModelOptions((prev) => ({
          ...prev,
          [id]: mergeModelLists(prev[id] ?? [], known, provider.model)
        }))
        setListMsg((m) => ({
          ...m,
          [id]:
            '✗ ' +
            (e instanceof Error ? e.message : String(e)) +
            '（已保留内置官方模型可选）'
        }))
      } finally {
        setListingId(null)
      }
    },
    [draft]
  )

  // 有 Key 时自动拉官方列表；无 Key 也保证下拉有 knownModels
  useEffect(() => {
    for (const p of draft.providers) {
      if (autoFetchedRef.current.has(p.id)) continue
      autoFetchedRef.current.add(p.id)
      void refreshModels(p.id, { selectIfMissing: !p.model?.trim() })
    }
  }, [draft.providers, refreshModels])

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

  const addPreset = (presetId: string) => {
    const preset = getProviderPreset(presetId)
    if (!preset) return
    if (draft.providers.some((p) => p.id === preset.id)) return
    const p = presetToProvider(preset)
    const next = { ...draft, providers: [...draft.providers, p] }
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
    autoFetchedRef.current.delete(id)
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestMsg((m) => ({ ...m, [id]: '测试中…' }))
    await onSave(draft)
    // 保存后以主进程回读的设置为准，避免 draft 里订阅 token 尚未同步
    let snapshot = draft
    try {
      const latest = await window.sharker.getSettings()
      snapshot = latest
      setDraft(latest)
    } catch {
      /* keep draft */
    }
    const r = await window.sharker.testProvider(id, snapshot)
    setTestMsg((m) => ({
      ...m,
      [id]: r.ok ? '✓ ' + r.message : '✗ ' + r.message
    }))
    setTestingId(null)
    if (r.ok) void refreshModels(id, { settingsSnapshot: snapshot })
  }

  const [subBusy, setSubBusy] = useState<string | null>(null)

  const importChatgpt = async () => {
    setSubBusy('openai-chatgpt')
    setListMsg((m) => ({ ...m, 'openai-chatgpt': '正在从 Codex 导入 ChatGPT 订阅…' }))
    try {
      // 先打开登录引导
      void window.sharker.openExternal('https://chatgpt.com/')
      const r = await window.sharker.importChatgptSubscription()
      if (r.settings) {
        setDraft(r.settings)
      }
      setListMsg((m) => ({
        ...m,
        'openai-chatgpt': r.ok
          ? '✓ ' + r.message
          : '✗ ' + r.message + '（请先终端执行 codex login 浏览器登录 ChatGPT）'
      }))
      if (r.ok) {
        autoFetchedRef.current.delete('openai-chatgpt')
        void refreshModels('openai-chatgpt')
      }
    } catch (e) {
      setListMsg((m) => ({
        ...m,
        'openai-chatgpt': '✗ ' + (e instanceof Error ? e.message : String(e))
      }))
    } finally {
      setSubBusy(null)
    }
  }

  const [xaiDeviceHint, setXaiDeviceHint] = useState<{
    userCode?: string
    verificationUri?: string
  } | null>(null)

  useEffect(() => {
    const off = window.sharker.onXaiDeviceCode?.((info) => {
      setXaiDeviceHint(info)
      if (info.userCode) {
        setListMsg((m) => ({
          ...m,
          'xai-grok': `请在浏览器确认设备码 ${info.userCode}（accounts.x.ai/oauth2/device）…`
        }))
      }
    })
    return () => off?.()
  }, [])

  /** SuperGrok：设备码 OAuth（打开 device?user_code=… 页面） */
  const importXaiDevice = async () => {
    setSubBusy('xai-grok')
    setXaiDeviceHint(null)
    setListMsg((m) => ({
      ...m,
      'xai-grok': '正在申请设备码，将打开 accounts.x.ai/oauth2/device?user_code=…'
    }))
    try {
      const r = await window.sharker.importXaiSubscription('device')
      if (r.settings) setDraft(r.settings)
      if (r.userCode) setXaiDeviceHint({ userCode: r.userCode, verificationUri: r.verificationUri })
      setListMsg((m) => ({
        ...m,
        'xai-grok': r.ok
          ? '✓ ' + r.message
          : '✗ ' + r.message
      }))
      if (r.ok) {
        setXaiDeviceHint(null)
        autoFetchedRef.current.delete('xai-grok')
        // 用登录返回的 settings（含 access token），不要依赖尚未更新的 draft 闭包
        void refreshModels('xai-grok', {
          settingsSnapshot: r.settings ?? undefined
        })
        // 登录成功后顺带测连通，给出明确结果
        try {
          const t = await window.sharker.testProvider(
            'xai-grok',
            r.settings ?? undefined
          )
          setTestMsg((m) => ({
            ...m,
            'xai-grok': t.ok ? '✓ ' + t.message : '✗ ' + t.message
          }))
        } catch (e) {
          setTestMsg((m) => ({
            ...m,
            'xai-grok': '✗ ' + (e instanceof Error ? e.message : String(e))
          }))
        }
      }
    } catch (e) {
      setListMsg((m) => ({
        ...m,
        'xai-grok': '✗ ' + (e instanceof Error ? e.message : String(e))
      }))
    } finally {
      setSubBusy(null)
    }
  }

  /** 备用：从本机 Hermes 缓存导入 */
  const importXaiHermes = async () => {
    setSubBusy('xai-grok')
    setListMsg((m) => ({ ...m, 'xai-grok': '正在从 Hermes 缓存导入…' }))
    try {
      const r = await window.sharker.importXaiSubscription('hermes')
      if (r.settings) setDraft(r.settings)
      setListMsg((m) => ({
        ...m,
        'xai-grok': r.ok ? '✓ ' + r.message : '✗ ' + r.message
      }))
      if (r.ok) {
        autoFetchedRef.current.delete('xai-grok')
        void refreshModels('xai-grok', {
          settingsSnapshot: r.settings ?? undefined
        })
      }
    } catch (e) {
      setListMsg((m) => ({
        ...m,
        'xai-grok': '✗ ' + (e instanceof Error ? e.message : String(e))
      }))
    } finally {
      setSubBusy(null)
    }
  }

  const readyProviders = configuredProviders(draft.providers)
  const activeProvider = draft.providers.find((p) => p.id === draft.activeProviderId)
  const activeLabel = activeProvider
    ? isProviderConfigured(activeProvider)
      ? activeProvider.name
      : `${activeProvider.name}（未配置）`
    : '暂不使用'

  const missingPresets = PROVIDER_PRESETS.filter(
    (preset) => !draft.providers.some((p) => p.id === preset.id)
  )

  const defaultModelOptions = [
    { value: '', label: '暂不使用' },
    ...readyProviders.map((p) => ({
      value: p.id,
      label: p.model?.trim() || p.name || '未命名'
    })),
    /** 当前选中但尚未配置时仍显示一行，避免下拉空白 */
    ...(activeProvider &&
    !isProviderConfigured(activeProvider) &&
    draft.activeProviderId
      ? [
          {
            value: activeProvider.id,
            label: `${activeProvider.model?.trim() || activeProvider.name}（未配置）`
          }
        ]
      : [])
  ]

  return (
    <>
      <SettingsSection title="对话">
        <SettingsCard>
          <SettingsRow
            title="默认模型"
            description={
              readyProviders.length === 0
                ? '请先在下方配置 API Key 或订阅'
                : `当前：${activeLabel}`
            }
            last
          >
            <SettingsSelect
              id="active-provider"
              value={draft.activeProviderId}
              onChange={setActiveProvider}
              placeholder="暂不使用"
              options={defaultModelOptions}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="API 配置">
        <p className="provider-section-hint">
          <strong>DeepSeek / Kimi / 智谱</strong>用 API Key；
          <strong>ChatGPT / Grok</strong>是<strong>订阅登录导入</strong>（不是 sk- Key）。
          模型一律用下拉选择；点「刷新模型」同步官方列表。
        </p>

        {draft.providers.length === 0 ? (
          <SettingsCard>
            <p className="provider-empty">还没有 API，点击下方添加或恢复内置接入。</p>
          </SettingsCard>
        ) : (
          <div className="provider-list">
            {draft.providers.map((p) => {
              const isActive = p.id === draft.activeProviderId
              const preset = getProviderPreset(p.id)
              const options =
                modelOptions[p.id]?.length
                  ? modelOptions[p.id]
                  : knownModelsForProvider(p.id, p.model)
              const current = p.model?.trim() ?? ''
              const selectValue =
                current && options.includes(current)
                  ? current
                  : current || options[0] || ''
              const thinkingOpts = resolveThinkingOptions(p)
              const thinkingValue =
                p.thinkingLevel && thinkingOpts.some((o) => o.id === p.thinkingLevel)
                  ? p.thinkingLevel
                  : defaultThinkingLevel(p)
              const thinkingHint = thinkingOpts.find((o) => o.id === thinkingValue)?.hint

              return (
                <div key={p.id} className={`provider-card ${isActive ? 'active' : ''}`}>
                  <div className="provider-card-head">
                    <ProviderBrandIcon provider={p} size={22} className="provider-card-brand" />
                    <input
                      className="provider-name-input"
                      value={p.name}
                      onChange={(e) => updateProvider(p.id, 'name', e.target.value)}
                      placeholder="配置名称"
                    />
                    {isActive && <span className="provider-active-tag">使用中</span>}
                  </div>
                  {preset?.hint ? <p className="provider-preset-hint">{preset.hint}</p> : null}
                  <div className="provider-fields">
                    <label>
                      <span>Base URL</span>
                      <input
                        value={p.baseUrl}
                        onChange={(e) => updateProvider(p.id, 'baseUrl', e.target.value)}
                        placeholder={preset?.baseUrl || 'https://api.openai.com/v1'}
                      />
                    </label>
                    {(p.authMode ?? preset?.authMode) === 'subscription' ? (
                      <div className="provider-subscription-block">
                        <span className="provider-sub-label">订阅状态</span>
                        <p className="provider-sub-status">
                          {p.apiKey?.trim()
                            ? p.subscriptionLabel || '已导入订阅 token'
                            : '未连接 · 请浏览器登录后导入（无需 API Key）'}
                        </p>
                        {p.id === 'xai-grok' && xaiDeviceHint?.userCode ? (
                          <div className="provider-device-code">
                            <span className="provider-device-code-label">设备码</span>
                            <code className="provider-device-code-value">
                              {xaiDeviceHint.userCode}
                            </code>
                            <span className="provider-device-code-hint">
                              浏览器应打开 accounts.x.ai/oauth2/device?user_code=…
                            </span>
                          </div>
                        ) : null}
                        <div className="provider-sub-actions">
                          {p.id === 'openai-chatgpt' ? (
                            <button
                              type="button"
                              className="provider-sub-btn"
                              disabled={subBusy === p.id}
                              onClick={() => void importChatgpt()}
                            >
                              {subBusy === p.id ? '导入中…' : '导入 ChatGPT 订阅（Codex）'}
                            </button>
                          ) : null}
                          {p.id === 'xai-grok' ? (
                            <>
                              <button
                                type="button"
                                className="provider-sub-btn"
                                disabled={subBusy === p.id}
                                onClick={() => void importXaiDevice()}
                              >
                                {subBusy === p.id
                                  ? xaiDeviceHint?.userCode
                                    ? `等待确认 ${xaiDeviceHint.userCode}…`
                                    : '登录中…'
                                  : '浏览器登录 SuperGrok'}
                              </button>
                              <button
                                type="button"
                                className="provider-sub-btn provider-sub-btn--secondary"
                                disabled={subBusy === p.id}
                                onClick={() => void importXaiHermes()}
                              >
                                从 Hermes 导入
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <label>
                        <span>API Key</span>
                        <input
                          type="password"
                          value={p.apiKey}
                          onChange={(e) => {
                            updateProvider(p.id, 'apiKey', e.target.value)
                            autoFetchedRef.current.delete(p.id)
                          }}
                          placeholder={preset?.apiKeyPlaceholder || 'sk-...'}
                        />
                      </label>
                    )}
                    <label className="provider-model-field">
                      <span>模型</span>
                      <div className="provider-model-row">
                        <select
                          className="provider-model-select"
                          value={selectValue}
                          onChange={(e) => {
                            const model = e.target.value
                            updateProvider(p.id, 'model', model)
                            // 换模型后重置为该模型官方默认思考档
                            const nextP = { ...p, model }
                            const opts = resolveThinkingOptions(nextP)
                            if (opts.length === 0) {
                              updateProvider(p.id, 'thinkingLevel', '')
                            } else {
                              updateProvider(p.id, 'thinkingLevel', defaultThinkingLevel(nextP))
                            }
                          }}
                          aria-label="选择模型"
                        >
                          {current && !options.includes(current) ? (
                            <option value={current}>{current}（当前）</option>
                          ) : null}
                          {options.length === 0 ? (
                            <option value="">暂无模型</option>
                          ) : (
                            options.map((id) => (
                              <option key={id} value={id}>
                                {formatModelLabel(id)}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          className="provider-refresh-models"
                          disabled={listingId === p.id}
                          onClick={() => void refreshModels(p.id)}
                          title="从官方 /models 同步最新列表"
                        >
                          {listingId === p.id ? '同步中…' : '刷新模型'}
                        </button>
                      </div>
                      <span className="provider-model-count">
                        {options.length} 个可选
                        {current ? ` · 当前 ${current}` : ''}
                        {preset?.id === 'deepseek'
                          ? ' · 官方主推 deepseek-v4-flash / deepseek-v4-pro'
                          : ''}
                      </span>
                    </label>
                    {thinkingOpts.length > 0 ? (
                      <label className="provider-model-field">
                        <span>思考水平</span>
                        <div className="provider-model-row">
                          <select
                            className="provider-model-select"
                            value={thinkingValue}
                            onChange={(e) =>
                              updateProvider(p.id, 'thinkingLevel', e.target.value)
                            }
                            aria-label="思考水平"
                          >
                            {thinkingOpts.map((opt) => (
                              <option key={opt.id} value={opt.id} title={opt.hint}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span className="provider-model-count">
                          仅官方支持的档位
                          {thinkingHint ? ` · ${thinkingHint}` : ''}
                        </span>
                      </label>
                    ) : null}
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
                    {preset?.docsUrl ? (
                      <a
                        className="provider-docs-link"
                        href={preset.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.preventDefault()
                          void window.sharker?.openExternal?.(preset.docsUrl!)
                        }}
                      >
                        获取 Key
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn-danger-ghost"
                      onClick={() => removeProvider(p.id)}
                    >
                      删除
                    </button>
                  </div>
                  {listMsg[p.id] && (
                    <p
                      className={`test-result ${listMsg[p.id].startsWith('✓') ? 'ok' : listMsg[p.id].startsWith('✗') || listMsg[p.id].includes('重启') ? 'err' : ''}`}
                    >
                      {listMsg[p.id]}
                    </p>
                  )}
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

        {missingPresets.length > 0 ? (
          <div className="provider-preset-restore">
            <span className="provider-preset-restore-label">恢复内置接入</span>
            <div className="provider-preset-chips">
              {missingPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="provider-preset-chip"
                  onClick={() => addPreset(preset.id)}
                >
                  + {preset.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button type="button" className="btn-add-provider" onClick={addProvider}>
          + 添加自定义 API
        </button>
      </SettingsSection>
    </>
  )
}

/** 下拉展示：技术 id + 可读名 */
function formatModelLabel(id: string): string {
  const map: Record<string, string> = {
    'deepseek-v4-flash': 'deepseek-v4-flash · V4 Flash',
    'deepseek-v4-pro': 'deepseek-v4-pro · V4 Pro',
    'grok-4': 'grok-4',
    'grok-4.5': 'grok-4.5',
    'grok-4.3': 'grok-4.3',
    'grok-build-0.1': 'grok-build-0.1',
    'gpt-5.2': 'gpt-5.2',
    'gpt-5.1': 'gpt-5.1',
    'gpt-5': 'gpt-5',
    'gpt-5-mini': 'gpt-5-mini',
    'gpt-4.1': 'gpt-4.1',
    'kimi-k2.6': 'kimi-k2.6',
    'kimi-k2.5': 'kimi-k2.5',
    'glm-4.7': 'glm-4.7',
    'glm-5': 'glm-5',
    'glm-5.1': 'glm-5.1'
  }
  return map[id] ?? id
}
