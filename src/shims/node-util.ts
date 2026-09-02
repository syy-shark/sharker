/**
 * 浏览器端 `node:util` 替身，给 Sharker core 的 inspect / format 走文本。
 * @see src/ARCH.md
 */

/** 打印任意值 */
export function inspect(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 忽略 options，拼成字符串 */
export function formatWithOptions(_options: unknown, ...args: unknown[]): string {
  return args.map((item) => (typeof item === 'string' ? item : inspect(item))).join(' ')
}

export default { inspect, formatWithOptions }
