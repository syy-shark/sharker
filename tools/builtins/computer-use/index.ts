/**
 * Computer Use 基础 Tool：截图 + ydotool 背景输入。
 * 完整 AT-SPI / portal 输入见 codex-computer-use-linux MCP。
 * @see tools/README.md · docs/agent-capabilities.md
 */
import fs from 'fs/promises'
import path from 'path'
import { ok } from '../../context'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import {
  captureScreenshot,
  checkAtSpiBus,
  desktopDoctorReport,
  findComputerUseMcpConfig,
  listWindowsWindows,
  runCmd,
  which,
  ydotoolEnv
} from './shared'
import type { ToolHandler } from '../../types'

/** 截图保存目录 */
function screenshotDir(workspace: string): string {
  return path.join(workspace, '.sharker', 'desktop')
}

/** ydotool 滚轮不可用时的按键回退（Linux evdev keycode） */
const SCROLL_KEY_FALLBACK: Record<string, number> = {
  up: 104, // KEY_PAGEUP
  down: 109, // KEY_PAGEDOWN
  left: 105, // KEY_LEFT
  right: 106 // KEY_RIGHT
}

export const desktopDoctorTool: ToolHandler = {
  name: 'desktop_doctor',
  title: '桌面自动化诊断',
  async execute(_args, _ctx) {
    return ok(await desktopDoctorReport())
  }
}

export const desktopScreenshotTool: ToolHandler = {
  name: 'desktop_screenshot',
  title: '桌面截图',
  async execute(_args, ctx) {
    const mcp = await findComputerUseMcpConfig()
    if (process.platform === 'win32') {
      if (mcp.configured) {
        return ok(
          'Windows: use mcp_cua_driver__get_window_state for screenshot + UIA tree.\n' +
            'Builtin desktop_screenshot is not available on Windows.'
        )
      }
      return ok(
        'Windows desktop screenshot requires Cua Driver MCP.\n' +
          'Install via Settings → Computer Use, then enable cua-driver MCP.'
      )
    }
    if (mcp.configured) {
      return ok(
        'Builtin desktop_screenshot skipped — MCP computer-use is configured.\n' +
          'Use mcp_cua_driver__get_window_state (preferred) or mcp_computer_use__screenshot instead.\n' +
          'get_window_state returns accessibility elements + screenshot metadata for clicks.'
      )
    }
    const ws = getActiveWorkspacePath(ctx.settings)
    const dir = screenshotDir(ws)
    const filename = `screenshot-${Date.now()}.png`
    const outputPath = path.join(dir, filename)
    try {
      const { tool } = await captureScreenshot(outputPath)
      const stat = await fs.stat(outputPath)
      return ok(
        `Screenshot saved (${tool})\npath: ${outputPath}\nbytes: ${stat.size}\nUse read_image to inspect.`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const mcp = await findComputerUseMcpConfig()
      return ok(
        `${msg}\n\n` +
          (mcp.configured
            ? 'Builtin CLI screenshot unavailable; use MCP mcp_computer_use__screenshot (portal).'
            : 'Install grim/scrot or configure codex-computer-use-linux in ~/.sharker/mcp.json for portal screenshots.')
      )
    }
  }
}

export const desktopClickTool: ToolHandler = {
  name: 'desktop_click',
  title: '桌面点击（虚拟指针）',
  assessRisk: () => ({ highRisk: true, reason: '桌面虚拟点击' }),
  async execute(args, _ctx) {
    if (process.platform === 'win32') {
      return ok(
        'Windows: use MCP cua-driver for clicks (mcp_cua_driver__click / type_text).\n' +
          'Install: Settings → Computer Use → copy install command, then enable cua-driver MCP.'
      )
    }
    if (!(await which('ydotool'))) {
      return ok('ydotool not installed. Run desktop_doctor for setup steps.')
    }
    const x = Number(args.x)
    const y = Number(args.y)
    const button = String(args.button ?? 'left')
    const count = Math.max(1, Number(args.count ?? 1))
    const env = await ydotoolEnv()

    const move = await runCmd('ydotool', ['mousemove', '--absolute', String(Math.round(x)), String(Math.round(y))], env)
    if (move.code !== 0) {
      return ok(`ydotool mousemove failed: ${move.stderr || move.stdout}\nEnsure ydotoold is running. Run desktop_doctor.`)
    }

    const btnCode = button === 'right' ? '0xC1' : button === 'middle' ? '0xC2' : '0xC0'
    const click = await runCmd('ydotool', ['click', '-r', String(count), btnCode], env)
    if (click.code !== 0) {
      return ok(`ydotool click failed: ${click.stderr || click.stdout}`)
    }
    return ok(`Clicked ${button} at (${x}, ${y}) x${count} via virtual input (physical mouse unchanged)`)
  }
}

export const desktopTypeTool: ToolHandler = {
  name: 'desktop_type',
  title: '桌面键盘输入（虚拟）',
  assessRisk: () => ({ highRisk: true, reason: '桌面虚拟键盘输入' }),
  async execute(args, _ctx) {
    if (process.platform === 'win32') {
      return ok(
        'Windows: use MCP cua-driver for clicks (mcp_cua_driver__click / type_text).\n' +
          'Install: Settings → Computer Use → copy install command, then enable cua-driver MCP.'
      )
    }
    if (!(await which('ydotool'))) {
      return ok('ydotool not installed. Run desktop_doctor for setup steps.')
    }
    const text = String(args.text ?? '')
    const env = await ydotoolEnv()
    const r = await runCmd('ydotool', ['type', text], env)
    if (r.code !== 0) {
      return ok(`ydotool type failed: ${r.stderr || r.stdout}`)
    }
    return ok(`Typed ${text.length} chars via virtual keyboard`)
  }
}

export const desktopKeyTool: ToolHandler = {
  name: 'desktop_key',
  title: '桌面按键（虚拟）',
  assessRisk: () => ({ highRisk: true, reason: '桌面虚拟按键' }),
  async execute(args, _ctx) {
    if (process.platform === 'win32') {
      return ok(
        'Windows: use MCP cua-driver for clicks (mcp_cua_driver__click / type_text).\n' +
          'Install: Settings → Computer Use → copy install command, then enable cua-driver MCP.'
      )
    }
    if (!(await which('ydotool'))) {
      return ok('ydotool not installed. Run desktop_doctor for setup steps.')
    }
    const key = String(args.key ?? '')
    const env = await ydotoolEnv()
    const r = await runCmd('ydotool', ['key', key], env)
    if (r.code !== 0) {
      return ok(`ydotool key failed: ${r.stderr || r.stdout}\nExample: key 28:1 28:0 for Enter`)
    }
    return ok(`Sent key chord: ${key}`)
  }
}

/**
 * 滚动（ydotool 无滚轮命令，用 Page/Arrow 键近似；精确 scroll 请用 MCP scroll）。
 */
export const desktopScrollTool: ToolHandler = {
  name: 'desktop_scroll',
  title: '桌面滚动（虚拟）',
  assessRisk: () => ({ highRisk: true, reason: '桌面虚拟滚动' }),
  async execute(args, _ctx) {
    if (process.platform === 'win32') {
      return ok(
        'Windows: use MCP cua-driver for clicks (mcp_cua_driver__click / type_text).\n' +
          'Install: Settings → Computer Use → copy install command, then enable cua-driver MCP.'
      )
    }
    if (!(await which('ydotool'))) {
      return ok('ydotool not installed. Run desktop_doctor for setup steps.')
    }
    const direction = String(args.direction ?? 'down').toLowerCase()
    const units = Math.max(1, Math.min(20, Number(args.units ?? 3)))
    const keycode = SCROLL_KEY_FALLBACK[direction]
    if (!keycode) {
      return ok(`Unknown direction "${direction}". Use up | down | left | right. For pixel scroll use MCP scroll.`)
    }

    const env = await ydotoolEnv()
    const x = args.x
    const y = args.y
    if (x != null && y != null) {
      const move = await runCmd(
        'ydotool',
        ['mousemove', '--absolute', String(Math.round(Number(x))), String(Math.round(Number(y)))],
        env
      )
      if (move.code !== 0) {
        return ok(`ydotool mousemove failed: ${move.stderr || move.stdout}`)
      }
    }

    const chord = `${keycode}:1 ${keycode}:0`
    for (let i = 0; i < units; i++) {
      const r = await runCmd('ydotool', ['key', chord], env)
      if (r.code !== 0) {
        return ok(`ydotool scroll fallback failed: ${r.stderr || r.stdout}`)
      }
    }
    return ok(
      `Sent ${units} scroll unit(s) ${direction} via key fallback (ydotool has no wheel API).\n` +
        'For coordinate scroll / portal input use MCP mcp_computer_use__scroll after configuring ~/.sharker/mcp.json.'
    )
  }
}

/**
 * AT-SPI UI 树占位：完整树由 codex-computer-use-linux MCP get_app_state 提供。
 */
export const desktopGetUiTreeTool: ToolHandler = {
  name: 'desktop_get_ui_tree',
  title: '获取 AT-SPI UI 树（需 MCP）',
  async execute(_args, _ctx) {
    const mcp = await findComputerUseMcpConfig()
    if (process.platform === 'win32') {
      const lines = ['# UI Tree (Windows · UIA via Cua Driver)', '']
      if (mcp.configured) {
        lines.push('Call mcp_cua_driver__get_window_state for UIA/MSAA tree + screenshot metadata.')
        lines.push('Element actions: mcp_cua_driver__click, type_text, scroll.')
      } else {
        lines.push('Install Cua Driver and enable MCP in Settings → Computer Use.')
      }
      return ok(lines.join('\n'))
    }
    const atspi = await checkAtSpiBus()

    const lines = ['# AT-SPI UI Tree', '']
    lines.push(`AT-SPI bus: ${atspi.ok ? '可用' : '不可用 — ' + atspi.detail}`)

    if (mcp.configured) {
      lines.push(`MCP: 已配置 (${mcp.command})`)
      lines.push('')
      lines.push('Call dynamic MCP tool:')
      lines.push('- mcp_cua_driver__get_window_state — AT-SPI 元素树 + 截图元数据（推荐）')
      lines.push('- mcp_cua_driver__click / scroll / zoom — 元素级操作')
      lines.push('- mcp_computer_use__get_app_state — codex 备选')
      if (!atspi.ok) {
        lines.push('')
        lines.push('AT-SPI unavailable; run mcp_computer_use__setup_accessibility first.')
      }
    } else {
      lines.push('MCP: 未配置 codex-computer-use-linux')
      lines.push('')
      lines.push('Setup:')
      lines.push('1. cargo build --release in codex-desktop-linux/computer-use-linux')
      lines.push('2. Add server to ~/.sharker/mcp.json (see tools/mcp.example.json)')
      lines.push('3. Restart Sharker query so MCP tool pool refreshes')
      lines.push('4. Use mcp_computer_use__get_app_state instead of this stub')
    }

    return ok(lines.join('\n'))
  }
}

/** 列出窗口（wmctrl / hyprctl 回退；完整 AT-SPI 见 codex-computer-use-linux MCP） */
export const desktopListWindowsTool: ToolHandler = {
  name: 'desktop_list_windows',
  title: '列出桌面窗口',
  async execute(_args, _ctx) {
    if (process.platform === 'win32') {
      return ok(await listWindowsWindows())
    }
    if (await which('wmctrl')) {
      const r = await runCmd('wmctrl', ['-l'])
      if (r.code === 0 && r.stdout.trim()) {
        return ok(`# Windows (wmctrl -l)\n${r.stdout.trim()}`)
      }
    }
    if (await which('hyprctl')) {
      const r = await runCmd('hyprctl', ['clients', '-j'])
      if (r.code === 0 && r.stdout.trim()) {
        return ok(`# Hyprland clients (JSON)\n${r.stdout.slice(0, 40_000)}`)
      }
    }
    const mcp = await findComputerUseMcpConfig()
    return ok(
      'No window list backend (install wmctrl or use Hyprland).\n' +
        (mcp.configured
          ? 'Use MCP mcp_computer_use__list_windows for GNOME extension / portal window list.'
          : 'For AT-SPI tree + focus: configure codex-computer-use-linux in ~/.sharker/mcp.json')
    )
  }
}

export const computerUseTools: ToolHandler[] = [
  desktopDoctorTool,
  desktopScreenshotTool,
  desktopListWindowsTool,
  desktopGetUiTreeTool,
  desktopClickTool,
  desktopTypeTool,
  desktopKeyTool,
  desktopScrollTool
]
