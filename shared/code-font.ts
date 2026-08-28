/**
 * 代码字体（对标 Codex Settings → Code font）。
 * 审查 / 终端 / 对话代码共用 `--mono`。
 * @see shared/ARCH.md
 */

/** 可选代码字体 id；空 / 未知回退 system */
export const CODE_FONT_IDS = [
  'system',
  'sf-mono',
  'menlo',
  'jetbrains',
  'cascadia',
  'fira'
] as const

/** 代码字体 id */
export type CodeFontId = (typeof CODE_FONT_IDS)[number]

/** 设置页展示名与 CSS 栈 */
export const CODE_FONT_OPTIONS: Array<{ id: CodeFontId; label: string; stack: string }> = [
  {
    id: 'system',
    label: '系统等宽',
    stack: "'SF Mono', ui-monospace, Menlo, Monaco, 'Cascadia Mono', monospace"
  },
  {
    id: 'sf-mono',
    label: 'SF Mono',
    stack: "'SF Mono', Menlo, ui-monospace, monospace"
  },
  {
    id: 'menlo',
    label: 'Menlo',
    stack: "Menlo, Monaco, 'SF Mono', ui-monospace, monospace"
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
  },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    stack: "'Cascadia Code', 'Cascadia Mono', ui-monospace, monospace"
  },
  {
    id: 'fira',
    label: 'Fira Code',
    stack: "'Fira Code', 'SF Mono', ui-monospace, monospace"
  }
]

const ALIAS: Record<string, CodeFontId> = {
  default: 'system',
  ui: 'system',
  sf: 'sf-mono',
  sfmono: 'sf-mono',
  'sf_mono': 'sf-mono',
  jb: 'jetbrains',
  jetbrainsmono: 'jetbrains',
  'cascadia-code': 'cascadia',
  cascadia_code: 'cascadia',
  firacode: 'fira',
  'fira-code': 'fira'
}

/** 把设置值收成白名单 id */
export function parseCodeFont(raw: unknown): CodeFontId {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  if (!key) return 'system'
  if ((CODE_FONT_IDS as readonly string[]).includes(key)) return key as CodeFontId
  return ALIAS[key] ?? 'system'
}

/** `--mono` 用的 font-family 栈 */
export function codeFontStack(raw: unknown): string {
  const id = parseCodeFont(raw)
  return CODE_FONT_OPTIONS.find((item) => item.id === id)?.stack ?? CODE_FONT_OPTIONS[0]!.stack
}
