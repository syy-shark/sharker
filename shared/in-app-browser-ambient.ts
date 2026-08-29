/**
 * 官方桌面内置浏览器 ambient 上下文（对标 Codex #39562）。
 * 只在用户看得见浏览器面板且已打开 http(s)/file 页时写入本轮 system。
 * 不发明 @Browser、Browser Use 控制或多标签。
 * @see shared/ARCH.md
 */
import { shouldRecordBrowserHistory } from './browser-history'

/** 开轮可交给管线的内置浏览器快照 */
export type InAppBrowserAmbient = {
  url: string
}

/** 与浏览历史同一条：http(s)/file，不要起始页 / about / data */
export function isInAppBrowserAmbientUrl(url: string): boolean {
  return shouldRecordBrowserHistory(url)
}

/**
 * 官方桌面任务里的固定英文块：
 * `# In app browser:` + 1 tab + Current URL
 */
export function formatInAppBrowserAmbient(url: string): string {
  const trimmed = String(url || '').trim()
  if (!isInAppBrowserAmbientUrl(trimmed)) return ''
  return [
    '# In app browser:',
    '- The user has the in-app browser open with 1 tab.',
    `- Current URL: ${trimmed}`
  ].join('\n')
}

/** 接到 system 末尾；空 URL 不改原文 */
export function appendInAppBrowserAmbient(system: string, url?: string | null): string {
  const block = formatInAppBrowserAmbient(url || '')
  if (!block) return system
  return `${system}\n\n${block}`
}

/**
 * 仅当前可见对话、聊天页、右侧浏览器 Tab 打开且已导航时才注入。
 * 后台会话 / 设置页 / 文件树 Tab 不写，避免把别人正在看的页漏进错误线程。
 */
export function resolveInAppBrowserAmbient(input: {
  page?: string
  panelOpen?: boolean
  tab?: string
  url?: string | null
  forActiveConversation?: boolean
}): InAppBrowserAmbient | null {
  if (input.forActiveConversation === false) return null
  if (input.page && input.page !== 'chat') return null
  if (!input.panelOpen || input.tab !== 'browser') return null
  const url = String(input.url || '').trim()
  if (!isInAppBrowserAmbientUrl(url)) return null
  return { url }
}
