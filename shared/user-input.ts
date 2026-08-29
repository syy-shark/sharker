/**
 * Codex 桌面 `request_user_input`（Ask User）契约：解析问题、补 Other、序列化答案。
 * 不发明选项备注（#37365）或分页问卷（#9926）。
 * @see shared/ARCH.md
 */
import type {
  UserInputAnswerPick,
  UserInputOption,
  UserInputQuestion,
  UserInputResponse
} from './types'

/** 官方工具名 */
export const REQUEST_USER_INPUT_TOOL = 'request_user_input'

/** 客户端补上的自由作答选项标签（模型不得自带） */
export const USER_INPUT_OTHER_LABEL = 'Other'

/** 官方：最多 3 题 */
export const USER_INPUT_MAX_QUESTIONS = 3

/** 官方：每题 2–3 个互斥选项 */
export const USER_INPUT_MIN_OPTIONS = 2
export const USER_INPUT_MAX_OPTIONS = 3

/** 官方 header ≤12 字符 */
export const USER_INPUT_HEADER_MAX = 12

const OTHER_LABELS = new Set(['other', 'other:', 'none of the above', '其他', '其它'])

/** 模型误带的 Other / None of the above 要从选项里剥掉，由客户端统一补 */
export function isClientOtherLabel(label: string): boolean {
  return OTHER_LABELS.has(label.trim().toLowerCase())
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitizeId(raw: string, fallback: string): string {
  const snake = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  return snake || fallback
}

function clipHeader(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return 'Question'
  return [...text].slice(0, USER_INPUT_HEADER_MAX).join('')
}

function parseOption(value: unknown): UserInputOption | null {
  const rec = asRecord(value)
  if (!rec) return null
  const label = asString(rec.label).replace(/\s+/g, ' ').trim()
  if (!label || isClientOtherLabel(label)) return null
  return {
    label,
    description: asString(rec.description).replace(/\s+/g, ' ').trim()
  }
}

function parseQuestion(value: unknown, index: number): UserInputQuestion | null {
  const rec = asRecord(value)
  if (!rec) return null
  const question = asString(rec.question).replace(/\s+/g, ' ').trim()
  if (!question) return null
  const rawOptions = Array.isArray(rec.options) ? rec.options : []
  const options: UserInputOption[] = []
  for (const item of rawOptions) {
    const option = parseOption(item)
    if (!option) continue
    options.push(option)
    if (options.length >= USER_INPUT_MAX_OPTIONS) break
  }
  if (options.length < USER_INPUT_MIN_OPTIONS) return null
  return {
    id: sanitizeId(asString(rec.id), `question_${index + 1}`),
    header: clipHeader(asString(rec.header) || question),
    question,
    options
  }
}

export type ParseUserInputResult =
  | { ok: true; questions: UserInputQuestion[] }
  | { ok: false; error: string }

/**
 * 解析模型参数：1–3 题，每题 2–3 个互斥选项；剥掉模型自带的 Other。
 */
export function parseRequestUserInput(args: Record<string, unknown>): ParseUserInputResult {
  const raw = Array.isArray(args.questions) ? args.questions : []
  if (!raw.length) {
    return { ok: false, error: 'request_user_input requires a non-empty questions array' }
  }
  const questions: UserInputQuestion[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (questions.length >= USER_INPUT_MAX_QUESTIONS) break
    const question = parseQuestion(item, questions.length)
    if (!question) continue
    let id = question.id
    let n = 2
    while (seen.has(id)) {
      id = `${question.id}_${n}`
      n += 1
    }
    seen.add(id)
    questions.push({ ...question, id })
  }
  if (!questions.length) {
    return {
      ok: false,
      error: 'request_user_input requires non-empty options for every question'
    }
  }
  return { ok: true, questions }
}

/** 选项题是否已选好（选项或非空 Other） */
export function isUserInputPickComplete(pick: UserInputAnswerPick | undefined): boolean {
  if (!pick) return false
  if (pick.kind === 'option') return Boolean(pick.label.trim())
  return Boolean(pick.other.trim())
}

/** 全部题目都有有效答案才可提交 */
export function isUserInputReady(
  questions: UserInputQuestion[],
  picks: Record<string, UserInputAnswerPick>
): boolean {
  return questions.every((q) => isUserInputPickComplete(picks[q.id]))
}

/**
 * 官方协议：`{ answers: { [id]: { answers: string[] } } }`。
 * 选选项交 label；选 Other 交自由文本。
 */
export function buildUserInputResponse(
  questions: UserInputQuestion[],
  picks: Record<string, UserInputAnswerPick>
): UserInputResponse {
  const answers: UserInputResponse['answers'] = {}
  for (const question of questions) {
    const pick = picks[question.id]
    if (pick?.kind === 'option' && pick.label.trim()) {
      answers[question.id] = { answers: [pick.label.trim()] }
      continue
    }
    if (pick?.kind === 'other' && pick.other.trim()) {
      answers[question.id] = { answers: [pick.other.trim()] }
      continue
    }
    answers[question.id] = { answers: [] }
  }
  return { answers }
}

/** 给模型的 JSON 文本 */
export function serializeUserInputResponse(response: UserInputResponse): string {
  return JSON.stringify(response)
}

/** 直播过程摘要：第一题 header 或题数 */
export function summarizeUserInputRequest(questions: UserInputQuestion[]): string {
  if (questions.length === 1) return questions[0]!.header
  return `${questions.length} 个问题`
}

/**
 * 等用户作答时若回合被 Stop，用 AbortError 解开等待。
 */
export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}
