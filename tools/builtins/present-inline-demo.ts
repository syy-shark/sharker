/**
 * present_inline_demo：把自包含 HTML/CSS/JS 演示直接嵌进对话，不写文件、不打开浏览器。
 * @see tools/ARCH.md
 */
import { ok } from '../context'
import type { ToolHandler } from '../types'

const MAX_HTML_CHARS = 80_000

export const presentInlineDemoTool: ToolHandler = {
  name: 'present_inline_demo',
  title: '内联演示',
  async execute(args) {
    const html = String(args.html ?? '').trim()
    if (!html) throw new Error('html 不能为空')
    if (html.length > MAX_HTML_CHARS) {
      throw new Error(`html 过长（${html.length} 字符，上限 ${MAX_HTML_CHARS}）`)
    }
    const caption = typeof args.caption === 'string' ? args.caption.trim() : ''
    // 短确认给模型；完整 HTML 已由 UI 从 toolArgs 渲染，不回灌到上下文。
    return ok(
      caption
        ? `Inline demo presented in chat: ${caption}`
        : 'Inline demo presented in the conversation stream.'
    )
  }
}
