/**
 * Computer Use 共享：检测依赖、执行外部命令（macOS）。
 * 内置：screencapture + osascript / cliclick；可选 cua-driver 诊断。
 * @see tools/builtins/computer-use/
 */
import { execFile, spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { defaultCuaDriverBinaryCandidates } from '../../../shared/plugin-catalog'

const execFileAsync = promisify(execFile)

/** 命令是否在 PATH 中 */
export async function which(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [bin])
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** 解析 cua-driver 可执行文件 */
export async function findCuaDriverBinary(): Promise<string | null> {
  const env = process.env.SHARKER_CUA_DRIVER_BIN ?? process.env.CUA_DRIVER_BIN
  if (env) {
    try {
      await fs.access(env, fs.constants.F_OK)
      return env
    } catch {
      /* fall through */
    }
  }
  const fromPath = await which('cua-driver')
  if (fromPath) return fromPath
  for (const candidate of defaultCuaDriverBinaryCandidates(os.homedir())) {
    if (!candidate) continue
    try {
      await fs.access(candidate, fs.constants.F_OK)
      return candidate
    } catch {
      /* next */
    }
  }
  return null
}

/** 运行 cua-driver doctor */
export async function runCuaDriverDoctor(): Promise<{ ok: boolean; output: string }> {
  const binary = await findCuaDriverBinary()
  if (!binary) {
    return { ok: false, output: 'cua-driver 未安装' }
  }
  const r = await runCmd(binary, ['doctor'], undefined, 12_000)
  const output = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
  return { ok: r.code === 0, output: output || `(exit ${r.code})` }
}

function normalizeRunOpts(
  optsOrEnv?: Record<string, string> | { env?: Record<string, string>; cwd?: string }
): { env?: Record<string, string>; cwd?: string } {
  if (!optsOrEnv) return {}
  if ('cwd' in optsOrEnv || 'env' in optsOrEnv) {
    return optsOrEnv as { env?: Record<string, string>; cwd?: string }
  }
  return { env: optsOrEnv as Record<string, string> }
}

/** 运行外部命令，返回 stdout/stderr；超时则 kill 子进程 */
export async function runCmd(
  bin: string,
  args: string[],
  optsOrEnv?: Record<string, string> | { env?: Record<string, string>; cwd?: string },
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  const { env, cwd } = normalizeRunOpts(optsOrEnv)
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...env },
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code })
    }
    const timer = setTimeout(() => {
      stderr += `\n(timeout after ${timeoutMs}ms)`
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      finish(124)
    }, timeoutMs)
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf8')
    })
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', (err) => {
      stderr += err.message
      finish(1)
    })
  })
}

/** 检测系统截图工具（macOS 自带 screencapture） */
export async function detectScreenshotTool(): Promise<string | null> {
  if (await which('screencapture')) return 'screencapture'
  return null
}

/** 截取全屏到 outputPath */
export async function captureScreenshot(outputPath: string): Promise<{ tool: string; width?: number; height?: number }> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const tool = await detectScreenshotTool()
  if (!tool) {
    throw new Error('screencapture not found.')
  }
  const r = await runCmd('screencapture', ['-x', '-t', 'png', outputPath], undefined, 12_000)
  if (r.code !== 0) throw new Error(`screencapture failed: ${r.stderr || r.stdout}`)
  return { tool }
}

/** 用 AppleScript 列出可见窗口 */
export async function listMacWindows(): Promise<string> {
  const script = `
tell application "System Events"
  set out to {}
  repeat with p in (every process whose background only is false)
    try
      set pname to name of p
      repeat with w in (every window of p)
        try
          set end of out to pname & " | " & (name of w as text)
        end try
      end repeat
    end try
  end repeat
  set AppleScript's text item delimiters to linefeed
  return out as text
end tell
`
  const r = await runCmd('osascript', ['-e', script], undefined, 15_000)
  if (r.code === 0 && r.stdout.trim()) {
    return `# macOS windows (System Events)\n${r.stdout.trim()}`
  }
  return (
    r.stderr.trim() ||
    '无法列出窗口。请在「系统设置 → 隐私与安全性 → 辅助功能」中授权 Sharker。'
  )
}

/** Computer Use 环境诊断（macOS） */
export async function desktopDoctorReport(): Promise<string> {
  const lines: string[] = ['# Computer Use 诊断 (macOS)', '']
  lines.push(`platform: darwin · macOS`)

  const binary = await findCuaDriverBinary()
  lines.push(`cua-driver (可选): ${binary ?? '未安装'}`)
  if (binary) {
    const ver = await runCmd(binary, ['--version'])
    if (ver.stdout.trim()) lines.push(`version: ${ver.stdout.trim()}`)
  }

  const doctor = await runCuaDriverDoctor()
  if (doctor.output && binary) {
    lines.push('', '## cua-driver doctor', doctor.output)
  }

  const shot = await detectScreenshotTool()
  lines.push(`screenshot: ${shot ?? '未找到 screencapture'}`)

  const cliclick = await which('cliclick')
  lines.push(`cliclick: ${cliclick ?? '未安装 — brew install cliclick'}`)

  lines.push('', '## 推荐路径')
  lines.push('- 辅助功能: 系统设置 → 隐私与安全性 → 辅助功能 → 允许 Sharker')
  lines.push('- 屏幕录制: 系统设置 → 隐私与安全性 → 屏幕录制（截图需要）')
  lines.push('- 工作流: desktop_screenshot → desktop_list_windows → desktop_click/type/key/scroll')
  lines.push('- 可选: bash scripts/setup-cua-driver.sh · brew install cliclick')

  return lines.join('\n')
}
