/**
 * open_url：在系统浏览器中打开 URL；用于用户明确要求“打开网页/用 Chrome 打开”。
 * @see tools/README.md
 */
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
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

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function windowsChromeCandidates(): string[] {
  const vars = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
  return vars
    .filter(Boolean)
    .map((base) => path.join(String(base), 'Google', 'Chrome', 'Application', 'chrome.exe'))
}

function linuxChromeCommands(): string[] {
  return ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']
}

async function openDefaultBrowser(url: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('rundll32.exe', ['url.dll,FileProtocolHandler', url])
    return
  }
  if (process.platform === 'darwin') {
    await execFileAsync('open', [url])
    return
  }
  await execFileAsync('xdg-open', [url])
}

async function openChrome(url: string): Promise<string> {
  if (process.platform === 'win32') {
    for (const candidate of windowsChromeCandidates()) {
      if (fileExists(candidate)) {
        await execFileAsync(candidate, [url])
        return candidate
      }
    }
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Start-Process -FilePath chrome -ArgumentList $args[0]',
      '--',
      url
    ])
    return 'chrome'
  }

  if (process.platform === 'darwin') {
    await execFileAsync('open', ['-a', 'Google Chrome', url])
    return 'Google Chrome'
  }

  for (const command of linuxChromeCommands()) {
    try {
      await execFileAsync(command, [url])
      return command
    } catch {
      /* try next */
    }
  }
  await execFileAsync('xdg-open', [url])
  return 'default browser (Chrome not found)'
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
