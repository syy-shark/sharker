/**
 * Computer Use 共享：检测依赖、执行外部命令。
 * 输入走 ydotool 虚拟设备，不占用物理鼠标。
 * @see tools/builtins/computer-use/
 */
import { execFile, spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { defaultCuaDriverBinaryCandidates } from '../../../shared/plugin-catalog'

const execFileAsync = promisify(execFile)

/** 命令是否在 PATH 中（跨平台） */
export async function which(bin: string): Promise<string | null> {
  if (process.platform === 'win32') {
    const names = bin.toLowerCase().endsWith('.exe') ? [bin] : [`${bin}.exe`, bin]
    for (const name of names) {
      try {
        const { stdout } = await execFileAsync('where.exe', [name], {
          windowsHide: true
        })
        const first = stdout.trim().split(/\r?\n/)[0]?.trim()
        if (first) return first
      } catch {
        /* try next */
      }
    }
    return null
  }
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

/** Windows：检测 Cua Driver 守护进程（计划任务或 doctor 输出） */
export async function checkCuaDriverDaemonWin(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await runCmd(
      'schtasks',
      ['/Query', '/TN', 'CuaDriverServe', '/FO', 'LIST'],
      undefined,
      12_000
    )
    if (r.code === 0 && /Ready|running/i.test(r.stdout)) {
      return { ok: true, detail: '计划任务 CuaDriverServe 已注册' }
    }
  } catch {
    /* ignore */
  }
  const doctor = await runCuaDriverDoctor()
  if (/daemon.*running|serve.*running|session.*ok|ready/i.test(doctor.output)) {
    return { ok: true, detail: 'doctor 报告 daemon 可用' }
  }
  return {
    ok: false,
    detail: doctor.output.includes('未安装')
      ? '未安装 cua-driver'
      : 'daemon 未运行 — 执行 cua-driver serve 或重新运行安装脚本（-AutoStart）'
  }
}

/** Windows：列出可见窗口标题 */
export async function listWindowsWindows(): Promise<string> {
  const ps =
    "Get-Process | Where-Object { $_.MainWindowTitle } | " +
    "Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String -Width 200"
  const r = await runCmd(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    undefined,
    20_000
  )
  if (r.code === 0 && r.stdout.trim()) {
    return `# Windows windows (Get-Process MainWindowTitle)\n${r.stdout.trim()}`
  }
  return r.stderr.trim() || '无法列出窗口（PowerShell 失败）'
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
  const shell =
    process.platform === 'win32' &&
    (/\.(cmd|bat)$/i.test(bin) || bin.toLowerCase() === 'npx' || bin.toLowerCase() === 'npm')
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...env },
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell,
      windowsHide: true
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

/** 解析 ydotoold 实际使用的 socket 路径 */
export async function resolveYdotoolSocket(): Promise<string | null> {
  if (process.env.YDOTOOL_SOCKET) return process.env.YDOTOOL_SOCKET

  const candidates = [
    path.join('/run/user', String(process.getuid?.() ?? os.userInfo().uid), '.ydotool_socket'),
    '/tmp/.ydotool_socket'
  ]
  for (const socket of candidates) {
    try {
      await fs.access(socket)
      return socket
    } catch {
      /* try next */
    }
  }
  return null
}

/** ydotool 环境：自动探测 socket（Ubuntu 默认在 $XDG_RUNTIME_DIR/.ydotool_socket） */
export async function ydotoolEnv(): Promise<Record<string, string>> {
  const socket = (await resolveYdotoolSocket()) ?? '/tmp/.ydotool_socket'
  return { YDOTOOL_SOCKET: socket }
}

/** 检测 AT-SPI D-Bus 是否可用 */
export async function checkAtSpiBus(): Promise<{ ok: boolean; detail: string }> {
  const r = await runCmd('busctl', [
    '--user',
    'call',
    'org.a11y.Bus',
    '/org/a11y/bus',
    'org.a11y.Bus',
    'GetAddress'
  ])
  if (r.code === 0 && r.stdout.trim()) {
    return { ok: true, detail: r.stdout.trim() }
  }
  return { ok: false, detail: r.stderr.trim() || 'AT-SPI bus 不可用' }
}

/** 检测 GNOME 辅助功能是否已开启（Codex get_app_state 依赖） */
export async function checkGnomeAccessibility(): Promise<{ ok: boolean; detail: string }> {
  const r = await runCmd('gsettings', [
    'get',
    'org.gnome.desktop.a11y.applications',
    'screen-reader-enabled'
  ])
  if (r.code !== 0) {
    return { ok: false, detail: '非 GNOME 或未安装 gsettings' }
  }
  const enabled = r.stdout.trim() === 'true'
  return {
    ok: enabled,
    detail: enabled ? 'screen-reader-enabled=true' : 'screen-reader-enabled=false（需 setup_accessibility）'
  }
}

/** 检测 ydotoold 是否在运行 */
export async function isYdotooldRunning(): Promise<boolean> {
  const r = await runCmd('pgrep', ['-x', 'ydotoold'])
  return r.code === 0
}

/** 检测截图工具优先级：grim → scrot → gnome-screenshot → import */
export async function detectScreenshotTool(): Promise<string | null> {
  for (const bin of ['grim', 'scrot', 'gnome-screenshot', 'import']) {
    if (await which(bin)) return bin
  }
  return null
}

/** 截取全屏到 outputPath */
export async function captureScreenshot(outputPath: string): Promise<{ tool: string; width?: number; height?: number }> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const tool = await detectScreenshotTool()
  if (!tool) {
    throw new Error(
      'No screenshot tool found. Install grim (Wayland) or scrot, or configure codex-computer-use-linux MCP (portal screenshot).'
    )
  }

  if (tool === 'grim') {
    const r = await runCmd('grim', [outputPath], undefined, 12_000)
    if (r.code !== 0) throw new Error(`grim failed: ${r.stderr || r.stdout}`)
  } else if (tool === 'scrot') {
    const r = await runCmd('scrot', [outputPath], undefined, 12_000)
    if (r.code !== 0) throw new Error(`scrot failed: ${r.stderr || r.stdout}`)
  } else if (tool === 'gnome-screenshot') {
    const r = await runCmd('gnome-screenshot', ['-f', outputPath])
    if (r.code !== 0) throw new Error(`gnome-screenshot failed: ${r.stderr || r.stdout}`)
  } else {
    const r = await runCmd('import', ['-window', 'root', outputPath])
    if (r.code !== 0) throw new Error(`import failed: ${r.stderr || r.stdout}`)
  }

  return { tool }
}

/** 从 mcp.json 读取 computer-use server 是否已配置 */
export async function findComputerUseMcpConfig(): Promise<{ configured: boolean; command?: string }> {
  const paths = [path.join(os.homedir(), '.sharker', 'mcp.json')]
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, 'utf8')
      const json = JSON.parse(raw) as { servers?: Array<{ name?: string; command?: string }> }
      const server = json.servers?.find(
        (s) =>
          s.name === 'cua-driver' ||
          s.name === 'computer-use' ||
          s.command?.includes('cua-driver') ||
          s.command?.includes('codex-computer-use-linux')
      )
      if (server?.command) return { configured: true, command: server.command }
    } catch {
      /* skip */
    }
  }
  return { configured: false }
}

/** Computer Use 环境诊断 */
export async function desktopDoctorReport(): Promise<string> {
  if (process.platform === 'win32') {
    return desktopDoctorReportWindows()
  }
  return desktopDoctorReportLinux()
}

async function desktopDoctorReportWindows(): Promise<string> {
  const lines: string[] = ['# Computer Use 诊断 (Windows · Cua Driver)', '']
  lines.push(`platform: ${process.platform} · ${process.env.OS ?? 'Windows'}`)

  const binary = await findCuaDriverBinary()
  lines.push(`cua-driver: ${binary ?? '未安装'}`)
  if (binary) {
    const ver = await runCmd(binary, ['--version'])
    if (ver.stdout.trim()) lines.push(`version: ${ver.stdout.trim()}`)
  }

  const daemon = await checkCuaDriverDaemonWin()
  lines.push(`daemon: ${daemon.ok ? daemon.detail : daemon.detail}`)

  const doctor = await runCuaDriverDoctor()
  if (doctor.output) {
    lines.push('', '## cua-driver doctor', doctor.output)
  }

  const mcp = await findComputerUseMcpConfig()
  lines.push(
    '',
    `MCP cua-driver: ${mcp.configured ? `已配置 (${mcp.command})` : '未配置 — 设置 → Computer Use → 启用 cua-driver'}`
  )

  lines.push('', '## 推荐路径 (Cua Driver)')
  lines.push('- 安装: irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex')
  lines.push('- MCP: cua-driver mcp（工具前缀 mcp_cua_driver__*）')
  lines.push('- 工作流: get_window_state → 元素 click/type → background 优先，必要时 foreground')
  lines.push('- 文档: https://cua.ai/docs/cua-driver')

  return lines.join('\n')
}

async function desktopDoctorReportLinux(): Promise<string> {
  const lines: string[] = ['# Desktop Computer Use 诊断', '']

  const sessionType = process.env.XDG_SESSION_TYPE ?? '(unknown)'
  const desktop = process.env.XDG_CURRENT_DESKTOP ?? '(unknown)'
  lines.push(`session: ${sessionType} · ${desktop}`)

  const ydotool = await which('ydotool')
  const ydotoold = await which('ydotoold')
  const ydotooldRunning = await isYdotooldRunning()
  const socket = await resolveYdotoolSocket()
  lines.push(`ydotool: ${ydotool ?? '未安装'}`)
  lines.push(`ydotoold: ${ydotoold ?? '未安装'}${ydotooldRunning ? ' (运行中)' : ydotoold ? ' (未运行 — 执行 ydotoold &)' : ''}`)
  lines.push(`YDOTOOL_SOCKET: ${socket ?? '未找到 socket'}`)

  try {
    await fs.access('/dev/uinput')
    const groups = (process.getgroups?.() ?? []).map(String)
    const inInput = groups.includes(String(os.userInfo().gid)) || (await runCmd('groups', [])).stdout.includes('input')
    lines.push(`/dev/uinput: 可访问${inInput ? '' : '（建议将用户加入 input 组并重新登录）'}`)
  } catch {
    lines.push('/dev/uinput: 不可访问 — 需 udev 规则 + input 组，见 tools/README.md')
  }

  const shot = await detectScreenshotTool()
  lines.push(
    `screenshot (builtin): ${shot ?? '未找到 grim/scrot/gnome-screenshot/import — 可装 grim 或走 MCP portal 截图'}`
  )

  const atspi = await checkAtSpiBus()
  lines.push(`AT-SPI bus: ${atspi.ok ? atspi.detail : atspi.detail}`)

  const a11y = await checkGnomeAccessibility()
  lines.push(`GNOME accessibility: ${a11y.detail}`)

  const wmctrl = await which('wmctrl')
  lines.push(`wmctrl: ${wmctrl ?? '未安装（desktop_list_windows 回退受限）'}`)

  const mcp = await findComputerUseMcpConfig()
  lines.push(
    `cua-driver / codex MCP: ${mcp.configured ? `已配置 (${mcp.command})` : '未配置 — bash scripts/setup-cua-driver.sh --install-mcp'}`
  )

  lines.push('')
  lines.push('## 两种路径')
  lines.push('**(A) 内置 desktop_***：ydotool 虚拟输入 + 本地截图 CLI；适合简单点击/打字。')
  lines.push('**(B) MCP cua-driver（推荐）**：后台 AT-SPI、元素级 click、get_window_state、scroll/zoom。')
  lines.push('**(C) MCP codex-computer-use-linux**：portal 截图、窗口聚焦（备选）。')
  lines.push('')
  lines.push('## 背景输入说明')
  lines.push('- ydotool 通过 /dev/uinput 创建虚拟输入设备，不移动物理鼠标')
  lines.push('- Ubuntu 24.04+ ydotoold socket 通常在 $XDG_RUNTIME_DIR/.ydotool_socket')
  lines.push('- 完整 UI 树 / 元素点击请配置 cua-driver 后使用 mcp_cua_driver__get_window_state / click')

  return lines.join('\n')
}
