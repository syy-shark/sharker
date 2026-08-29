/**
 * 定时任务触发：五字段 cron，或官方 RFC 5545 RRULE。
 * 对标 Codex Scheduled advanced schedule。
 * @see shared/ARCH.md
 */

/** 已解析的 RRULE（桌面分钟调度用到的子集） */
export interface AutomationRRule {
  raw: string
  freq: 'MINUTELY' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byMinute: number[] | null
  byHour: number[] | null
  byMonthDay: number[] | null
  byMonth: number[] | null
  byDay: Array<{ dow: number; nth?: number }> | null
  until?: Date
}

const WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 } as const

function parseIntList(raw: string | undefined, min: number, max: number): number[] | null {
  if (!raw) return null
  const out = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= min && n <= max && n !== 0)
  return out.length ? out : null
}

function parseMinuteHourList(
  raw: string | undefined,
  min: number,
  max: number
): number[] | null {
  if (!raw) return null
  const out = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= min && n <= max)
  return out.length ? out : null
}

function parseByDay(raw: string | undefined): AutomationRRule['byDay'] {
  if (!raw) return null
  const out: Array<{ dow: number; nth?: number }> = []
  for (const part of raw.split(',')) {
    const token = part.trim().toUpperCase()
    const m = token.match(/^(-?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/)
    if (!m) continue
    const dow = WEEKDAY[m[2] as keyof typeof WEEKDAY]
    const nth = m[1] ? Number(m[1]) : undefined
    if (nth != null && (!Number.isFinite(nth) || nth === 0)) continue
    out.push(nth != null ? { dow, nth } : { dow })
  }
  return out.length ? out : null
}

function parseUntil(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const m = raw
    .trim()
    .toUpperCase()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/)
  if (!m) return undefined
  const date = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    )
  )
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** 读官方 `RRULE:FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0` */
export function parseAutomationRRule(raw: unknown): AutomationRRule | null {
  let text = String(raw ?? '').trim()
  if (!text) return null
  if (/^RRULE:/i.test(text)) text = text.slice(6).trim()
  const map = new Map<string, string>()
  for (const seg of text.split(';')) {
    const cut = seg.indexOf('=')
    if (cut <= 0) continue
    map.set(seg.slice(0, cut).trim().toUpperCase(), seg.slice(cut + 1).trim())
  }
  const freq = (map.get('FREQ') || '').toUpperCase()
  if (
    freq !== 'MINUTELY' &&
    freq !== 'HOURLY' &&
    freq !== 'DAILY' &&
    freq !== 'WEEKLY' &&
    freq !== 'MONTHLY' &&
    freq !== 'YEARLY'
  ) {
    return null
  }
  const interval = Math.max(1, Number(map.get('INTERVAL') || 1) || 1)
  const byMonthDay = parseIntList(map.get('BYMONTHDAY'), -31, 31)
  return {
    raw: String(raw ?? '').trim(),
    freq,
    interval,
    byMinute: parseMinuteHourList(map.get('BYMINUTE'), 0, 59),
    byHour: parseMinuteHourList(map.get('BYHOUR'), 0, 23),
    byMonthDay,
    byMonth: parseMinuteHourList(map.get('BYMONTH'), 1, 12),
    byDay: parseByDay(map.get('BYDAY')),
    until: parseUntil(map.get('UNTIL'))
  }
}

/** 落盘时补 `RRULE:` 前缀，方便对照官方文案 */
export function formatAutomationRRule(raw: unknown): string | undefined {
  const parsed = parseAutomationRRule(raw)
  if (!parsed) return undefined
  return /^RRULE:/i.test(parsed.raw) ? parsed.raw : `RRULE:${parsed.raw}`
}

function listHas(list: number[] | null, value: number, fallback: number | 'any'): boolean {
  if (list && list.length) return list.includes(value)
  return fallback === 'any' ? true : value === fallback
}

function monthDayMatches(days: number[] | null, date: number, lastDate: number): boolean {
  if (!days?.length) return true
  return days.some((day) => (day > 0 ? day === date : lastDate + 1 + day === date))
}

function weekdayMatches(
  byDay: AutomationRRule['byDay'],
  dow: number,
  date: number,
  lastDate: number
): boolean {
  if (!byDay?.length) return true
  return byDay.some((item) => {
    if (item.dow !== dow) return false
    if (item.nth == null) return true
    if (item.nth > 0) return Math.ceil(date / 7) === item.nth
    const fromEnd = Math.ceil((lastDate - date + 1) / 7)
    return fromEnd === Math.abs(item.nth)
  })
}

/** 当前分钟是否命中 RRULE（无 DTSTART：INTERVAL 按日历序号取模） */
export function rruleMatches(rule: AutomationRRule, now: Date): boolean {
  if (rule.until && now.getTime() > rule.until.getTime()) return false
  const minute = now.getMinutes()
  const hour = now.getHours()
  const date = now.getDate()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const dow = now.getDay()
  const lastDate = new Date(year, month, 0).getDate()

  if (rule.freq === 'MINUTELY') {
    return minute % rule.interval === 0 && listHas(rule.byMinute, minute, 'any')
  }
  if (!listHas(rule.byMinute, minute, 0)) return false

  if (rule.freq === 'HOURLY') {
    return hour % rule.interval === 0 && listHas(rule.byHour, hour, 'any')
  }
  if (!listHas(rule.byHour, hour, 0)) return false

  if (rule.byMonth?.length && !rule.byMonth.includes(month)) return false
  if (!monthDayMatches(rule.byMonthDay, date, lastDate)) return false
  if (!weekdayMatches(rule.byDay, dow, date, lastDate)) return false

  if (rule.freq === 'DAILY') {
    const dayNum = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000)
    return dayNum % rule.interval === 0
  }
  if (rule.freq === 'WEEKLY') {
    const weekNum = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000 / 7)
    return weekNum % rule.interval === 0
  }
  if (rule.freq === 'MONTHLY') {
    return (year * 12 + month - 1) % rule.interval === 0
  }
  return year % rule.interval === 0
}

function fieldMatches(part: string, value: number): boolean {
  if (part === '*') return true
  if (part.startsWith('*/')) {
    const step = Number(part.slice(2))
    return Number.isFinite(step) && step > 0 && value % step === 0
  }
  if (part.includes(',')) {
    return part.split(',').some((p) => Number(p) === value)
  }
  const n = Number(part)
  return Number.isFinite(n) && n === value
}

/** 解析简易 cron 是否匹配当前时间（分 时 日 月 周） */
export function cronMatches(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [min, hour, dom, mon, dow] = parts
  return (
    fieldMatches(min, now.getMinutes()) &&
    fieldMatches(hour, now.getHours()) &&
    fieldMatches(dom, now.getDate()) &&
    fieldMatches(mon, now.getMonth() + 1) &&
    fieldMatches(dow, now.getDay())
  )
}

/** cron 五字段，或可解析的 RRULE，都算有效日程 */
export function isAutomationSchedule(input: { cron?: unknown; rrule?: unknown }): boolean {
  if (parseAutomationRRule(input.rrule)) return true
  return String(input.cron ?? '').trim().split(/\s+/).length >= 5
}

/**
 * 有 RRULE 走高级日程，否则走 cron。
 * 对标 Codex：custom cadence 或 edit RFC 5545 RRULE。
 */
export function automationScheduleMatches(
  job: { cron?: unknown; rrule?: unknown },
  now: Date
): boolean {
  const rule = parseAutomationRRule(job.rrule)
  if (rule) return rruleMatches(rule, now)
  const cron = String(job.cron ?? '').trim()
  return cron ? cronMatches(cron, now) : false
}
