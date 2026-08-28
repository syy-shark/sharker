/**
 * AGENTS.md 发现与合并（对标 Codex：全局 + 根到 cwd，override 优先，32KiB 上限）。
 * @see shared/ARCH.md
 */

/** Codex 默认项目说明总上限 */
export const PROJECT_DOC_MAX_BYTES = 32 * 1024

/** 目录内候选文件名（先 override） */
export const AGENTS_DOC_NAMES = [
  'AGENTS.override.md',
  'AGENTS.md',
  '.sharker/AGENTS.override.md',
  '.sharker/AGENTS.md'
] as const

/** `/init` 脚手架（仅在仓库还没有任何 AGENTS.md 时写入） */
export const AGENTS_MD_SCAFFOLD = `# 项目说明

写给在本仓库工作的 Agent。只写会反复用到的约定，保持简短。

## 构建与测试

- 改代码后按仓库现有脚本验证（如 \`npm test\` / \`npm run build\`）。

## 代码风格

- 跟周围文件的命名、类型与注释习惯。
- 不要提交密钥；设置里的 Key 走加密存储。

## 不要做

- 不要无关重构。
- 不要编造没跑过的测试结果。
`

/** 从根走到 cwd 的目录链（含两端）；cwd 不在根下则只返回根 */
export function dirsFromRootToCwd(root: string, cwd?: string | null): string[] {
  const base = root.replace(/[\\/]+$/, '')
  if (!base) return []
  if (!cwd) return [base]
  const dest = cwd.replace(/[\\/]+$/, '')
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  if (norm(dest) === norm(base)) return [base]
  if (!norm(dest).startsWith(`${norm(base)}/`)) return [base]
  const rel = dest.slice(base.length).replace(/^[\\/]+/, '')
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  const out = [base]
  let cur = base
  for (const part of parts) {
    cur = `${cur}/${part}`.replace(/\\/g, '/')
    out.push(cur)
  }
  return out
}

/** 一层目录里按 Codex 优先级挑一份说明 */
export function pickAgentsDoc(
  files: Record<string, string | undefined>
): { name: string; content: string } | null {
  for (const name of AGENTS_DOC_NAMES) {
    const content = files[name]
    if (typeof content === 'string' && content.trim()) {
      return { name, content }
    }
  }
  return null
}

/** 从根到叶拼接，超限截断 */
export function mergeAgentsDocs(
  docs: Array<{ source: string; content: string }>,
  maxBytes = PROJECT_DOC_MAX_BYTES
): string {
  const chunks: string[] = []
  let used = 0
  for (const doc of docs) {
    const body = doc.content.replace(/\s+$/, '')
    if (!body.trim()) continue
    const block = `<!-- ${doc.source} -->\n${body}`
    const extra = (chunks.length ? 2 : 0) + block.length
    if (used + extra > maxBytes) {
      const remain = maxBytes - used - (chunks.length ? 2 : 0)
      if (remain > 32) chunks.push(`${block.slice(0, remain)}…`)
      break
    }
    chunks.push(block)
    used += extra
  }
  return chunks.join('\n\n')
}
