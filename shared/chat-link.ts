/**
 * 对话里的 http(s) 链接打开目标（对标 Codex：点 URL 进内置浏览器，⌘/Ctrl+点进系统浏览器）。
 * mailto 仍走系统。不发明 Shift+点、自定义 Open with。
 * @see shared/ARCH.md
 */

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

/** 对话正文可进内置浏览器的网址 */
export function isInAppBrowserChatHref(href: string): boolean {
  return /^https?:\/\//i.test(String(href || '').trim())
}

/** ⌘/Ctrl+点：系统浏览器（对标 Codex #41122 回归前的手势） */
export function chatLinkOpensInSystemBrowser(event: {
  metaKey?: boolean
  ctrlKey?: boolean
}): boolean {
  return Boolean(event.metaKey || event.ctrlKey)
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
