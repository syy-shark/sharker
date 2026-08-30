/**
 * 捕获最前窗口截图与辅助功能可读文本（对标 Codex Appshots）。
 * @see electron/main/ARCH.md
 */
import { desktopCapturer, nativeImage } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AppshotCaptureResult } from '../../shared/appshot'

const execFileAsync = promisify(execFile)

const PERMISSION_HINT =
  'Check Screen & System Audio Recording and Accessibility for Codex Computer Use.'

async function runOsascript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 12_000 })
    return String(stdout || '').trim()
  } catch {
    return ''
  }
}

async function frontmostAppName(): Promise<string> {
  return runOsascript(`
tell application "System Events"
  set p to first application process whose frontmost is true
  return name of p
end tell
`)
}

async function frontmostWindowText(): Promise<string> {
  const text = await runOsascript(`
tell application "System Events"
  tell (first application process whose frontmost is true)
    try
      return entire contents of window 1 as text
    end try
  end tell
end tell
`)
  return text.slice(0, 80_000)
}

function isOwnAppName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n === 'sharker' || n === 'electron' || n.includes('sharker')
}

/** 截取最前窗口：优先 desktopCapturer 窗口源，失败再全屏。 */
export async function captureAppshot(): Promise<AppshotCaptureResult> {
  const appName = await frontmostAppName()
  const text = await frontmostWindowText()
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1200 },
      fetchWindowIcons: false
    })
    const named = appName
      ? sources.find((source) => source.name.toLowerCase().includes(appName.toLowerCase()))
      : undefined
    const other = sources.find((source) => !isOwnAppName(source.name))
    const picked = named ?? other ?? sources[0]
    if (picked && !picked.thumbnail.isEmpty()) {
      const imageDataUrl = picked.thumbnail.toDataURL()
      return {
        ok: true,
        imageDataUrl,
        text: text || undefined,
        appName: appName || picked.name
      }
    }
  } catch {
    /* fall through to screencapture */
  }

  if (process.platform === 'darwin') {
    const dest = path.join(os.tmpdir(), `sharker-appshot-${Date.now()}.png`)
    try {
      await execFileAsync('screencapture', ['-x', '-t', 'png', dest], { timeout: 12_000 })
      const buf = await fs.readFile(dest)
      await fs.unlink(dest).catch(() => undefined)
      const image = nativeImage.createFromBuffer(buf)
      if (!image.isEmpty()) {
        return {
          ok: true,
          imageDataUrl: image.toDataURL(),
          text: text || undefined,
          appName: appName || undefined
        }
      }
    } catch {
      /* permission or missing binary */
    }
  }

  return { ok: false, message: PERMISSION_HINT }
}
