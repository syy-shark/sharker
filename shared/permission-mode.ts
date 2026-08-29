/**
 * 沙箱 / 完整权限：输入框下方控件与 `/permissions` 共用文案。
 * 对标 Codex desktop permissions control beneath the composer。
 * 只暴露 Sharker 已有的 `sandbox` | `full`，不发明 Ask / Auto / 命名 profile。
 * @see shared/ARCH.md
 */
import type { PermissionMode } from './types'

export const PERMISSION_MODES = ['sandbox', 'full'] as const

export function parsePermissionMode(raw: string): PermissionMode | null {
  const token = raw.trim().toLowerCase().split(/\s+/)[0] || ''
  return token === 'sandbox' || token === 'full' ? token : null
}

export function permissionModeChipLabel(mode: PermissionMode): string {
  return mode === 'full' ? '完整' : '沙箱'
}

export function permissionModeStatusLabel(mode: PermissionMode): string {
  return mode === 'full' ? '完整（整机）' : '沙箱（仅工作区）'
}

export function permissionModeChipTitle(mode: PermissionMode): string {
  return mode === 'full'
    ? '完整权限：可访问整机文件系统，请谨慎'
    : '沙箱：仅允许访问当前工作区内的文件与命令'
}

export function formatPermissionStatus(mode: PermissionMode): string {
  return `当前权限：${permissionModeStatusLabel(mode)}。用法：\`/permissions sandbox|full\``
}

export function formatPermissionChanged(mode: PermissionMode): string {
  return `权限已切换为${permissionModeStatusLabel(mode)}。`
}
