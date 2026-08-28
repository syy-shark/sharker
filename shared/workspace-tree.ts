/**
 * 工作区文件树与 `@` 文件搜索。
 * @see shared/ARCH.md
 */
import fs from 'fs/promises'
import path from 'path'
import { IGNORE_DIRS } from '../tools/shared/ignore-dirs'

/** 文件树节点 */
export interface WorkspaceTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: WorkspaceTreeNode[]
}

/** 构建文件树选项 */
export interface BuildWorkspaceTreeOptions {
  maxDepth?: number
  depth?: number
  /** Home 工作区：仅目录，不列出文件 */
  directoriesOnly?: boolean
}

/** 读取单层或递归目录树 */
export async function buildWorkspaceTree(
  root: string,
  options: BuildWorkspaceTreeOptions = {}
): Promise<WorkspaceTreeNode[]> {
  const maxDepth = options.maxDepth ?? 4
  const depth = options.depth ?? 0
  const directoriesOnly = options.directoriesOnly ?? false

  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const nodes: WorkspaceTreeNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.sharker') continue
    if (IGNORE_DIRS.has(e.name)) continue
    if (directoriesOnly && !e.isDirectory()) continue

    const full = path.join(root, e.name)
    const node: WorkspaceTreeNode = {
      name: e.name,
      path: full,
      isDirectory: e.isDirectory()
    }
    if (e.isDirectory() && depth < maxDepth) {
      node.children = await buildWorkspaceTree(full, {
        maxDepth,
        depth: depth + 1,
        directoriesOnly
      })
    }
    nodes.push(node)
  }
  return nodes
}

/** 有附加根时，主文件夹与附加文件夹都作为顶层节点（对标 Codex Edit project 多文件夹） */
export function wrapWorkspaceForest(
  primaryPath: string,
  primaryChildren: WorkspaceTreeNode[],
  extras: Array<{ path: string; children: WorkspaceTreeNode[] }>
): WorkspaceTreeNode[] {
  const extrasClean = extras.filter((item) => item.path && item.path !== primaryPath)
  if (!primaryPath || extrasClean.length === 0) return primaryChildren
  const wrap = (root: string, children: WorkspaceTreeNode[]): WorkspaceTreeNode => ({
    name: path.basename(root) || root,
    path: root,
    isDirectory: true,
    children
  })
  return [wrap(primaryPath, primaryChildren), ...extrasClean.map((item) => wrap(item.path, item.children))]
}

/** 主工作区 + 附加文件夹森林；无附加时仍返回主根子节点（保持旧文件树） */
export async function buildWorkspaceForest(
  root: string,
  extraRoots: string[] = [],
  options: BuildWorkspaceTreeOptions = {}
): Promise<WorkspaceTreeNode[]> {
  const extras = extraRoots.filter((item) => item && item !== root)
  const primaryChildren = root ? await buildWorkspaceTree(root, options) : []
  if (extras.length === 0) return primaryChildren
  const extraNodes = await Promise.all(
    extras.map(async (item) => ({ path: item, children: await buildWorkspaceTree(item, options) }))
  )
  return wrapWorkspaceForest(root, primaryChildren, extraNodes)
}

/** Composer `@` 文件命中 */
export interface WorkspaceFileHit {
  name: string
  path: string
  relativePath: string
}

/** 给 `@` 查询打分：文件名开头 > 文件名包含 > 路径包含 */
export function scoreWorkspaceFileHit(relativePath: string, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const rel = relativePath.replaceAll('\\', '/').toLowerCase()
  const name = rel.split('/').pop() ?? rel
  if (name.startsWith(q)) return 100 - Math.min(rel.length, 40)
  if (name.includes(q)) return 70 - Math.min(rel.length, 40)
  if (rel.includes(q)) return 40 - Math.min(rel.length, 30)
  return 0
}

/** 按查询排序并截断文件命中 */
export function rankWorkspaceFileHits(
  files: WorkspaceFileHit[],
  query: string,
  limit = 30
): WorkspaceFileHit[] {
  return files
    .map((f) => ({ f, score: scoreWorkspaceFileHit(f.relativePath, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.f.relativePath.localeCompare(b.f.relativePath))
    .slice(0, limit)
    .map((x) => x.f)
}

/** 扁平收集工作区文件（跳过忽略目录），供 `@` 模糊搜索 */
export async function collectWorkspaceFiles(
  root: string,
  options: { maxFiles?: number; maxDepth?: number; depth?: number; prefix?: string } = {}
): Promise<WorkspaceFileHit[]> {
  const maxFiles = options.maxFiles ?? 4000
  const maxDepth = options.maxDepth ?? 8
  const depth = options.depth ?? 0
  const prefix = options.prefix ?? ''
  const hits: WorkspaceFileHit[] = []

  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  for (const e of entries) {
    if (hits.length >= maxFiles) break
    if (e.name.startsWith('.') && e.name !== '.sharker') continue
    if (IGNORE_DIRS.has(e.name)) continue
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      if (depth >= maxDepth) continue
      const nested = await collectWorkspaceFiles(full, {
        maxFiles: maxFiles - hits.length,
        maxDepth,
        depth: depth + 1,
        prefix: rel
      })
      hits.push(...nested)
      continue
    }
    if (e.isFile()) {
      hits.push({ name: e.name, path: full, relativePath: rel.replaceAll('\\', '/') })
    }
  }
  return hits
}

/** 在工作区中按查询搜索文件；附加根用目录名做前缀以免和主树撞路径 */
export async function searchWorkspaceFiles(
  root: string,
  query: string,
  limit = 30,
  extraRoots: string[] = []
): Promise<WorkspaceFileHit[]> {
  if (!root && extraRoots.length === 0) return []
  const files = root ? await collectWorkspaceFiles(root) : []
  for (const extra of extraRoots) {
    if (!extra || extra === root) continue
    const prefix = path.basename(extra)
    files.push(...(await collectWorkspaceFiles(extra, { prefix })))
  }
  return rankWorkspaceFileHits(files, query, limit)
}
