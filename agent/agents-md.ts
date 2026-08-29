/**
 * 从磁盘加载 AGENTS.md 链并写入 system prompt。
 * @see agent/ARCH.md
 */
import { homedir } from 'os'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import {
  AGENTS_DOC_NAMES,
  AGENTS_MD_SCAFFOLD,
  clampPersonalAgentsMd,
  dirsFromRootToCwd,
  globalPersonalAgentsMdPath,
  mergeAgentsDocs,
  pickAgentsDoc
} from '../shared/agents-md'

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return undefined
  }
}

async function pickInDir(dir: string): Promise<{ name: string; content: string } | null> {
  const files: Record<string, string | undefined> = {}
  await Promise.all(
    AGENTS_DOC_NAMES.map(async (name) => {
      files[name] = await readIfExists(path.join(dir, name))
    })
  )
  return pickAgentsDoc(files)
}

/** 全局 ~/.sharker + 工作区根到 cwd 的说明 */
export async function loadAgentsInstructions(
  workspace: string,
  options?: { home?: string; cwd?: string }
): Promise<string> {
  const root = workspace.trim()
  if (!root) return ''
  const home = options?.home ?? homedir()
  const docs: Array<{ source: string; content: string }> = []

  const globalDir = path.join(home, '.sharker')
  const global = await pickInDir(globalDir)
  if (global && (global.name === 'AGENTS.override.md' || global.name === 'AGENTS.md')) {
    docs.push({ source: `global:${global.name}`, content: global.content })
  }

  for (const dir of dirsFromRootToCwd(root, options?.cwd || root)) {
    const picked = await pickInDir(dir)
    if (!picked) continue
    const rel = dir === root ? picked.name : `${path.relative(root, dir) || '.'}/${picked.name}`
    docs.push({ source: rel, content: picked.content })
  }
  return mergeAgentsDocs(docs)
}

/** `/init`：没有说明文件时写入当前目录 AGENTS.md（对标 Codex current directory） */
export async function initAgentsMdFile(
  workspace: string
): Promise<{ ok: true; path: string; created: boolean } | { ok: false; error: string }> {
  const root = workspace.trim()
  if (!root) return { ok: false, error: '没有工作区' }
  const existing = await pickInDir(root)
  if (existing) {
    return { ok: true, path: path.join(root, existing.name), created: false }
  }
  const dest = path.join(root, 'AGENTS.md')
  try {
    await writeFile(dest, AGENTS_MD_SCAFFOLD, 'utf8')
    return { ok: true, path: dest, created: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 设置 → 自定义说明：只读写 `~/.sharker/AGENTS.md`，不动 override / 不碰 `~/.codex` */
export async function readPersonalAgentsMd(homeDir?: string): Promise<{
  path: string
  content: string
  exists: boolean
  overrideActive: boolean
}> {
  const home = homeDir || homedir()
  const dest = globalPersonalAgentsMdPath(home)
  const override = await readIfExists(path.join(home, '.sharker', 'AGENTS.override.md'))
  const content = (await readIfExists(dest)) ?? ''
  return {
    path: dest,
    content,
    exists: Boolean(content),
    overrideActive: Boolean(override?.trim())
  }
}

export async function writePersonalAgentsMd(
  content: string,
  homeDir?: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const home = homeDir || homedir()
  const dest = globalPersonalAgentsMdPath(home)
  try {
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, clampPersonalAgentsMd(content), 'utf8')
    return { ok: true, path: dest }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
