/**
 * Computer Use 截图视觉回灌：将落盘 PNG 作为多模态 user 消息喂给视觉模型。
 * @see docs/agent-capabilities.md
 */
import fs from 'fs/promises'
import path from 'path'
import type { AppSettings } from '../shared/types'
import { getActiveProvider } from '../providers/openai'
import type { ChatCompletionContentPart } from '../providers/openai'
import { inferProviderVision } from '../shared/provider-vision'

const MAX_VISION_BYTES = 800_000

/** 是否为截图类工具（执行后可能附带图片） */
export function isScreenshotTool(toolName: string): boolean {
  if (toolName === 'desktop_screenshot' || toolName === 'browser_screenshot') return true
  if (toolName.includes('__screenshot')) return true
  if (toolName.includes('__get_app_state')) return true
  return false
}

/** 从工具 stdout 文本中提取截图路径 */
export function extractScreenshotPathFromToolOutput(output: string): string | null {
  const patterns = [
    /Screenshot saved:\s*(\/[^\s\n]+)/i,
    /path:\s*(\/[^\s\n]+\.(?:png|jpg|jpeg|webp))/i,
    /(\/[^\s\n]+\.sharker\/desktop\/[^\s\n]+\.(?:png|jpg|jpeg|webp))/i
  ]
  for (const re of patterns) {
    const m = output.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

/** 当前 Provider 是否支持视觉（显式开关或模型名启发） */
export function providerSupportsVision(settings: AppSettings): boolean {
  try {
    const p = getActiveProvider(settings)
    return inferProviderVision(p)
  } catch {
    return false
  }
}

/** 构建带截图的多模态 user 消息 content */
export async function buildVisionContentParts(
  imagePath: string,
  hint?: string
): Promise<ChatCompletionContentPart[]> {
  const stat = await fs.stat(imagePath)
  if (stat.size > MAX_VISION_BYTES) {
    return [
      {
        type: 'text',
        text:
          `[系统] 截图过大 (${stat.size} bytes)，未附图像。路径: ${imagePath}。请用 MCP get_app_state 的 coordinate 元数据或缩小截图。`
      }
    ]
  }
  const buf = await fs.readFile(imagePath)
  const ext = path.extname(imagePath).toLowerCase()
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/png'
  const b64 = buf.toString('base64')
  const text =
    hint ??
    '[系统] 上一工具截图已附后。根据 coordinate_width/coordinate_height 使用 mcp_computer_use__click 点击。' +
      '微信等无 AT-SPI 树的应用必须靠看图定位 UI，不要重复调用 screenshot。'
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'low' } }
  ]
}
