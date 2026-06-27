/**
 * Browser 自动化：Playwright 可选集成（navigate/snapshot/click/type）。
 * 未安装 playwright 时返回安装指引；也可通过 MCP @playwright/mcp 对接。
 * @see tools/README.md · docs/agent-capabilities.md
 */
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

/** Playwright 最小类型（避免硬依赖 playwright 包） */
interface BrowserLike {
  newPage(): Promise<PageLike>
  close(): Promise<void>
}

interface PageLike {
  goto(url: string, opts?: object): Promise<unknown>
  title(): Promise<string>
  url(): string
  click(selector: string, opts?: object): Promise<void>
  fill(selector: string, text: string, opts?: object): Promise<void>
  screenshot(opts?: object): Promise<unknown>
  evaluate<T>(fn: () => T): Promise<T>
}

type PlaywrightModule = {
  chromium: { launch(opts?: object): Promise<BrowserLike> }
}

let session: { browser: BrowserLike; page: PageLike } | null = null

/** 懒加载 Playwright（可选依赖，不参与打包） */
async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
      s: string
    ) => Promise<PlaywrightModule>
    return await dynamicImport('playwright')
  } catch {
    return null
  }
}

/** 获取或创建浏览器会话 */
async function getSession(
  url?: string
): Promise<{ page: PageLike } | string> {
  const pw = await loadPlaywright()
  if (!pw) {
    return (
      'Playwright 未安装。请运行: npm install playwright && npx playwright install chromium\n' +
      '或在 ~/.sharker/mcp.json 配置 @playwright/mcp Server。'
    )
  }
  if (!session) {
    const browser = await pw.chromium.launch({ headless: true })
    const page = await browser.newPage()
    session = { browser, page }
  }
  if (url) {
    await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  }
  return { page: session.page }
}

/** 关闭浏览器会话 */
async function closeSession(): Promise<void> {
  if (session) {
    await session.browser.close().catch(() => {})
    session = null
  }
}

export const browserNavigateTool: ToolHandler = {
  name: 'browser_navigate',
  title: '浏览器打开 URL',
  async execute(args) {
    const url = String(args.url)
    const r = await getSession(url)
    if (typeof r === 'string') return ok(r)
    const title = await r.page.title()
    return ok(`Navigated to ${url}\nTitle: ${title}`)
  }
}

export const browserSnapshotTool: ToolHandler = {
  name: 'browser_snapshot',
  title: '浏览器页面快照',
  async execute(args) {
    const url = args.url != null ? String(args.url) : undefined
    const r = await getSession(url)
    if (typeof r === 'string') return ok(r)
    const page = r.page
    const title = await page.title()
    const urlNow = page.url()
    const text = await page.evaluate(() => {
      const walk = (el: Element): string => {
        const tag = el.tagName.toLowerCase()
        const role = el.getAttribute('role') ?? tag
        const name =
          el.getAttribute('aria-label') ??
          (el as HTMLElement).innerText?.slice(0, 80) ??
          ''
        const kids = Array.from(el.children)
          .slice(0, 40)
          .map((c) => walk(c))
          .filter(Boolean)
          .join('\n')
        if (!name && !kids) return ''
        return `- [${role}] ${name}${kids ? '\n' + kids : ''}`
      }
      return walk(document.body).slice(0, 60_000)
    })
    return ok(`URL: ${urlNow}\nTitle: ${title}\n\nAccessibility tree (simplified):\n${text}`)
  }
}

export const browserClickTool: ToolHandler = {
  name: 'browser_click',
  title: '浏览器点击',
  assessRisk: () => ({ highRisk: true, reason: '浏览器页面点击' }),
  async execute(args) {
    const selector = String(args.selector ?? '')
    const r = await getSession()
    if (typeof r === 'string') return ok(r)
    await r.page.click(selector, { timeout: 15_000 })
    return ok(`Clicked: ${selector}`)
  }
}

export const browserTypeTool: ToolHandler = {
  name: 'browser_type',
  title: '浏览器输入',
  assessRisk: () => ({ highRisk: true, reason: '浏览器页面输入' }),
  async execute(args) {
    const selector = String(args.selector ?? '')
    const text = String(args.text ?? '')
    const r = await getSession()
    if (typeof r === 'string') return ok(r)
    await r.page.fill(selector, text, { timeout: 15_000 })
    return ok(`Typed into ${selector}: ${text.length} chars`)
  }
}

export const browserScreenshotTool: ToolHandler = {
  name: 'browser_screenshot',
  title: '浏览器截图',
  async execute(args) {
    const outputPath = String(args.path ?? '')
    const r = await getSession()
    if (typeof r === 'string') return ok(r)
    await r.page.screenshot({ path: outputPath, fullPage: Boolean(args.full_page) })
    return ok(`Screenshot saved: ${outputPath}`)
  }
}

export const browserCloseTool: ToolHandler = {
  name: 'browser_close',
  title: '关闭浏览器',
  async execute() {
    await closeSession()
    return ok('Browser session closed')
  }
}

export const browserTools: ToolHandler[] = [
  browserNavigateTool,
  browserSnapshotTool,
  browserClickTool,
  browserTypeTool,
  browserScreenshotTool,
  browserCloseTool
]
