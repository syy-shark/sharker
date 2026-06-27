/**
 * 聊天 @file 引用：解析 @path 并注入文件内容到用户消息。
 * @see agent/pipeline.ts
 */
import fs from 'fs/promises'
import path from 'path'

const MAX_FILE_CHARS = 12_000
const MAX_FILES = 8

/** 匹配 @path（不含空格；支持相对/绝对路径） */
const FILE_REF_RE = /@([^\s@]+)/g

/** 解析 @ 引用为绝对路径（工作区内） */
function resolveRef(ref: string, workspace: string): string | null {
  const trimmed = ref.replace(/^file:/, '')
  if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null
  const abs = path.isAbsolute(trimmed) ? trimmed : path.join(workspace, trimmed)
  const normalized = path.normalize(abs)
  if (workspace && !normalized.startsWith(path.normalize(workspace))) {
    return null
  }
  return normalized
}

/** 读取单文件片段（带行号） */
async function readSnippet(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return null
    const raw = await fs.readFile(filePath, 'utf8')
    const truncated = raw.length > MAX_FILE_CHARS
    const body = truncated ? raw.slice(0, MAX_FILE_CHARS) + '\n…(truncated)' : raw
    const rel = filePath
    return `### ${rel}\n\`\`\`\n${body}\n\`\`\``
  } catch {
    return null
  }
}

/**
 * 展开用户消息中的 @file 引用，附加文件内容块。
 * @returns 展开后的 userText（若无引用则原样返回）
 */
export async function expandFileReferences(userText: string, workspace: string): Promise<string> {
  if (!workspace || !userText.includes('@')) return userText

  const refs = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(FILE_REF_RE.source, 'g')
  while ((m = re.exec(userText)) !== null) {
    const resolved = resolveRef(m[1], workspace)
    if (resolved) refs.add(resolved)
    if (refs.size >= MAX_FILES) break
  }

  if (!refs.size) return userText

  const blocks: string[] = []
  for (const p of refs) {
    const snippet = await readSnippet(p)
    if (snippet) blocks.push(snippet)
  }

  if (!blocks.length) return userText

  return `${userText}\n\n---\n**Attached files (${blocks.length}):**\n\n${blocks.join('\n\n')}`
}
