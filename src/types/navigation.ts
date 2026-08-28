/**
 * 应用页面与设置 Tab 路由类型
 * @see src/ARCH.md
 */
/** 主界面页面：聊天或设置 */
export type AppPage = 'chat' | 'settings' | 'automations'

/** 设置页 Tab（桌面 / 浏览器入口暂隐藏；用量对标 Codex Profile） */
export type SettingsTab =
  | 'permissions'
  | 'models'
  | 'appearance'
  | 'shortcuts'
  | 'archived'
  | 'usage'
