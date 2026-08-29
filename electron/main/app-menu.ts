/**
 * macOS 应用菜单（对标 Codex File / Edit / View / Window / Help）。
 * 自定义项 `registerAccelerator: false`，避免与渲染进程快捷键双触发。
 * @see electron/main/ARCH.md
 */
import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from 'electron'
import { IPC } from '../../shared/ipc'
import {
  COPY_AS_MARKDOWN_LABEL,
  OPEN_COMMAND_MENU_LABEL,
  OPEN_KEYBOARD_SHORTCUTS_LABEL,
  OPEN_REVIEW_TAB_LABEL,
  TOGGLE_BOTTOM_PANEL_LABEL,
  TOGGLE_FILE_TREE_MENU_LABEL,
  TOGGLE_REVIEW_PANEL_LABEL,
  TOGGLE_SIDEBAR_LABEL,
  TOGGLE_TERMINAL_LABEL
} from '../../shared/reveal-in-folder'

/** 把菜单动作发给所有渲染窗 */
export function sendMenuAction(action: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IPC.MENU_ACTION, action)
  }
}

/** 安装应用菜单 */
export function installApplicationMenu(): void {
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
          label: '设置…',
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
      label: '文件',
      submenu: [
        {
          label: '新对话',
          accelerator: 'Command+N',
          registerAccelerator: false,
          ...send('new_conversation')
        },
        {
          label: '独立新对话',
          accelerator: 'Command+Alt+O',
          registerAccelerator: false,
          ...send('standalone_conversation')
        },
        { type: 'separator' },
        {
          label: '打开文件夹…',
          accelerator: 'Command+O',
          registerAccelerator: false,
          ...send('open_folder')
        },
        {
          label: '分享只读快照…',
          registerAccelerator: false,
          ...send('share_thread')
        },
        {
          label: COPY_AS_MARKDOWN_LABEL,
          registerAccelerator: false,
          ...send('copy_conversation_markdown')
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        {
          label: '撤销',
          accelerator: 'Command+Z',
          registerAccelerator: false,
          ...send('undo_app')
        },
        {
          label: '重做',
          accelerator: 'Command+Shift+Z',
          registerAccelerator: false,
          ...send('redo_app')
        },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '显示',
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
          label: TOGGLE_TERMINAL_LABEL,
          accelerator: 'Control+`',
          registerAccelerator: false,
          ...send('toggle_terminal')
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
        { type: 'separator' },
        {
          label: OPEN_KEYBOARD_SHORTCUTS_LABEL,
          accelerator: 'Command+/',
          registerAccelerator: false,
          ...send('shortcut_help')
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入全屏幕' }
      ]
    },
    {
      label: '窗口',
      role: 'window',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' }
      ]
    },
    {
      label: '帮助',
      role: 'help',
      submenu: [
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
