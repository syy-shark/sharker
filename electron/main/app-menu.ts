/**
 * macOS 应用菜单（对标 Codex File / Edit / View / Window / Help）。
 * 自定义项 `registerAccelerator: false`，避免与渲染进程快捷键双触发。
 * @see electron/main/ARCH.md
 */
import { BrowserWindow, Menu, app, shell, type MenuItemConstructorOptions } from 'electron'
import { IPC } from '../../shared/ipc'
import {
  COPY_AS_MARKDOWN_LABEL,
  COPY_LABEL,
  CUT_LABEL,
  EDIT_MENU_LABEL,
  FILE_CLOSE_LABEL,
  FILE_MENU_LABEL,
  HELP_MENU_LABEL,
  CODEX_DOCUMENTATION_LABEL,
  CODEX_DOCUMENTATION_URL,
  SEND_FEEDBACK_LABEL,
  NEW_CHAT_LABEL,
  NEW_STANDALONE_CHAT_LABEL,
  NEW_WINDOW_LABEL,
  BACK_MENU_LABEL,
  FIND_MENU_LABEL,
  FORWARD_MENU_LABEL,
  NEXT_CHAT_MENU_LABEL,
  OPEN_BROWSER_TAB_MENU_LABEL,
  FOCUS_BROWSER_ADDRESS_BAR_MENU_LABEL,
  RELOAD_BROWSER_PAGE_MENU_LABEL,
  OPEN_TERMINAL_MENU_LABEL,
  PASTE_LABEL,
  PREVIOUS_CHAT_MENU_LABEL,
  REDO_LABEL,
  SELECT_ALL_LABEL,
  UNDO_LABEL,
  OPEN_COMMAND_MENU_LABEL,
  OPEN_FOLDER_LABEL,
  OPEN_SETTINGS_LABEL,
  SHARE_LABEL,
  OPEN_KEYBOARD_SHORTCUTS_LABEL,
  OPEN_REVIEW_TAB_LABEL,
  TOGGLE_BOTTOM_PANEL_LABEL,
  TOGGLE_FILE_TREE_MENU_LABEL,
  TOGGLE_FULL_SCREEN_LABEL,
  TOGGLE_REVIEW_PANEL_LABEL,
  TOGGLE_SIDEBAR_LABEL,
  VIEW_MENU_LABEL,
  WINDOW_MENU_LABEL
} from '../../shared/reveal-in-folder'

/** 把菜单动作发给所有渲染窗 */
export function sendMenuAction(action: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IPC.MENU_ACTION, action)
  }
}

/** 安装应用菜单 */
export function installApplicationMenu(options?: { onNewWindow?: () => void }): void {
  const send = (action: string): MenuItemConstructorOptions => ({
    click: () => sendMenuAction(action)
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name || 'Sharker',
      submenu: [
        { role: 'about', label: '关于 Sharker' },
        { type: 'separator' },
        {
          label: OPEN_SETTINGS_LABEL,
          accelerator: 'Command+,',
          registerAccelerator: false,
          ...send('open_settings')
        },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 Sharker' },
        { role: 'hideOthers', label: '隐藏其它' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Sharker' }
      ]
    },
    {
      label: FILE_MENU_LABEL,
      submenu: [
        {
          label: NEW_CHAT_LABEL,
          accelerator: 'Command+N',
          registerAccelerator: false,
          ...send('new_conversation')
        },
        {
          label: NEW_STANDALONE_CHAT_LABEL,
          accelerator: 'Command+Alt+O',
          registerAccelerator: false,
          ...send('standalone_conversation')
        },
        {
          label: NEW_WINDOW_LABEL,
          accelerator: 'Command+Shift+N',
          registerAccelerator: false,
          click: () => options?.onNewWindow?.()
        },
        { type: 'separator' },
        {
          label: OPEN_FOLDER_LABEL,
          accelerator: 'Command+O',
          registerAccelerator: false,
          ...send('open_folder')
        },
        {
          label: SHARE_LABEL,
          registerAccelerator: false,
          ...send('share_thread')
        },
        {
          label: COPY_AS_MARKDOWN_LABEL,
          registerAccelerator: false,
          ...send('copy_conversation_markdown')
        },
        { type: 'separator' },
        { role: 'close', label: FILE_CLOSE_LABEL }
      ]
    },
    {
      label: EDIT_MENU_LABEL,
      submenu: [
        {
          label: UNDO_LABEL,
          accelerator: 'Command+Z',
          registerAccelerator: false,
          ...send('undo_app')
        },
        {
          label: REDO_LABEL,
          accelerator: 'Command+Shift+Z',
          registerAccelerator: false,
          ...send('redo_app')
        },
        { type: 'separator' },
        { role: 'cut', label: CUT_LABEL },
        { role: 'copy', label: COPY_LABEL },
        { role: 'paste', label: PASTE_LABEL },
        { role: 'selectAll', label: SELECT_ALL_LABEL }
      ]
    },
    {
      label: VIEW_MENU_LABEL,
      submenu: [
        {
          label: TOGGLE_SIDEBAR_LABEL,
          accelerator: 'Command+B',
          registerAccelerator: false,
          ...send('toggle_sidebar')
        },
        {
          label: TOGGLE_BOTTOM_PANEL_LABEL,
          accelerator: 'Command+J',
          registerAccelerator: false,
          ...send('toggle_panel')
        },
        {
          label: OPEN_TERMINAL_MENU_LABEL,
          registerAccelerator: false,
          ...send('open_terminal')
        },
        {
          label: TOGGLE_REVIEW_PANEL_LABEL,
          accelerator: 'Command+Alt+B',
          registerAccelerator: false,
          ...send('toggle_review')
        },
        {
          label: OPEN_REVIEW_TAB_LABEL,
          accelerator: 'Control+Shift+G',
          registerAccelerator: false,
          ...send('open_review')
        },
        {
          label: TOGGLE_FILE_TREE_MENU_LABEL,
          accelerator: 'Command+Shift+E',
          registerAccelerator: false,
          ...send('toggle_files')
        },
        {
          label: OPEN_BROWSER_TAB_MENU_LABEL,
          accelerator: 'Command+T',
          registerAccelerator: false,
          ...send('open_browser')
        },
        {
          label: FOCUS_BROWSER_ADDRESS_BAR_MENU_LABEL,
          accelerator: 'Command+L',
          registerAccelerator: false,
          ...send('focus_browser_address')
        },
        {
          label: RELOAD_BROWSER_PAGE_MENU_LABEL,
          accelerator: 'Command+R',
          registerAccelerator: false,
          ...send('reload_browser_page')
        },
        {
          label: FIND_MENU_LABEL,
          accelerator: 'Command+F',
          registerAccelerator: false,
          ...send('find_in_thread')
        },
        {
          label: PREVIOUS_CHAT_MENU_LABEL,
          accelerator: 'Command+Shift+[',
          registerAccelerator: false,
          ...send('prev_thread')
        },
        {
          label: NEXT_CHAT_MENU_LABEL,
          accelerator: 'Command+Shift+]',
          registerAccelerator: false,
          ...send('next_thread')
        },
        {
          label: BACK_MENU_LABEL,
          accelerator: 'Command+[',
          registerAccelerator: false,
          ...send('nav_back')
        },
        {
          label: FORWARD_MENU_LABEL,
          accelerator: 'Command+]',
          registerAccelerator: false,
          ...send('nav_forward')
        },
        { type: 'separator' },
        {
          label: OPEN_KEYBOARD_SHORTCUTS_LABEL,
          accelerator: 'Command+/',
          registerAccelerator: false,
          ...send('shortcut_help')
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: TOGGLE_FULL_SCREEN_LABEL }
      ]
    },
    {
      label: WINDOW_MENU_LABEL,
      role: 'window',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' }
      ]
    },
    {
      label: HELP_MENU_LABEL,
      role: 'help',
      submenu: [
        {
          label: CODEX_DOCUMENTATION_LABEL,
          click: () => {
            void shell.openExternal(CODEX_DOCUMENTATION_URL)
          }
        },
        {
          label: SEND_FEEDBACK_LABEL,
          registerAccelerator: false,
          ...send('show_feedback')
        },
        { type: 'separator' },
        {
          label: OPEN_COMMAND_MENU_LABEL,
          accelerator: 'Command+K',
          registerAccelerator: false,
          ...send('command_palette')
        },
        {
          label: OPEN_KEYBOARD_SHORTCUTS_LABEL,
          accelerator: 'Command+/',
          registerAccelerator: false,
          ...send('shortcut_help')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
