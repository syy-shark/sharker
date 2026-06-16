/**
 * 各模型 context 上限解析与 token 格式化。
 * 详见 shared/README.md
 */

/** 已知模型 ID → 上下文 token 上限（对照各厂商官方文档，2025–2026） */
const EXACT_MODEL_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4o-2024-08-06': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4-turbo-preview': 128_000,
  'gpt-4': 128_000,
  'gpt-3.5-turbo': 16_385,
  'gpt-4.1': 128_000,
  'gpt-4.1-mini': 128_000,
  'o1': 200_000,
  'o1-mini': 128_000,
  'o1-preview': 128_000,
  'o3-mini': 200_000,
  'o3': 200_000,
  // Anthropic Claude
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-sonnet-latest': 200_000,
  'claude-3-5-haiku-latest': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-opus-4-20250514': 200_000,
  'claude-opus-4-6': 1_000_000,
  'claude-haiku-4-5': 200_000,
  // DeepSeek
  'deepseek-chat': 1_000_000,
  'deepseek-reasoner': 1_000_000,
  'deepseek-coder': 64_000,
  'deepseek-v3': 64_000,
  'deepseek-v3.1': 128_000,
  'deepseek-v3.2': 128_000,
  'deepseek-v4': 1_000_000,
  'deepseek-v4-flash': 1_000_000,
  'deepseek-v4-pro': 1_000_000,
  'deepseek-r1': 64_000,
  // 智谱 GLM
  'glm-4': 128_000,
  'glm-4-plus': 128_000,
  'glm-4-air': 128_000,
  'glm-4-airx': 128_000,
  'glm-4-flash': 128_000,
  'glm-4-flashx': 128_000,
  'glm-4-long': 1_000_000,
  'glm-4.5': 128_000,
  'glm-4.5-air': 128_000,
  'glm-4.5-flash': 128_000,
  'glm-4.6': 200_000,
  'glm-4.7': 200_000,
  'glm-4.7-flash': 200_000,
  // Kimi / Moonshot
  'moonshot-v1-8k': 8_192,
  'moonshot-v1-32k': 32_768,
  'moonshot-v1-128k': 131_072,
  'kimi-k2': 256_000,
  'kimi-k2.5': 256_000,
  'kimi-k2.6': 256_000,
  'kimi-k2-turbo-preview': 256_000,
  'kimi-k2-0905-preview': 256_000,
  'kimi-k2-thinking': 256_000,
  'kimi-k2-0711-preview': 128_000,
  // MiniMax
  'minimax-m3': 1_000_000,
  'minimax-m2.7': 204_800,
  'minimax-m2.7-highspeed': 204_800,
  'minimax-m2.5': 204_800,
  'minimax-m2.5-highspeed': 204_800,
  'minimax-m2.1': 204_800,
  'minimax-m2': 204_800,
  'm2-her': 64_000,
  // 通义千问
  'qwen-max': 32_768,
  'qwen-plus': 131_072,
  'qwen-turbo': 131_072,
  'qwen2.5-72b-instruct': 131_072,
  'qwen3-235b-a22b': 131_072
}

/** 模型 ID 子串 / 正则 → 上限 */
const PATTERN_LIMITS: { pattern: RegExp; limit: number }[] = [
  { pattern: /claude[-_]?opus[-_]?4[-_.]6|claude[-_]?sonnet[-_]?4[-_.]6/i, limit: 1_000_000 },
  { pattern: /minimax[-_]?m3/i, limit: 1_000_000 },
  { pattern: /deepseek[-_]?v4|deepseek[-_]?chat|deepseek[-_]?reasoner/i, limit: 1_000_000 },
  { pattern: /glm[-_]?4[-_.]long/i, limit: 1_000_000 },
  { pattern: /kimi[-_]?k2/i, limit: 256_000 },
  { pattern: /[-_/]1m\b|1[-_]?million|1000000/i, limit: 1_000_000 },
  { pattern: /[-_/]256k\b|256000/i, limit: 256_000 },
  { pattern: /[-_/]200k\b|200000/i, limit: 200_000 },
  { pattern: /[-_/]128k\b|128000/i, limit: 128_000 },
  { pattern: /[-_/]64k\b|64000/i, limit: 64_000 },
  { pattern: /[-_/]32k\b|32000/i, limit: 32_768 },
  { pattern: /[-_/]8k\b|8192/i, limit: 8_192 },
  { pattern: /claude[-_]?3[-_.]5|claude[-_]?sonnet|claude[-_]?opus|claude[-_]?haiku/i, limit: 200_000 },
  { pattern: /gpt[-_]?4o|gpt[-_]?4[-_]1|gpt[-_]?4[-_]turbo/i, limit: 128_000 },
  { pattern: /minimax[-_]?m2/i, limit: 204_800 },
  { pattern: /moonshot[-_]?v1[-_]128/i, limit: 131_072 },
  { pattern: /moonshot[-_]?v1[-_]32/i, limit: 32_768 },
  { pattern: /moonshot[-_]?v1[-_]8/i, limit: 8_192 },
  { pattern: /glm[-_]?4/i, limit: 128_000 },
  { pattern: /deepseek/i, limit: 1_000_000 },
  { pattern: /qwen2\.5|qwen[-_]?plus|qwen[-_]?max|qwen3/i, limit: 131_072 }
]

/** 未识别模型时的默认上下文上限 */
export const DEFAULT_CONTEXT_LIMIT = 128_000

/** 上下文上限的来源类型 */
export type ContextLimitSource = 'manual' | 'catalog' | 'pattern' | 'default'

/** 解析后的模型上下文上限 */
export interface ResolvedContextLimit {
  limit: number
  source: ContextLimitSource
  model: string
}

/** 优先级：手动覆盖 > 精确表 > 后缀匹配 > 名称正则 > 默认 128k */
export function resolveContextLimit(
  model: string,
  manualOverride?: number
): ResolvedContextLimit {
  const id = model.trim()
  if (manualOverride != null && manualOverride > 0) {
    return { limit: manualOverride, source: 'manual', model: id }
  }

  const lower = id.toLowerCase()
  if (lower) {
    if (EXACT_MODEL_LIMITS[lower]) {
      return { limit: EXACT_MODEL_LIMITS[lower], source: 'catalog', model: id }
    }
    for (const [key, limit] of Object.entries(EXACT_MODEL_LIMITS)) {
      if (lower === key.toLowerCase() || lower.endsWith('/' + key.toLowerCase())) {
        return { limit, source: 'catalog', model: id }
      }
    }
    for (const { pattern, limit } of PATTERN_LIMITS) {
      if (pattern.test(id)) {
        return { limit, source: 'pattern', model: id }
      }
    }
  }

  return { limit: DEFAULT_CONTEXT_LIMIT, source: 'default', model: id || '—' }
}

/** 将 token 数格式化为 k/M 可读字符串 */
export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  const v = Math.round(n)
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(2).replace(/\.?0+$/, '')}M`
  }
  if (v >= 10_000) return `${Math.round(v / 1000)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return v.toLocaleString()
}

/** 上限来源类型的中文说明 */
export function contextLimitSourceLabel(source: ContextLimitSource): string {
  switch (source) {
    case 'manual':
      return '设置中手动填写'
    case 'catalog':
      return '官方模型库匹配'
    case 'pattern':
      return '按模型名称规则识别'
    default:
      return '未识别模型，默认 128k'
  }
}
