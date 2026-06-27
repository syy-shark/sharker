/**
 * Browser Use native messaging：检测/安装 Chrome manifest，定位 codex-chrome-extension-host。
 * 逻辑改编自 codex-desktop-linux patch-chrome-plugin.js（MIT）。
 * @see docs/computer-use-setup.md · third_party/codex/NOTICE.md
 */
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Codex Browser Use 扩展与 native host 名 */
export const BROWSER_EXTENSION_ID = 'hehggadaopoacecdllhhajmbjkdcmajg'
export const NATIVE_HOST_NAME = 'com.openai.codexextension'

/** Linux 下各 Chromium 系浏览器的 manifest 目录 */
export function nativeMessagingHostDirs(): string[] {
  const home = os.homedir()
  return [
    path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts'),
    path.join(home, '.config', 'google-chrome-beta', 'NativeMessagingHosts'),
    path.join(home, '.config', 'google-chrome-unstable', 'NativeMessagingHosts'),
    path.join(home, '.config', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
    path.join(home, '.config', 'chromium', 'NativeMessagingHosts')
  ]
}

/** manifest 完整路径 */
export function nativeMessagingManifestPath(hostDir: string): string {
  return path.join(hostDir, `${NATIVE_HOST_NAME}.json`)
}

/** 生成 native messaging manifest JSON */
export function buildNativeMessagingManifest(hostBinaryPath: string): string {
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Codex / Sharker Browser Use native messaging host',
    path: hostBinaryPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${BROWSER_EXTENSION_ID}/`]
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** 解析 codex-chrome-extension-host 候选路径 */
export async function resolveChromeExtensionHostBinary(): Promise<string | null> {
  const env = process.env.SHARKER_CHROME_EXTENSION_HOST ?? process.env.CODEX_CHROME_EXTENSION_HOST
  if (env) {
    try {
      await fs.access(env, fs.constants.X_OK)
      return env
    } catch {
      /* fall through */
    }
  }

  const candidates = [
    path.join(os.homedir(), 'codex-desktop-linux-main', 'target', 'release', 'codex-chrome-extension-host'),
    path.join(os.homedir(), '下载', 'GitHub', 'codex-desktop-linux-main', 'target', 'release', 'codex-chrome-extension-host'),
    '/opt/codex-desktop/resources/plugins/openai-bundled/plugins/computer-use/bin/codex-chrome-extension-host'
  ]

  try {
    const { stdout } = await execFileAsync('which', ['codex-chrome-extension-host'])
    const fromPath = stdout.trim()
    if (fromPath) candidates.unshift(fromPath)
  } catch {
    /* ignore */
  }

  for (const c of candidates) {
    try {
      await fs.access(c, fs.constants.X_OK)
      return c
    } catch {
      /* try next */
    }
  }
  return null
}

/** 读取已安装 manifest 中的 host path */
async function readManifestHostPath(manifestPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8')
    const json = JSON.parse(raw) as { path?: string }
    return typeof json.path === 'string' ? json.path : null
  } catch {
    return null
  }
}

/** 单项 manifest 状态 */
export interface NativeMessagingManifestStatus {
  browserProfile: string
  manifestPath: string
  installed: boolean
  hostPath?: string
  hostExists: boolean
}

/** 扫描各浏览器 profile 的 manifest 安装情况 */
export async function gatherNativeMessagingStatus(): Promise<{
  hostBinary: string | null
  manifests: NativeMessagingManifestStatus[]
}> {
  const hostBinary = await resolveChromeExtensionHostBinary()
  const manifests: NativeMessagingManifestStatus[] = []

  for (const dir of nativeMessagingHostDirs()) {
    const manifestPath = nativeMessagingManifestPath(dir)
    const browserProfile = path.basename(path.dirname(dir))
    let installed = false
    let hostPath: string | undefined
    let hostExists = false

    try {
      await fs.access(manifestPath)
      installed = true
      hostPath = (await readManifestHostPath(manifestPath)) ?? undefined
      if (hostPath) {
        try {
          await fs.access(hostPath, fs.constants.X_OK)
          hostExists = true
        } catch {
          hostExists = false
        }
      }
    } catch {
      installed = false
    }

    manifests.push({
      browserProfile,
      manifestPath,
      installed,
      hostPath,
      hostExists
    })
  }

  return { hostBinary, manifests }
}

/** 为所有 Chromium profile 写入 native messaging manifest */
export async function installNativeMessagingManifests(hostBinaryPath: string): Promise<string[]> {
  const body = buildNativeMessagingManifest(hostBinaryPath)
  const written: string[] = []
  for (const dir of nativeMessagingHostDirs()) {
    await fs.mkdir(dir, { recursive: true })
    const manifestPath = nativeMessagingManifestPath(dir)
    await fs.writeFile(manifestPath, body, 'utf8')
    written.push(manifestPath)
  }
  return written
}
