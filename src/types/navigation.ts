/**
 * 应用页面与设置 Tab 路由类型
 * @see src/README.md
 */
/** 主界面页面：聊天或设置 */
export type AppPage = 'chat' | 'settings' | 'automations'

/** 设置页 Tab */
export type SettingsTab =
  | 'permissions'
  | 'models'
  | 'skills'
  | 'mcp'
  | 'computerUse'
  | 'browserUse'
  | 'usage'
  | 'pet'
  | 'extensions'
