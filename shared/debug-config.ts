/**
 * `/debug-config`：本机设置层摘要（不含 Key）。
 * @see shared/ARCH.md
 */
import type { AppSettings } from './types'

function providerLine(p: AppSettings['providers'][number]): string {
  const hasKey = Boolean(p.apiKey?.trim())
  const model = p.model?.trim() || '（未选模型）'
  const base = p.baseUrl?.trim() || '默认'
  return `- ${p.name || p.id} · ${model} · ${base} · Key ${hasKey ? '已配置' : '未配置'}`
}

/** 生成可粘贴的本地诊断（不写 apiKey 原文） */
export function formatDebugConfig(settings: AppSettings): string {
  const providers = settings.providers ?? []
  const active = providers.find((p) => p.id === settings.activeProviderId)
  const keymap = Object.keys(settings.keyboardShortcuts ?? {}).length
  const lines = [
    '**调试配置**（本地摘要，不含密钥）',
    '',
    `- 权限：${settings.permissionMode || 'sandbox'}`,
    `- 网络：${settings.networkMode || 'open'}`,
    `- 主题：${settings.uiTheme || 'light'} · 字号 ${settings.uiFontScale ?? 1}`,
    `- 人格：${settings.personality || 'pragmatic'}`,
    `- 记忆：注入 ${settings.memoryInjection === false ? '关' : '开'} · 写入 ${settings.memoryGeneration === false ? '关' : '开'}`,
    `- 托管 worktree 保留：${settings.worktreeKeepCount ?? 15}`,
    `- Worktree 根：${settings.worktreeRoot?.trim() || '~/.sharker/worktrees'}`,
    `- 快捷键覆盖：${keymap} 项`,
    `- 工作区：${settings.workspaces?.length ?? 0} 个 · 当前 ${settings.activeWorkspaceId || '无'}`,
    `- 当前接入：${active?.name || active?.id || '无'} · ${active?.model || '—'}`,
    '',
    '**接入**',
    ...(providers.length ? providers.map(providerLine) : ['- （无）'])
  ]
  return lines.join('\n')
}
