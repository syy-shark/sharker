/**
 * 解析 Codex 桌面端 `.codex/environments/environment.toml`：
 * `[setup]` / `[cleanup] script`，以及顶栏 `[[actions]]`（对标 Local environments / ⌘⇧D）。
 * 不发明 Settings 编辑器、嵌套 `[actions.macos]` 或 `CODEX_WORKTREE_PATH`。
 * @see shared/ARCH.md
 */
import path from 'node:path'

/** `[setup]` 新建时跑；`[cleanup]` 删除托管 worktree 前跑 */
export type LocalEnvironmentScriptKind = 'setup' | 'cleanup'

/** 官方 `platform` 归一化后的宿主（对标 #41348 `darwin`） */
export type LocalEnvironmentHost = 'darwin' | 'win32' | 'linux'

/** 官方 `[[actions]]`：name / command 必填，icon / platform 可选 */
export interface LocalEnvironmentAction {
  name: string
  command: string
  icon?: string
  platform?: LocalEnvironmentHost
}

/** 官方项目内本地环境文件（对标 Codex Local environments） */
export const LOCAL_ENVIRONMENT_REL = path.join('.codex', 'environments', 'environment.toml')

/** 仓库根下的 environment.toml 绝对路径 */
export function localEnvironmentTomlPath(root: string): string {
  const base = String(root || '').trim()
  if (!base) return LOCAL_ENVIRONMENT_REL
  return path.join(base, LOCAL_ENVIRONMENT_REL)
}

/**
 * 取出 `[setup]` / `[cleanup]` 的 `script`。空串 / 缺表 / 半截引号都当没脚本。
 * 对标 openai/codex environment.toml 与 #19480：cleanup 在删托管 worktree 前跑。
 */
export function parseLocalEnvironmentScript(
  toml: string,
  kind: LocalEnvironmentScriptKind
): string {
  const text = String(toml || '').replace(/\r\n/g, '\n')
  const name = kind === 'cleanup' ? 'cleanup' : 'setup'
  const section = new RegExp(
    `(?:^|\\n)\\[${name}\\][ \\t]*\\n([\\s\\S]*?)(?=\\n\\[|\\n\\[\\[|$)`,
    'i'
  ).exec(text)
  if (!section) return ''
  return parseTomlStringField(section[1] ?? '', 'script')
}

/** `[setup] script` */
export function parseLocalEnvironmentSetupScript(toml: string): string {
  return parseLocalEnvironmentScript(toml, 'setup')
}

/** `[cleanup] script`（对标 Codex：Before deleting a Codex-managed worktree） */
export function parseLocalEnvironmentCleanupScript(toml: string): string {
  return parseLocalEnvironmentScript(toml, 'cleanup')
}

/**
 * 解析 `[[actions]]`。缺 name / command 的表丢掉。
 * 字段只认官方出现过的 `name` / `icon` / `command` / `platform`（#18171 / #41348 / OpnForm）。
 */
export function parseLocalEnvironmentActions(toml: string): LocalEnvironmentAction[] {
  const text = String(toml || '').replace(/\r\n/g, '\n')
  const blocks = text.matchAll(/(?:^|\n)\[\[actions\]\][ \t]*\n([\s\S]*?)(?=\n\[|\n\[\[|$)/gi)
  const out: LocalEnvironmentAction[] = []
  for (const block of blocks) {
    const body = block[1] ?? ''
    const name = parseTomlStringField(body, 'name')
    const command = parseTomlStringField(body, 'command')
    if (!name || !command) continue
    const icon = parseTomlStringField(body, 'icon')
    const platform = normalizeLocalEnvironmentPlatform(parseTomlStringField(body, 'platform'))
    const action: LocalEnvironmentAction = { name, command }
    if (icon) action.icon = icon
    if (platform) action.platform = platform
    out.push(action)
  }
  return out
}

/**
 * 当前宿主上可见的动作：无 platform 全平台；同名时平台表覆盖默认表。
 * 顺序保持文件里第一次出现该 name 的位置（⌘⇧D 跑第一条）。
 */
export function resolveLocalEnvironmentActions(
  actions: LocalEnvironmentAction[],
  platform: string
): LocalEnvironmentAction[] {
  const host = normalizeLocalEnvironmentPlatform(platform)
  const ordered: LocalEnvironmentAction[] = []
  const indexByName = new Map<string, number>()
  for (const action of actions) {
    if (action.platform && action.platform !== host) continue
    const idx = indexByName.get(action.name)
    if (idx == null) {
      indexByName.set(action.name, ordered.length)
      ordered.push(action)
      continue
    }
    const prev = ordered[idx]
    if (action.platform && !prev?.platform) ordered[idx] = action
  }
  return ordered
}

/** ⌘⇧D / 顶栏主按钮：当前宿主第一条动作 */
export function primaryLocalEnvironmentAction(
  actions: LocalEnvironmentAction[]
): LocalEnvironmentAction | null {
  return actions[0] ?? null
}

/** `darwin` / `macos` → darwin；`windows` / `win32` → win32；`linux` → linux */
export function normalizeLocalEnvironmentPlatform(raw: string): LocalEnvironmentHost | undefined {
  const key = String(raw || '').trim().toLowerCase()
  if (key === 'darwin' || key === 'macos' || key === 'osx') return 'darwin'
  if (key === 'win32' || key === 'windows' || key === 'win') return 'win32'
  if (key === 'linux') return 'linux'
  return undefined
}

/** Node / Electron 渲染进程都能用的宿主平台 */
export function hostLocalEnvironmentPlatform(): LocalEnvironmentHost {
  if (typeof process !== 'undefined' && process.platform) {
    return normalizeLocalEnvironmentPlatform(process.platform) ?? 'linux'
  }
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent
    if (/Windows/i.test(ua)) return 'win32'
    if (/Mac|iPhone|iPad/i.test(ua)) return 'darwin'
  }
  return 'linux'
}

function parseTomlStringField(body: string, key: string): string {
  const triple =
    new RegExp(`^\\s*${key}\\s*=\\s*"""([\\s\\S]*?)"""`, 'im').exec(body) ??
    new RegExp(`^\\s*${key}\\s*=\\s*'''([\\s\\S]*?)'''`, 'im').exec(body)
  if (triple) return triple[1].replace(/^\n/, '').replace(/\n$/, '').trim()
  const basic = new RegExp(`^\\s*${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`, 'im').exec(body)
  if (basic) return unescapeTomlBasic(basic[1]).trim()
  const literal = new RegExp(`^\\s*${key}\\s*=\\s*'((?:\\\\.|[^'\\\\])*)'`, 'im').exec(body)
  if (literal) return literal[1].replace(/\\'/g, "'").trim()
  return ''
}

function unescapeTomlBasic(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}
