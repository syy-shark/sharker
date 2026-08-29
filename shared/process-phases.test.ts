import { describe, expect, it } from 'vitest'
import {
  appendProcessPhaseStepOnToolStart,
  deriveChronologicalSteps,
  remapProcessPhaseStepsOnThinkAppend,
  retargetProcessPhaseStepsOnToolMeta,
  reuseProcessPhaseSteps
} from './process-phases'
import type { TurnSegment } from './types'

describe('process phases privacy', () => {
  it('never exposes raw thinking content as step title', () => {
    const segments: TurnSegment[] = [
      {
        id: 't1',
        kind: 'thinking',
        content: 'The user wants me to read package.json secretly',
        status: 'done',
        startedAt: 1,
        endedAt: 2
      },
      {
        id: 'tool1',
        kind: 'tool',
        toolName: 'read_file',
        toolTitle: '读取文件',
        toolDetail: 'package.json',
        content: '读取文件 · package.json',
        status: 'done',
        startedAt: 3,
        endedAt: 4
      }
    ]
    const steps = deriveChronologicalSteps(segments)
    const think = steps.find((s) => s.kind === 'thinking')
    expect(think?.title).toBe('分析任务目标与约束')
    expect(think?.title).not.toMatch(/package\.json secretly|The user wants/)
    const grown = deriveChronologicalSteps([
      ...segments,
      {
        id: 'tool2',
        kind: 'tool',
        toolName: 'write_file',
        toolTitle: '写入文件',
        toolDetail: 'src/a.ts',
        content: '写入文件 · src/a.ts',
        status: 'active',
        startedAt: 5
      }
    ])
    const reused = reuseProcessPhaseSteps(steps, grown)
    expect(reused[0]).toBe(steps[0])
    expect(reused[1]).toBe(steps[1])
    expect(reused).toHaveLength(3)
    expect(reused[2]).toBe(grown[2])
    const clonedGrown = grown.map((step, index) =>
      index < 2 ? { ...step, segment: { ...step.segment } } : step
    )
    const reusedCloned = reuseProcessPhaseSteps(steps, clonedGrown)
    expect(reusedCloned[0]).toBe(steps[0])
    expect(reusedCloned[1]).toBe(steps[1])
    expect(reusedCloned[2]).toBe(clonedGrown[2])
    const cmdRunning: TurnSegment = {
      id: 'cmd1',
      kind: 'tool',
      toolName: 'run_terminal_cmd',
      toolArgs: { command: 'npm test' },
      status: 'active',
      startedAt: 8
    }
    const cmdLine: TurnSegment = { ...cmdRunning, toolDetail: 'PASS src/a.test.ts' }
    const cmdSteps = deriveChronologicalSteps([cmdRunning], { isStreaming: true })
    const retargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdLine],
      true
    )
    expect(retargeted).toBe(cmdSteps)
    const cmdPath: TurnSegment = { ...cmdRunning, toolDetail: 'src/a.ts' }
    const pathRetargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdPath],
      true
    )
    expect(pathRetargeted).not.toBeNull()
    expect(pathRetargeted).not.toBe(cmdSteps)
    expect(pathRetargeted![0].segment).toBe(cmdPath)
    expect(pathRetargeted![0].title).toBe(cmdSteps[0].title)
    expect(pathRetargeted![0]).toMatchObject({ id: cmdSteps[0].id, phase: cmdSteps[0].phase })
    const cmdPreview: TurnSegment = {
      ...cmdRunning,
      editPreview: [{ path: 'a.ts', stats: { added: 1, removed: 0 } }]
    }
    const previewRetargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdPreview],
      true
    )
    expect(previewRetargeted).not.toBeNull()
    expect(previewRetargeted).not.toBe(cmdSteps)
    expect(previewRetargeted![0].segment).toBe(cmdPreview)
    expect(previewRetargeted![0].title).toBe(cmdSteps[0].title)
    expect(previewRetargeted![0].id).toBe(cmdSteps[0].id)
    const cmdDone: TurnSegment = { ...cmdRunning, status: 'done' }
    const doneRetargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdDone],
      true
    )
    expect(doneRetargeted).not.toBeNull()
    expect(doneRetargeted).not.toBe(cmdSteps)
    expect(doneRetargeted![0].status).toBe('done')
    expect(doneRetargeted![0].segment).toBe(cmdDone)
    expect(doneRetargeted![0].id).toBe(cmdSteps[0].id)
    const cmdDoneDiff: TurnSegment = {
      ...cmdDone,
      fileDiff: { path: 'a.ts', lines: [], stats: { added: 1, removed: 0 } }
    }
    const doneDiffRetargeted = retargetProcessPhaseStepsOnToolMeta(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff],
      true
    )
    expect(doneDiffRetargeted).not.toBeNull()
    expect(doneDiffRetargeted![0].status).toBe('done')
    expect(doneDiffRetargeted![0].segment).toBe(cmdDoneDiff)
    expect(doneDiffRetargeted![0].id).toBe(cmdSteps[0].id)
    const cmdNext: TurnSegment = {
      id: 'read1',
      kind: 'tool',
      toolName: 'read_file',
      toolTitle: '读取文件',
      toolDetail: 'src/b.ts',
      status: 'active',
      startedAt: 9
    }
    const appended = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, cmdNext],
      true
    )
    expect(appended).not.toBeNull()
    expect(appended).toHaveLength(2)
    expect(appended![0]).toBe(doneRetargeted![0])
    expect(appended![1].segment).toBe(cmdNext)
    const cmdGrep: TurnSegment = {
      id: 'grep1',
      kind: 'tool',
      toolName: 'grep',
      toolTitle: '搜索',
      toolDetail: 'foo',
      status: 'active',
      startedAt: 9.5
    }
    const parallelAppended = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, cmdNext, cmdGrep],
      true
    )
    expect(parallelAppended).not.toBeNull()
    expect(parallelAppended).toHaveLength(3)
    expect(parallelAppended![0]).toBe(doneRetargeted![0])
    expect(parallelAppended![1].segment).toBe(cmdNext)
    expect(parallelAppended![2].segment).toBe(cmdGrep)
    const settleAndAppend = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDone, cmdNext],
      true
    )
    expect(settleAndAppend).not.toBeNull()
    expect(settleAndAppend).toHaveLength(2)
    expect(settleAndAppend![0].id).toBe(cmdSteps[0].id)
    expect(settleAndAppend![0].segment).toBe(cmdDone)
    expect(settleAndAppend![0].status).toBe('done')
    expect(settleAndAppend![1].segment).toBe(cmdNext)
    const cmdNextSettled: TurnSegment = {
      ...cmdNext,
      status: 'done',
      resultSummary: 'ok',
      endedAt: 9.2
    }
    const settledAppend = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, cmdNextSettled],
      true
    )
    expect(settledAppend).not.toBeNull()
    expect(settledAppend).toHaveLength(2)
    expect(settledAppend![0]).toBe(doneRetargeted![0])
    expect(settledAppend![1].segment).toBe(cmdNextSettled)
    expect(settledAppend![1].status).toBe('done')
    const writeThenSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, cmdNextSettled],
      true
    )
    expect(writeThenSettled).not.toBeNull()
    expect(writeThenSettled).toHaveLength(2)
    expect(writeThenSettled![0].segment).toBe(cmdDoneDiff)
    expect(writeThenSettled![1].segment).toBe(cmdNextSettled)
    const writeAndAppend = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, cmdNext],
      true
    )
    expect(writeAndAppend).not.toBeNull()
    expect(writeAndAppend).toHaveLength(2)
    expect(writeAndAppend![0].id).toBe(cmdSteps[0].id)
    expect(writeAndAppend![0].segment).toBe(cmdDoneDiff)
    expect(writeAndAppend![1].segment).toBe(cmdNext)
    const nextThink: TurnSegment = {
      id: 'th-after',
      kind: 'thinking',
      content: 'Next',
      status: 'active',
      startedAt: 10
    }
    const thinkThenSettled = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, nextThink, cmdNextSettled],
      true
    )
    expect(thinkThenSettled).not.toBeNull()
    expect(thinkThenSettled).toHaveLength(2)
    expect(thinkThenSettled![0]).toBe(doneRetargeted![0])
    expect(thinkThenSettled![1].segment).toBe(cmdNextSettled)
    const firstReplyEarly: TurnSegment = {
      id: 'reply-settle-1',
      kind: 'text',
      status: 'done',
      content: 'Hi',
      startedAt: 10.5,
      endedAt: 10.6
    }
    const thinkAnswerSettled = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, nextThink, firstReplyEarly, cmdNextSettled],
      true
    )
    expect(thinkAnswerSettled).not.toBeNull()
    expect(thinkAnswerSettled).toHaveLength(2)
    expect(thinkAnswerSettled![0]).toBe(doneRetargeted![0])
    expect(thinkAnswerSettled![1].segment).toBe(cmdNextSettled)
    const writeThinkSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, nextThink, cmdNextSettled],
      true
    )
    expect(writeThinkSettled).not.toBeNull()
    expect(writeThinkSettled).toHaveLength(2)
    expect(writeThinkSettled![0].segment).toBe(cmdDoneDiff)
    expect(writeThinkSettled![1].segment).toBe(cmdNextSettled)
    const writeAnswerSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, firstReplyEarly, cmdNextSettled],
      true
    )
    expect(writeAnswerSettled).not.toBeNull()
    expect(writeAnswerSettled).toHaveLength(2)
    expect(writeAnswerSettled![0].segment).toBe(cmdDoneDiff)
    expect(writeAnswerSettled![1].segment).toBe(cmdNextSettled)
    const writeThinkAnswerSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, nextThink, firstReplyEarly, cmdNextSettled],
      true
    )
    expect(writeThinkAnswerSettled).not.toBeNull()
    expect(writeThinkAnswerSettled).toHaveLength(2)
    expect(writeThinkAnswerSettled![0].segment).toBe(cmdDoneDiff)
    expect(writeThinkAnswerSettled![1].segment).toBe(cmdNextSettled)
    expect(
      remapProcessPhaseStepsOnThinkAppend(appended!, [cmdDone, cmdNext], [cmdDone, cmdNext, nextThink])
    ).toBe(appended)
    const settleAndThink = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDone, nextThink],
      true
    )
    expect(settleAndThink).not.toBeNull()
    expect(settleAndThink).toHaveLength(1)
    expect(settleAndThink![0].id).toBe(cmdSteps[0].id)
    expect(settleAndThink![0].segment).toBe(cmdDone)
    expect(settleAndThink![0].status).toBe('done')
    const firstReply: TurnSegment = {
      id: 'reply-1',
      kind: 'text',
      status: 'active',
      content: 'Hi',
      startedAt: 11
    }
    expect(remapProcessPhaseStepsOnThinkAppend(appended!, [cmdDone, cmdNext], [cmdDone, cmdNext, firstReply])).toBe(
      appended
    )
    const inlineDemo: TurnSegment = {
      id: 'demo-tool-1',
      kind: 'tool',
      toolName: 'present_inline_demo',
      status: 'active',
      content: '',
      startedAt: 12
    }
    expect(
      appendProcessPhaseStepOnToolStart(appended!, [cmdDone, cmdNext], [cmdDone, cmdNext, inlineDemo], true)
    ).toBeNull()
    expect(
      remapProcessPhaseStepsOnThinkAppend(appended!, [cmdDone, cmdNext], [cmdDone, cmdNext, inlineDemo])
    ).toBe(appended)
    const demoHtml: TurnSegment = {
      ...inlineDemo,
      content: '<div class="scene"><h1>广义相对论</h1><p>spacetime curvature demo</p></div>'
    }
    expect(
      remapProcessPhaseStepsOnThinkAppend(
        appended!,
        [cmdDone, cmdNext, inlineDemo],
        [cmdDone, cmdNext, demoHtml]
      )
    ).toBe(appended)
    const reconnectStatus: TurnSegment = {
      id: 're-1',
      kind: 'status',
      status: 'active',
      content: 'Reconnecting... 1/5',
      startedAt: 13
    }
    const afterReconnect = appendProcessPhaseStepOnToolStart(
      appended!,
      [cmdDone, cmdNext],
      [cmdDone, cmdNext, reconnectStatus],
      true
    )
    expect(afterReconnect).not.toBeNull()
    expect(afterReconnect).toHaveLength(3)
    expect(afterReconnect!.at(-1)?.segment).toBe(reconnectStatus)
    expect(afterReconnect!.at(-1)?.title).toBe('Reconnecting... 1/5')
    const settleAndStatus = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDone, reconnectStatus],
      true
    )
    expect(settleAndStatus).not.toBeNull()
    expect(settleAndStatus).toHaveLength(2)
    expect(settleAndStatus![0].segment).toBe(cmdDone)
    expect(settleAndStatus![0].status).toBe('done')
    expect(settleAndStatus!.at(-1)?.segment).toBe(reconnectStatus)
    const runningCmd: TurnSegment = {
      id: 'run-appr',
      kind: 'tool',
      toolName: 'run_terminal_cmd',
      toolArgs: { command: 'rm -rf /tmp/x' },
      status: 'active',
      startedAt: 15
    }
    const approvalSteps = deriveChronologicalSteps([runningCmd], { isStreaming: true })
    const approvalReq = {
      id: 'appr-1',
      title: '执行命令',
      description: 'rm -rf /tmp/x',
      toolName: 'run_terminal_cmd',
      args: { command: 'rm -rf /tmp/x' }
    }
    const cmdAwaiting: TurnSegment = { ...runningCmd, approval: approvalReq }
    const awaitingStatus: TurnSegment = {
      id: 'st-appr',
      kind: 'status',
      status: 'active',
      content: 'Awaiting approval · 执行命令',
      toolName: 'run_terminal_cmd',
      startedAt: 16
    }
    const afterApproval = appendProcessPhaseStepOnToolStart(
      approvalSteps,
      [runningCmd],
      [cmdAwaiting, awaitingStatus],
      true
    )
    expect(afterApproval).not.toBeNull()
    expect(afterApproval).toHaveLength(2)
    expect(afterApproval![0].segment).toBe(cmdAwaiting)
    expect(afterApproval!.at(-1)?.segment).toBe(awaitingStatus)
    expect(afterApproval!.at(-1)?.title).toMatch(/Awaiting approval/)
    const awaitingStatusDone: TurnSegment = { ...awaitingStatus, status: 'done', endedAt: 16.5 }
    const approvalCompressDone: TurnSegment = {
      id: 'cp-appr-hang',
      kind: 'tool',
      toolName: 'compress',
      toolTitle: 'Context automatically compacted',
      status: 'done',
      startedAt: 16.6,
      endedAt: 16.6
    }
    const afterApprovalThink = appendProcessPhaseStepOnToolStart(
      approvalSteps,
      [runningCmd],
      [cmdAwaiting, awaitingStatus, nextThink],
      true
    )
    expect(afterApprovalThink).not.toBeNull()
    expect(afterApprovalThink!.some((step) => step.segment === awaitingStatus)).toBe(true)
    expect(afterApprovalThink!.some((step) => step.segment === nextThink)).toBe(false)
    const afterApprovalToken = appendProcessPhaseStepOnToolStart(
      approvalSteps,
      [runningCmd],
      [cmdAwaiting, awaitingStatusDone, firstReply],
      true
    )
    expect(afterApprovalToken).not.toBeNull()
    expect(afterApprovalToken!.some((step) => step.segment === firstReply)).toBe(false)
    const afterApprovalCompress = appendProcessPhaseStepOnToolStart(
      approvalSteps,
      [runningCmd],
      [cmdAwaiting, awaitingStatusDone, approvalCompressDone],
      true
    )
    expect(afterApprovalCompress).not.toBeNull()
    expect(afterApprovalCompress!.at(-1)?.segment).toBe(approvalCompressDone)
    const afterWriteApprovalCompress = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, cmdAwaiting, awaitingStatusDone, approvalCompressDone],
      true
    )
    expect(afterWriteApprovalCompress).not.toBeNull()
    expect(afterWriteApprovalCompress![0].segment).toBe(cmdDoneDiff)
    expect(afterWriteApprovalCompress!.at(-1)?.segment).toBe(approvalCompressDone)
    const cmdAwaitingCancelled: TurnSegment = {
      ...cmdAwaiting,
      status: 'cancelled',
      errorMessage: '任务已停止',
      resultSummary: '已停止',
      endedAt: 16.7
    }
    const awaitingStatusCancelled: TurnSegment = { ...awaitingStatus, status: 'cancelled', endedAt: 16.7 }
    const afterWriteApprovalCancel = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, cmdAwaitingCancelled, awaitingStatusCancelled],
      true
    )
    expect(afterWriteApprovalCancel).not.toBeNull()
    expect(afterWriteApprovalCancel![0].segment).toBe(cmdDoneDiff)
    expect(afterWriteApprovalCancel!.some((step) => step.segment === cmdAwaitingCancelled)).toBe(true)
    const reconnectApprovalStatus: TurnSegment = {
      id: 'st-reconnect-appr',
      kind: 'status',
      status: 'done',
      content: 'Reconnecting... 1/5',
      endedAt: 16.8
    }
    const helloApprovalHang: TurnSegment = {
      id: 'hello-appr-hang',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Hello'
    }
    const helloApprovalHangDone: TurnSegment = { ...helloApprovalHang, status: 'done' }
    const helloApprovalHangSteps = deriveChronologicalSteps([helloApprovalHang], { isStreaming: true })
    const afterReconnectApprovalCompress = appendProcessPhaseStepOnToolStart(
      helloApprovalHangSteps,
      [helloApprovalHang],
      [
        helloApprovalHangDone,
        reconnectApprovalStatus,
        cmdAwaiting,
        awaitingStatusDone,
        approvalCompressDone
      ],
      true
    )
    expect(afterReconnectApprovalCompress).not.toBeNull()
    expect(afterReconnectApprovalCompress!.some((step) => step.segment === reconnectApprovalStatus)).toBe(
      true
    )
    expect(afterReconnectApprovalCompress!.at(-1)?.segment).toBe(approvalCompressDone)
    const afterReconnectApprovalCancel = appendProcessPhaseStepOnToolStart(
      helloApprovalHangSteps,
      [helloApprovalHang],
      [helloApprovalHangDone, reconnectApprovalStatus, cmdAwaitingCancelled, awaitingStatusCancelled],
      true
    )
    expect(afterReconnectApprovalCancel).not.toBeNull()
    expect(afterReconnectApprovalCancel!.some((step) => step.segment === cmdAwaitingCancelled)).toBe(true)
    const appendApproval = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, cmdAwaiting, awaitingStatus],
      true
    )
    expect(appendApproval).not.toBeNull()
    expect(appendApproval).toHaveLength(3)
    expect(appendApproval![0]).toBe(doneRetargeted![0])
    expect(appendApproval![1].segment).toBe(cmdAwaiting)
    expect(appendApproval![2].segment).toBe(awaitingStatus)
    const settleAndApproval = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDone, cmdAwaiting, awaitingStatus],
      true
    )
    expect(settleAndApproval).not.toBeNull()
    expect(settleAndApproval).toHaveLength(3)
    expect(settleAndApproval![0].segment).toBe(cmdDone)
    expect(settleAndApproval![1].segment).toBe(cmdAwaiting)
    expect(settleAndApproval![2].segment).toBe(awaitingStatus)
    const writeAndApproval = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, cmdAwaiting, awaitingStatus],
      true
    )
    expect(writeAndApproval).not.toBeNull()
    expect(writeAndApproval).toHaveLength(3)
    expect(writeAndApproval![0].segment).toBe(cmdDoneDiff)
    expect(writeAndApproval![1].segment).toBe(cmdAwaiting)
    expect(writeAndApproval![2].segment).toBe(awaitingStatus)
    const awaitingDone: TurnSegment = {
      ...awaitingStatus,
      status: 'done',
      content: '已确认，继续执行',
      endedAt: 17
    }
    const afterResolved = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [runningCmd, awaitingDone],
      true
    )
    expect(afterResolved).not.toBeNull()
    expect(afterResolved).toHaveLength(2)
    expect(afterResolved!.at(-1)?.segment).toBe(awaitingDone)
    expect(afterResolved!.at(-1)?.status).toBe('done')
    const awaitingDenied: TurnSegment = {
      ...awaitingStatus,
      status: 'done',
      content: '已拒绝该操作',
      endedAt: 17
    }
    const cmdDenied: TurnSegment = {
      ...cmdAwaiting,
      status: 'error',
      errorMessage: '用户拒绝了此操作',
      endedAt: 17
    }
    const afterDenied = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdDenied, awaitingDenied],
      true
    )
    expect(afterDenied).not.toBeNull()
    expect(afterDenied).toHaveLength(2)
    expect(afterDenied![0].segment).toBe(cmdDenied)
    expect(afterDenied![0].status).toBe('error')
    expect(afterDenied!.at(-1)?.segment).toBe(awaitingDenied)
    const planAfterDeny: TurnSegment = {
      id: 'st-plan-deny',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…',
      startedAt: 18
    }
    const afterDeniedPlan = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdDenied, awaitingDenied, planAfterDeny],
      true
    )
    expect(afterDeniedPlan).not.toBeNull()
    expect(afterDeniedPlan).toHaveLength(3)
    expect(afterDeniedPlan![0].segment).toBe(cmdDenied)
    expect(afterDeniedPlan!.at(-1)?.segment).toBe(planAfterDeny)
    const nextAfterDeny: TurnSegment = {
      id: 'read-after-deny',
      kind: 'tool',
      toolName: 'read_file',
      toolDetail: 'src/a.ts',
      status: 'active',
      startedAt: 18
    }
    const afterDeniedTool = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdDenied, awaitingDenied, nextAfterDeny],
      true
    )
    expect(afterDeniedTool).not.toBeNull()
    expect(afterDeniedTool).toHaveLength(3)
    expect(afterDeniedTool![0].segment).toBe(cmdDenied)
    expect(afterDeniedTool!.at(-1)?.segment).toBe(nextAfterDeny)
    const afterDeniedThink = remapProcessPhaseStepsOnThinkAppend(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdDenied, awaitingDenied, nextThink],
      true
    )
    expect(afterDeniedThink).not.toBeNull()
    expect(afterDeniedThink).toHaveLength(2)
    expect(afterDeniedThink![0].segment).toBe(cmdDenied)
    const afterDeniedThinkSettled = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdDenied, awaitingDenied, nextThink, cmdNextSettled],
      true
    )
    expect(afterDeniedThinkSettled).not.toBeNull()
    expect(afterDeniedThinkSettled).toHaveLength(3)
    expect(afterDeniedThinkSettled![0].segment).toBe(cmdDenied)
    expect(afterDeniedThinkSettled!.at(-1)?.segment).toBe(cmdNextSettled)
    const cmdAllowedPreview: TurnSegment = {
      ...runningCmd,
      editPreview: [{ path: 'a.ts', stats: { added: 1, removed: 0 } }]
    }
    const afterAllowedWrite = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedPreview, awaitingDone],
      true
    )
    expect(afterAllowedWrite).not.toBeNull()
    expect(afterAllowedWrite).toHaveLength(2)
    expect(afterAllowedWrite![0].segment).toBe(cmdAllowedPreview)
    expect(afterAllowedWrite!.at(-1)?.segment).toBe(awaitingDone)
    expect(afterAllowedWrite!.at(-1)?.status).toBe('done')
    const planAfterAllowWrite: TurnSegment = {
      id: 'st-plan-allow-write',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…',
      startedAt: 18
    }
    const afterAllowedWritePlan = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedPreview, awaitingDone, planAfterAllowWrite],
      true
    )
    expect(afterAllowedWritePlan).not.toBeNull()
    expect(afterAllowedWritePlan).toHaveLength(3)
    expect(afterAllowedWritePlan![0].segment).toBe(cmdAllowedPreview)
    expect(afterAllowedWritePlan!.at(-1)?.segment).toBe(planAfterAllowWrite)
    const nextAfterAllowWrite: TurnSegment = {
      id: 'read-after-allow-write',
      kind: 'tool',
      toolName: 'read_file',
      toolDetail: 'src/a.ts',
      status: 'active',
      startedAt: 18
    }
    const afterAllowedWriteNext = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedPreview, awaitingDone, nextAfterAllowWrite],
      true
    )
    expect(afterAllowedWriteNext).not.toBeNull()
    expect(afterAllowedWriteNext).toHaveLength(3)
    expect(afterAllowedWriteNext![0].segment).toBe(cmdAllowedPreview)
    expect(afterAllowedWriteNext!.at(-1)?.segment).toBe(nextAfterAllowWrite)
    const cmdAllowedSettled: TurnSegment = {
      ...runningCmd,
      status: 'done',
      resultSummary: 'exit 0',
      endedAt: 17
    }
    const afterAllowedSettle = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedSettled, awaitingDone],
      true
    )
    expect(afterAllowedSettle).not.toBeNull()
    expect(afterAllowedSettle).toHaveLength(2)
    expect(afterAllowedSettle![0].segment).toBe(cmdAllowedSettled)
    expect(afterAllowedSettle![0].status).toBe('done')
    expect(afterAllowedSettle!.at(-1)?.segment).toBe(awaitingDone)
    const planAfterAllow: TurnSegment = {
      id: 'st-plan-allow',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…',
      startedAt: 18
    }
    const afterAllowedPlan = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedSettled, awaitingDone, planAfterAllow],
      true
    )
    expect(afterAllowedPlan).not.toBeNull()
    expect(afterAllowedPlan).toHaveLength(3)
    expect(afterAllowedPlan![0].segment).toBe(cmdAllowedSettled)
    expect(afterAllowedPlan!.at(-1)?.segment).toBe(planAfterAllow)
    const nextAfterAllow: TurnSegment = {
      id: 'read-after-allow',
      kind: 'tool',
      toolName: 'read_file',
      toolDetail: 'src/a.ts',
      status: 'active',
      startedAt: 18
    }
    const afterAllowedNext = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedSettled, awaitingDone, nextAfterAllow],
      true
    )
    expect(afterAllowedNext).not.toBeNull()
    expect(afterAllowedNext).toHaveLength(3)
    expect(afterAllowedNext![0].segment).toBe(cmdAllowedSettled)
    expect(afterAllowedNext!.at(-1)?.segment).toBe(nextAfterAllow)
    const afterAllowedThink = remapProcessPhaseStepsOnThinkAppend(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedSettled, awaitingDone, nextThink],
      true
    )
    expect(afterAllowedThink).not.toBeNull()
    expect(afterAllowedThink).toHaveLength(2)
    expect(afterAllowedThink![0].segment).toBe(cmdAllowedSettled)
    expect(afterAllowedThink!.at(-1)?.segment).toBe(awaitingDone)
    const afterAllowedAnswer = remapProcessPhaseStepsOnThinkAppend(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedSettled, awaitingDone, firstReply],
      true
    )
    expect(afterAllowedAnswer).not.toBeNull()
    expect(afterAllowedAnswer).toHaveLength(2)
    expect(afterAllowedAnswer![0].segment).toBe(cmdAllowedSettled)
    const afterAllowedThinkSettled = appendProcessPhaseStepOnToolStart(
      afterApproval!,
      [cmdAwaiting, awaitingStatus],
      [cmdAllowedSettled, awaitingDone, nextThink, cmdNextSettled],
      true
    )
    expect(afterAllowedThinkSettled).not.toBeNull()
    expect(afterAllowedThinkSettled).toHaveLength(3)
    expect(afterAllowedThinkSettled![0].segment).toBe(cmdAllowedSettled)
    expect(afterAllowedThinkSettled!.at(-1)?.segment).toBe(cmdNextSettled)
    const askTool: TurnSegment = {
      id: 'ask-1',
      kind: 'tool',
      toolName: 'request_user_input',
      status: 'active',
      toolTitle: 'Question requested',
      startedAt: 18
    }
    const askSteps = deriveChronologicalSteps([askTool], { isStreaming: true })
    const askReady: TurnSegment = { ...askTool, toolTitle: 'Scope', toolDetail: 'Scope' }
    const askStatus: TurnSegment = {
      id: 'st-ask',
      kind: 'status',
      status: 'active',
      content: 'Scope',
      toolName: 'request_user_input',
      startedAt: 19
    }
    const afterAsk = appendProcessPhaseStepOnToolStart(
      askSteps,
      [askTool],
      [askReady, askStatus],
      true
    )
    expect(afterAsk).not.toBeNull()
    expect(afterAsk).toHaveLength(2)
    expect(afterAsk![0].segment).toBe(askReady)
    expect(afterAsk!.at(-1)?.segment).toBe(askStatus)
    const appendAsk = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, askReady, askStatus],
      true
    )
    expect(appendAsk).not.toBeNull()
    expect(appendAsk).toHaveLength(3)
    expect(appendAsk![0]).toBe(doneRetargeted![0])
    expect(appendAsk![1].segment).toBe(askReady)
    expect(appendAsk![2].segment).toBe(askStatus)
    const askStatusDone: TurnSegment = { ...askStatus, status: 'done', endedAt: 20 }
    const afterAskDone = appendProcessPhaseStepOnToolStart(
      afterAsk!,
      [askReady, askStatus],
      [askReady, askStatusDone],
      true
    )
    expect(afterAskDone).not.toBeNull()
    expect(afterAskDone).toHaveLength(2)
    expect(afterAskDone!.at(-1)?.segment).toBe(askStatusDone)
    expect(afterAskDone!.at(-1)?.status).toBe('done')
    const askToolDone: TurnSegment = {
      ...askReady,
      status: 'done',
      resultSummary: 'Scope',
      endedAt: 20
    }
    const afterAskResolveDone = appendProcessPhaseStepOnToolStart(
      afterAsk!,
      [askReady, askStatus],
      [askToolDone, askStatusDone],
      true
    )
    expect(afterAskResolveDone).not.toBeNull()
    expect(afterAskResolveDone).toHaveLength(2)
    expect(afterAskResolveDone![0].segment).toBe(askToolDone)
    expect(afterAskResolveDone![0].status).toBe('done')
    expect(afterAskResolveDone!.at(-1)?.segment).toBe(askStatusDone)
    expect(afterAskResolveDone!.at(-1)?.status).toBe('done')
    const planStatus: TurnSegment = {
      id: 'st-plan',
      kind: 'status',
      status: 'active',
      content: '根据已完成步骤规划下一步…',
      startedAt: 20
    }
    const planSteps = deriveChronologicalSteps([cmdDone, planStatus], { isStreaming: true })
    const planAskStatus: TurnSegment = {
      ...planStatus,
      content: 'API style',
      toolName: 'request_user_input'
    }
    const afterPlanAsk = appendProcessPhaseStepOnToolStart(
      planSteps,
      [cmdDone, planStatus],
      [cmdDone, planAskStatus],
      true
    )
    expect(afterPlanAsk).not.toBeNull()
    expect(afterPlanAsk).toHaveLength(2)
    expect(afterPlanAsk![0]).toBe(planSteps[0])
    expect(afterPlanAsk!.at(-1)?.segment).toBe(planAskStatus)
    const planAwaitingStatus: TurnSegment = {
      ...planStatus,
      content: 'Awaiting approval · npm test',
      toolName: 'run_terminal_cmd'
    }
    const afterPlanApproval = appendProcessPhaseStepOnToolStart(
      planSteps,
      [cmdDone, planStatus],
      [cmdDone, planAwaitingStatus],
      true
    )
    expect(afterPlanApproval).not.toBeNull()
    expect(afterPlanApproval!.at(-1)?.segment).toBe(planAwaitingStatus)
    expect(afterPlanApproval!.at(-1)?.title).toMatch(/Awaiting approval/)
    const afterPlanThinkAsk = appendProcessPhaseStepOnToolStart(
      planSteps,
      [cmdDone, planStatus],
      [cmdDone, planStatus, nextThink, askStatus],
      true
    )
    expect(afterPlanThinkAsk).not.toBeNull()
    expect(afterPlanThinkAsk).toHaveLength(3)
    expect(afterPlanThinkAsk![0]).toBe(planSteps[0])
    expect(afterPlanThinkAsk![1].segment).toBe(planStatus)
    expect(afterPlanThinkAsk!.at(-1)?.segment).toBe(askStatus)
    expect(afterPlanThinkAsk!.some((step) => step.segment === nextThink)).toBe(false)
    const afterPlanThinkApproval = appendProcessPhaseStepOnToolStart(
      planSteps,
      [cmdDone, planStatus],
      [cmdDone, planStatus, nextThink, awaitingStatus],
      true
    )
    expect(afterPlanThinkApproval).not.toBeNull()
    expect(afterPlanThinkApproval!.at(-1)?.segment).toBe(awaitingStatus)
    expect(afterPlanThinkApproval!.some((step) => step.segment === nextThink)).toBe(false)
    const helloAskHang: TurnSegment = {
      id: 'hello-ask-hang',
      kind: 'text',
      role: 'final',
      status: 'active',
      content: 'Hello'
    }
    const helloAskHangDone: TurnSegment = { ...helloAskHang, status: 'done' }
    const helloAskHangSteps = deriveChronologicalSteps([helloAskHang], { isStreaming: true })
    const askStatusDoneForHang: TurnSegment = { ...askStatus, status: 'done', endedAt: 21 }
    const afterAskHangThink = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, askReady, askStatus, nextThink],
      true
    )
    expect(afterAskHangThink).not.toBeNull()
    expect(afterAskHangThink!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterAskHangThink!.some((step) => step.segment === askStatus)).toBe(true)
    expect(afterAskHangThink!.some((step) => step.segment === nextThink)).toBe(false)
    const afterAskHangToken = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, askReady, askStatusDoneForHang, firstReply],
      true
    )
    expect(afterAskHangToken).not.toBeNull()
    expect(afterAskHangToken!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterAskHangToken!.some((step) => step.segment === firstReply)).toBe(false)
    const afterAskHangThinkSettled = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, askReady, askStatusDoneForHang, { ...nextThink, status: 'done' }, cmdNextSettled],
      true
    )
    expect(afterAskHangThinkSettled).not.toBeNull()
    expect(afterAskHangThinkSettled!.at(-1)?.segment).toBe(cmdNextSettled)
    expect(afterAskHangThinkSettled!.some((step) => step.segment.kind === 'thinking')).toBe(false)
    const afterWriteAskThink = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, askReady, askStatus, nextThink],
      true
    )
    expect(afterWriteAskThink).not.toBeNull()
    expect(afterWriteAskThink![0].segment).toBe(cmdDoneDiff)
    expect(afterWriteAskThink!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterWriteAskThink!.some((step) => step.segment === nextThink)).toBe(false)
    const afterWriteAskToken = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, askReady, askStatusDoneForHang, firstReply],
      true
    )
    expect(afterWriteAskToken).not.toBeNull()
    expect(afterWriteAskToken!.some((step) => step.segment === firstReply)).toBe(false)
    const planStatusDone: TurnSegment = { ...planStatus, status: 'done', endedAt: 21.5 }
    const afterWritePlanAskThink = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, planStatusDone, askReady, askStatus, nextThink],
      true
    )
    expect(afterWritePlanAskThink).not.toBeNull()
    expect(afterWritePlanAskThink![0].segment).toBe(cmdDoneDiff)
    expect(afterWritePlanAskThink!.some((step) => step.segment === planStatusDone)).toBe(true)
    expect(afterWritePlanAskThink!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterWritePlanAskThink!.some((step) => step.segment === nextThink)).toBe(false)
    const afterWriteAskThinkToken = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, askReady, askStatusDoneForHang, { ...nextThink, status: 'done' }, firstReply],
      true
    )
    expect(afterWriteAskThinkToken).not.toBeNull()
    expect(afterWriteAskThinkToken!.some((step) => step.segment === firstReply)).toBe(false)
    expect(afterWriteAskThinkToken!.some((step) => step.segment === askReady)).toBe(true)
    const afterAskHangThinkTokenSettled = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [
        helloAskHangDone,
        askReady,
        askStatusDoneForHang,
        { ...nextThink, status: 'done' },
        firstReplyEarly,
        cmdNextSettled
      ],
      true
    )
    expect(afterAskHangThinkTokenSettled).not.toBeNull()
    expect(afterAskHangThinkTokenSettled!.at(-1)?.segment).toBe(cmdNextSettled)
    expect(afterAskHangThinkTokenSettled!.some((step) => step.segment === firstReplyEarly)).toBe(false)
    const reconnectAskStatus: TurnSegment = {
      id: 'st-reconnect-ask',
      kind: 'status',
      status: 'done',
      content: 'Reconnecting... 1/5',
      endedAt: 22
    }
    const afterReconnectAskThink = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, reconnectAskStatus, askReady, askStatus, nextThink],
      true
    )
    expect(afterReconnectAskThink).not.toBeNull()
    expect(afterReconnectAskThink!.some((step) => step.segment === reconnectAskStatus)).toBe(true)
    expect(afterReconnectAskThink!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterReconnectAskThink!.some((step) => step.segment === nextThink)).toBe(false)
    const afterReconnectAskToken = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, reconnectAskStatus, askReady, askStatusDoneForHang, firstReply],
      true
    )
    expect(afterReconnectAskToken).not.toBeNull()
    expect(afterReconnectAskToken!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterReconnectAskToken!.some((step) => step.segment === firstReply)).toBe(false)
    const afterReconnectAskThinkSettled = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [
        helloAskHangDone,
        reconnectAskStatus,
        askReady,
        askStatusDoneForHang,
        { ...nextThink, status: 'done' },
        cmdNextSettled
      ],
      true
    )
    expect(afterReconnectAskThinkSettled).not.toBeNull()
    expect(afterReconnectAskThinkSettled!.at(-1)?.segment).toBe(cmdNextSettled)
    expect(afterReconnectAskThinkSettled!.some((step) => step.segment.kind === 'thinking')).toBe(false)
    const afterWriteAskThinkTokenSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [
        cmdDoneDiff,
        askReady,
        askStatusDoneForHang,
        { ...nextThink, status: 'done' },
        firstReplyEarly,
        cmdNextSettled
      ],
      true
    )
    expect(afterWriteAskThinkTokenSettled).not.toBeNull()
    expect(afterWriteAskThinkTokenSettled!.at(-1)?.segment).toBe(cmdNextSettled)
    expect(afterWriteAskThinkTokenSettled!.some((step) => step.segment === firstReplyEarly)).toBe(false)
    const askHangCompressDone: TurnSegment = {
      id: 'cp-ask-hang',
      kind: 'tool',
      toolName: 'compress',
      toolTitle: 'Context automatically compacted',
      status: 'done',
      startedAt: 23,
      endedAt: 23
    }
    const afterAskHangCompress = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, askReady, askStatusDoneForHang, askHangCompressDone],
      true
    )
    expect(afterAskHangCompress).not.toBeNull()
    expect(afterAskHangCompress!.some((step) => step.segment === askReady)).toBe(true)
    expect(afterAskHangCompress!.at(-1)?.segment).toBe(askHangCompressDone)
    const askReadyCancelled: TurnSegment = {
      ...askReady,
      status: 'cancelled',
      errorMessage: '任务已停止',
      resultSummary: '已停止',
      endedAt: 24
    }
    const askStatusCancelled: TurnSegment = { ...askStatus, status: 'cancelled', endedAt: 24 }
    const afterAskHangCancel = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, askReadyCancelled, askStatusCancelled],
      true
    )
    expect(afterAskHangCancel).not.toBeNull()
    expect(afterAskHangCancel!.some((step) => step.segment === askReadyCancelled)).toBe(true)
    expect(afterAskHangCancel!.some((step) => step.segment === askStatusCancelled)).toBe(true)
    const nextThinkCancelledAsk: TurnSegment = { ...nextThink, status: 'cancelled', endedAt: 24 }
    const afterAskHangThinkCancel = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, askReadyCancelled, askStatusCancelled, nextThinkCancelledAsk],
      true
    )
    expect(afterAskHangThinkCancel).not.toBeNull()
    expect(afterAskHangThinkCancel!.some((step) => step.segment === askReadyCancelled)).toBe(true)
    expect(afterAskHangThinkCancel!.some((step) => step.segment.kind === 'thinking')).toBe(false)
    const afterWriteAskCompress = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, askReady, askStatusDoneForHang, askHangCompressDone],
      true
    )
    expect(afterWriteAskCompress).not.toBeNull()
    expect(afterWriteAskCompress![0].segment).toBe(cmdDoneDiff)
    expect(afterWriteAskCompress!.at(-1)?.segment).toBe(askHangCompressDone)
    const afterWriteAskCancel = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, askReadyCancelled, askStatusCancelled],
      true
    )
    expect(afterWriteAskCancel).not.toBeNull()
    expect(afterWriteAskCancel![0].segment).toBe(cmdDoneDiff)
    expect(afterWriteAskCancel!.some((step) => step.segment === askReadyCancelled)).toBe(true)
    const afterWritePlanAskCompress = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, planStatusDone, askReady, askStatusDoneForHang, askHangCompressDone],
      true
    )
    expect(afterWritePlanAskCompress).not.toBeNull()
    expect(afterWritePlanAskCompress!.some((step) => step.segment === planStatusDone)).toBe(true)
    expect(afterWritePlanAskCompress!.at(-1)?.segment).toBe(askHangCompressDone)
    const afterWritePlanAskCancel = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, planStatusDone, askReadyCancelled, askStatusCancelled],
      true
    )
    expect(afterWritePlanAskCancel).not.toBeNull()
    expect(afterWritePlanAskCancel!.some((step) => step.segment === planStatusDone)).toBe(true)
    expect(afterWritePlanAskCancel!.some((step) => step.segment === askReadyCancelled)).toBe(true)
    const afterReconnectAskCompress = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, reconnectAskStatus, askReady, askStatusDoneForHang, askHangCompressDone],
      true
    )
    expect(afterReconnectAskCompress).not.toBeNull()
    expect(afterReconnectAskCompress!.some((step) => step.segment === reconnectAskStatus)).toBe(true)
    expect(afterReconnectAskCompress!.at(-1)?.segment).toBe(askHangCompressDone)
    const afterReconnectAskCancel = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, reconnectAskStatus, askReadyCancelled, askStatusCancelled],
      true
    )
    expect(afterReconnectAskCancel).not.toBeNull()
    expect(afterReconnectAskCancel!.some((step) => step.segment === reconnectAskStatus)).toBe(true)
    expect(afterReconnectAskCancel!.some((step) => step.segment === askReadyCancelled)).toBe(true)
    const afterReconnectAskThinkCancel = appendProcessPhaseStepOnToolStart(
      helloAskHangSteps,
      [helloAskHang],
      [helloAskHangDone, reconnectAskStatus, askReadyCancelled, askStatusCancelled, nextThinkCancelledAsk],
      true
    )
    expect(afterReconnectAskThinkCancel).not.toBeNull()
    expect(afterReconnectAskThinkCancel!.some((step) => step.segment === reconnectAskStatus)).toBe(true)
    expect(afterReconnectAskThinkCancel!.some((step) => step.segment.kind === 'thinking')).toBe(false)
    const afterWriteAskThinkCancel = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, askReadyCancelled, askStatusCancelled, nextThinkCancelledAsk],
      true
    )
    expect(afterWriteAskThinkCancel).not.toBeNull()
    expect(afterWriteAskThinkCancel![0].segment).toBe(cmdDoneDiff)
    expect(afterWriteAskThinkCancel!.some((step) => step.segment.kind === 'thinking')).toBe(false)
    const afterWritePlanAskThinkCancel = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, planStatusDone, askReadyCancelled, askStatusCancelled, nextThinkCancelledAsk],
      true
    )
    expect(afterWritePlanAskThinkCancel).not.toBeNull()
    expect(afterWritePlanAskThinkCancel!.some((step) => step.segment === planStatusDone)).toBe(true)
    expect(afterWritePlanAskThinkCancel!.some((step) => step.segment.kind === 'thinking')).toBe(false)
    const cancelCmd: TurnSegment = {
      id: 'run-stop',
      kind: 'tool',
      toolName: 'read_file',
      toolDetail: 'src/a.ts',
      status: 'active',
      startedAt: 21
    }
    const cancelSteps = deriveChronologicalSteps([cancelCmd], { isStreaming: true })
    const cancelledCmd: TurnSegment = {
      ...cancelCmd,
      status: 'cancelled',
      errorMessage: '任务已停止',
      resultSummary: '已停止',
      endedAt: 22
    }
    const afterCancel = appendProcessPhaseStepOnToolStart(
      cancelSteps,
      [cancelCmd],
      [cancelledCmd],
      true
    )
    expect(afterCancel).not.toBeNull()
    expect(afterCancel).toHaveLength(1)
    expect(afterCancel![0].id).toBe(cancelSteps[0].id)
    expect(afterCancel![0].segment).toBe(cancelledCmd)
    expect(afterCancel![0].status).toBe('cancelled')
    const errStatus: TurnSegment = {
      id: 'st-err',
      kind: 'status',
      status: 'active',
      content: 'Working',
      startedAt: 23
    }
    const errStatusSteps = deriveChronologicalSteps([errStatus], { isStreaming: true })
    const errStatusDone: TurnSegment = { ...errStatus, status: 'done', endedAt: 24 }
    const errText: TurnSegment = {
      id: 'err-1',
      kind: 'text',
      status: 'done',
      role: 'final',
      content: '**错误**: boom',
      startedAt: 25
    }
    const afterError = remapProcessPhaseStepsOnThinkAppend(
      errStatusSteps,
      [errStatus],
      [errStatusDone, errText],
      true
    )
    expect(afterError).not.toBeNull()
    expect(afterError).toHaveLength(1)
    expect(afterError![0].segment).toBe(errStatusDone)
    expect(afterError![0].status).toBe('done')
    const settleAndError = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDone, errText],
      true
    )
    expect(settleAndError).not.toBeNull()
    expect(settleAndError).toHaveLength(1)
    expect(settleAndError![0].id).toBe(cmdSteps[0].id)
    expect(settleAndError![0].segment).toBe(cmdDone)
    expect(settleAndError![0].status).toBe('done')
    const demoFence: TurnSegment = {
      id: 'demo-fence-1',
      kind: 'text',
      status: 'active',
      content: '```demo\n<div>',
      startedAt: 14
    }
    expect(
      remapProcessPhaseStepsOnThinkAppend(appended!, [cmdDone, cmdNext], [cmdDone, cmdNext, demoFence])
    ).toBe(appended)
    const demoFenceGrown: TurnSegment = {
      ...demoFence,
      content: '```demo\n<div class="scene"><h1>广义相对论</h1></div>'
    }
    expect(
      remapProcessPhaseStepsOnThinkAppend(
        appended!,
        [cmdDone, cmdNext, demoFence],
        [cmdDone, cmdNext, demoFenceGrown]
      )
    ).toBe(appended)
    const writeAndStatus = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus],
      true
    )
    expect(writeAndStatus).not.toBeNull()
    expect(writeAndStatus).toHaveLength(2)
    expect(writeAndStatus![0].id).toBe(cmdSteps[0].id)
    expect(writeAndStatus![0].segment).toBe(cmdDoneDiff)
    expect(writeAndStatus![0].status).toBe('done')
    expect(writeAndStatus!.at(-1)?.segment).toBe(reconnectStatus)
    const writeAndStatusThink = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, nextThink],
      true
    )
    expect(writeAndStatusThink).not.toBeNull()
    expect(writeAndStatusThink).toHaveLength(2)
    expect(writeAndStatusThink![0].segment).toBe(cmdDoneDiff)
    expect(writeAndStatusThink!.at(-1)?.segment).toBe(reconnectStatus)
    const writeAndThinkAnswer = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, nextThink, firstReply],
      true
    )
    expect(writeAndThinkAnswer).not.toBeNull()
    expect(writeAndThinkAnswer).toHaveLength(1)
    expect(writeAndThinkAnswer![0].segment).toBe(cmdDoneDiff)
    const writeAndThink = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, nextThink],
      true
    )
    expect(writeAndThink).not.toBeNull()
    expect(writeAndThink).toHaveLength(1)
    expect(writeAndThink![0].id).toBe(cmdSteps[0].id)
    expect(writeAndThink![0].segment).toBe(cmdDoneDiff)
    expect(writeAndThink![0].status).toBe('done')
    const writeAndAnswer = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, firstReply],
      true
    )
    expect(writeAndAnswer).not.toBeNull()
    expect(writeAndAnswer).toHaveLength(1)
    expect(writeAndAnswer![0].segment).toBe(cmdDoneDiff)
    const writeAndFence = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, demoFence],
      true
    )
    expect(writeAndFence).not.toBeNull()
    expect(writeAndFence).toHaveLength(1)
    expect(writeAndFence![0].segment).toBe(cmdDoneDiff)
    const writeAndError = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, errText],
      true
    )
    expect(writeAndError).not.toBeNull()
    expect(writeAndError).toHaveLength(1)
    expect(writeAndError![0].segment).toBe(cmdDoneDiff)
    expect(writeAndError![0].status).toBe('done')
    const writeAndDemo = remapProcessPhaseStepsOnThinkAppend(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, inlineDemo],
      true
    )
    expect(writeAndDemo).not.toBeNull()
    expect(writeAndDemo).toHaveLength(1)
    expect(writeAndDemo![0].segment).toBe(cmdDoneDiff)
    const liveText: TurnSegment = {
      id: 'ans1',
      kind: 'text',
      status: 'active',
      content: 'Hi',
      startedAt: 12
    }
    const liveTextDone: TurnSegment = { ...liveText, status: 'done' }
    const fromAnswer = deriveChronologicalSteps([liveText], { isStreaming: true })
    const afterAnswerTool = appendProcessPhaseStepOnToolStart(
      fromAnswer,
      [liveText],
      [liveTextDone, cmdNext],
      true
    )
    expect(afterAnswerTool).not.toBeNull()
    expect(afterAnswerTool!.at(-1)?.segment).toBe(cmdNext)
    const liveTextGrownDone: TurnSegment = { ...liveText, status: 'done', content: 'Hi there' }
    const afterAnswerGrow = appendProcessPhaseStepOnToolStart(
      fromAnswer,
      [liveText],
      [liveTextGrownDone, cmdNext],
      true
    )
    expect(afterAnswerGrow).not.toBeNull()
    expect(afterAnswerGrow!.at(-1)?.segment).toBe(cmdNext)
    const twoActive = deriveChronologicalSteps([cmdRunning, cmdNext], { isStreaming: true })
    const earlierSettled = retargetProcessPhaseStepsOnToolMeta(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNext],
      true
    )
    expect(earlierSettled).not.toBeNull()
    expect(earlierSettled![0].status).toBe('done')
    expect(earlierSettled![0].segment).toBe(cmdDone)
    expect(earlierSettled![1].segment).toBe(cmdNext)
    const cmdNextDone: TurnSegment = { ...cmdNext, status: 'done' }
    const bothSettled = retargetProcessPhaseStepsOnToolMeta(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone],
      true
    )
    expect(bothSettled).not.toBeNull()
    expect(bothSettled![0].status).toBe('done')
    expect(bothSettled![0].segment).toBe(cmdDone)
    expect(bothSettled![1].status).toBe('done')
    expect(bothSettled![1].segment).toBe(cmdNextDone)
    const settleAndStatusThink = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatus, nextThink],
      true
    )
    expect(settleAndStatusThink).not.toBeNull()
    expect(settleAndStatusThink).toHaveLength(3)
    expect(settleAndStatusThink![0].segment).toBe(cmdDone)
    expect(settleAndStatusThink![1].segment).toBe(cmdNextDone)
    expect(settleAndStatusThink!.at(-1)?.segment).toBe(reconnectStatus)
    const settleAndThinkAnswer = remapProcessPhaseStepsOnThinkAppend(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThink, firstReply],
      true
    )
    expect(settleAndThinkAnswer).not.toBeNull()
    expect(settleAndThinkAnswer).toHaveLength(2)
    expect(settleAndThinkAnswer![0].segment).toBe(cmdDone)
    expect(settleAndThinkAnswer![1].segment).toBe(cmdNextDone)
    const nextThinkDone: TurnSegment = { ...nextThink, status: 'done' }
    const settleAndStatusThinkAnswer = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatus, nextThinkDone, firstReply],
      true
    )
    expect(settleAndStatusThinkAnswer).not.toBeNull()
    expect(settleAndStatusThinkAnswer).toHaveLength(3)
    expect(settleAndStatusThinkAnswer![0].segment).toBe(cmdDone)
    expect(settleAndStatusThinkAnswer![1].segment).toBe(cmdNextDone)
    expect(settleAndStatusThinkAnswer!.at(-1)?.segment).toBe(reconnectStatus)
    const settleAndStatusDemo = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatus, demoFence],
      true
    )
    expect(settleAndStatusDemo).not.toBeNull()
    expect(settleAndStatusDemo).toHaveLength(3)
    expect(settleAndStatusDemo![0].segment).toBe(cmdDone)
    expect(settleAndStatusDemo![1].segment).toBe(cmdNextDone)
    expect(settleAndStatusDemo!.at(-1)?.segment).toBe(reconnectStatus)
    const settleAndThinkDemo = remapProcessPhaseStepsOnThinkAppend(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThinkDone, demoFence],
      true
    )
    expect(settleAndThinkDemo).not.toBeNull()
    expect(settleAndThinkDemo).toHaveLength(2)
    expect(settleAndThinkDemo![0].segment).toBe(cmdDone)
    expect(settleAndThinkDemo![1].segment).toBe(cmdNextDone)
    const readSettled: TurnSegment = {
      id: 'read-settle-2',
      kind: 'tool',
      toolName: 'read_file',
      status: 'done',
      resultSummary: 'ok',
      startedAt: 14.5,
      endedAt: 14.6
    }
    const statusThinkAnswerSettled = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatus, nextThinkDone, firstReply, readSettled],
      true
    )
    expect(statusThinkAnswerSettled).not.toBeNull()
    expect(statusThinkAnswerSettled).toHaveLength(4)
    expect(statusThinkAnswerSettled![0].segment).toBe(cmdDone)
    expect(statusThinkAnswerSettled![1].segment).toBe(cmdNextDone)
    expect(statusThinkAnswerSettled![2].segment).toBe(reconnectStatus)
    expect(statusThinkAnswerSettled![3].segment).toBe(readSettled)
    const thinkDemoFenceAppend = appendProcessPhaseStepOnToolStart(
      doneRetargeted!,
      [cmdDone],
      [cmdDone, nextThinkDone, demoFence, inlineDemo],
      true
    )
    expect(thinkDemoFenceAppend).not.toBeNull()
    expect(thinkDemoFenceAppend).toHaveLength(1)
    expect(thinkDemoFenceAppend![0]).toBe(doneRetargeted![0])
    const writeThinkDemoFence = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, nextThinkDone, demoFence, inlineDemo],
      true
    )
    expect(writeThinkDemoFence).not.toBeNull()
    expect(writeThinkDemoFence).toHaveLength(1)
    expect(writeThinkDemoFence![0].segment).toBe(cmdDoneDiff)
    const writeFenceDemo = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, demoFence, inlineDemo],
      true
    )
    expect(writeFenceDemo).not.toBeNull()
    expect(writeFenceDemo).toHaveLength(1)
    expect(writeFenceDemo![0].segment).toBe(cmdDoneDiff)
    const writePlanThinkSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, nextThinkDone, readSettled],
      true
    )
    expect(writePlanThinkSettled).not.toBeNull()
    expect(writePlanThinkSettled).toHaveLength(3)
    expect(writePlanThinkSettled![0].segment).toBe(cmdDoneDiff)
    expect(writePlanThinkSettled![1].segment).toBe(reconnectStatus)
    expect(writePlanThinkSettled![2].segment).toBe(readSettled)
    const writePlanTokenSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, firstReply, readSettled],
      true
    )
    expect(writePlanTokenSettled).not.toBeNull()
    expect(writePlanTokenSettled).toHaveLength(3)
    expect(writePlanTokenSettled![0].segment).toBe(cmdDoneDiff)
    expect(writePlanTokenSettled![1].segment).toBe(reconnectStatus)
    expect(writePlanTokenSettled![2].segment).toBe(readSettled)
    const writePlanThinkTokenSettled = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, nextThinkDone, firstReply, readSettled],
      true
    )
    expect(writePlanThinkTokenSettled).not.toBeNull()
    expect(writePlanThinkTokenSettled).toHaveLength(3)
    expect(writePlanThinkTokenSettled![0].segment).toBe(cmdDoneDiff)
    expect(writePlanThinkTokenSettled![1].segment).toBe(reconnectStatus)
    expect(writePlanThinkTokenSettled![2].segment).toBe(readSettled)
    const writePlanDemo = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, demoFence, inlineDemo],
      true
    )
    expect(writePlanDemo).not.toBeNull()
    expect(writePlanDemo).toHaveLength(2)
    expect(writePlanDemo![0].segment).toBe(cmdDoneDiff)
    expect(writePlanDemo![1].segment).toBe(reconnectStatus)
    const writePlanThinkDemo = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, nextThinkDone, demoFence, inlineDemo],
      true
    )
    expect(writePlanThinkDemo).not.toBeNull()
    expect(writePlanThinkDemo).toHaveLength(2)
    expect(writePlanThinkDemo![0].segment).toBe(cmdDoneDiff)
    expect(writePlanThinkDemo![1].segment).toBe(reconnectStatus)
    const reconnectStatusDone: TurnSegment = { ...reconnectStatus, status: 'done', endedAt: 14 }
    const nextRoundTool: TurnSegment = {
      id: 'read2',
      kind: 'tool',
      toolName: 'read_file',
      toolTitle: '读取文件',
      toolDetail: 'src/c.ts',
      status: 'active',
      startedAt: 15
    }
    const settleAndStatusTool = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatusDone, nextRoundTool],
      true
    )
    expect(settleAndStatusTool).not.toBeNull()
    expect(settleAndStatusTool).toHaveLength(4)
    expect(settleAndStatusTool![0].segment).toBe(cmdDone)
    expect(settleAndStatusTool![1].segment).toBe(cmdNextDone)
    expect(settleAndStatusTool![2].segment).toBe(reconnectStatusDone)
    expect(settleAndStatusTool!.at(-1)?.segment).toBe(nextRoundTool)
    const settleAndThinkTool = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThinkDone, nextRoundTool],
      true
    )
    expect(settleAndThinkTool).not.toBeNull()
    expect(settleAndThinkTool).toHaveLength(3)
    expect(settleAndThinkTool![0].segment).toBe(cmdDone)
    expect(settleAndThinkTool![1].segment).toBe(cmdNextDone)
    expect(settleAndThinkTool!.at(-1)?.segment).toBe(nextRoundTool)
    expect(settleAndThinkTool!.some((step) => step.segment === nextThinkDone)).toBe(false)
    const settleAndStatusThinkTool = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatusDone, nextThinkDone, nextRoundTool],
      true
    )
    expect(settleAndStatusThinkTool).not.toBeNull()
    expect(settleAndStatusThinkTool).toHaveLength(4)
    expect(settleAndStatusThinkTool![0].segment).toBe(cmdDone)
    expect(settleAndStatusThinkTool![1].segment).toBe(cmdNextDone)
    expect(settleAndStatusThinkTool![2].segment).toBe(reconnectStatusDone)
    expect(settleAndStatusThinkTool!.at(-1)?.segment).toBe(nextRoundTool)
    expect(settleAndStatusThinkTool!.some((step) => step.segment === nextThinkDone)).toBe(false)
    const settleAndStatusDemoTool = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatusDone, inlineDemo],
      true
    )
    expect(settleAndStatusDemoTool).not.toBeNull()
    expect(settleAndStatusDemoTool).toHaveLength(3)
    expect(settleAndStatusDemoTool![0].segment).toBe(cmdDone)
    expect(settleAndStatusDemoTool![1].segment).toBe(cmdNextDone)
    expect(settleAndStatusDemoTool!.at(-1)?.segment).toBe(reconnectStatusDone)
    expect(settleAndStatusDemoTool!.some((step) => step.segment === inlineDemo)).toBe(false)
    const settleAndThinkDemoTool = remapProcessPhaseStepsOnThinkAppend(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThinkDone, inlineDemo],
      true
    )
    expect(settleAndThinkDemoTool).not.toBeNull()
    expect(settleAndThinkDemoTool).toHaveLength(2)
    expect(settleAndThinkDemoTool![0].segment).toBe(cmdDone)
    expect(settleAndThinkDemoTool![1].segment).toBe(cmdNextDone)
    const settleAndStatusThinkDemoTool = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatusDone, nextThinkDone, inlineDemo],
      true
    )
    expect(settleAndStatusThinkDemoTool).not.toBeNull()
    expect(settleAndStatusThinkDemoTool).toHaveLength(3)
    expect(settleAndStatusThinkDemoTool!.at(-1)?.segment).toBe(reconnectStatusDone)
    expect(settleAndStatusThinkDemoTool!.some((step) => step.segment === inlineDemo)).toBe(false)
    const errorText: TurnSegment = {
      id: 'err-1',
      kind: 'text',
      role: 'final',
      status: 'done',
      content: '**错误**: boom'
    }
    const settleAndStatusError = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatusDone, errorText],
      true
    )
    expect(settleAndStatusError).not.toBeNull()
    expect(settleAndStatusError).toHaveLength(3)
    expect(settleAndStatusError!.at(-1)?.segment).toBe(reconnectStatusDone)
    expect(settleAndStatusError!.some((step) => step.segment === errorText)).toBe(false)
    const settleAndThinkError = remapProcessPhaseStepsOnThinkAppend(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThinkDone, errorText],
      true
    )
    expect(settleAndThinkError).not.toBeNull()
    expect(settleAndThinkError).toHaveLength(2)
    const compressDone: TurnSegment = {
      id: 'cp-plan',
      kind: 'tool',
      toolName: 'compress',
      toolTitle: 'Context automatically compacted',
      status: 'done',
      startedAt: 16,
      endedAt: 16
    }
    const settleAndStatusCompress = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatusDone, compressDone],
      true
    )
    expect(settleAndStatusCompress).not.toBeNull()
    expect(settleAndStatusCompress).toHaveLength(4)
    expect(settleAndStatusCompress![2].segment).toBe(reconnectStatusDone)
    expect(settleAndStatusCompress!.at(-1)?.segment).toBe(compressDone)
    const settleAndThinkCompress = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThinkDone, compressDone],
      true
    )
    expect(settleAndThinkCompress).not.toBeNull()
    expect(settleAndThinkCompress).toHaveLength(3)
    expect(settleAndThinkCompress!.at(-1)?.segment).toBe(compressDone)
    expect(settleAndThinkCompress!.some((step) => step.segment === nextThinkDone)).toBe(false)
    const reconnectCancelled: TurnSegment = { ...reconnectStatus, status: 'cancelled', endedAt: 17 }
    const nextThinkCancelled: TurnSegment = { ...nextThink, status: 'cancelled', endedAt: 17 }
    const settleAndStatusCancel = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectCancelled],
      true
    )
    expect(settleAndStatusCancel).not.toBeNull()
    expect(settleAndStatusCancel).toHaveLength(3)
    expect(settleAndStatusCancel!.at(-1)?.segment).toBe(reconnectCancelled)
    const settleAndThinkCancel = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, nextThinkCancelled],
      true
    )
    expect(settleAndThinkCancel).not.toBeNull()
    expect(settleAndThinkCancel).toHaveLength(2)
    expect(settleAndThinkCancel!.some((step) => step.segment === nextThinkCancelled)).toBe(false)
    const settleAndStatusThinkCancel = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectCancelled, nextThinkCancelled],
      true
    )
    expect(settleAndStatusThinkCancel).not.toBeNull()
    expect(settleAndStatusThinkCancel).toHaveLength(3)
    expect(settleAndStatusThinkCancel!.at(-1)?.segment).toBe(reconnectCancelled)
    const settleAndStatusThinkAsk = appendProcessPhaseStepOnToolStart(
      twoActive,
      [cmdRunning, cmdNext],
      [cmdDone, cmdNextDone, reconnectStatus, nextThink, askStatus],
      true
    )
    expect(settleAndStatusThinkAsk).not.toBeNull()
    expect(settleAndStatusThinkAsk).toHaveLength(4)
    expect(settleAndStatusThinkAsk![2].segment).toBe(reconnectStatus)
    expect(settleAndStatusThinkAsk!.at(-1)?.segment).toBe(askStatus)
    expect(settleAndStatusThinkAsk!.some((step) => step.segment === nextThink)).toBe(false)
    const writeAndStatusThinkAsk = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, reconnectStatus, nextThink, askStatus],
      true
    )
    expect(writeAndStatusThinkAsk).not.toBeNull()
    expect(writeAndStatusThinkAsk).toHaveLength(3)
    expect(writeAndStatusThinkAsk![0].segment).toBe(cmdDoneDiff)
    expect(writeAndStatusThinkAsk![1].segment).toBe(reconnectStatus)
    expect(writeAndStatusThinkAsk!.at(-1)?.segment).toBe(askStatus)
    expect(settleAndStatusThinkCancel!.some((step) => step.segment === nextThinkCancelled)).toBe(
      false
    )
    const thinkOpen: TurnSegment = {
      id: 'th-live',
      kind: 'thinking',
      content: 'Hmm',
      status: 'active',
      startedAt: 1
    }
    const thinkClosed: TurnSegment = { ...thinkOpen, status: 'done', endedAt: 2 }
    const thinkSteps = deriveChronologicalSteps([thinkOpen], { isStreaming: true })
    const firstFromThink = appendProcessPhaseStepOnToolStart(
      thinkSteps,
      [thinkOpen],
      [thinkClosed, cmdNext],
      true
    )
    expect(firstFromThink).not.toBeNull()
    expect(firstFromThink!.at(-1)?.segment).toBe(cmdNext)
    const thinkGrown: TurnSegment = { ...thinkOpen, status: 'done', content: 'Hmm next', endedAt: 2 }
    const firstFromThinkGrow = appendProcessPhaseStepOnToolStart(
      thinkSteps,
      [thinkOpen],
      [thinkGrown, cmdNext],
      true
    )
    expect(firstFromThinkGrow).not.toBeNull()
    expect(firstFromThinkGrow!.at(-1)?.segment).toBe(cmdNext)
    expect(firstFromThinkGrow![0]?.segment).toBe(thinkGrown)
    const thinkGrownAnswer = remapProcessPhaseStepsOnThinkAppend(
      thinkSteps,
      [thinkOpen],
      [thinkGrown, firstReply],
      true
    )
    expect(thinkGrownAnswer).not.toBeNull()
    expect(thinkGrownAnswer).toHaveLength(thinkSteps.length)
    expect(thinkGrownAnswer![0]?.segment).toBe(thinkGrown)
    const search = deriveChronologicalSteps([
      {
        id: 'ws1',
        kind: 'tool',
        toolName: 'web_search',
        toolTitle: '网页搜索',
        toolArgs: { query: 'codex desktop' },
        status: 'active',
        startedAt: 6
      }
    ])
    expect(search[0]?.title).toBe('Searching the web')
    const searched = deriveChronologicalSteps([
      {
        id: 'ws2',
        kind: 'tool',
        toolName: 'web_search',
        toolTitle: '网页搜索',
        toolArgs: { query: 'codex desktop' },
        status: 'done',
        startedAt: 6,
        endedAt: 7
      }
    ])
    expect(searched[0]?.title).toBe('Searched')
    expect(searched[0]?.detail).toBe('codex desktop')
    expect(search[0]?.detail).toBe('codex desktop')
    const fetching = deriveChronologicalSteps([
      {
        id: 'wf1',
        kind: 'tool',
        toolName: 'web_fetch',
        toolTitle: '抓取网页',
        toolArgs: { url: 'https://example.com/docs' },
        status: 'active',
        startedAt: 8
      }
    ])
    expect(fetching[0]?.title).toBe('Searching the web')
    expect(fetching[0]?.detail).toBe('https://example.com/docs')
    const fetched = deriveChronologicalSteps([
      {
        id: 'wf2',
        kind: 'tool',
        toolName: 'web_fetch',
        toolTitle: '抓取网页',
        toolArgs: { url: 'https://example.com/docs' },
        status: 'done',
        startedAt: 8,
        endedAt: 9
      }
    ])
    expect(fetched[0]?.title).toBe('Searched')
    expect(fetched[0]?.detail).toBe('https://example.com/docs')
    const planning = deriveChronologicalSteps([
      {
        id: 'up1',
        kind: 'tool',
        toolName: 'update_plan',
        toolTitle: '更新计划',
        toolArgs: {
          plan: [
            { step: 'Add types', status: 'completed' },
            { step: 'Wire tool', status: 'in_progress' }
          ]
        },
        status: 'active',
        startedAt: 8
      }
    ])
    expect(planning[0]?.title).toBe('Wire tool')
    const mcpLive = deriveChronologicalSteps([
      {
        id: 'mcp1',
        kind: 'tool',
        toolName: 'mcp_github__search',
        toolTitle: 'mcp_github__search',
        toolArgs: { q: 'codex' },
        resultSummary: '{"items":[1,2,3]}',
        resultOutput: '{"items":[1,2,3]}',
        status: 'active',
        startedAt: 9
      }
    ])
    expect(mcpLive[0]?.title).toBe('Calling github.search({"q":"codex"})')
    expect(mcpLive[0]?.detail).toBeUndefined()
    const mcpDone = deriveChronologicalSteps([
      {
        id: 'mcp2',
        kind: 'tool',
        toolName: 'mcp_call_tool',
        toolTitle: 'MCP 调用',
        toolArgs: { server: 'docs', tool_name: 'lookup', arguments: { q: 'plan' } },
        status: 'done',
        startedAt: 10,
        endedAt: 11
      }
    ])
    expect(mcpDone[0]?.title).toBe('Called docs.lookup({"q":"plan"})')
    const running = deriveChronologicalSteps([
      {
        id: 'ex1',
        kind: 'tool',
        toolName: 'run_terminal_cmd',
        toolTitle: '运行命令',
        toolArgs: { command: 'rm -rf /tmp/demo' },
        status: 'active',
        startedAt: 12
      }
    ])
    expect(running[0]?.title).toBe('Running rm -rf /tmp/demo')
    const ran = deriveChronologicalSteps([
      {
        id: 'ex2',
        kind: 'tool',
        toolName: 'run_terminal_cmd',
        toolTitle: '运行命令',
        toolArgs: { command: 'sleep 2' },
        status: 'done',
        startedAt: 13,
        endedAt: 14
      }
    ])
    expect(ran[0]?.title).toBe('Ran sleep 2')
    const reading = deriveChronologicalSteps([
      {
        id: 'rd1',
        kind: 'tool',
        toolName: 'read_file',
        toolTitle: '读取文件',
        toolArgs: { path: 'src/App.tsx' },
        toolDetail: 'src/App.tsx',
        status: 'active',
        startedAt: 15
      }
    ])
    expect(reading[0]?.title).toBe('Read App.tsx')
    expect(reading[0]?.detail).toBeUndefined()
    const listing = deriveChronologicalSteps([
      {
        id: 'ls1',
        kind: 'tool',
        toolName: 'list_dir',
        toolTitle: '列出目录',
        toolArgs: { path: 'src' },
        status: 'done',
        startedAt: 16,
        endedAt: 17
      }
    ])
    expect(listing[0]?.title).toBe('List src')
    const searching = deriveChronologicalSteps([
      {
        id: 'gr1',
        kind: 'tool',
        toolName: 'grep',
        toolTitle: '搜索内容',
        toolArgs: { pattern: 'LiveHead', path: 'shared' },
        status: 'done',
        startedAt: 18,
        endedAt: 19
      }
    ])
    expect(searching[0]?.title).toBe('Search LiveHead in shared')
    const editing = deriveChronologicalSteps([
      {
        id: 'ed1',
        kind: 'tool',
        toolName: 'write_file',
        toolTitle: '写入文件',
        toolArgs: { path: 'src/a.ts' },
        toolDetail: 'src/a.ts',
        status: 'active',
        startedAt: 20
      }
    ])
    expect(editing[0]?.title).toBe('Edited a.ts')
    const deleted = deriveChronologicalSteps([
      {
        id: 'del1',
        kind: 'tool',
        toolName: 'delete_path',
        toolTitle: '删除路径',
        toolArgs: { path: 'src/gone.ts' },
        status: 'done',
        startedAt: 21,
        endedAt: 22
      }
    ])
    expect(deleted[0]?.title).toBe('Deleted gone.ts')
    const failedPatch = deriveChronologicalSteps([
      {
        id: 'pt1',
        kind: 'tool',
        toolName: 'apply_patch',
        toolTitle: '应用补丁',
        status: 'error',
        startedAt: 23,
        endedAt: 24
      }
    ])
    expect(failedPatch[0]?.title).toBe('Failed to apply patch')
    const compacting = deriveChronologicalSteps([
      {
        id: 'cp1',
        kind: 'tool',
        toolName: 'compress',
        toolTitle: 'Automatically compacting context',
        status: 'active',
        startedAt: 25
      }
    ])
    expect(compacting[0]?.title).toBe('Automatically compacting context')
    const compacted = deriveChronologicalSteps([
      {
        id: 'cp2',
        kind: 'tool',
        toolName: 'compress',
        toolTitle: 'Automatically compacting context',
        status: 'done',
        startedAt: 26,
        endedAt: 27
      }
    ])
    expect(compacted[0]?.title).toBe('Context automatically compacted')
    const compactStatus: TurnSegment = {
      id: 'cp-st',
      kind: 'status',
      status: 'active',
      content: 'Automatically compacting context',
      startedAt: 27.5
    }
    const compactStatusSteps = deriveChronologicalSteps([compactStatus], { isStreaming: true })
    const compactStatusDone: TurnSegment = { ...compactStatus, status: 'done', endedAt: 27.6 }
    const compressDoneSeg: TurnSegment = {
      id: 'cp-live',
      kind: 'tool',
      toolName: 'compress',
      toolTitle: 'Automatically compacting context',
      status: 'done',
      startedAt: 27.7,
      endedAt: 27.8
    }
    const afterCompress = appendProcessPhaseStepOnToolStart(
      compactStatusSteps,
      [compactStatus],
      [compactStatusDone, compressDoneSeg],
      true
    )
    expect(afterCompress).not.toBeNull()
    expect(afterCompress).toHaveLength(2)
    expect(afterCompress![0].segment).toBe(compactStatusDone)
    expect(afterCompress![0].status).toBe('done')
    expect(afterCompress!.at(-1)?.segment).toBe(compressDoneSeg)
    const writeAndCompress = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDoneDiff, compressDoneSeg],
      true
    )
    expect(writeAndCompress).not.toBeNull()
    expect(writeAndCompress).toHaveLength(2)
    expect(writeAndCompress![0].id).toBe(cmdSteps[0].id)
    expect(writeAndCompress![0].segment).toBe(cmdDoneDiff)
    expect(writeAndCompress![0].status).toBe('done')
    expect(writeAndCompress!.at(-1)?.segment).toBe(compressDoneSeg)
    const settleAndCompress = appendProcessPhaseStepOnToolStart(
      cmdSteps,
      [cmdRunning],
      [cmdDone, compressDoneSeg],
      true
    )
    expect(settleAndCompress).not.toBeNull()
    expect(settleAndCompress).toHaveLength(2)
    expect(settleAndCompress![0].id).toBe(cmdSteps[0].id)
    expect(settleAndCompress![0].segment).toBe(cmdDone)
    expect(settleAndCompress![0].status).toBe('done')
    expect(settleAndCompress!.at(-1)?.segment).toBe(compressDoneSeg)
    const asking = deriveChronologicalSteps([
      {
        id: 'ask1',
        kind: 'tool',
        toolName: 'request_user_input',
        toolTitle: '询问用户',
        toolArgs: {
          questions: [
            {
              id: 'scope',
              header: 'Scope',
              question: 'What should we change?',
              options: [
                { label: 'Minimal', description: 'Smallest fix.' },
                { label: 'Rewrite', description: 'Replace the module.' }
              ]
            }
          ]
        },
        status: 'active',
        startedAt: 28
      }
    ])
    expect(asking[0]?.title).toBe('Scope')
    const askingMany = deriveChronologicalSteps([
      {
        id: 'ask2',
        kind: 'tool',
        toolName: 'request_user_input',
        toolTitle: '询问用户',
        toolArgs: {
          questions: [
            {
              id: 'a',
              header: 'One',
              question: 'First?',
              options: [
                { label: 'A', description: 'a' },
                { label: 'B', description: 'b' }
              ]
            },
            {
              id: 'b',
              header: 'Two',
              question: 'Second?',
              options: [
                { label: 'C', description: 'c' },
                { label: 'D', description: 'd' }
              ]
            }
          ]
        },
        status: 'done',
        startedAt: 29,
        endedAt: 30
      }
    ])
    expect(askingMany[0]?.title).toBe('2 questions requested')
    const viewing = deriveChronologicalSteps([
      {
        id: 'img1',
        kind: 'tool',
        toolName: 'view_image',
        toolTitle: '查看图片',
        toolArgs: { path: '/tmp/shot.png' },
        toolDetail: '/tmp/shot.png',
        resultSummary: 'Viewed image: /tmp/shot.png',
        resultOutput: 'Viewed image: /tmp/shot.png\npath: /tmp/shot.png\nbytes: 12',
        status: 'done',
        startedAt: 31,
        endedAt: 32
      }
    ])
    expect(viewing[0]?.title).toBe('Viewed Image')
    expect(viewing[0]?.detail).toBe('shot.png')
    const reconnecting = deriveChronologicalSteps([
      {
        id: 're1',
        kind: 'status',
        content: '正在重新连接… 2/5',
        status: 'active',
        startedAt: 33
      }
    ])
    expect(reconnecting[0]?.title).toBe('Reconnecting... 2/5')
    const reconnectOfficial = deriveChronologicalSteps([
      {
        id: 're2',
        kind: 'status',
        content: 'Reconnecting... 4/5',
        status: 'active',
        startedAt: 34
      }
    ])
    expect(reconnectOfficial[0]?.title).toBe('Reconnecting... 4/5')
    const connecting = deriveChronologicalSteps([
      {
        id: 'cn1',
        kind: 'status',
        content: '连接模型并准备任务…',
        status: 'active',
        startedAt: 35
      }
    ])
    expect(connecting[0]?.title).toBe('Thinking')
    const connectingOfficial = deriveChronologicalSteps([
      {
        id: 'cn2',
        kind: 'status',
        content: 'Thinking',
        status: 'active',
        startedAt: 36
      }
    ])
    expect(connectingOfficial[0]?.title).toBe('Thinking')
  })
})
