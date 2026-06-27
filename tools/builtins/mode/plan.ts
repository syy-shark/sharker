/**
 * 计划模式：enter / exit（Cursor 式只读规划 + Build）。
 * @see tools/README.md
 */
import {
  enterPlanMode,
  exitPlanMode,
  getHarnessPhase,
  getPlanDocument
} from '../../harness-state'
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

export const enterPlanModeTool: ToolHandler = {
  name: 'enter_plan_mode',
  title: '进入计划模式',
  async execute() {
    if (getHarnessPhase() === 'plan') {
      return ok('Already in plan mode. Use read-only tools to research, then exit_plan_mode with the plan document.')
    }
    enterPlanMode()
    return ok(
      'Entered plan mode. Only read-only tools are available. ' +
        'Research the codebase, then call exit_plan_mode with the full plan markdown. ' +
        'User can click Build to execute the plan.'
    )
  }
}

export const exitPlanModeTool: ToolHandler = {
  name: 'exit_plan_mode',
  title: '退出计划模式',
  async execute(args) {
    const document = String(args.plan_document ?? args.document ?? '')
    const filePath = args.plan_file_path ? String(args.plan_file_path) : undefined
    exitPlanMode({ document: document || undefined, filePath })
    const preview = document.slice(0, 500)
    return {
      output:
        'Plan mode ended. Plan ready for user Build.\n\n' +
        (preview ? `Plan preview:\n${preview}${document.length > 500 ? '…' : ''}` : '(no plan document provided)'),
      planReady: true,
      planDocument: document,
      planFilePath: filePath
    }
  }
}

/** 供 query-loop 检测 plan 产出 */
export function peekPlanDocument(): ReturnType<typeof getPlanDocument> {
  return getPlanDocument()
}
