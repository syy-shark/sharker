/**
 * 对话数学：官方已交付的 `\(...\)` / `\[...\]` / `$$...$$`（对标 Codex 桌面 KaTeX）。
 * 不认 `$...$`（官方 tokenizer 也不认）；非法 TeX 回退原文；`trust: false`。
 * 直播 token 中先画原文，收束后再跑 KaTeX，避免同步着色卡 16ms 热路径。
 * @see shared/ARCH.md
 */
import katex from 'katex'

/** 单条公式上限，避免超长 TeX 卡直播 */
export const CHAT_MATH_MAX_TEX = 4_000

/** 直播 token 中即使公式已闭合也不跑 KaTeX，收束后再着色。 */
export function shouldRenderLiveChatMath(options: { streaming?: boolean }): boolean {
  return !options.streaming
}

export type ChatMathFence = '$$' | 'square' | 'paren'

export type ChatMathHit = {
  tex: string
  display: boolean
  fence: ChatMathFence
  end: number
}

const renderCache = new Map<string, string | null>()
const RENDER_CACHE_LIMIT = 64

function cacheGet(key: string): string | null | undefined {
  if (!renderCache.has(key)) return undefined
  const hit = renderCache.get(key)
  renderCache.delete(key)
  renderCache.set(key, hit ?? null)
  return hit ?? null
}

function cacheSet(key: string, value: string | null): string | null {
  renderCache.set(key, value)
  while (renderCache.size > RENDER_CACHE_LIMIT) {
    const first = renderCache.keys().next().value
    if (first == null) break
    renderCache.delete(first)
  }
  return value
}

/** 把闭合公式还原成原文，给增量解析 / 回退展示 */
export function chatMathSource(tex: string, fence: ChatMathFence): string {
  if (fence === '$$') return `$$${tex}$$`
  if (fence === 'square') return `\\[${tex}\\]`
  return `\\(${tex}\\)`
}

/**
 * 从 `start` 读一条已闭合公式。未闭合或 `$...$` 返回 null，留给后继 token。
 */
export function readChatMath(src: string, start: number): ChatMathHit | null {
  if (start < 0 || start >= src.length) return null
  if (src.startsWith('$$', start)) {
    const close = src.indexOf('$$', start + 2)
    if (close === -1) return null
    const tex = src.slice(start + 2, close)
    if (!tex || tex.length > CHAT_MATH_MAX_TEX) return null
    return { tex, display: true, fence: '$$', end: close + 2 }
  }
  if (src.startsWith('\\[', start)) {
    const close = src.indexOf('\\]', start + 2)
    if (close === -1) return null
    const tex = src.slice(start + 2, close)
    if (!tex || tex.length > CHAT_MATH_MAX_TEX) return null
    return { tex, display: true, fence: 'square', end: close + 2 }
  }
  if (src.startsWith('\\(', start)) {
    const close = src.indexOf('\\)', start + 2)
    if (close === -1) return null
    const tex = src.slice(start + 2, close)
    if (!tex || tex.length > CHAT_MATH_MAX_TEX) return null
    return { tex, display: false, fence: 'paren', end: close + 2 }
  }
  return null
}

/**
 * KaTeX HTML；失败回退 null（调用方画原文）。
 * `trust: false`，不执行 `\html`。
 */
export function renderChatMathHtml(tex: string, display: boolean): string | null {
  const key = `${display ? 'd' : 'i'}\n${tex}`
  const cached = cacheGet(key)
  if (cached !== undefined) return cached
  try {
    return cacheSet(
      key,
      katex.renderToString(tex, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        output: 'html'
      })
    )
  } catch {
    return cacheSet(key, null)
  }
}
