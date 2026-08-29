/**
 * 对话 / 终端里的 http(s) / 工作区 HTML file:// 打开目标（对标 Codex：点 URL 进内置浏览器，⌘/Ctrl+点进系统浏览器）。
 * mailto 仍走系统。不发明 Shift+点、自定义 Open with。
 * @see shared/ARCH.md
 */

import { isHtmlPreviewPath, stripPreviewHrefSuffix } from './file-preview'

export type ChatLinkOpenTarget = 'in-app' | 'system' | 'ignore'

export type ChatLinkMenuAction = 'in-app' | 'system' | 'copy'

/** 右键：内置 / 系统 / 复制（对标 Codex #41122 菜单，不发明默认打开设置） */
export function chatLinkMenuItems(): Array<{ action: ChatLinkMenuAction; title: string }> {
  return [
    { action: 'in-app', title: '在内置浏览器打开' },
    { action: 'system', title: '在系统浏览器打开' },
    { action: 'copy', title: '复制链接' }
  ]
}

/** 对话正文可进内置浏览器的网址：http(s) 与 file:// HTML（对标 Codex #32773） */
export function isInAppBrowserChatHref(href: string): boolean {
  const url = String(href || '').trim()
  if (/^https?:\/\//i.test(url)) return true
  if (!/^file:/i.test(url)) return false
  const path = stripPreviewHrefSuffix(url.replace(/^file:\/\//i, '')).path
  try {
    return isHtmlPreviewPath(decodeURIComponent(path))
  } catch {
    return isHtmlPreviewPath(path)
  }
}

/** ⌘/Ctrl+点：系统浏览器（对标 Codex #41122 回归前的手势） */
export function chatLinkOpensInSystemBrowser(event: {
  metaKey?: boolean
  ctrlKey?: boolean
}): boolean {
  return Boolean(event.metaKey || event.ctrlKey)
}

/** 终端一行里的 http(s) 链接（去掉尾标点） */
export function findHttpLinksInText(text: string): Array<{ start: number; end: number; href: string }> {
  const raw = String(text || '')
  const out: Array<{ start: number; end: number; href: string }> = []
  const re = /https?:\/\/[^\s<>"'`]+/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    let href = match[0]
    let end = match.index + href.length
    while (href.length > 8 && /[.,);\]>'"]$/.test(href)) {
      href = href.slice(0, -1)
      end -= 1
    }
    if (!isInAppBrowserChatHref(href)) continue
    out.push({ start: match.index, end, href })
  }
  return out
}

/** 点链接：默认内置浏览器；修饰键或 mailto 走系统 */
export function resolveChatLinkOpen(
  href: string,
  event: { metaKey?: boolean; ctrlKey?: boolean } = {}
): ChatLinkOpenTarget {
  const url = String(href || '').trim()
  if (/^mailto:/i.test(url)) return 'system'
  if (!isInAppBrowserChatHref(url)) return 'ignore'
  return chatLinkOpensInSystemBrowser(event) ? 'system' : 'in-app'
}
