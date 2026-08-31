import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  ASK_WHERE_TO_SAVE_DOWNLOADS_LABEL,
  BROWSER_DOWNLOADS_INTRO,
  parseBrowserAskWhereToSave,
  parseBrowserDownloadPath,
  resolveBrowserDownloadDir,
  sanitizeBrowserDownloadName,
  uniqueBrowserDownloadPath
} from './browser-downloads'

describe('browser downloads', () => {
  it('resolves the official download folder, unique names, and persist sites', () => {
    expect(parseBrowserDownloadPath(undefined)).toBe('')
    expect(parseBrowserDownloadPath('  /Users/me/Inbox  ')).toBe('/Users/me/Inbox')
    expect(parseBrowserDownloadPath('/tmp/../etc')).toBe('')
    expect(parseBrowserAskWhereToSave(undefined)).toBe(false)
    expect(parseBrowserAskWhereToSave(true)).toBe(true)
    expect(resolveBrowserDownloadDir('', '/Users/me/Downloads')).toBe('/Users/me/Downloads')
    expect(resolveBrowserDownloadDir('/Users/me/Inbox', '/Users/me/Downloads')).toBe(
      '/Users/me/Inbox'
    )
    expect(sanitizeBrowserDownloadName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeBrowserDownloadName('')).toBe('download')
    expect(sanitizeBrowserDownloadName('report.pdf')).toBe('report.pdf')
    const taken = new Set([join('/tmp/dl', 'report.pdf'), join('/tmp/dl', 'report (1).pdf')])
    expect(uniqueBrowserDownloadPath('/tmp/dl', 'report.pdf', (abs) => taken.has(abs))).toBe(
      join('/tmp/dl', 'report (2).pdf')
    )
    const appSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'), 'utf8')
    expect(appSrc).toContain('browserDownloadPath: updated.browserDownloadPath')
    expect(appSrc).toContain('browserDownloadPath: draft.browserDownloadPath')
    expect(appSrc).toContain('browserDownloadPath: next.browserDownloadPath')
    expect(appSrc).toContain('browserAskWhereToSave: updated.browserAskWhereToSave')
    expect(appSrc).toContain('browserAskWhereToSave: draft.browserAskWhereToSave')
    expect(appSrc).toContain('browserAskWhereToSave: next.browserAskWhereToSave')
    const mainSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../electron/main/index.ts'),
      'utf8'
    )
    expect(mainSrc).toContain("ses.on('will-download'")
    expect(mainSrc).toContain('setSaveDialogOptions')
    expect(mainSrc).toContain('setSavePath')
    expect(ASK_WHERE_TO_SAVE_DOWNLOADS_LABEL).toBe('Ask where to save downloads')
    expect(BROWSER_DOWNLOADS_INTRO).toMatch(/system Downloads folder by default/)
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/BrowserSettings.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('ASK_WHERE_TO_SAVE_DOWNLOADS_LABEL')
    expect(settingsSrc).toContain('BROWSER_DOWNLOADS_INTRO')
    expect(settingsSrc).not.toContain('title="每次询问保存位置"')
    expect(settingsSrc).not.toContain('label="每次询问保存位置"')
    expect(settingsSrc).not.toContain('默认保存到系统下载文件夹')
    expect(settingsSrc).not.toContain('下载前弹出另存为')
  })
})
