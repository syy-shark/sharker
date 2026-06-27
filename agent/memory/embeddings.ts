/**
 * 文本 embedding（OpenAI 兼容 /embeddings）。
 */
import type { AppSettings } from '../../shared/types'
import { getActiveProvider } from '../../providers/openai'

function resolveEmbeddingsUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/$/, '')
  if (!base.startsWith('http')) base = `https://${base}`
  if (base.endsWith('/v1')) return `${base}/embeddings`
  try {
    const u = new URL(base)
    return `${u.origin}/v1/embeddings`
  } catch {
    return `${base}/embeddings`
  }
}

/** 生成 embedding；失败返回 null */
export async function embedText(settings: AppSettings, text: string): Promise<number[] | null> {
  const trimmed = text.trim().slice(0, 8000)
  if (!trimmed) return null
  try {
    const p = getActiveProvider(settings)
    const url = resolveEmbeddingsUrl(p.baseUrl)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: trimmed })
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
    const vec = data.data?.[0]?.embedding
    return Array.isArray(vec) ? vec : null
  } catch {
    return null
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
