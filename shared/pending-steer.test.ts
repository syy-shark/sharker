import { describe, expect, it } from 'vitest'
import {
  appendConsumedSteerMessage,
  cancelPendingSteer,
  createPendingSteer,
  drainPendingSteers,
  enqueuePendingSteer,
  formatSteerForModel,
  listPendingSteers,
  shouldDrainPendingSteers,
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
  })
})
