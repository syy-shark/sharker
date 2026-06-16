/**
 * 当前 API 配置校验与简要描述。
 * 详见 shared/README.md
 */
import type { AppSettings } from './types'

/** 校验当前 API 配置完整性，返回错误文案或 null */
export function validateActiveProvider(settings: AppSettings): string | null {
  if (!settings.activeProviderId) {
    return '请先在 **设置 → 模型** 中选择要使用的 API'
  }
  const p = settings.providers.find((x) => x.id === settings.activeProviderId)
  if (!p) {
    return '当前选中的 API 配置不存在，请重新选择'
  }
  if (!p.apiKey?.trim()) {
    return `请为「${p.name}」填写 API Key`
  }
  if (!p.model?.trim()) {
    return `请为「${p.name}」填写模型 ID`
  }
  const base = p.baseUrl?.trim()
  if (!base) {
    return `请为「${p.name}」填写 Base URL`
  }
  try {
    const url = new URL(base.startsWith('http') ? base : `https://${base}`)
    if (!url.hostname) return 'Base URL 格式不正确'
  } catch {
    return 'Base URL 格式不正确。OpenAI: https://api.openai.com/v1 · DeepSeek: https://api.deepseek.com'
  }
  return null
}

/** 当前模型的简短描述（模型 ID · 主机名） */
export function describeActiveProvider(settings: AppSettings): string {
  const p = settings.providers.find((x) => x.id === settings.activeProviderId)
  if (!p) return '未选择模型'
  let host = p.baseUrl
  try {
    host = new URL(
      p.baseUrl.startsWith('http') ? p.baseUrl : `https://${p.baseUrl}`
    ).host
  } catch {
    /* keep raw */
  }
  return `${p.model} · ${host}`
}
