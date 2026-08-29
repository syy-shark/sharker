/**
 * 官方 `view_image`：读本地图并交给视觉回灌（对标 Codex view_image / #36966）。
 * 工具结果只留路径与体积，不把整段 base64 灌进直播。
 * 不发明 ImageGen、画布或 `features.view_image` 关闭开关。
 * @see shared/ARCH.md
 */

export const VIEW_IMAGE_TOOL = 'view_image'

const VIEW_IMAGE_TOOLS = new Set(['view_image', 'read_image'])

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const IMAGE_EXT = new Set([...RASTER_EXT, '.svg'])

/** 官方名与既有 `read_image` 别名 */
export function isViewImageTool(name: string): boolean {
  return VIEW_IMAGE_TOOLS.has(name)
}

export type ViewImageDetail = 'original' | null

/** 官方只认 `original`；其它值当默认缩放 */
export function parseViewImageDetail(raw: unknown): ViewImageDetail {
  return String(raw ?? '')
    .trim()
    .toLowerCase() === 'original'
    ? 'original'
    : null
}

export function isViewImageExt(ext: string): boolean {
  return IMAGE_EXT.has(String(ext || '').toLowerCase())
}

export function isViewImageRasterExt(ext: string): boolean {
  return RASTER_EXT.has(String(ext || '').toLowerCase())
}

/** 扩展名 → MIME；不认识则空 */
export function mimeForViewImagePath(filePath: string): string | null {
  const base = String(filePath || '').trim().toLowerCase()
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot) : ''
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return null
}

/** 直播/工具结果：短文本 + `path:` 供 query-loop 回灌 */
export function formatViewImageToolOutput(input: {
  path: string
  bytes: number
  mime: string
  detail: ViewImageDetail
}): string {
  return [
    `Viewed image: ${input.path}`,
    `path: ${input.path}`,
    `bytes: ${input.bytes}`,
    `MIME: ${input.mime}`,
    `detail: ${input.detail ?? 'null'}`
  ].join('\n')
}

/** 从工具 stdout 取出绝对路径与 detail */
export function parseViewImageToolOutput(output: string): {
  path: string
  detail: ViewImageDetail
} | null {
  const pathMatch = String(output || '').match(/^path:\s*(.+)$/m)
  const rawPath = pathMatch?.[1]?.trim() ?? ''
  if (!rawPath.startsWith('/')) return null
  const detailMatch = String(output || '').match(/^detail:\s*(\S+)/m)
  return {
    path: rawPath,
    detail: parseViewImageDetail(detailMatch?.[1])
  }
}

/** 回灌给模型的 OpenAI `image_url.detail` */
export function viewImageApiDetail(detail: ViewImageDetail): 'low' | 'high' {
  return detail === 'original' ? 'high' : 'low'
}

/** 官方 ImageView：工具完成后从短结果取路径，过程区画图而不是灌 base64 */
export function viewedImagePathFromTool(toolName: string, output: string): string | null {
  if (!isViewImageTool(toolName)) return null
  return parseViewImageToolOutput(output)?.path ?? null
}
