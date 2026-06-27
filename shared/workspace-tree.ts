/**
 * 工作区文件树：供右侧面板 IPC 返回结构化节点。
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
