/**
 * Computer Use 基础 Tool（macOS）：截图 + 可选 cliclick / osascript。
 * @see tools/ARCH.md · docs/agent-capabilities.md
 */
import fs from 'fs/promises'
import path from 'path'
import { ok } from '../../context'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import {
  captureScreenshot,
  desktopDoctorReport,
  listMacWindows,
  runCmd,
  which
} from './shared'
import type { ToolHandler } from '../../types'

/** 截图保存目录 */
function screenshotDir(workspace: string): string {
  return path.join(workspace, '.sharker', 'desktop')
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
      return ok(
        `${msg}\n\n` +
          'Grant Screen Recording permission in System Settings → Privacy & Security.'
      )
    }
  }
}

export const desktopClickTool: ToolHandler = {
  name: 'desktop_click',
  title: '桌面点击',
  assessRisk: () => ({ highRisk: true, reason: '桌面点击' }),
  async execute(args, _ctx) {
    if (!(await which('cliclick'))) {
      return ok('cliclick not installed. Install: brew install cliclick')
    }
    const x = Math.round(Number(args.x))
    const y = Math.round(Number(args.y))
    const button = String(args.button ?? 'left')
    const count = Math.max(1, Number(args.count ?? 1))
    const btn = button === 'right' ? 'rc' : button === 'middle' ? 'mc' : 'c'
    const parts: string[] = [`m:${x},${y}`]
    for (let i = 0; i < count; i++) parts.push(btn + ':.')
    const r = await runCmd('cliclick', parts)
    if (r.code !== 0) {
      return ok(`cliclick failed: ${r.stderr || r.stdout}\nCheck Accessibility permission.`)
    }
    return ok(`Clicked ${button} at (${x}, ${y}) x${count} via cliclick`)
  }
}

export const desktopTypeTool: ToolHandler = {
  name: 'desktop_type',
  title: '桌面键盘输入',
  assessRisk: () => ({ highRisk: true, reason: '桌面键盘输入' }),
  async execute(args, _ctx) {
    if (!(await which('cliclick'))) {
      return ok('cliclick not installed. Install: brew install cliclick')
    }
    const text = String(args.text ?? '')
    const r = await runCmd('cliclick', [`t:${text}`])
    if (r.code !== 0) {
      return ok(`cliclick type failed: ${r.stderr || r.stdout}`)
    }
    return ok(`Typed ${text.length} chars via cliclick`)
  }
}

export const desktopKeyTool: ToolHandler = {
  name: 'desktop_key',
  title: '桌面按键',
  assessRisk: () => ({ highRisk: true, reason: '桌面按键' }),
  async execute(args, _ctx) {
    const key = String(args.key ?? '')
    const script = `tell application "System Events" to keystroke ${JSON.stringify(key)}`
    const r = await runCmd('osascript', ['-e', script])
    if (r.code !== 0) {
      return ok(
        `osascript key failed: ${r.stderr || r.stdout}\n` +
          'Grant Accessibility permission in System Settings → Privacy & Security.'
      )
    }
    return ok(`Sent keystroke: ${key}`)
  }
}

/** 滚动（Page/Arrow 键近似） */
export const desktopScrollTool: ToolHandler = {
  name: 'desktop_scroll',
  title: '桌面滚动',
  assessRisk: () => ({ highRisk: true, reason: '桌面滚动' }),
  async execute(args, _ctx) {
    const direction = String(args.direction ?? 'down').toLowerCase()
    const units = Math.max(1, Math.min(20, Number(args.units ?? 3)))
    const keyCodeMap: Record<string, number> = {
      up: 126,
      down: 125,
      left: 123,
      right: 124
    }
    const pageMap: Record<string, number> = { up: 116, down: 121 }
    const keyCode = pageMap[direction] ?? keyCodeMap[direction]
    if (keyCode == null) {
      return ok(`Unknown direction "${direction}". Use up | down | left | right.`)
    }
    for (let i = 0; i < units; i++) {
      const script = `tell application "System Events" to key code ${keyCode}`
      const r = await runCmd('osascript', ['-e', script])
      if (r.code !== 0) {
        return ok(`scroll failed: ${r.stderr || r.stdout}`)
      }
    }
    return ok(`Sent ${units} scroll unit(s) ${direction} via System Events.`)
  }
}

/** UI 树：System Events 窗口列表 + 使用指引 */
export const desktopGetUiTreeTool: ToolHandler = {
  name: 'desktop_get_ui_tree',
  title: '获取 UI 树',
  async execute(_args, _ctx) {
    const windows = await listMacWindows()
    const lines = [
      '# UI Tree (macOS · System Events)',
      '',
      windows,
      '',
      'Workflow:',
      '1. desktop_screenshot — capture screen',
      '2. desktop_list_windows — window list',
      '3. desktop_click / desktop_type / desktop_key / desktop_scroll — interact',
      '4. Grant Accessibility + Screen Recording if tools fail'
    ]
    return ok(lines.join('\n'))
  }
}

/** 列出窗口（osascript System Events） */
export const desktopListWindowsTool: ToolHandler = {
  name: 'desktop_list_windows',
  title: '列出桌面窗口',
  async execute(_args, _ctx) {
    return ok(await listMacWindows())
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
