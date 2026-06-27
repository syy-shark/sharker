/**
 * Computer Use 状态聚合：供设置 UI 与 Agent system prompt 使用。
 */
import path from 'path'
import {
  checkAtSpiBus,
  checkGnomeAccessibility,
  desktopDoctorReport,
  detectScreenshotTool,
  findCuaDriverBinary,
  findComputerUseMcpConfig,
  isYdotooldRunning,
  resolveYdotoolSocket,
  runCuaDriverDoctor,
  which
} from '../tools/builtins/computer-use/shared'
import { listMcpTools, listMcpToolsQuick, loadMcpConfig } from '../tools/services/mcp-registry'
import { COMPUTER_USE_BUILTIN_TOOLS } from '../tools/tool-groups'

/** 单项环境检查 */
export interface ComputerUseCheckItem {
  id: string
  label: string
  ok: boolean
  detail: string
}

/** MCP computer-use 连接摘要 */
export interface ComputerUseMcpStatus {
  configured: boolean
  command?: string
  connected: boolean
  toolCount: number
  toolSamples: string[]
  error?: string
}

/** 完整 Computer Use 状态（设置页 / IPC） */
export interface ComputerUseStatus {
  sessionType: string
  desktop: string
  checklist: ComputerUseCheckItem[]
  builtinReady: boolean
  mcp: ComputerUseMcpStatus
  doctorReport: string
  builtinTools: readonly string[]
}

/** 判断 MCP server 是否为 computer-use（cua-driver 或 codex） */
function isComputerUseServer(name: string, command?: string): boolean {
  return (
    name === 'cua-driver' ||
    name === 'computer-use' ||
    Boolean(command?.includes('codex-computer-use-linux')) ||
    Boolean(command?.includes('cua-driver'))
  )
}

async function gatherMcpStatus(
  workspace: string,
  cuServer?: { name: string; command?: string },
  quick = true
): Promise<ComputerUseMcpStatus> {
  const legacyMcp = await findComputerUseMcpConfig()
  const mcp: ComputerUseMcpStatus = {
    configured: Boolean(cuServer?.command ?? legacyMcp.configured),
    command: cuServer?.command ?? legacyMcp.command,
    connected: false,
    toolCount: 0,
    toolSamples: []
  }

  if (!mcp.configured) return mcp

  try {
    const all = quick
      ? await listMcpToolsQuick(workspace, 12_000)
      : await listMcpTools(workspace)
    const cuTools = all.filter(
      (t) => isComputerUseServer(t.server, cuServer?.command) && !t.name.startsWith('(')
    )
    const failed = all.find(
      (t) => isComputerUseServer(t.server, cuServer?.command) && t.name === '(connection failed)'
    )
    if (failed) {
      mcp.error = failed.description
    } else if (cuTools.length) {
      mcp.connected = true
      mcp.toolCount = cuTools.length
      mcp.toolSamples = cuTools.slice(0, 6).map((t) => `mcp_${t.server}__${t.name}`)
    } else if (!failed) {
      mcp.error = '已配置但未发现工具（检查 cua-driver 路径与 daemon 是否在运行）'
    }
  } catch (e) {
    mcp.error = e instanceof Error ? e.message : String(e)
  }
  return mcp
}

/** Windows：Cua Driver + MCP */
async function gatherWindowsComputerUseStatus(workspace: string): Promise<ComputerUseStatus> {
  const binary = await findCuaDriverBinary()
  const servers = await loadMcpConfig(workspace)
  const cuServer = servers.find((s) => isComputerUseServer(s.name, s.command))
  const mcp = await gatherMcpStatus(workspace, cuServer)

  const doctor = binary ? await runCuaDriverDoctor() : { ok: false, output: '' }

  const checklist: ComputerUseCheckItem[] = [
    {
      id: 'ready',
      label: 'Computer Use',
      ok: Boolean(binary) && (mcp.connected || mcp.configured),
      detail:
        mcp.connected
          ? '已就绪'
          : binary
            ? mcp.error ?? 'MCP 未连接 — 确认 cua-driver serve 在运行'
            : '正在安装或尚未找到 Cua Driver'
    },
    {
      id: 'cua-driver',
      label: 'Cua Driver',
      ok: Boolean(binary),
      detail: binary ? path.basename(binary) : '未安装'
    },
    {
      id: 'mcp',
      label: 'Agent 工具',
      ok: mcp.connected,
      detail: mcp.connected ? `${mcp.toolCount} 个工具可用` : mcp.error ?? '未连接'
    }
  ]

  return {
    sessionType: 'windows',
    desktop: process.env.OS ?? 'Windows',
    checklist,
    builtinReady: mcp.connected || (Boolean(binary) && mcp.configured),
    mcp,
    doctorReport: doctor.output.slice(0, 4000),
    builtinTools: COMPUTER_USE_BUILTIN_TOOLS
  }
}

/** Linux：Cua Driver MCP 优先，ydotool 为内置回退 */
async function gatherLinuxComputerUseStatus(workspace: string): Promise<ComputerUseStatus> {
  const sessionType = process.env.XDG_SESSION_TYPE ?? '(unknown)'
  const desktop = process.env.XDG_CURRENT_DESKTOP ?? '(unknown)'

  const ydotool = await which('ydotool')
  const ydotoold = await which('ydotoold')
  const ydotooldRunning = await isYdotooldRunning()
  const socket = await resolveYdotoolSocket()
  const shot = await detectScreenshotTool()
  const atspi = await checkAtSpiBus()
  const a11y = await checkGnomeAccessibility()
  const wmctrl = await which('wmctrl')
  const cuaBinary = await findCuaDriverBinary()

  let uinputOk = false
  let uinputDetail = '不可访问'
  try {
    const fs = await import('fs/promises')
    await fs.access('/dev/uinput')
    uinputOk = true
    uinputDetail = '可访问'
  } catch {
    uinputDetail = '不可访问 — 需 udev 规则 + input 组'
  }

  const servers = await loadMcpConfig(workspace)
  const cuServer = servers.find((s) => isComputerUseServer(s.name, s.command))
  const mcp = await gatherMcpStatus(workspace, cuServer)

  const checklist: ComputerUseCheckItem[] = [
    {
      id: 'cua-driver',
      label: 'Cua Driver（推荐）',
      ok: Boolean(cuaBinary),
      detail: cuaBinary ?? '可选 — bash scripts/setup-cua-driver.sh'
    },
    {
      id: 'mcp',
      label: 'cua-driver MCP',
      ok: mcp.connected,
      detail: mcp.connected
        ? `已连接 · ${mcp.toolCount} 个工具`
        : mcp.configured
          ? mcp.error ?? '已配置但未连接'
          : '未配置 — 设置 → Computer Use → 启用 cua-driver'
    },
    {
      id: 'ydotool',
      label: 'ydotool（内置 desktop_* 回退）',
      ok: Boolean(ydotool),
      detail: ydotool ?? '未安装 — sudo apt install ydotool'
    },
    {
      id: 'ydotoold',
      label: 'ydotoold 守护进程',
      ok: ydotooldRunning,
      detail: ydotooldRunning
        ? `运行中 · socket: ${socket ?? '未知'}`
        : ydotoold
          ? '未运行 — 执行 ydotoold &'
          : '未安装 ydotoold'
    },
    {
      id: 'uinput',
      label: '/dev/uinput',
      ok: uinputOk,
      detail: uinputDetail
    },
    {
      id: 'screenshot',
      label: '截图 CLI（grim/scrot）',
      ok: Boolean(shot),
      detail: shot ?? '未安装 — sudo apt install grim（Wayland）或 scrot'
    },
    {
      id: 'atspi',
      label: 'AT-SPI 无障碍总线',
      ok: atspi.ok,
      detail: atspi.ok ? '可用' : atspi.detail
    },
    {
      id: 'a11y',
      label: 'GNOME 辅助功能',
      ok: a11y.ok,
      detail: a11y.detail
    },
    {
      id: 'wmctrl',
      label: 'wmctrl（窗口列表）',
      ok: Boolean(wmctrl),
      detail: wmctrl ?? '可选 — sudo apt install wmctrl'
    }
  ]

  const builtinReady =
    mcp.connected || Boolean(ydotool && ydotooldRunning && shot)

  const doctorReport = await desktopDoctorReport()

  return {
    sessionType,
    desktop,
    checklist,
    builtinReady,
    mcp,
    doctorReport,
    builtinTools: COMPUTER_USE_BUILTIN_TOOLS
  }
}

/** 聚合桌面自动化就绪状态 */
export async function gatherComputerUseStatus(workspace: string): Promise<ComputerUseStatus> {
  if (process.platform === 'win32') {
    return gatherWindowsComputerUseStatus(workspace)
  }
  return gatherLinuxComputerUseStatus(workspace)
}
