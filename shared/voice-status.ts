/**
 * Voice / Read Aloud 状态：本地 TTS、Kokoro、read-aloud MCP。
 * @see docs/computer-use-setup.md · scripts/install-kokoro-runtime.sh
 */
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { loadMcpConfig } from '../tools/services/mcp-registry'

const execFileAsync = promisify(execFile)

/** 单项检查 */
export interface VoiceCheckItem {
  id: string
  label: string
  ok: boolean
  detail: string
}

/** Voice 完整状态 */
export interface VoiceStatus {
  localTts: string | null
  kokoroPython: string
  kokoroModel: string
  kokoroVoices: string
  kokoroReady: boolean
  readAloudMcpConfigured: boolean
  readAloudMcpConnected: boolean
  readAloudBinary: string | null
  checklist: VoiceCheckItem[]
  setupScript: string
}

async function which(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [bin])
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function pathKind(p: string): Promise<string> {
  try {
    const st = await fs.stat(p)
    if (st.isDirectory()) return 'directory'
    if (st.mode & 0o111) return 'executable'
    return 'file'
  } catch {
    return 'missing'
  }
}

/** Kokoro 路径（Sharker 默认，兼容 Codex 环境变量） */
export function kokoroPaths() {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
  return {
    python:
      process.env.SHARKER_READ_ALOUD_KOKORO_PYTHON ??
      process.env.CODEX_LINUX_READ_ALOUD_KOKORO_PYTHON ??
      path.join(dataHome, 'sharker', 'read-aloud', 'kokoro-venv', 'bin', 'python'),
    model:
      process.env.SHARKER_READ_ALOUD_KOKORO_MODEL ??
      process.env.CODEX_LINUX_READ_ALOUD_KOKORO_MODEL ??
      path.join(dataHome, 'kokoro', 'kokoro-v1.0.onnx'),
    voices:
      process.env.SHARKER_READ_ALOUD_KOKORO_VOICES ??
      process.env.CODEX_LINUX_READ_ALOUD_KOKORO_VOICES ??
      path.join(dataHome, 'kokoro', 'voices-v1.0.bin')
  }
}

async function resolveReadAloudBinary(): Promise<string | null> {
  const env = process.env.SHARKER_READ_ALOUD_BIN ?? process.env.CODEX_READ_ALOUD_BIN
  if (env) {
    try {
      await fs.access(env, fs.constants.X_OK)
      return env
    } catch {
      /* fall through */
    }
  }
  const candidates = [
    path.join(os.homedir(), 'codex-desktop-linux-main', 'target', 'release', 'codex-read-aloud-linux'),
    path.join(os.homedir(), '下载', 'GitHub', 'codex-desktop-linux-main', 'target', 'release', 'codex-read-aloud-linux')
  ]
  const fromPath = await which('codex-read-aloud-linux')
  if (fromPath) candidates.unshift(fromPath)
  for (const c of candidates) {
    try {
      await fs.access(c, fs.constants.X_OK)
      return c
    } catch {
      /* next */
    }
  }
  return null
}

function isReadAloudServer(name: string, command?: string): boolean {
  return name === 'read-aloud' || Boolean(command?.includes('codex-read-aloud-linux'))
}

/** 聚合 Voice 就绪状态 */
export async function gatherVoiceStatus(workspace: string): Promise<VoiceStatus> {
  const spd = await which('spd-say')
  const espeak = await which('espeak-ng')
  const localTts = spd ? 'spd-say' : espeak ? 'espeak-ng' : null

  const paths = kokoroPaths()
  const pyKind = await pathKind(paths.python)
  const modelKind = await pathKind(paths.model)
  const voicesKind = await pathKind(paths.voices)
  const kokoroReady = pyKind === 'executable' && modelKind === 'file' && voicesKind === 'file'

  const servers = await loadMcpConfig(workspace)
  const raServer = servers.find((s) => isReadAloudServer(s.name, s.command))
  const readAloudMcpConfigured = Boolean(raServer?.command)
  let readAloudMcpConnected = false
  if (readAloudMcpConfigured) {
    const { listMcpTools } = await import('../tools/services/mcp-registry')
    try {
      const tools = await listMcpTools(workspace)
      readAloudMcpConnected = tools.some(
        (t) => isReadAloudServer(t.server, raServer?.command) && t.name === 'read_aloud'
      )
    } catch {
      readAloudMcpConnected = false
    }
  }

  const readAloudBinary = await resolveReadAloudBinary()

  const checklist: VoiceCheckItem[] = [
    {
      id: 'local-tts',
      label: '本地 TTS（spd-say / espeak）',
      ok: Boolean(localTts),
      detail: localTts ?? '未安装 — sudo apt install speech-dispatcher espeak-ng'
    },
    {
      id: 'kokoro',
      label: 'Kokoro 高质量 TTS',
      ok: kokoroReady,
      detail: kokoroReady
        ? 'python + model + voices 就绪'
        : `python=${pyKind}, model=${modelKind}, voices=${voicesKind}`
    },
    {
      id: 'read-aloud-mcp',
      label: 'codex-read-aloud-linux MCP',
      ok: readAloudMcpConnected,
      detail: readAloudMcpConnected
        ? 'MCP read_aloud 可用'
        : readAloudMcpConfigured
          ? '已配置但未连接'
          : '未配置 — 见 tools/mcp.example.json'
    },
    {
      id: 'read-aloud-bin',
      label: 'read-aloud 二进制',
      ok: Boolean(readAloudBinary),
      detail: readAloudBinary ?? 'cargo build -p codex-read-aloud-linux'
    }
  ]

  return {
    localTts,
    kokoroPython: paths.python,
    kokoroModel: paths.model,
    kokoroVoices: paths.voices,
    kokoroReady,
    readAloudMcpConfigured,
    readAloudMcpConnected,
    readAloudBinary,
    checklist,
    setupScript: 'scripts/install-kokoro-runtime.sh'
  }
}
