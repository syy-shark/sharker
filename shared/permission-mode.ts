/**
 * Ask for approval / Full access：输入框下方控件与 `/permissions` 共用文案。
 * 对标 Codex desktop permissions control beneath the composer。
 * 只暴露 Sharker 已有的 `sandbox` | `full`，不发明 Approve for me / Auto / 命名 profile。
 * @see shared/ARCH.md
 */
import type { PermissionMode } from './types'

export const PERMISSION_MODES = ['sandbox', 'full'] as const

/** 官方 composer 权限菜单项（对标 learn.chatgpt.com/docs/sandboxing） */
export const ASK_FOR_APPROVAL_LABEL = 'Ask for approval'
export const FULL_ACCESS_LABEL = 'Full access'
export const ASK_FOR_APPROVAL_DESCRIPTION =
  'Always ask to edit external files and use the internet'
export const FULL_ACCESS_DESCRIPTION =
  'When ChatGPT runs with full access, it can edit files and run commands with network access without your approval.'

export function parsePermissionMode(raw: string): PermissionMode | null {
  const token = raw.trim().toLowerCase().split(/\s+/)[0] || ''
  return token === 'sandbox' || token === 'full' ? token : null
}

export function permissionModeChipLabel(mode: PermissionMode): string {
  return mode === 'full' ? FULL_ACCESS_LABEL : ASK_FOR_APPROVAL_LABEL
}

export function permissionModeStatusLabel(mode: PermissionMode): string {
  return permissionModeChipLabel(mode)
}

export function permissionModeChipTitle(mode: PermissionMode): string {
  return mode === 'full' ? FULL_ACCESS_DESCRIPTION : ASK_FOR_APPROVAL_DESCRIPTION
}

export function formatPermissionStatus(mode: PermissionMode): string {
  return `当前权限：${permissionModeStatusLabel(mode)}。用法：\`/permissions sandbox|full\``
}

export function formatPermissionChanged(mode: PermissionMode): string {
  return `权限已切换为 ${permissionModeStatusLabel(mode)}。`
}
