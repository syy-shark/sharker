/**
 * 各厂商官方「思考 / 推理水平」能力表与请求体映射。
 * 只暴露该模型官方文档支持的档位，没有就不显示。
 *
 * 参考（2026-08）：
 * - DeepSeek Thinking Mode：thinking.type + reasoning_effort low/high/max
 * - xAI Grok：4.6 low/medium/high/xhigh；4.5 low/medium/high
 * - OpenAI GPT-5.6：reasoning_effort none/minimal/low/medium/high/xhigh
 * - Kimi K3：顶层 reasoning_effort low/high/max；K2.7 Code：thinking.type
 * - 智谱 GLM-5.2：thinking.type + reasoning_effort
 * - OpenCode Go：同一网关多厂商 id，按模型名前缀走上面各表（不单独成一家）
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

/** Official desktop composer: Light (CLI Low). learn.chatgpt.com/docs/models */
export const REASONING_LIGHT_LABEL = 'Light'
/** Official desktop / CLI Medium. */
export const REASONING_MEDIUM_LABEL = 'Medium'
/** Official desktop / CLI High. */
export const REASONING_HIGH_LABEL = 'High'
/** Official desktop Extra High (config `xhigh`). */
export const REASONING_EXTRA_HIGH_LABEL = 'Extra High'
/** Official desktop Max. Do not invent Ultra in the picker. */
export const REASONING_MAX_LABEL = 'Max'
/** Official Models page heading for the effort control. */
export const PICK_REASONING_EFFORT_LABEL = 'Pick a reasoning effort'

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
        { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
        { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' },
        { id: 'max', label: REASONING_MAX_LABEL, hint: 'reasoning_effort=max' }
      ]

    case 'xai':
      // grok-4.6：low/medium/high/xhigh，默认 high
      if (/grok-4\.6|grok-4-6/.test(model)) {
        return [
          { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
          { id: 'medium', label: REASONING_MEDIUM_LABEL, hint: 'reasoning_effort=medium' },
          { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' },
          { id: 'xhigh', label: REASONING_EXTRA_HIGH_LABEL, hint: 'reasoning_effort=xhigh' }
        ]
      }
      // grok-4.5：low/medium/high，不可关闭，默认 high
      if (/grok-4\.5|grok-4-5/.test(model)) {
        return [
          { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
          { id: 'medium', label: REASONING_MEDIUM_LABEL, hint: 'reasoning_effort=medium' },
          { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' }
        ]
      }
      // 其它 grok id（刷新 /models 可能带回）：按 4.6 档位
      if (/^grok-/.test(model)) {
        return [
          { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
          { id: 'medium', label: REASONING_MEDIUM_LABEL, hint: 'reasoning_effort=medium' },
          { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' },
          { id: 'xhigh', label: REASONING_EXTRA_HIGH_LABEL, hint: 'reasoning_effort=xhigh' }
        ]
      }
      return []

    case 'openai':
      // o1/o3/o4 与 GPT-5 系：reasoning_effort
      if (/^o[1-9]|o3|o4|gpt-5/.test(model) || /o3-mini|o4-mini|o1-pro/.test(model)) {
        // 主流：low / medium / high；新模型另有 none/minimal/xhigh/max，这里给常用+扩展
        if (/gpt-5/.test(model)) {
          return [
            { id: 'none', label: '无', hint: 'reasoning_effort=none' },
            { id: 'minimal', label: '最低', hint: 'reasoning_effort=minimal' },
            { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
            { id: 'medium', label: REASONING_MEDIUM_LABEL, hint: 'reasoning_effort=medium' },
            { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' },
            { id: 'xhigh', label: REASONING_EXTRA_HIGH_LABEL, hint: 'reasoning_effort=xhigh' }
          ]
        }
        return [
          { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
          { id: 'medium', label: REASONING_MEDIUM_LABEL, hint: 'reasoning_effort=medium' },
          { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' }
        ]
      }
      return []

    case 'kimi':
      // K3：顶层 reasoning_effort low|high|max，默认 max
      if (/kimi-k3/.test(model)) {
        return [
          { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort=low' },
          { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' },
          { id: 'max', label: REASONING_MAX_LABEL, hint: 'reasoning_effort=max' }
        ]
      }
      // K2.7 Code：thinking.type enabled|disabled
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
          { id: 'low', label: REASONING_LIGHT_LABEL, hint: 'reasoning_effort≈high' },
          { id: 'high', label: REASONING_HIGH_LABEL, hint: 'reasoning_effort=high' },
          { id: 'max', label: REASONING_MAX_LABEL, hint: 'reasoning_effort=max' }
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
  if (kind === 'kimi') {
    if (/kimi-k3/i.test(provider.model ?? '')) return 'max'
    return 'on'
  }
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
      if (level === 'low' || level === 'medium' || level === 'high' || level === 'xhigh') {
        return { reasoning_effort: level }
      }
      return { reasoning_effort: 'high' }
    }

    case 'openai': {
      // Chat Completions 使用顶层 reasoning_effort
      return { reasoning_effort: level }
    }

    case 'kimi': {
      if (/kimi-k3/.test(model)) {
        const effort = level === 'low' || level === 'high' || level === 'max' ? level : 'max'
        return { reasoning_effort: effort }
      }
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

/** 设置页 / 输入框旁：当前档位官方桌面名（Light / Medium / High / Extra High / Max） */
export function thinkingLevelLabel(provider: ProviderConfig): string {
  const id = provider.thinkingLevel || defaultThinkingLevel(provider)
  const opt = resolveThinkingOptions(provider).find((o) => o.id === id)
  return opt?.label ?? '—'
}

/** 输入框旁思考条：当前档在官方选项里的下标（对标 Codex composer gauge） */
export function thinkingGaugeIndex(
  options: Array<{ id: string }>,
  current: string
): number {
  const idx = options.findIndex((o) => o.id === current)
  return idx >= 0 ? idx : 0
}

/** Alt+, / Alt+. 升降思考档（对标 Codex reasoning depth） */
export function stepThinkingLevel(
  options: Array<{ id: string }>,
  current: string,
  delta: number
): string | null {
  if (!options.length) return null
  const idx = options.findIndex((o) => o.id === current)
  const from = idx >= 0 ? idx : 0
  const next = Math.max(0, Math.min(options.length - 1, from + delta))
  return options[next]?.id ?? null
}

/** Settings → Keyboard Shortcuts Cycle reasoning effort：绕回官方档位，默认不绑 */
export function cycleThinkingLevel(
  options: Array<{ id: string }>,
  current: string
): string | null {
  if (!options.length) return null
  const idx = options.findIndex((o) => o.id === current)
  const from = idx >= 0 ? idx : -1
  const next = (from + 1 + options.length) % options.length
  return options[next]?.id ?? null
}

const REASONING_ALIASES: Record<string, string[]> = {
  off: ['off', 'none', 'disable', 'disabled'],
  none: ['none', 'off'],
  minimal: ['minimal', 'min'],
  low: ['low', 'l', 'light'],
  medium: ['medium', 'mid', 'med'],
  high: ['high', 'h'],
  xhigh: ['xhigh', 'x-high', 'extra', 'extra high', 'extrahigh'],
  max: ['max', 'maximum']
}

/** `/reasoning` 参数：空则查看；档位 id / 别名则设定（对标 Codex /reasoning） */
export function parseReasoningArgs(
  args: string,
  options: Array<{ id: string; label?: string }>
): { kind: 'status' } | { kind: 'set'; id: string } | { kind: 'unknown'; raw: string } {
  const raw = args.trim().toLowerCase()
  if (!raw) return { kind: 'status' }
  const exact = options.find(
    (o) => o.id.toLowerCase() === raw || String(o.label || '').toLowerCase() === raw
  )
  if (exact) return { kind: 'set', id: exact.id }
  for (const [id, names] of Object.entries(REASONING_ALIASES)) {
    if (names.includes(raw) && options.some((o) => o.id === id)) return { kind: 'set', id }
  }
  return { kind: 'unknown', raw }
}

/** `/reasoning` 状态文案 */
export function formatReasoningStatus(opts: {
  supported: boolean
  current?: string
  options: Array<{ id: string; label?: string }>
  unknown?: string
}): string {
  if (!opts.supported) {
    return '当前模型没有思考档位，`/reasoning` 不会改请求参数。'
  }
  const lines = ['**思考档位**（对标 Codex `/reasoning`）', '']
  for (const o of opts.options) {
    const mark = o.id === opts.current ? ' ← 当前' : ''
    lines.push(`- \`${o.id}\` ${o.label || ''}${mark}`.trimEnd())
  }
  if (opts.unknown) {
    lines.push('', `未识别档位 \`${opts.unknown}\`。`)
  }
  lines.push(
    '',
    '用法：`/reasoning [off|low|medium|high|max|…]`，空参数查看当前档。输入框旁思考条可点选，⌥, / ⌥. 也可升降。'
  )
  return lines.join('\n')
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
