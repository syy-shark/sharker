/**
 * `/memories` 解析与展示（对标 Codex：注入 / 生成开关 + 列出条目）。
 * @see shared/ARCH.md
 */

export type MemoryCommand =
  | { kind: 'status' }
  | { kind: 'set'; injection?: boolean; generation?: boolean }

export interface MemoryListItem {
  id: string
  scope: string
  kind: string
  content: string
}

/** 解析 `/memories` 参数 */
export function parseMemoryCommand(args: string): MemoryCommand {
  const t = args.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t || t === 'status' || t === 'list') return { kind: 'status' }
  if (t === 'on' || t === 'enable') return { kind: 'set', injection: true, generation: true }
  if (t === 'off' || t === 'disable') return { kind: 'set', injection: false, generation: false }
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
  items: MemoryListItem[]
}): string {
  const lines = [
    '**记忆**（对标 Codex `/memories`）',
    '',
    `- 注入：${opts.injection ? '开' : '关'}`,
    `- 写入：${opts.generation ? '开' : '关'}`,
    '',
    '用法：`/memories on|off` · `/memories inject on|off` · `/memories generate on|off`',
    ''
  ]
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
