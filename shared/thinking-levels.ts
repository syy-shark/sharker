/**
 * 各厂商官方「思考 / 推理水平」能力表与请求体映射。
 * 只暴露该模型官方文档支持的档位，没有就不显示。
 *
 * 参考（2026-08）：
 * - DeepSeek Thinking Mode：thinking.type + reasoning_effort low/high/max
 * - xAI Grok：reasoning_effort（4.5: low/medium/high；4.3: none/low/medium/high）
 * - OpenAI o 系列 / GPT-5：reasoning_effort low/medium/high（部分支持更多）
 * - Kimi：thinking.type enabled/disabled
 * - 智谱 GLM：thinking.type +（GLM-5.2+）reasoning_effort
 */
import type { ProviderConfig } from './types'

/** 设置里可选的思考档位（统一 id，按厂商映射到官方参数） */
export interface ThinkingLevelOption {
  /** 写入 ProviderConfig.thinkingLevel */
  id: string
  /** UI 文案 */
  label: string
  /** 简短说明 */
  hint?: string
}

/** 当前模型是否支持思考水平配置 */
export function supportsThinkingLevels(provider: ProviderConfig): boolean {
  return resolveThinkingOptions(provider).length > 0
}

/**
 * 按 baseUrl + model 解析可选档位。
 * 无官方支持时返回空数组 → UI 不展示。
 */
export function resolveThinkingOptions(provider: ProviderConfig): ThinkingLevelOption[] {
  const model = (provider.model ?? '').trim().toLowerCase()
  const host = hostOf(provider.baseUrl)
  const kind = detectProviderKind(provider.id, host, model)

  switch (kind) {
    case 'deepseek':
      // OpenAI 格式：thinking.type + reasoning_effort low|high|max；默认开启 high
      // https://api-docs.deepseek.com/guides/thinking_mode
      if (!/deepseek/.test(model) && kind === 'deepseek') {
        // 自定义模型 id 仍按 DeepSeek 端点处理
      }
      return [
        { id: 'off', label: '关闭思考', hint: 'thinking.type=disabled' },
        { id: 'low', label: '低', hint: 'reasoning_effort=low' },
        { id: 'high', label: '高（默认）', hint: 'reasoning_effort=high' },
        { id: 'max', label: '最大', hint: 'reasoning_effort=max' }
      ]

    case 'xai':
      // grok-4.5：low/medium/high，不可关闭，默认 high
      if (/grok-4\.5|grok-4-5|grok-4\.20|grok-4-20|grok-build/.test(model)) {
        return [
          { id: 'low', label: '低', hint: 'reasoning_effort=low' },
          { id: 'medium', label: '中', hint: 'reasoning_effort=medium' },
          { id: 'high', label: '高（默认）', hint: 'reasoning_effort=high' }
        ]
      }
      // grok-4.3：none/low/medium/high
      if (/grok-4\.3|grok-4-3/.test(model)) {
        return [
          { id: 'off', label: '关闭', hint: 'reasoning_effort=none' },
          { id: 'low', label: '低', hint: 'reasoning_effort=low' },
          { id: 'medium', label: '中', hint: 'reasoning_effort=medium' },
          { id: 'high', label: '高', hint: 'reasoning_effort=high' }
        ]
      }
      // grok-4-1-fast / grok-4-fast 等：社区与文档常见 low/medium/high
      if (/grok-4.*fast|grok-4-1/.test(model)) {
        return [
          { id: 'low', label: '低', hint: 'reasoning_effort=low' },
          { id: 'medium', label: '中', hint: 'reasoning_effort=medium' },
          { id: 'high', label: '高', hint: 'reasoning_effort=high' }
        ]
      }
      // 纯 grok-4：官方曾写不可配置 reasoning_effort → 不展示
      return []

    case 'openai':
      // o1/o3/o4 与 GPT-5 系：reasoning_effort
      if (/^o[1-9]|o3|o4|gpt-5/.test(model) || /o3-mini|o4-mini|o1-pro/.test(model)) {
        // 主流：low / medium / high；新模型另有 none/minimal/xhigh/max，这里给常用+扩展
        if (/gpt-5/.test(model)) {
          return [
            { id: 'none', label: '无', hint: 'reasoning_effort=none' },
            { id: 'minimal', label: '最低', hint: 'reasoning_effort=minimal' },
            { id: 'low', label: '低', hint: 'reasoning_effort=low' },
            { id: 'medium', label: '中（常用）', hint: 'reasoning_effort=medium' },
            { id: 'high', label: '高', hint: 'reasoning_effort=high' },
            { id: 'xhigh', label: '很高', hint: 'reasoning_effort=xhigh' }
          ]
        }
        return [
          { id: 'low', label: '低', hint: 'reasoning_effort=low' },
          { id: 'medium', label: '中（默认）', hint: 'reasoning_effort=medium' },
          { id: 'high', label: '高', hint: 'reasoning_effort=high' }
        ]
      }
      return []

    case 'kimi':
      // platform.kimi.ai：thinking.type enabled|disabled
      if (/kimi|moonshot|thinking/.test(model) || kind === 'kimi') {
        return [
          { id: 'off', label: '关闭思考', hint: 'thinking.type=disabled' },
          { id: 'on', label: '开启思考（默认）', hint: 'thinking.type=enabled' }
        ]
      }
      return []

    case 'zhipu':
      // thinking.type enabled|disabled；GLM-5.2+ 另有 reasoning_effort
      if (/glm-5\.2|glm-5-2|glm-5\.1|glm-5$|glm-5-/.test(model)) {
        return [
          { id: 'off', label: '关闭思考', hint: 'thinking.type=disabled' },
          { id: 'low', label: '低', hint: 'reasoning_effort≈high' },
          { id: 'high', label: '高', hint: 'reasoning_effort=high' },
          { id: 'max', label: '最大（推荐）', hint: 'reasoning_effort=max' }
        ]
      }
      if (/glm-4\.[5-9]|glm-4-|glm-5/.test(model) || kind === 'zhipu') {
        return [
          { id: 'off', label: '关闭思考', hint: 'thinking.type=disabled' },
          { id: 'on', label: '开启思考（默认）', hint: 'thinking.type=enabled' }
        ]
      }
      return []

    default:
      return []
  }
}

/** 默认档位（官方默认优先） */
export function defaultThinkingLevel(provider: ProviderConfig): string {
  const opts = resolveThinkingOptions(provider)
  if (opts.length === 0) return ''
  const kind = detectProviderKind(provider.id, hostOf(provider.baseUrl), provider.model)
  if (kind === 'deepseek') return 'high'
  if (kind === 'xai') return 'high'
  if (kind === 'openai') return 'medium'
  if (kind === 'kimi') return 'on'
  if (kind === 'zhipu') {
    if (opts.some((o) => o.id === 'max')) return 'max'
    return 'on'
  }
  return opts[0]?.id ?? ''
}

/**
 * 把用户选择的思考水平变成 Chat Completions 请求字段。
 * 不支持时返回 {}。
 */
export function buildThinkingRequestFields(
  provider: ProviderConfig
): Record<string, unknown> {
  const opts = resolveThinkingOptions(provider)
  if (opts.length === 0) return {}

  let level = (provider.thinkingLevel ?? '').trim()
  if (!level || !opts.some((o) => o.id === level)) {
    level = defaultThinkingLevel(provider)
  }

  const kind = detectProviderKind(provider.id, hostOf(provider.baseUrl), provider.model)
  const model = (provider.model ?? '').toLowerCase()

  switch (kind) {
    case 'deepseek': {
      // OpenAI 兼容：thinking + reasoning_effort
      if (level === 'off') {
        return { thinking: { type: 'disabled' } }
      }
      const effort =
        level === 'low' ? 'low' : level === 'max' ? 'max' : 'high'
      return {
        thinking: { type: 'enabled' },
        reasoning_effort: effort
      }
    }

    case 'xai': {
      if (level === 'off') return { reasoning_effort: 'none' }
      if (level === 'low' || level === 'medium' || level === 'high') {
        return { reasoning_effort: level }
      }
      return { reasoning_effort: 'high' }
    }

    case 'openai': {
      // Chat Completions 使用顶层 reasoning_effort
      return { reasoning_effort: level }
    }

    case 'kimi': {
      return {
        thinking: { type: level === 'off' ? 'disabled' : 'enabled' }
      }
    }

    case 'zhipu': {
      if (level === 'off') {
        return { thinking: { type: 'disabled' } }
      }
      if (/glm-5\.2|glm-5-2/.test(model)) {
        const effort =
          level === 'low' ? 'high' : level === 'high' ? 'high' : level === 'max' ? 'max' : 'max'
        return {
          thinking: { type: 'enabled' },
          reasoning_effort: effort
        }
      }
      return { thinking: { type: 'enabled' } }
    }

    default:
      return {}
  }
}

/** 设置页展示：当前档位中文名 */
export function thinkingLevelLabel(provider: ProviderConfig): string {
  const id = provider.thinkingLevel || defaultThinkingLevel(provider)
  const opt = resolveThinkingOptions(provider).find((o) => o.id === id)
  return opt?.label ?? '—'
}

type ProviderKind = 'deepseek' | 'xai' | 'openai' | 'kimi' | 'zhipu' | 'other'

function hostOf(baseUrl: string): string {
  try {
    let b = baseUrl.trim()
    if (!b.startsWith('http')) b = `https://${b}`
    return new URL(b).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function detectProviderKind(id: string, host: string, model: string): ProviderKind {
  const m = model.toLowerCase()
  if (id === 'deepseek' || host.includes('deepseek.com') || m.startsWith('deepseek')) {
    return 'deepseek'
  }
  if (id === 'xai-grok' || host.includes('x.ai') || m.startsWith('grok')) {
    return 'xai'
  }
  if (
    id === 'openai-chatgpt' ||
    host.includes('openai.com') ||
    host.includes('chatgpt.com') ||
    /^o[1-9]|gpt-/.test(m)
  ) {
    return 'openai'
  }
  if (
    id === 'kimi' ||
    host.includes('moonshot') ||
    host.includes('kimi.ai') ||
    m.startsWith('kimi') ||
    m.startsWith('moonshot')
  ) {
    return 'kimi'
  }
  if (
    id === 'zhipu-coding' ||
    host.includes('bigmodel') ||
    host.includes('zhipuai') ||
    m.startsWith('glm')
  ) {
    return 'zhipu'
  }
  return 'other'
}
