/**
 * Computer / Browser Use 一键就绪（设置开关触发）。
 */
import { findCuaDriverBinary, runCmd } from '../builtins/computer-use/shared'
import { invalidateMcpToolPool } from './mcp-tool-pool'
import { setMcpPluginEnabled } from './mcp-plugin-store'

const CUA_INSTALL_PS =
  'irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex'

export interface FeatureEnsureResult {
  ok: boolean
  message: string
}

/** Windows：尝试安装 Cua Driver（官方脚本） */
async function installCuaDriverWindows(): Promise<boolean> {
  const r = await runCmd(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', CUA_INSTALL_PS],
    undefined,
    180_000
  )
  return r.code === 0 || Boolean(await findCuaDriverBinary())
}

/** 启用 Computer Use 时：安装（如需）+ 写入 cua-driver MCP */
export async function ensureComputerUseReady(workspace: string): Promise<FeatureEnsureResult> {
  let binary = await findCuaDriverBinary()

  if (!binary && process.platform === 'win32') {
    const installed = await installCuaDriverWindows()
    binary = installed ? await findCuaDriverBinary() : null
  }

  await setMcpPluginEnabled(workspace, 'cua-driver', true)
  invalidateMcpToolPool()

  if (binary) {
    return { ok: true, message: 'Cua Driver 已就绪' }
  }
  if (process.platform === 'win32') {
    return {
      ok: false,
      message: 'Cua Driver 未安装成功，请重启 Sharker 后再次打开开关'
    }
  }
  return {
    ok: false,
    message: '未找到 cua-driver，请安装后再次打开开关'
  }
}

/** 关闭 Computer Use：移除 cua-driver MCP */
export async function disableComputerUse(workspace: string): Promise<void> {
  await setMcpPluginEnabled(workspace, 'cua-driver', false)
  invalidateMcpToolPool()
}

/** 检测 Playwright 是否可 import */
async function detectPlaywright(): Promise<boolean> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
      s: string
    ) => Promise<unknown>
    await dynamicImport('playwright')
    return true
  } catch {
    return false
  }
}

/** 启用 Browser Use：MCP + 可选安装 Playwright */
export async function ensureBrowserUseReady(
  workspace: string,
  appRoot?: string
): Promise<FeatureEnsureResult> {
  await setMcpPluginEnabled(workspace, 'playwright', true)
  invalidateMcpToolPool()

  if (await detectPlaywright()) {
    return { ok: true, message: 'Browser Use 已就绪' }
  }

  const root = appRoot ?? process.cwd()
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const install = await runCmd(npm, ['install', 'playwright', '--no-save'], { cwd: root }, 180_000)
  if (install.code !== 0) {
    return {
      ok: true,
      message: 'Playwright MCP 已启用（首次浏览器任务可能稍慢）'
    }
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  await runCmd(npx, ['playwright', 'install', 'chromium'], { cwd: root }, 300_000).catch(() => {})

  if (await detectPlaywright()) {
    return { ok: true, message: 'Browser Use 已就绪' }
  }
  return { ok: true, message: 'Playwright MCP 已启用' }
}

/** 关闭 Browser Use */
export async function disableBrowserUse(workspace: string): Promise<void> {
  await setMcpPluginEnabled(workspace, 'playwright', false)
  invalidateMcpToolPool()
}
