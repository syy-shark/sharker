/**
 * `/memories` 解析与展示（对标 Codex：注入 / 生成开关 + 列出条目）。
 * @see shared/ARCH.md
 */

export type MemoryCommand =
  | { kind: 'pick' }
  | { kind: 'status' }
  | { kind: 'set'; injection?: boolean; generation?: boolean; inherit?: boolean }

/** 官方空 `/memories`：为本对话选使用 / 写入 / 关闭 */
export type MemoryChatPick = 'use' | 'generate' | 'off' | 'inherit'

export interface MemoryListItem {
  id: string
  scope: string
  kind: string
  content: string
}

/** 空命令先出本对话选择器（对标 Codex choose use / generate / disabled） */
export function memoryNeedsChatPicker(args: string): boolean {
  return parseMemoryCommand(args).kind === 'pick'
}

/**
 * 本对话覆盖优先，未设则跟随全局。
 * 对标 Codex：Chat-level choices don't change your global memory settings.
 */
export function resolveChatMemoryFlags(
  chat: { memoryInjection?: boolean | null; memoryGeneration?: boolean | null },
  global: {
    memoriesEnabled?: boolean
    memoryInjection?: boolean
    memoryGeneration?: boolean
  }
): {
  injection: boolean
  generation: boolean
  injectionInherited: boolean
  generationInherited: boolean
} {
  const enabled = global.memoriesEnabled === true
  return {
    injection: enabled && (chat.memoryInjection ?? global.memoryInjection !== false),
    generation: enabled && (chat.memoryGeneration ?? global.memoryGeneration !== false),
    injectionInherited: chat.memoryInjection == null,
    generationInherited: chat.memoryGeneration == null
  }
}

/** 选择器结果写成会话覆盖；`inherit` 清掉覆盖 */
export function memoryFlagsForPick(pick: MemoryChatPick): {
  memoryInjection: boolean | null
  memoryGeneration: boolean | null
} {
  if (pick === 'inherit') return { memoryInjection: null, memoryGeneration: null }
  if (pick === 'off') return { memoryInjection: false, memoryGeneration: false }
  if (pick === 'use') return { memoryInjection: true, memoryGeneration: false }
  return { memoryInjection: true, memoryGeneration: true }
}

/** 解析 `/memories` 参数 */
export function parseMemoryCommand(args: string): MemoryCommand {
  const t = args.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return { kind: 'pick' }
  if (t === 'status' || t === 'list') return { kind: 'status' }
  if (t === 'inherit' || t === 'default' || t === 'global') return { kind: 'set', inherit: true }
  if (t === 'on' || t === 'enable' || t === 'generate' || t === 'both') {
    return { kind: 'set', injection: true, generation: true }
  }
  if (t === 'off' || t === 'disable') return { kind: 'set', injection: false, generation: false }
  if (t === 'use') return { kind: 'set', injection: true, generation: false }
  if (t === 'inject on' || t === 'injection on') return { kind: 'set', injection: true }
  if (t === 'inject off' || t === 'injection off') return { kind: 'set', injection: false }
  if (t === 'generate on' || t === 'generation on') return { kind: 'set', generation: true }
  if (t === 'generate off' || t === 'generation off') return { kind: 'set', generation: false }
  return { kind: 'status' }
}

/** 记忆状态 + 条目 Markdown */
export function formatMemoryStatus(opts: {
  injection: boolean
  generation: boolean
  injectionInherited?: boolean
  generationInherited?: boolean
  featureEnabled?: boolean
  items: MemoryListItem[]
}): string {
  const inheritNote = (inherited?: boolean) =>
    inherited == null ? '' : inherited ? '（跟随全局）' : '（本对话）'
  const lines = [
    '**记忆**（对标 Codex `/memories`：本对话开关，不改全局）',
    ''
  ]
  if (opts.featureEnabled === false) {
    lines.push(
      '全局记忆功能已关闭。到设置 → 个性化打开「启用记忆」后才会注入或写入。',
      ''
    )
  }
  lines.push(
    `- 注入：${opts.injection ? '开' : '关'}${inheritNote(opts.injectionInherited)}`,
    `- 写入：${opts.generation ? '开' : '关'}${inheritNote(opts.generationInherited)}`,
    '',
    '用法：空命令先选本对话；`/memories on|off|use|inherit` · `/memories inject on|off` · `/memories generate on|off`',
    ''
  )
  if (opts.items.length === 0) {
    lines.push('当前没有可展示的记忆条目。')
    return lines.join('\n')
  }
  lines.push(`最近 ${opts.items.length} 条：`, '')
  for (const item of opts.items.slice(0, 24)) {
    const body = item.content.replace(/\s+/g, ' ').trim().slice(0, 160)
    lines.push(`- \`[${item.kind}/${item.scope}]\` ${body}`)
  }
  return lines.join('\n')
}
