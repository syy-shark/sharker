/**
 * Agent 事件钩子：读取 ~/.sharker/hooks.json 并在 turn 生命周期触发。
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

export type HookEvent = 'turn_start' | 'turn_done' | 'tool_before' | 'tool_after'

/** 单条钩子 */
export interface HookEntry {
  id: string
  event: HookEvent
  /** shell 命令或脚本路径 */
  command: string
  enabled?: boolean
}

interface HookStore {
  hooks: HookEntry[]
}

function hooksPath(): string {
  return path.join(os.homedir(), '.sharker', 'hooks.json')
}

/** 读取钩子配置 */
export async function loadHooks(): Promise<HookEntry[]> {
  try {
    const raw = await fs.readFile(hooksPath(), 'utf8')
    const parsed = JSON.parse(raw) as HookStore
    return (parsed.hooks ?? []).filter((h) => h.enabled !== false)
  } catch {
    return []
  }
}

/** 保存钩子 */
export async function saveHooks(hooks: HookEntry[]): Promise<void> {
  const dir = path.dirname(hooksPath())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(hooksPath(), JSON.stringify({ hooks }, null, 2), 'utf8')
}

/** 触发指定事件的钩子（fire-and-forget） */
export async function runHooks(
  event: HookEvent,
  payload: Record<string, string>
): Promise<void> {
  const hooks = (await loadHooks()).filter((h) => h.event === event)
  for (const h of hooks) {
    const env = { ...process.env, ...payload, SHARKER_HOOK_EVENT: event }
    spawn(h.command, { shell: true, env, stdio: 'ignore', detached: true }).unref()
  }
}
