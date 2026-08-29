/**
 * 已知密钥模式脱敏（对标 Codex 桌面 Share：redacts known secret patterns）。
 * 只替换常见令牌形态，不上传、不外发。
 * @see shared/ARCH.md
 */

/** 一条替换规则 */
interface SecretPattern {
  re: RegExp
  label: string
}

/**
 * 顺序：更长/更具体的在前，避免 `sk-proj-` 被短 `sk-` 截断后漏标。
 * 标签给预览「已脱敏 N 处」用。
 */
const SECRET_PATTERNS: SecretPattern[] = [
  {
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    label: 'PRIVATE_KEY'
  },
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, label: 'GITHUB_TOKEN' },
  { re: /gh[pousr]_[A-Za-z0-9_]{20,}/g, label: 'GITHUB_TOKEN' },
  { re: /sk-ant-[A-Za-z0-9_-]{16,}/g, label: 'API_KEY' },
  { re: /sk-proj-[A-Za-z0-9_-]{16,}/g, label: 'API_KEY' },
  { re: /sk-[A-Za-z0-9_-]{20,}/g, label: 'API_KEY' },
  { re: /xox[abpos]-[A-Za-z0-9-]{10,}/g, label: 'SLACK_TOKEN' },
  { re: /AKIA[0-9A-Z]{16}/g, label: 'AWS_KEY' },
  { re: /AIza[0-9A-Za-z_-]{35}/g, label: 'GOOGLE_KEY' },
  { re: /Bearer\s+[A-Za-z0-9._\-+=/]{20,}/gi, label: 'BEARER' },
  {
    re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
    label: 'SECRET'
  }
]

/** 脱敏结果：替换后的正文与命中次数 */
export interface SecretRedactResult {
  text: string
  redactedCount: number
}

/** 把已知密钥形态换成 `[REDACTED:标签]`；路径与普通代码尽量留下 */
export function redactKnownSecrets(input: string): SecretRedactResult {
  let text = String(input ?? '')
  let redactedCount = 0
  for (const { re, label } of SECRET_PATTERNS) {
    const next = text.replace(re, () => {
      redactedCount += 1
      return `[REDACTED:${label}]`
    })
    text = next
  }
  return { text, redactedCount }
}
