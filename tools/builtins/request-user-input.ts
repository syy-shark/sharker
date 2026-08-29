/**
 * request_user_input：模型提问，query-loop 拦截后等用户作答。
 * 本 handler 只作兜底；真实等待在 agent/query-loop。
 * @see tools/ARCH.md
 */
import type { ToolHandler } from '../types'

export const requestUserInputTool: ToolHandler = {
  name: 'request_user_input',
  title: 'Question requested',
  async execute() {
    throw new Error('request_user_input must be answered in the client')
  }
}
