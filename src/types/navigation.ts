/**
 * 应用页面与设置 Tab 路由类型
 * @see src/ARCH.md
 */
/** 主界面页面：聊天、设置、自动化、Skills */
export type AppPage = 'chat' | 'settings' | 'automations' | 'skills'

/** 设置页 Tab（桌面 / 浏览器入口暂隐藏；用量对标 Codex Profile） */
export type SettingsTab =
  | 'permissions'
  | 'models'
  | 'appearance'
  | 'shortcuts'
  | 'archived'
  | 'usage'
