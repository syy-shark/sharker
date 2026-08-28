/**
 * 父 turn 审批桥：子 Agent 启动时沿用，避免循环 import queryLoop。
 * @see agent/ARCH.md
 */
import type { ApprovalHandler } from './loop'

let parentApproval: ApprovalHandler | null = null

export function setParentApprovalHandler(handler: ApprovalHandler | null): void {
  parentApproval = handler
}

export function getParentApprovalHandler(): ApprovalHandler | null {
  return parentApproval
}
