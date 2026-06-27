/**
 * Provider 视觉能力判断（Computer Use 截图回灌用）。
 * @see docs/agent-capabilities.md
 */
import type { AppSettings, ProviderConfig } from './types'

/** 按模型名启发式判断是否支持视觉 */
export function inferProviderVision(provider: ProviderConfig): boolean {
  if (provider.vision === true) return true
  if (provider.vision === false) return false
  const m = provider.model.toLowerCase()
  return /gpt-4o|gpt-4-turbo|gpt-4-vision|o1|o3|o4|claude-3|claude-4|gemini|qwen.*vl|glm-4v|vision|4v|gpt-5|composer/i.test(
    m
  )
}

/** 当前激活模型的 Computer Use 能力提示 */
export function getComputerUseModelHint(settings: AppSettings): {
  modelId: string
  providerName: string
  vision: boolean
  recommendation: string
} {
  const p = settings.providers.find((x) => x.id === settings.activeProviderId)
  if (!p) {
    return {
      modelId: '',
      providerName: '',
      vision: false,
      recommendation: '请先在 设置 → 模型 中选择 API 与模型。'
    }
  }
  const vision = inferProviderVision(p)
  const flashLike = /flash|mini|lite|fast|step-3/i.test(p.model)
  let recommendation = vision
    ? '当前模型支持视觉截图回灌，可用于微信等无 AT-SPI 应用。'
    : '当前模型可能不支持看图。微信/桌面任务请在 设置 → 模型 中启用「视觉」或换 gpt-4o、Claude、Gemini 等视觉模型。'
  if (flashLike) {
    recommendation +=
      ' 轻量模型（如 step-*-flash）常不支持原生工具调用，会在正文输出 XML 导致卡住；建议换更强模型。'
  }
  return {
    modelId: p.model,
    providerName: p.name,
    vision,
    recommendation
  }
}
