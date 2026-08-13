/**
 * 用户消息附件 → OpenAI 兼容多模态 content。
 * @see agent/ARCH.md
 */
import fs from 'fs/promises'
import type { ChatAttachment, ChatMessage } from '../shared/types'
import type { ChatCompletionContentPart } from '../providers/openai'

const MAX_ATTACHMENT_VISION_BYTES = 5 * 1024 * 1024

function attachmentLabel(attachments: ChatAttachment[]): string {
  if (!attachments.length) return ''
  return attachments.map((a, i) => `[图片 ${i + 1}: ${a.name}]`).join('\n')
}

async function imagePartFromAttachment(
  attachment: ChatAttachment
): Promise<ChatCompletionContentPart | null> {
  if (attachment.kind !== 'image') return null
  const stat = await fs.stat(attachment.path)
  if (!stat.isFile()) return null
  if (stat.size > MAX_ATTACHMENT_VISION_BYTES) {
    return {
      type: 'text',
      text: `[系统] 图片过大 (${stat.size} bytes)，未发送给视觉模型。路径: ${attachment.path}`
    }
  }
  const buf = await fs.readFile(attachment.path)
  return {
    type: 'image_url',
    image_url: {
      url: `data:${attachment.mimeType};base64,${buf.toString('base64')}`,
      detail: 'auto'
    }
  }
}

export async function userMessageContentWithAttachments(
  text: string,
  attachments?: ChatAttachment[]
): Promise<string | ChatCompletionContentPart[]> {
  const images = attachments?.filter((a) => a.kind === 'image') ?? []
  if (!images.length) return text

  const parts: ChatCompletionContentPart[] = [
    { type: 'text', text: `${text}\n\n${attachmentLabel(images)}`.trim() }
  ]
  for (const attachment of images) {
    try {
      const part = await imagePartFromAttachment(attachment)
      if (part) parts.push(part)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      parts.push({
        type: 'text',
        text: `[系统] 图片读取失败: ${attachment.name} (${msg})`
      })
    }
  }
  return parts
}

export async function mapHistoryMessageToApi(
  message: ChatMessage
): Promise<{
  role: 'user' | 'assistant' | 'tool'
  content?: string | ChatCompletionContentPart[] | null
  tool_call_id?: string
}> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId!,
      content: message.content
    }
  }
  if (message.role === 'assistant') {
    return { role: 'assistant', content: message.content || null }
  }
  return {
    role: 'user',
    content: await userMessageContentWithAttachments(message.content, message.attachments)
  }
}
