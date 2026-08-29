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
