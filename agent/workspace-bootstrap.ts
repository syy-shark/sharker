/**
 * 为 Agent 注入工作区快照（顶层目录、README 摘要、package.json 概要）。
 * @see agent/README.md
 */
import fs from 'fs/promises'
import path from 'path'

const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', '.cache', '.sharker'])

/** 列出工作区顶层条目，过滤常见构建/缓存目录 */
async function listTopLevel(workspace: string): Promise<string[]> {
  const lines: string[] = []
  try {
    const entries = await fs.readdir(workspace, { withFileTypes: true })
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue
      lines.push(`${e.name}${e.isDirectory() ? '/' : ''}`)
    }
  } catch {
    return []
  }
  return lines.sort()
}

/** 读取文件前 N 行作为摘要 */
async function readHead(filePath: string, maxLines: number): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return raw
      .split('\n')
      .slice(0, maxLines)
      .join('\n')
      .trim()
  } catch {
    return null
  }
}

/** 提取 package.json 名称、scripts 与依赖概要 */
async function summarizePackageJson(workspace: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(workspace, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as {
      name?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
    }
    const parts: string[] = []
    if (pkg.name) parts.push(`name: ${pkg.name}`)
    if (pkg.scripts) {
      const keys = Object.keys(pkg.scripts).slice(0, 12)
      parts.push(`scripts: ${keys.join(', ')}`)
    }
    if (pkg.dependencies) {
      const deps = Object.keys(pkg.dependencies).slice(0, 10)
      parts.push(`deps: ${deps.join(', ')}${Object.keys(pkg.dependencies).length > 10 ? '…' : ''}`)
    }
    return parts.length ? parts.join('\n') : null
  } catch {
    return null
  }
}

/** 为 Agent 注入的工作区快照，控制在约 1.5k 字符内 */
export async function buildWorkspaceBootstrap(workspace: string): Promise<string> {
  if (!workspace) return ''

  const blocks: string[] = []
  const top = await listTopLevel(workspace)
  if (top.length) {
    blocks.push(`Top-level:\n${top.join('\n')}`)
  }

  const readme = await readHead(path.join(workspace, 'README.md'), 35)
  if (readme) blocks.push(`README (excerpt):\n${readme}`)

  const pkg = await summarizePackageJson(workspace)
  if (pkg) blocks.push(`package.json:\n${pkg}`)

  try {
    await fs.access(path.join(workspace, '.git'))
    blocks.push('git: yes')
  } catch {
    /* no git */
  }

  const body = blocks.join('\n\n')
  const max = 1500
  if (body.length <= max) return body
  return `${body.slice(0, max)}…`
}
