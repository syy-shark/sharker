/**
 * 语音朗读（TTS）：macOS say。
 * @see docs/agent-capabilities.md
 */
import { spawn } from 'child_process'
import { which, runCmd } from '../computer-use/shared'
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

/** 用本地 TTS 朗读文本 */
async function speakLocal(text: string): Promise<string> {
  const trimmed = text.slice(0, 2000)
  if (await which('say')) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('say', [trimmed], { stdio: 'ignore' })
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`say exit ${code}`))))
      child.on('error', reject)
    })
    return 'Spoke via say'
  }
  return (
    'No local TTS found (macOS say).\n' +
    'Or install Kokoro: bash scripts/install-kokoro-runtime.sh'
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
    await runCmd('pkill', ['-x', 'say']).catch(() => {})
    return ok('Stop signal sent (if TTS was running)')
  }
}

export const voiceTools: ToolHandler[] = [voiceReadAloudTool, voiceStopTool]
