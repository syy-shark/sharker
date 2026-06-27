/**
 * 语音朗读（TTS）：本地 spd-say / espeak 或 MCP read-aloud Server。
 * @see docs/agent-capabilities.md
 */
import { spawn } from 'child_process'
import { which, runCmd } from '../computer-use/shared'
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

/** 用本地 TTS 朗读文本 */
async function speakLocal(text: string): Promise<string> {
  const trimmed = text.slice(0, 2000)
  if (await which('spd-say')) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('spd-say', [trimmed], { stdio: 'ignore' })
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`spd-say exit ${code}`))))
      child.on('error', reject)
    })
    return 'Spoke via spd-say'
  }
  if (await which('espeak-ng')) {
    const r = await runCmd('espeak-ng', ['-s', '150', trimmed])
    if (r.code !== 0) throw new Error(r.stderr || 'espeak-ng failed')
    return 'Spoke via espeak-ng'
  }
  return (
    'No local TTS found (spd-say / espeak-ng).\n' +
    'Install: sudo apt install speech-dispatcher espeak-ng\n' +
    'Or configure codex-read-aloud-linux MCP in ~/.sharker/mcp.json'
  )
}

export const voiceReadAloudTool: ToolHandler = {
  name: 'voice_read_aloud',
  title: '朗读文本',
  async execute(args) {
    const text = String(args.text ?? '')
    if (!text.trim()) return ok('(empty text)')
    const result = await speakLocal(text)
    return ok(result)
  }
}

export const voiceStopTool: ToolHandler = {
  name: 'voice_stop',
  title: '停止朗读',
  async execute() {
    if (await which('spd-say')) {
      await runCmd('spd-say', ['--stop'])
    }
    return ok('Stop signal sent (if TTS was running)')
  }
}

export const voiceTools: ToolHandler[] = [voiceReadAloudTool, voiceStopTool]
