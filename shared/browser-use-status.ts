/** Browser Use 状态（macOS） */
import {
  BROWSER_EXTENSION_ID,
  resolveChromeExtensionHostBinary
} from '../tools/services/browser-native-host'

/** 单项检查 */
export interface BrowserUseCheckItem {
  id: string
  label: string
  ok: boolean
  detail: string
}

/** Browser Use 完整状态（设置 UI / IPC） */
export interface BrowserUseStatus {
  playwrightAvailable: boolean
  playwrightDetail: string
  chromeHostBinary: string | null
  extensionId: string
  nativeMessagingReady: boolean
  manifestSummary: string
  checklist: BrowserUseCheckItem[]
  setupScript: string
}

/** 检测 Playwright 是否可 import */
async function detectPlaywright(): Promise<{ ok: boolean; detail: string }> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
      s: string
    ) => Promise<unknown>
    await dynamicImport('playwright')
    return { ok: true, detail: 'playwright 包已安装' }
  } catch {
    return {
      ok: false,
      detail: '未安装 — npm install playwright && npx playwright install chromium'
    }
  }
}

/** 聚合 Browser Use 就绪状态 */
export async function gatherBrowserUseStatus(_workspace: string): Promise<BrowserUseStatus> {
  const pw = await detectPlaywright()

  const checklist: BrowserUseCheckItem[] = [
    {
      id: 'ready',
      label: 'Browser Use',
      ok: pw.ok,
      detail: pw.ok ? '已就绪' : '未就绪'
    }
  ]

  return {
    playwrightAvailable: pw.ok,
    playwrightDetail: pw.detail,
    chromeHostBinary: null,
    extensionId: BROWSER_EXTENSION_ID,
    nativeMessagingReady: false,
    manifestSummary: '',
    checklist,
    setupScript: 'scripts/setup-browser-use.sh'
  }
}

/** 安装 native messaging manifest（IPC 调用） */
export async function runBrowserUseManifestInstall(): Promise<{ ok: boolean; message: string }> {
  const { installNativeMessagingManifests } = await import('../tools/services/browser-native-host')
  const host = await resolveChromeExtensionHostBinary()
  if (!host) {
    return {
      ok: false,
      message:
        '未找到 chrome extension host。请设置 SHARKER_CHROME_EXTENSION_HOST，或使用应用内 Browser 面板。'
    }
  }
  try {
    const written = await installNativeMessagingManifests(host)
    return {
      ok: true,
      message: `已写入 ${written.length} 个 manifest（${written[0]} 等）`
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
