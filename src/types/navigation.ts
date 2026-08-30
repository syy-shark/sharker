/**
 * 应用页面与设置 Tab 路由类型
 * @see src/ARCH.md
 */
/** 主界面页面：聊天、设置、自动化、Skills */
export type AppPage = 'chat' | 'settings' | 'automations' | 'skills'

/** 设置页 Tab（Computer Use / Browser Use 入口暂隐藏；browser / worktrees 对标官方 Settings） */
export type SettingsTab =
  | 'permissions'
  | 'models'
  | 'general'
  | 'worktrees'
  | 'browser'
  | 'appearance'
  | 'notifications'
  | 'personalization'
  | 'mcp'
  | 'suggested'
  | 'shortcuts'
  | 'archived'
  | 'usage'
