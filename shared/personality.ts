/**
 * Codex 式人格：只改语气，不改能力。
 * 对标官方 Settings → Personalization：Pragmatic / Friendly / None。
 * @see shared/ARCH.md
 */

/** Pragmatic / Friendly / None（自动化与严格解析用） */
export type AgentPersonality = 'pragmatic' | 'friendly' | 'none'

/** Official desktop Settings → Personalization option titles. */
export const PRAGMATIC_LABEL = 'Pragmatic'
export const FRIENDLY_LABEL = 'Friendly'
export const NONE_PERSONALITY_LABEL = 'None'
/** Official Settings → Personalization heading (learn.chatgpt.com/docs/reference/settings). */
export const CUSTOM_INSTRUCTIONS_LABEL = 'Custom instructions'

/** 桌面端默认：Pragmatic */
export const DEFAULT_PERSONALITY: AgentPersonality = 'pragmatic'

/** 设置页与斜杠可选值 */
export const PERSONALITY_OPTIONS: Array<{
  id: AgentPersonality
  title: string
  description: string
}> = [
  { id: 'pragmatic', title: PRAGMATIC_LABEL, description: '短、直接、先行动，少寒暄。' },
  { id: 'friendly', title: FRIENDLY_LABEL, description: '更会解释与确认，适合一起想清楚。' },
  {
    id: 'none',
    title: NONE_PERSONALITY_LABEL,
    description: 'Use None to disable personality instructions.'
  }
]

/** 规范化设置里的人格字段；旧 `empathetic` 读成 `friendly` */
export function parsePersonality(raw: unknown): AgentPersonality {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'friendly' || v === 'empathetic' || v === 'empathy') return 'friendly'
  if (v === 'none' || v === 'off') return 'none'
  if (v === 'pragmatic') return 'pragmatic'
  return DEFAULT_PERSONALITY
}

/** `/personality` 参数；空或无法识别返回 null */
export function parsePersonalityArg(arg: string): AgentPersonality | null {
  const v = arg.trim().toLowerCase()
  if (!v) return null
  if (v === 'friendly' || v === 'empathetic' || v === 'empathy') return 'friendly'
  if (v === 'none' || v === 'off') return 'none'
  if (v === 'pragmatic') return 'pragmatic'
  return null
}

/** 循环切换：务实 → 友好 → 关闭 */
export function nextPersonality(current: AgentPersonality): AgentPersonality {
  if (current === 'pragmatic') return 'friendly'
  if (current === 'friendly') return 'none'
  return 'pragmatic'
}

/** 写入 system prompt 的语气段；`none` 为空 */
export function personalityPrompt(personality: AgentPersonality): string {
  if (personality === 'none') return ''
  if (personality === 'friendly') {
    return [
      'Communication style: friendly.',
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
