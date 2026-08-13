/**
 * 应用页面与设置 Tab 路由类型
 * @see src/ARCH.md
 */
/** 主界面页面：聊天或设置 */
export type AppPage = 'chat' | 'settings' | 'automations'

/** 设置页 Tab（桌面 / 浏览器 / Token 入口暂隐藏，组件仍保留） */
export type SettingsTab =
  | 'permissions'
  | 'models'
  | 'appearance'
  | 'archived'
