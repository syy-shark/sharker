/**
 * Linux 桌面集成：.desktop 入口与 hicolor 图标主题安装。
 * @see electron/README.md
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

const ICON_NAME = 'sharker'
const WM_CLASS = 'sharker'

const ICON_SIZES = [256, 128, 64, 48, 32] as const

/** 在常见根目录中查找含 resources/icon.png 的项目根 */
function findProjectRoot(): string | undefined {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
    app.getAppPath()
  ]
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, 'resources', 'icon.png'))) return root
  }
  return undefined
}

/** 优先使用项目 resources/icon.png，否则用打包图标 */
function resolveIconSource(projectRoot: string | undefined, fallbackIcon: string): string {
  if (projectRoot) {
    const themed = path.join(projectRoot, 'resources', 'icon.png')
    if (fs.existsSync(themed)) return themed
  }
  return fallbackIcon
}

/** 取指定尺寸的图标路径，无则回退 master */
function iconForSize(projectRoot: string | undefined, size: number, master: string): string {
  if (projectRoot) {
    const sized = path.join(projectRoot, 'resources', 'icons', `${size}x${size}.png`)
    if (fs.existsSync(sized)) return sized
  }
  return master
}

/**
 * 安装 ~/.local 下的 .desktop 与多尺寸图标，供 GNOME/KDE 任务栏正确显示。
 * 仅 BrowserWindow.icon 不足以让 Linux 桌面环境识别应用。
 */
export function installLinuxDesktopEntry(fallbackIconPath: string): void {
  if (process.platform !== 'linux') return

  const home = app.getPath('home')
  const projectRoot = findProjectRoot()
  const masterIcon = resolveIconSource(projectRoot, fallbackIconPath)
  if (!fs.existsSync(masterIcon)) return

  const iconsRoot = path.join(home, '.local/share/icons/hicolor')
  for (const size of ICON_SIZES) {
    const dir = path.join(iconsRoot, `${size}x${size}`, 'apps')
    fs.mkdirSync(dir, { recursive: true })
    const src = iconForSize(projectRoot, size, masterIcon)
    fs.copyFileSync(src, path.join(dir, `${ICON_NAME}.png`))
  }

  const appsDir = path.join(home, '.local/share/applications')
  fs.mkdirSync(appsDir, { recursive: true })

  const quote = (s: string) => (s.includes(' ') ? `"${s}"` : s)

  let execLine: string
  let workdir: string
  if (app.isPackaged) {
    execLine = quote(process.execPath)
    workdir = path.dirname(process.execPath)
  } else if (projectRoot) {
    const launcher = path.join(projectRoot, 'scripts', 'launch-sharker.sh')
    execLine = fs.existsSync(launcher)
      ? quote(launcher)
      : quote(`env NO_SANDBOX=1 npm run dev --prefix ${projectRoot}`)
    workdir = projectRoot
  } else {
    execLine = quote(process.execPath)
    workdir = app.getAppPath()
  }

  const desktop = `[Desktop Entry]
Version=1.0
Type=Application
Name=Sharker
GenericName=AI Assistant
Comment=Desktop AI assistant
Exec=${execLine}
Path=${quote(workdir)}
Icon=${ICON_NAME}
StartupWMClass=${WM_CLASS}
Terminal=false
Categories=Development;Utility;
`

  fs.writeFileSync(path.join(appsDir, 'sharker.desktop'), desktop, { mode: 0o644 })

  execFile('update-desktop-database', [appsDir], () => {})
  execFile('gtk-update-icon-cache', ['-f', '-t', iconsRoot], () => {})
}
