/**
 * open_url：在系统浏览器中打开 URL；用于用户明确要求“打开网页/用 Chrome 打开”。
 * @see tools/ARCH.md
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { ok } from '../context'
import { assertWebAccessAllowed } from '../network-policy'
import type { ToolHandler } from '../types'

const execFileAsync = promisify(execFile)

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('URL 不能为空')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withScheme)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`仅支持 http/https URL: ${url.protocol}`)
  }
  return url.toString()
}

async function openDefaultBrowser(url: string): Promise<void> {
  await execFileAsync('open', [url])
}

async function openChrome(url: string): Promise<string> {
  await execFileAsync('open', ['-a', 'Google Chrome', url])
  return 'Google Chrome'
}

export const openUrlTool: ToolHandler = {
  name: 'open_url',
  title: '打开网页',
  async execute(args, ctx) {
    const url = normalizeUrl(String(args.url ?? ''))
    const browser = String(args.browser ?? 'default').toLowerCase()
    assertWebAccessAllowed(url, ctx.settings)

    if (browser === 'chrome') {
      const used = await openChrome(url)
      return ok(`Opened URL in ${used}: ${url}`)
    }

    await openDefaultBrowser(url)
    return ok(`Opened URL in default browser: ${url}`)
  }
}
