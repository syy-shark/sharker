/**
 * 应用设置持久化（settings.json）与 API Key 加密存储。
 * @see electron/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { app, safeStorage } from 'electron'
import type { AppSettings } from '../shared/types'
import { normalizeSettings } from '../shared/workspace'

/** userData 下 settings.json 路径 */
function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

/** 从 userData 读取设置，解密 API Key 并规范化字段。 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as AppSettings & {
      encryptedKeys?: Record<string, string>
    }
    if (parsed.encryptedKeys && safeStorage.isEncryptionAvailable()) {
      for (const p of parsed.providers ?? []) {
        const enc = parsed.encryptedKeys[p.id]
        if (enc) {
          p.apiKey = safeStorage.decryptString(Buffer.from(enc, 'base64'))
        }
      }
    }
    delete (parsed as { encryptedKeys?: unknown }).encryptedKeys
    if (!Array.isArray(parsed.providers)) parsed.providers = []
    if (!Array.isArray(parsed.workspaces)) parsed.workspaces = []
    return normalizeSettings(parsed, app.getPath('home'))
  } catch {
    return normalizeSettings({}, app.getPath('home'))
  }
}

/** 加密 API Key 后写入 settings.json。 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const encryptedKeys: Record<string, string> = {}
  const toSave = normalizeSettings(structuredClone(settings), app.getPath('home'))
  if (safeStorage.isEncryptionAvailable()) {
    for (const p of toSave.providers) {
      if (p.apiKey) {
        encryptedKeys[p.id] = safeStorage.encryptString(p.apiKey).toString('base64')
        p.apiKey = ''
      }
    }
  }
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  const payload = { ...toSave, encryptedKeys }
  await fs.writeFile(settingsPath(), JSON.stringify(payload, null, 2), 'utf8')
  delete (toSave as { encryptedKeys?: unknown }).encryptedKeys
}
