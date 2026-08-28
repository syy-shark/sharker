/**
 * `/feedback` 本地诊断包（对标 Codex 桌面反馈对话框；不外发）。
 * @see shared/ARCH.md
 */
import { formatThreadStatus, type ThreadStatusInfo } from './thread-status'

/** 对标官方 feedback/upload classification；桌面 issue 里可见 Bug */
export type FeedbackClassification = 'bug' | 'other'

export const FEEDBACK_CLASSIFICATIONS: Array<{
  id: FeedbackClassification
  title: string
  description: string
}> = [
  { id: 'bug', title: '问题', description: '出错、卡顿或行为不对。' },
  { id: 'other', title: '其他', description: '建议或其它反馈。' }
]

export function parseFeedbackClassification(raw: unknown): FeedbackClassification {
  return String(raw || '').trim().toLowerCase() === 'other' ? 'other' : 'bug'
}

export function feedbackClassificationTitle(id: FeedbackClassification): string {
  return FEEDBACK_CLASSIFICATIONS.find((item) => item.id === id)?.title ?? id
}

/** 诊断包额外字段 */
export interface FeedbackBundleInfo extends ThreadStatusInfo {
  conversationId?: string
  mcpServerCount?: number
  appVersion?: string
  classification?: FeedbackClassification
  reason?: string
  /** 对标官方「附带当前会话」；false 时只留会话 ID 与说明 */
  includeSession?: boolean
}

/** 拼一段可复制的本地诊断 */
export function formatFeedbackBundle(info: FeedbackBundleInfo): string {
  const classification = info.classification
    ? `- **类型**：${feedbackClassificationTitle(info.classification)}`
    : ''
  const reason = info.reason?.trim() ? `- **说明**：${info.reason.trim()}` : ''
  const sessionId = info.conversationId ? `- **会话 ID**：\`${info.conversationId}\`` : ''
  if (info.includeSession === false) {
    return [
      '**反馈**（仅本机，不会发送）',
      '',
      '把下面这段连同复现步骤发给维护者。',
      '',
      classification,
      reason,
      sessionId
    ]
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  const extra = [
    sessionId,
    info.appVersion ? `- **版本**：${info.appVersion}` : '',
    info.mcpServerCount != null ? `- **MCP Server**：${info.mcpServerCount}` : ''
  ].filter(Boolean)
  return [
    '**反馈诊断**（仅本机，不会发送）',
    '',
    '把下面这段连同复现步骤发给维护者。',
    '',
    classification,
    reason,
    formatThreadStatus(info),
    extra.length ? '' : '',
    ...extra
  ]
    .filter((line, i, arr) => line !== '' || arr[i - 1] !== '')
    .join('\n')
    .trim()
}
