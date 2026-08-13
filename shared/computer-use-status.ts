/**
 * Computer Use 状态聚合（macOS）：供设置 UI 与 Agent system prompt 使用。
 */
import path from 'path'
import {
  desktopDoctorReport,
  detectScreenshotTool,
  findCuaDriverBinary,
  runCuaDriverDoctor,
  which
} from '../tools/builtins/computer-use/shared'
import { COMPUTER_USE_BUILTIN_TOOLS } from '../tools/tool-groups'

/** 单项环境检查 */
export interface ComputerUseCheckItem {
  id: string
  label: string
  ok: boolean
  detail: string
}

/** 完整 Computer Use 状态（设置页 / IPC） */
export interface ComputerUseStatus {
  sessionType: string
  desktop: string
  checklist: ComputerUseCheckItem[]
  builtinReady: boolean
  doctorReport: string
  builtinTools: readonly string[]
}

/** macOS：Cua Driver + screencapture / cliclick 内置工具 */
export async function gatherComputerUseStatus(_workspace: string): Promise<ComputerUseStatus> {
  const binary = await findCuaDriverBinary()
  const shot = await detectScreenshotTool()
  const cliclick = await which('cliclick')

  const doctor = binary ? await runCuaDriverDoctor() : { ok: false, output: '' }
  const doctorReport = (await desktopDoctorReport()).slice(0, 4000)

  const checklist: ComputerUseCheckItem[] = [
    {
      id: 'ready',
      label: 'Computer Use',
      ok: Boolean(shot) && Boolean(binary || cliclick),
      detail: shot
        ? binary
          ? '已就绪'
          : cliclick
            ? '内置工具可用（可选安装 Cua Driver）'
            : '截图可用 — 建议 brew install cliclick 或安装 Cua Driver'
        : '未找到 screencapture'
    },
    {
      id: 'cua-driver',
      label: 'Cua Driver',
      ok: Boolean(binary),
      detail: binary ? path.basename(binary) : '可选 — bash scripts/setup-cua-driver.sh'
    },
    {
      id: 'screenshot',
      label: '截图（screencapture）',
      ok: Boolean(shot),
      detail: shot ?? '未找到 screencapture'
    },
    {
      id: 'cliclick',
      label: 'cliclick（坐标输入）',
      ok: Boolean(cliclick),
      detail: cliclick ?? '可选 — brew install cliclick'
    }
  ]

  return {
    sessionType: 'macos',
    desktop: 'macOS',
    checklist,
    builtinReady: Boolean(shot),
    doctorReport: doctor.output ? doctorReport : doctorReport,
    builtinTools: COMPUTER_USE_BUILTIN_TOOLS
  }
}
