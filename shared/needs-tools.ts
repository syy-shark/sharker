/**
 * 判断寒暄类消息是否跳过 tools schema。
 * 详见 shared/README.md
 */
import type { ChatMessage } from './types'

/** 纯寒暄：不带工具，避免部分 API 挂起 */
const GREETING_ONLY =
  /^(你好|嗨|哈喽|hello|hi|hey|谢谢|感谢|thanks|thx|在吗|在不在|早安|晚安|好的|ok|okay|收到|明白了|知道了)[!.?~，,\s]*$/i

const TOOL_KEYWORDS =
  /文件|目录|文件夹|工作区|网站|页面|网页|html|css|js|代码|项目|程序|脚本|读取|写入|搜索|创建|删除|修改|编辑|执行|运行|命令|终端|git|skill|工具|bash|npm|写一|做个|帮我|实现|开发|生成|介绍|搭建|部署|修复|bug|报错|重构|添加|新建|保存|微信|桌面|打开|点击|发消息|computer/i

/** 是否需要向 API 附带 tools：默认开启，仅纯寒暄关闭 */
export function needsToolCalling(userText: string, history: ChatMessage[]): boolean {
  if (history.some((m) => m.role === 'tool' || m.toolName)) return true
  const t = userText.trim()
  if (!t) return false
  if (GREETING_ONLY.test(t)) return false
  if (TOOL_KEYWORDS.test(t)) return true
  if (t.length > 40) return true
  // 有实质内容的短句（如「做一个网站」）也应带工具
  return t.length >= 4
}
