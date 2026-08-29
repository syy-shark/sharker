import { describe, expect, it } from 'vitest'
import {
  appendConsumedSteerMessage,
  appendFinishLeftoverSteers,
  applyHeldBusyFollowUp,
  cancelHeldBusyFollowUp,
  cancelPendingSteer,
  createPendingSteer,
  drainPendingSteers,
  enqueuePendingSteer,
  formatSteerForModel,
  heldFollowUpsAsQueued,
  holdBusyFollowUp,
  historyWithoutSteerIds,
  joinLeftoverSteerPrompt,
  leftoverSteerDisposition,
  moveHeldBusyFollowUp,
  placeMessageBeforeIds,
  queuedChipPrimaryAction,
  resolveBusyFollowUp,
  resolveBusyFollowUpWithoutConversation,
  listPendingSteers,
  shouldDrainPendingSteers,
  takeHeldBusyFollowUp,
  takeHeldBusyFollowUps,
  updateHeldBusyFollowUpText,
  updatePendingSteerText
} from './pending-steer'

describe('pending steer mailbox', () => {
  it('queues per conversation and drains only after the first sample', () => {
    const a = createPendingSteer('conv-a', '改用测试', undefined, 's-a')
    const b = createPendingSteer('conv-b', '别改 B', undefined, 's-b')
    let boxes = enqueuePendingSteer({}, 'conv-a', a)
    boxes = enqueuePendingSteer(boxes, 'conv-b', b)
    expect(listPendingSteers(boxes, 'conv-a').map((s) => s.id)).toEqual(['s-a'])
    expect(listPendingSteers(boxes, 'conv-b')).toHaveLength(1)
    expect(shouldDrainPendingSteers({ hasSampledOnce: false })).toBe(false)
    expect(shouldDrainPendingSteers({ hasSampledOnce: true, samplingInFlight: true })).toBe(false)
    expect(shouldDrainPendingSteers({ hasSampledOnce: true })).toBe(true)
    const drained = drainPendingSteers(boxes, 'conv-a')
    expect(drained.items).toHaveLength(1)
    expect(listPendingSteers(drained.boxes, 'conv-a')).toEqual([])
    expect(listPendingSteers(drained.boxes, 'conv-b')).toHaveLength(1)
    boxes = updatePendingSteerText(drained.boxes, 'conv-b', 's-b', '改一下 B')
    expect(listPendingSteers(boxes, 'conv-b')[0]?.text).toBe('改一下 B')
    boxes = cancelPendingSteer(boxes, 'conv-b', 's-b')
    expect(listPendingSteers(boxes, 'conv-b')).toEqual([])
    expect(
      formatSteerForModel({
        ...a,
        attachments: [
          { id: 'f', name: 'note.txt', mimeType: 'text/plain', path: '/tmp/note.txt', size: 4, kind: 'text' }
        ]
      })
    ).toContain('note.txt')
    const msgs = appendConsumedSteerMessage([], { id: 's-a', text: '改用测试' })
    expect(appendConsumedSteerMessage(msgs, { id: 's-a', text: '改用测试' })).toBe(msgs)
    expect(msgs[0]).toMatchObject({ id: 's-a', role: 'user', content: '改用测试' })
    expect(leftoverSteerDisposition({ outcome: 'success', sampled: true })).toBe('consume')
    expect(leftoverSteerDisposition({ outcome: 'success', sampled: false })).toBe('restore')
    expect(leftoverSteerDisposition({ outcome: 'aborted', sampled: true })).toBe('restore')
    expect(leftoverSteerDisposition({ outcome: 'error', sampled: true })).toBe('restore')
    expect(joinLeftoverSteerPrompt([{ text: '先测' }, { text: '再改' }])).toBe('先测\n\n再改')
    expect(historyWithoutSteerIds(msgs, ['s-a'])).toEqual([])
    expect(historyWithoutSteerIds(msgs, ['other'])).toBe(msgs)
    const placed = placeMessageBeforeIds(
      [...msgs, { id: 's-late', role: 'user', content: '残留' } as (typeof msgs)[0]],
      { id: 'a1', role: 'assistant', content: '答' } as (typeof msgs)[0],
      ['s-late']
    )
    expect(placed.map((m) => m.id)).toEqual(['s-a', 'a1', 's-late'])
    expect(
      placeMessageBeforeIds(
        appendFinishLeftoverSteers([{ id: 'live', role: 'user', content: '问' } as (typeof msgs)[0]], [
          { id: 's-late', text: '残留' }
        ]),
        { id: 'a1', role: 'assistant', content: '答' } as (typeof msgs)[0],
        ['s-late']
      ).map((m) => m.id)
    ).toEqual(['live', 'a1', 's-late'])
    expect(appendFinishLeftoverSteers(msgs, [{ id: 's-a', text: '改用测试' }])).toBe(msgs)
    expect(queuedChipPrimaryAction(true)).toBe('steer')
    expect(queuedChipPrimaryAction(false)).toBe('send')
    expect(resolveBusyFollowUp({ intent: 'queue' })).toBe('queue')
    expect(resolveBusyFollowUp({ intent: 'steer', accepted: { ok: true, id: 's1' } })).toBe(
      'pending'
    )
    expect(resolveBusyFollowUp({ intent: 'steer', accepted: null })).toBe('queue')
    expect(
      resolveBusyFollowUp({ intent: 'steer', accepted: { ok: false, reason: 'no_active_turn' } })
    ).toBe('send')
    expect(
      resolveBusyFollowUp({ intent: 'steer', accepted: { ok: false, reason: 'empty' } })
    ).toBe('ignore')
    expect(
      resolveBusyFollowUp({ intent: 'steer', accepted: { ok: false, reason: 'no_conversation' } })
    ).toBe('queue')
    expect(resolveBusyFollowUpWithoutConversation('jump')).toBe('hold-steer')
    expect(resolveBusyFollowUpWithoutConversation('queue')).toBe('hold-queue')
    expect(resolveBusyFollowUpWithoutConversation('send')).toBe('ignore')
    expect(holdBusyFollowUp([], { text: '  ', intent: 'steer' })).toEqual([])
    const held = holdBusyFollowUp([], { text: '  继续  ', intent: 'steer' })
    expect(held).toHaveLength(1)
    expect(held[0]?.text).toBe('继续')
    expect(held[0]?.intent).toBe('steer')
    const two = holdBusyFollowUp(held, { text: '排队', intent: 'queue' })
    expect(two.map((row) => row.intent)).toEqual(['steer', 'queue'])
    expect(heldFollowUpsAsQueued(two)[0]).toMatchObject({
      id: held[0]?.id,
      conversationId: '',
      text: '继续'
    })
    expect(updateHeldBusyFollowUpText(two, two[1]!.id, '改排队')[1]?.text).toBe('改排队')
    expect(moveHeldBusyFollowUp(two, two[1]!.id, -1).map((row) => row.intent)).toEqual([
      'queue',
      'steer'
    ])
    expect(cancelHeldBusyFollowUp(two, two[0]!.id)).toHaveLength(1)
    const one = takeHeldBusyFollowUp(two, two[0]!.id)
    expect(one.item?.id).toBe(two[0]?.id)
    expect(one.rest).toHaveLength(1)
    const taken = takeHeldBusyFollowUps(two)
    expect(taken.items).toHaveLength(2)
    expect(taken.rest).toEqual([])
    expect(
      applyHeldBusyFollowUp({
        intent: 'steer',
        accepted: { ok: false, reason: 'no_active_turn' },
        phase: 'starting'
      })
    ).toBe('retry')
    expect(
      applyHeldBusyFollowUp({
        intent: 'steer',
        accepted: { ok: false, reason: 'no_active_turn' },
        phase: 'live'
      })
    ).toBe('retry')
    expect(
      applyHeldBusyFollowUp({
        intent: 'steer',
        accepted: { ok: false, reason: 'no_active_turn' },
        phase: 'idle'
      })
    ).toBe('send')
    expect(
      applyHeldBusyFollowUp({
        intent: 'steer',
        accepted: { ok: true, id: 's-held' },
        phase: 'starting'
      })
    ).toBe('pending')
    expect(applyHeldBusyFollowUp({ intent: 'queue', phase: 'starting' })).toBe('queue')
  })
})
