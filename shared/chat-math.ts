/**
 * 对话数学：官方已交付的 `\(...\)` / `\[...\]` / `$$...$$`（对标 Codex 桌面 KaTeX）。
 * 不认 `$...$`（官方 tokenizer 也不认）；非法 TeX 回退原文；`trust: false`。
 * 直播 token 中先画原文，收束后再跑 KaTeX；预热命中则同一帧着色，避免先闪原文。
 * 直播中公式闭合后 `shouldWarmLiveChatMath` 开工 `renderChatMathHtml` 写缓存，不着色。
 * @see shared/ARCH.md
 */
import katex from 'katex'

/** 单条公式上限，避免超长 TeX 卡直播 */
export const CHAT_MATH_MAX_TEX = 4_000

/** 直播 token 中即使公式已闭合也不着色，收束后再画 KaTeX。 */
export function shouldRenderLiveChatMath(options: { streaming?: boolean }): boolean {
  return !options.streaming
}

/**
 * 公式已闭合但仍在直播 token：effect 里开工 KaTeX 写缓存，不 setHtml。
 * 收束帧更常命中 `peekChatMathHtml`，不必先闪原文。
 */
export function shouldWarmLiveChatMath(options: { streaming?: boolean; tex?: string }): boolean {
  return Boolean(options.streaming) && Boolean(String(options.tex ?? '').trim())
}

/** 展示公式直播中也占 block 槽，收束着色时不从行内跳成块。 */
export function liveChatMathClassName(options: { display?: boolean; raw?: boolean }): string {
  const classes = ['chat-math']
  if (options.raw) classes.push('chat-math--raw')
  if (options.display) classes.push('chat-math--display')
  return classes.join(' ')
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
 * 扫一段原文里的闭合公式。调用方应只喂散文槽，避免代码围栏里的 `\\(` 被当成公式。
 */
export function collectClosedChatMath(text: string): ChatMathHit[] {
  const src = String(text ?? '')
  const hits: ChatMathHit[] = []
  let i = 0
  while (i < src.length) {
    const ch = src.charCodeAt(i)
    if (ch !== 92 && ch !== 36) {
      i += 1
      continue
    }
    const hit = readChatMath(src, i)
    if (hit) {
      hits.push(hit)
      i = hit.end
      continue
    }
    i += 1
  }
  return hits
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

/** 公式缓存是否已有这段 TeX（不现场跑 KaTeX）。未写入为 `undefined`。 */
export function peekChatMathHtml(tex: string, display: boolean): string | null | undefined {
  const key = `${display ? 'd' : 'i'}\n${tex}`
  if (!renderCache.has(key)) return undefined
  return cacheGet(key)
}

/**
 * 直播收束后：state 或预热缓存任一有 HTML 就同一帧画，不必先闪原文再等 effect。
 * 直播 token 中一律原文。
 */
export function resolveLiveChatMathHtml(options: {
  streaming?: boolean
  html: string | null
  cached?: string | null
}): string | null {
  if (!shouldRenderLiveChatMath({ streaming: options.streaming })) return null
  return options.html ?? options.cached ?? null
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
