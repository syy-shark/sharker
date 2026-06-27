/**
 * create_directory：创建目录。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import { assertAccess, ok } from '../context'
import { normalizePath } from '../permissions'
import type { ToolHandler } from '../types'

export const createDirectoryTool: ToolHandler = {
  name: 'create_directory',
  title: '创建目录',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    await fs.mkdir(p, { recursive: Boolean(args.recursive ?? true) })
    return ok(`Created ${p}`)
  }
}
