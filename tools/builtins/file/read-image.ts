/**
 * read_image：读取图片文件元数据与路径（供多模态或本地预览）。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { assertAccess, ok } from '../../context'
import { normalizePath } from '../../permissions'
import type { ToolHandler } from '../../types'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

export const readImageTool: ToolHandler = {
  name: 'read_image',
  title: '读取图片',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const ext = path.extname(p).toLowerCase()
    if (!IMAGE_EXT.has(ext)) throw new Error(`Not an image: ${ext}`)
    const stat = await fs.stat(p)
    if (stat.size > 10 * 1024 * 1024) throw new Error('Image too large (>10MB)')
    const buf = await fs.readFile(p)
    const b64 = buf.toString('base64')
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.svg'
              ? 'image/svg+xml'
              : 'image/jpeg'
    return ok(
      `Image: ${p}\nSize: ${stat.size} bytes\nMIME: ${mime}\n` +
        `[base64 data URI — ${Math.round(b64.length / 1024)}KB encoded]\n` +
        `data:${mime};base64,${b64.slice(0, 200)}…`
    )
  }
}
