/**
 * read_image：`view_image` 别名，兼容旧提示与 Computer Use 回指。
 * @see ./ARCH.md
 */
import type { ToolHandler } from '../../types'
import { executeViewImage } from './view-image'

export const readImageTool: ToolHandler = {
  name: 'read_image',
  title: '读取图片',
  extractPaths: (args) => [String(args.path)],
  execute: executeViewImage
}
