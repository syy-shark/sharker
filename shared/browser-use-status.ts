/** Browser Use 状态 */
import {
  BROWSER_EXTENSION_ID,
  resolveChromeExtensionHostBinary
} from '../tools/services/browser-native-host'
import { loadMcpConfig } from '../tools/services/mcp-registry'

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
  mcpPlaywrightConfigured: boolean
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

/** 检测 npx @playwright/mcp 是否在 MCP 配置中 */
async function detectPlaywrightMcp(workspace: string): Promise<boolean> {
  const servers = await loadMcpConfig(workspace)
  return servers.some(
    (s) =>
      s.name === 'playwright' ||
      s.args?.some((a) => a.includes('@playwright/mcp')) ||
      s.command.includes('playwright')
  )
}

/** 聚合 Browser Use 就绪状态 */
export async function gatherBrowserUseStatus(workspace: string): Promise<BrowserUseStatus> {
  const isWin = process.platform === 'win32'
  const pw = await detectPlaywright()
  const mcpPw = await detectPlaywrightMcp(workspace)

  const checklist: BrowserUseCheckItem[] = [
    {
      id: 'ready',
      label: 'Browser Use',
      ok: pw.ok || mcpPw || isWin,
      detail: pw.ok || mcpPw ? '已就绪' : isWin ? 'Playwright MCP 已配置' : '未就绪'
    }
  ]

  return {
    playwrightAvailable: pw.ok,
    playwrightDetail: pw.detail,
    chromeHostBinary: null,
    extensionId: BROWSER_EXTENSION_ID,
    nativeMessagingReady: false,
    manifestSummary: mcpPw ? 'Playwright MCP 已配置' : '',
    mcpPlaywrightConfigured: mcpPw,
    checklist,
    setupScript: isWin ? 'scripts/setup-cua-driver.cmd' : 'scripts/setup-browser-use.sh'
  }
}

/** 安装 native messaging manifest（IPC 调用） */
export async function runBrowserUseManifestInstall(): Promise<{ ok: boolean; message: string }> {
  if (process.platform === 'win32') {
    return {
      ok: false,
      message:
        'Chrome native messaging manifest 面向 Linux。Windows 请安装 Playwright（npm install playwright && npx playwright install chromium）或使用应用内 Browser 面板。'
    }
  }
  const { installNativeMessagingManifests } = await import('../tools/services/browser-native-host')
  const host = await resolveChromeExtensionHostBinary()
  if (!host) {
    return {
      ok: false,
      message:
        '未找到 codex-chrome-extension-host。请在 codex-desktop-linux 仓库执行 cargo build --release -p codex-computer-use-linux --bin codex-chrome-extension-host'
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
