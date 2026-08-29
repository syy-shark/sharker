/**
 * `/fast`：把思考档位切到最快一档（对标 Codex Fast，本地等价为关闭/最低思考）。
 * @see shared/ARCH.md
 */

export type FastCommand = 'on' | 'off' | 'status'

/** 解析 `/fast` 参数 */
export function parseFastCommand(args: string): FastCommand {
  const t = args.trim().toLowerCase()
  if (t === 'on') return 'on'
  if (t === 'off') return 'off'
  return 'status'
}

const FAST_IDS = new Set(['off', 'none', 'minimal'])

/** 当前档位是否算 Fast */
export function isFastThinkingLevel(id: string): boolean {
  return FAST_IDS.has(id.trim().toLowerCase())
}

/** 当前档位再点 Fast：开则降到最低，关则回到默认档 */
export function nextFastThinkingLevel(
  options: Array<{ id: string }>,
  currentId: string,
  defaultId: string
): string | null {
  return pickFastThinkingLevel(options, !isFastThinkingLevel(currentId), defaultId)
}

/** Fast 开 → off/none/minimal/low；关 → 官方默认档 */
export function pickFastThinkingLevel(
  options: Array<{ id: string }>,
  wantFast: boolean,
  defaultId: string
): string | null {
  if (options.length === 0) return null
  if (wantFast) {
    const ranked = ['off', 'none', 'minimal', 'low']
    for (const id of ranked) {
      if (options.some((o) => o.id === id)) return id
    }
    return options[0]?.id ?? null
  }
  if (defaultId && options.some((o) => o.id === defaultId)) return defaultId
  return options[0]?.id ?? null
}

/** `/fast` 状态文案 */
export function formatFastStatus(opts: {
  supported: boolean
  level: string
  fast: boolean
}): string {
  if (!opts.supported) {
    return '当前模型没有思考档位，`/fast` 不会改请求参数。'
  }
  return [
    `**Fast**：${opts.fast ? '开' : '关'}`,
    `思考档位：\`${opts.level || '默认'}\``,
    '',
    '用法：`/fast on|off|status`。开启时尽量关掉或降到最低思考。'
  ].join('\n')
}
