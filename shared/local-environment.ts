/**
 * 解析 Codex 桌面端 `.codex/environments/environment.toml` 的安装脚本。
 * 只认 `[setup] script`；不发明顶栏 Actions / ⌘⇧D。
 * @see shared/ARCH.md
 */
import path from 'node:path'

/** 官方项目内本地环境文件（对标 Codex Local environments） */
export const LOCAL_ENVIRONMENT_REL = path.join('.codex', 'environments', 'environment.toml')

/** 仓库根下的 environment.toml 绝对路径 */
export function localEnvironmentTomlPath(root: string): string {
  const base = String(root || '').trim()
  if (!base) return LOCAL_ENVIRONMENT_REL
  return path.join(base, LOCAL_ENVIRONMENT_REL)
}

/**
 * 取出 `[setup] script`。空串 / 缺表 / 半截引号都当没脚本。
 * 对标 openai/codex 自己的 environment.toml：`[setup]` + `script = ""`。
 */
export function parseLocalEnvironmentSetupScript(toml: string): string {
  const text = String(toml || '').replace(/\r\n/g, '\n')
  const section = /(?:^|\n)\[setup\][ \t]*\n([\s\S]*?)(?=\n\[|\n\[\[|$)/i.exec(text)
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

function unescapeTomlBasic(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}
