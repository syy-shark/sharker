/**
 * Codex 式人格：只改语气，不改能力。
 * @see shared/ARCH.md
 */

/** 务实 / 共情 / 关闭（自动化与严格解析用） */
export type AgentPersonality = 'pragmatic' | 'empathetic' | 'none'

/** 桌面端默认：务实 */
export const DEFAULT_PERSONALITY: AgentPersonality = 'pragmatic'

/** 设置页与斜杠可选值 */
export const PERSONALITY_OPTIONS: Array<{
  id: AgentPersonality
  title: string
  description: string
}> = [
  { id: 'pragmatic', title: '务实', description: '短、直接、先行动，少寒暄。' },
  { id: 'empathetic', title: '共情', description: '更会解释与确认，适合一起想清楚。' },
  { id: 'none', title: '关闭', description: '不加人格指令，语气中性。' }
]

/** 规范化设置里的人格字段 */
export function parsePersonality(raw: unknown): AgentPersonality {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'empathetic' || v === 'friendly' || v === 'empathy') return 'empathetic'
  if (v === 'none' || v === 'off') return 'none'
  if (v === 'pragmatic') return 'pragmatic'
  return DEFAULT_PERSONALITY
}

/** `/personality` 参数；空或无法识别返回 null */
export function parsePersonalityArg(arg: string): AgentPersonality | null {
  const v = arg.trim().toLowerCase()
  if (!v) return null
  if (v === 'empathetic' || v === 'friendly' || v === 'empathy') return 'empathetic'
  if (v === 'none' || v === 'off') return 'none'
  if (v === 'pragmatic') return 'pragmatic'
  return null
}

/** 循环切换：务实 → 共情 → 关闭 */
export function nextPersonality(current: AgentPersonality): AgentPersonality {
  if (current === 'pragmatic') return 'empathetic'
  if (current === 'empathetic') return 'none'
  return 'pragmatic'
}

/** 写入 system prompt 的语气段；`none` 为空 */
export function personalityPrompt(personality: AgentPersonality): string {
  if (personality === 'none') return ''
  if (personality === 'empathetic') {
    return [
      'Communication style: empathetic.',
      'Be a collaborative partner. Explain why before large edits, acknowledge uncertainty, and check that the user is aligned.',
      'Do not reduce tool use or skip verification to sound nicer.'
    ].join('\n')
  }
  return [
    'Communication style: pragmatic.',
    'Be terse and execution-first. Minimal acknowledgement. Prefer doing the work over narrating it.',
    'Do not skip tools, tests, or necessary caveats to stay short.'
  ].join('\n')
}

/** 切换确认文案（写入 transcript，对标 Codex） */
export function personalitySwitchNote(personality: AgentPersonality): string {
  const opt = PERSONALITY_OPTIONS.find((o) => o.id === personality)
  return `已切换人格为 **${opt?.title ?? personality}**。只改语气，不改能力。`
}
