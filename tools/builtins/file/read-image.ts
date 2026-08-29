/**
 * read_image：`view_image` 别名，兼容旧提示与 Computer Use 回指。
 * @see ./ARCH.md
 */
import path from 'path'
import type { ToolHandler } from '../../types'
import { normalizePath } from '../../permissions'
import { executeViewImage } from './view-image'

export const readImageTool: ToolHandler = {
  name: 'read_image',
  title: '读取图片',
  extractPaths: (args, workspace) => {
    const input = String(args.path ?? '').trim()
    if (!input) return []
    return [path.isAbsolute(input) ? normalizePath(input) : normalizePath(path.join(workspace, input))]
  },
  execute: executeViewImage
}
