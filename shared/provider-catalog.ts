/**
 * 内置模型接入预设（OpenAI 兼容 Chat Completions）。
 * 稳定 id，供默认设置与「一键添加」使用。
 *
 * 鉴权：
 * - api_key：官方 Key（DeepSeek / Kimi / 智谱 Coding Plan）
 * - subscription：浏览器订阅登录后导入（ChatGPT Plus/Pro、SuperGrok）
 */
import type { ProviderAuthMode, ProviderConfig } from './types'

/** 内置预设 id（写入 ProviderConfig.id，勿随意改） */
export type BuiltinProviderId =
  | 'deepseek'
  | 'xai-grok'
  | 'openai-chatgpt'
  | 'kimi'
  | 'zhipu-coding'

/** 内置接入模板 */
export interface ProviderPreset {
  id: BuiltinProviderId
  name: string
  baseUrl: string
  model: string
  contextWindow?: number
  vision?: boolean
  authMode: ProviderAuthMode
  /**
   * 官方已知模型（下拉兜底；有 Key/订阅后会再与 /models 合并）。
   * 名称必须与官方 API model id 一致。
   */
  knownModels: string[]
  /** 设置页说明 */
  hint: string
  apiKeyPlaceholder: string
  /** 获取 Key / 订阅入口 */
  docsUrl?: string
}

/**
 * 默认支持的接入（2026-08 对齐公开文档）：
 * - DeepSeek 官方 API：deepseek-v4-flash / deepseek-v4-pro
 * - xAI SuperGrok 订阅（浏览器登录导入，非 console API Key）
 * - OpenAI ChatGPT 订阅（Codex/ChatGPT OAuth 导入，非 Platform sk-）
 * - Kimi（Moonshot）API
 * - 智谱 GLM Coding Plan 专用端点
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    contextWindow: 1_000_000,
    vision: false,
    authMode: 'api_key',
    knownModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    hint: 'DeepSeek 官方 API Key。下拉选 V4 Flash / V4 Pro；可刷新 /models。',
    apiKeyPlaceholder: 'sk-…（platform.deepseek.com）',
    docsUrl: 'https://platform.deepseek.com'
  },
  {
    id: 'xai-grok',
    name: 'xAI Grok 订阅',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4',
    contextWindow: 256_000,
    vision: true,
    authMode: 'subscription',
    // 与 xAI / Hermes SuperGrok 侧常见 id 对齐
    knownModels: [
      'grok-4',
      'grok-4.5',
      'grok-4.3',
      'grok-build-0.1',
      'grok-4-1-fast-reasoning',
      'grok-4-1-fast',
      'grok-3',
      'grok-3-mini'
    ],
    hint: 'SuperGrok / X Premium+：点登录会打开 accounts.x.ai/oauth2/device?user_code=… 设备码页（不是账户设置页）。',
    apiKeyPlaceholder: '（订阅 token，由导入写入）',
    docsUrl: 'https://accounts.x.ai/'
  },
  {
    id: 'openai-chatgpt',
    name: 'ChatGPT 订阅',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.2',
    contextWindow: 256_000,
    vision: true,
    authMode: 'subscription',
    knownModels: [
      'gpt-5.2',
      'gpt-5.1',
      'gpt-5',
      'gpt-5-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'o3',
      'o4-mini'
    ],
    hint: 'ChatGPT Plus/Pro 订阅：用 Codex `codex login` 浏览器登录后「导入订阅」，不是 Platform sk- API Key。',
    apiKeyPlaceholder: '（订阅 token，由导入写入）',
    docsUrl: 'https://chatgpt.com/'
  },
  {
    id: 'kimi',
    name: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',
    contextWindow: 256_000,
    vision: true,
    authMode: 'api_key',
    knownModels: [
      'kimi-k2.6',
      'kimi-k2.5',
      'kimi-k2',
      'kimi-k2-turbo-preview',
      'kimi-k2-thinking',
      'kimi-k2-0905-preview',
      'moonshot-v1-128k',
      'moonshot-v1-32k',
      'moonshot-v1-8k'
    ],
    hint: '月之暗面 Kimi API Key。国内 api.moonshot.cn；国际可改 api.moonshot.ai/v1。',
    apiKeyPlaceholder: 'sk-…（platform.moonshot.cn）',
    docsUrl: 'https://platform.moonshot.cn'
  },
  {
    id: 'zhipu-coding',
    name: '智谱 Coding Plan',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    model: 'glm-4.7',
    contextWindow: 200_000,
    vision: false,
    authMode: 'api_key',
    // Coding Plan 套餐常见模型 id（以套餐控制台为准，可刷新 /models）
    knownModels: [
      'glm-4.7',
      'glm-4.6',
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-flash',
      'glm-4-plus',
      'glm-4-air',
      'glm-4-flash',
      'glm-5',
      'glm-5.1'
    ],
    hint: '智谱编码套餐专用端点 /api/coding/paas/v4（勿填通用 /api/paas/v4）。',
    apiKeyPlaceholder: '…（bigmodel.cn 编程套餐 API Key）',
    docsUrl: 'https://bigmodel.cn/coding-plan'
  }
] as const

/** 预设 → 可写入设置的 ProviderConfig */
export function presetToProvider(preset: ProviderPreset): ProviderConfig {
  return {
    id: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    apiKey: '',
    model: preset.model,
    contextWindow: preset.contextWindow,
    vision: preset.vision,
    authMode: preset.authMode
  }
}

/** 全部内置预设转 ProviderConfig 列表 */
export function builtinProviders(): ProviderConfig[] {
  return PROVIDER_PRESETS.map(presetToProvider)
}

/**
 * 是否已配置可调用：API Key 或订阅 token 非空。
 * 聊天模型切换、默认模型下拉只展示这些，避免空壳预设刷屏。
 */
export function isProviderConfigured(p: ProviderConfig): boolean {
  return Boolean(p?.apiKey?.trim())
}

/** 仅已配置接入（有 Key/订阅 token） */
export function configuredProviders(providers: ProviderConfig[] | undefined | null): ProviderConfig[] {
  return (providers ?? []).filter(isProviderConfigured)
}

/** 按 id 查预设 */
export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

/** 预设已知模型 + 当前值，供下拉初始选项 */
export function knownModelsForProvider(
  providerId: string,
  currentModel?: string
): string[] {
  const preset = getProviderPreset(providerId)
  const base = preset?.knownModels ? [...preset.knownModels] : []
  const cur = currentModel?.trim()
  if (cur && !base.includes(cur)) base.unshift(cur)
  return base
}

/**
 * 合并官方拉取列表与已知列表：官方优先，已知兜底。
 */
export function mergeModelLists(
  fetched: string[],
  known: string[],
  currentModel?: string
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (id: string) => {
    const t = id.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  for (const id of fetched) push(id)
  for (const id of known) push(id)
  if (currentModel?.trim()) push(currentModel)
  return out
}

/**
 * 保证内置预设存在：已有同 id 则保留用户配置（不覆盖 Key/模型），缺失则追加。
 * 同步补上 authMode（旧数据无该字段时）。
 */
export function ensureBuiltinProviders(providers: ProviderConfig[]): ProviderConfig[] {
  const list = Array.isArray(providers) ? [...providers] : []
  const have = new Set(list.map((p) => p.id))
  for (const preset of PROVIDER_PRESETS) {
    if (!have.has(preset.id)) {
      list.push(presetToProvider(preset))
      have.add(preset.id)
    }
  }
  return list.map((p) => {
    const preset = getProviderPreset(p.id)
    if (!preset) return p
    if (p.authMode) return p
    return { ...p, authMode: preset.authMode, name: p.name || preset.name }
  })
}
