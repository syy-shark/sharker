/**
 * 解析 Codex 桌面端 `.codex/environments/environment.toml` 的 setup / cleanup 脚本。
 * 不发明顶栏 Actions / ⌘⇧D。
 * @see shared/ARCH.md
 */
import path from 'node:path'

/** `[setup]` 新建时跑；`[cleanup]` 删除托管 worktree 前跑 */
export type LocalEnvironmentScriptKind = 'setup' | 'cleanup'

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
  const body = section[1] ?? ''
  const triple = /^\s*script\s*=\s*"""([\s\S]*?)"""/m.exec(body) ?? /^\s*script\s*=\s*'''([\s\S]*?)'''/m.exec(body)
  if (triple) return triple[1].replace(/^\n/, '').replace(/\n$/, '').trim()
  const basic = /^\s*script\s*=\s*"((?:\\.|[^"\\])*)"/m.exec(body)
  if (basic) return unescapeTomlBasic(basic[1]).trim()
  const literal = /^\s*script\s*=\s*'((?:\\.|[^'\\])*)'/m.exec(body)
  if (literal) return literal[1].replace(/\\'/g, "'").trim()
  return ''
}

/** `[setup] script` */
export function parseLocalEnvironmentSetupScript(toml: string): string {
  return parseLocalEnvironmentScript(toml, 'setup')
}

/** `[cleanup] script`（对标 Codex：Before deleting a Codex-managed worktree） */
export function parseLocalEnvironmentCleanupScript(toml: string): string {
  return parseLocalEnvironmentScript(toml, 'cleanup')
}

function unescapeTomlBasic(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}
