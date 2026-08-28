/**
 * `/feedback` 本地诊断包（对标 Codex 收集日志；不外发）。
 * @see shared/ARCH.md
 */
import { formatThreadStatus, type ThreadStatusInfo } from './thread-status'

/** 诊断包额外字段 */
export interface FeedbackBundleInfo extends ThreadStatusInfo {
  conversationId?: string
  mcpServerCount?: number
  appVersion?: string
}

/** 拼一段可复制的本地诊断 */
export function formatFeedbackBundle(info: FeedbackBundleInfo): string {
  const extra = [
    info.conversationId ? `- **对话**：\`${info.conversationId}\`` : '',
    info.appVersion ? `- **版本**：${info.appVersion}` : '',
    info.mcpServerCount != null ? `- **MCP Server**：${info.mcpServerCount}` : ''
  ].filter(Boolean)
  return [
    '**反馈诊断**（仅本机，不会发送）',
    '',
    '把下面这段连同复现步骤发给维护者。',
    '',
    formatThreadStatus(info),
    extra.length ? '' : '',
    ...extra
  ]
    .filter((line, i, arr) => line !== '' || arr[i - 1] !== '')
    .join('\n')
    .trim()
}
