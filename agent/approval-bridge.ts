/**
 * 父 turn 审批 / Ask User 桥：子 Agent 启动时沿用，避免循环 import queryLoop。
 * @see agent/ARCH.md
 */
import type { ApprovalHandler, UserInputHandler } from './loop'

let parentApproval: ApprovalHandler | null = null
let parentUserInput: UserInputHandler | null = null

export function setParentApprovalHandler(handler: ApprovalHandler | null): void {
  parentApproval = handler
}

export function getParentApprovalHandler(): ApprovalHandler | null {
  return parentApproval
}

export function setParentUserInputHandler(handler: UserInputHandler | null): void {
  parentUserInput = handler
}

export function getParentUserInputHandler(): UserInputHandler | null {
  return parentUserInput
}
