/**
 * view_image：官方读本地图（对标 Codex view_image）。
 * 结果只报路径/体积；像素由 query-loop 视觉回灌。read_image 共用此执行。
 * @see ./ARCH.md
 */
import fs from 'fs/promises'
import path from 'path'
import { assertAccess, ok, toolCwd } from '../../context'
import { normalizePath } from '../../permissions'
import type { ToolContext, ToolHandler } from '../../types'
import {
  formatViewImageToolOutput,
  isViewImageExt,
  mimeForViewImagePath,
  parseViewImageDetail
} from '../../../shared/view-image'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** 官方：相对路径接到环境 cwd / worktree（#29526） */
export function resolveViewImagePath(raw: unknown, ctx: ToolContext): string {
  const input = String(raw ?? '').trim()
  if (!input) throw new Error('image path is required')
  if (path.isAbsolute(input)) return normalizePath(input)
  return normalizePath(path.join(toolCwd(ctx, undefined), input))
}

/** 读盘校验后写短结果；不把 data URL 灌进直播 */
export async function executeViewImage(
  args: Record<string, unknown>,
  ctx: Parameters<ToolHandler['execute']>[1]
) {
  const p = resolveViewImagePath(args.path, ctx)
  assertAccess(ctx, p)
  const ext = path.extname(p).toLowerCase()
  if (!isViewImageExt(ext)) throw new Error(`Not an image: ${ext}`)
  const mime = mimeForViewImagePath(p)
  if (!mime) throw new Error(`Not an image: ${ext}`)
  const stat = await fs.stat(p)
  if (!stat.isFile()) throw new Error(`image path \`${p}\` is not a file`)
  if (stat.size > MAX_IMAGE_BYTES) throw new Error('Image too large (>10MB)')
  await fs.access(p)
  return ok(
    formatViewImageToolOutput({
      path: p,
      bytes: stat.size,
      mime,
      detail: parseViewImageDetail(args.detail)
    })
  )
}

export const viewImageTool: ToolHandler = {
  name: 'view_image',
  title: '查看图片',
  extractPaths: (args, workspace) => {
    const input = String(args.path ?? '').trim()
    if (!input) return []
    return [path.isAbsolute(input) ? normalizePath(input) : normalizePath(path.join(workspace, input))]
  },
  execute: executeViewImage
}
