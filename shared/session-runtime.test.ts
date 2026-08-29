import { describe, expect, it } from 'vitest'
import {
  appendAssistantMessage,
  historicalMessagesDuringLive,
  hasLiveAssistantBody,
  liveRowMessageId,
  shouldRenderLiveAssistantRow,
  upsertAssistantMessage,
  cancelQueuedPrompt,
  clearDoneCommitted,
  createQueuedPrompt,
  dequeueForConversation,
  enqueueForConversation,
  moveQueuedPrompt,
  takeQueuedPrompt,
  updateQueuedPromptText,
  isDoneCommittedFor,
  listQueuedForConversation,
  markDoneCommitted,
  nextFollowUpAfterTurn,
  resolveCommitConversationId,
  resolveStopAction,
  shouldAcceptDoneEvent,
  shouldApplyStreamToActive,
  shouldCommitToActiveUi,
  type DoneCommittedMap
} from './session-runtime'
import type { ChatMessage } from './types'

describe('session / queue isolation', () => {
  it('follow-up queued under A never dispatches under B after a switch', () => {
    let queues = {}
    const itemA = createQueuedPrompt('conv-a', 'follow-up for A', undefined, 'qa1', {
      providerId: 'openai-chatgpt',
      thinkingLevel: 'high'
    })
    queues = enqueueForConversation(queues, 'conv-a', itemA)
    expect(listQueuedForConversation(queues, 'conv-a')[0]).toMatchObject({
      providerId: 'openai-chatgpt',
      thinkingLevel: 'high'
    })

    // 用户切到 B：A 的队列仍在 A 下
    expect(listQueuedForConversation(queues, 'conv-b')).toEqual([])
    expect(listQueuedForConversation(queues, 'conv-a')).toHaveLength(1)

    // B 完成一轮后只应取 B 的队列（空）
    const afterB = nextFollowUpAfterTurn(queues, 'conv-b')
    expect(afterB.next).toBeNull()
    expect(listQueuedForConversation(afterB.queues, 'conv-a')).toHaveLength(1)

    // A 完成后才拿到 A 的 follow-up
    const afterA = nextFollowUpAfterTurn(afterB.queues, 'conv-a')
    expect(afterA.next?.id).toBe('qa1')
    expect(afterA.next?.conversationId).toBe('conv-a')
    expect(afterA.next?.text).toBe('follow-up for A')
    expect(listQueuedForConversation(afterA.queues, 'conv-a')).toEqual([])
  })

  it('enqueue/dequeue never cross conversation boundaries', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'A1', undefined, 'a1')
    )
    queues = enqueueForConversation(
      queues,
      'conv-b',
      createQueuedPrompt('conv-b', 'B1', undefined, 'b1')
    )
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'A2', undefined, 'a2')
    )

    const dA = dequeueForConversation(queues, 'conv-a')
    expect(dA.next?.id).toBe('a1')
    const dB = dequeueForConversation(dA.queues, 'conv-b')
    expect(dB.next?.id).toBe('b1')
    const dA2 = dequeueForConversation(dB.queues, 'conv-a')
    expect(dA2.next?.id).toBe('a2')
  })

  it('stream chunks for A do not apply while B is active', () => {
    expect(shouldApplyStreamToActive('conv-a', 'conv-b')).toBe(false)
    expect(shouldApplyStreamToActive('conv-a', 'conv-a')).toBe(true)
    expect(shouldApplyStreamToActive(undefined, 'conv-a')).toBe(false)
    expect(shouldApplyStreamToActive('conv-a', null)).toBe(false)
  })

  it('cancel only removes the target prompt in its conversation', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'keep', undefined, 'keep')
    )
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'drop', undefined, 'drop')
    )
    queues = cancelQueuedPrompt(queues, 'conv-a', 'drop')
    expect(listQueuedForConversation(queues, 'conv-a').map((q) => q.id)).toEqual(['keep'])
  })

  it('edits, reorders, and takes a queued prompt in its conversation', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'first', undefined, 'a1')
    )
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'second', undefined, 'a2')
    )
    queues = enqueueForConversation(
      queues,
      'conv-b',
      createQueuedPrompt('conv-b', 'other', undefined, 'b1')
    )
    queues = updateQueuedPromptText(queues, 'conv-a', 'a2', 'second edited')
    queues = moveQueuedPrompt(queues, 'conv-a', 'a2', -1)
    expect(listQueuedForConversation(queues, 'conv-a').map((q) => q.id)).toEqual(['a2', 'a1'])
    expect(listQueuedForConversation(queues, 'conv-a')[0]?.text).toBe('second edited')
    const taken = takeQueuedPrompt(queues, 'conv-a', 'a2')
    expect(taken.item?.text).toBe('second edited')
    expect(listQueuedForConversation(taken.queues, 'conv-a').map((q) => q.id)).toEqual(['a1'])
    expect(listQueuedForConversation(taken.queues, 'conv-b').map((q) => q.id)).toEqual(['b1'])
  })

  it('does not drain the follow-up queue while held', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'later', undefined, 'q1')
    )
    const held = nextFollowUpAfterTurn(queues, 'conv-a', { held: true })
    expect(held.next).toBeNull()
    expect(listQueuedForConversation(held.queues, 'conv-a')).toHaveLength(1)
  })
})

describe('stop / done ownership (Stop while other session queued)', () => {
  it('Stop only targets the visible busy session — not a global commit', () => {
    // A in-flight, user switched to B and B is busy (queued on turnChain)
    const onB = resolveStopAction({
      activeConversationId: 'conv-b',
      activeIsBusy: true
    })
    expect(onB.abortConversationId).toBe('conv-b')
    expect(onB.commitStopToConversationId).toBe('conv-b')
    // 不 busy 时不 abort（不能误杀 A）
    expect(
      resolveStopAction({ activeConversationId: 'conv-b', activeIsBusy: false })
    ).toEqual({ abortConversationId: null, commitStopToConversationId: null })
  })

  it('doneCommitted on B does not drop A’s done (and B real done is still gated)', () => {
    let map: DoneCommittedMap = {}
    // 用户在 B 上点 Stop
    map = markDoneCommitted(map, 'conv-b')
    expect(isDoneCommittedFor(map, 'conv-b')).toBe(true)
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(false)
    // A 的 done 仍必须接受
    expect(shouldAcceptDoneEvent(map, 'conv-a')).toBe(true)
    map = markDoneCommitted(map, 'conv-a')
    // B 重新开 turn 后可再接受
    map = clearDoneCommitted(map, 'conv-b')
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(true)
  })

  it('simulates Stop-on-B while A running: B stop gate must not block A done or B restart', () => {
    let map: DoneCommittedMap = {}
    // A running; B send queued then user Stop on B
    const stop = resolveStopAction({ activeConversationId: 'conv-b', activeIsBusy: true })
    map = markDoneCommitted(map, stop.commitStopToConversationId!)
    // A finishes while user still on B
    expect(shouldAcceptDoneEvent(map, 'conv-a')).toBe(true)
    map = markDoneCommitted(map, 'conv-a')
    // B was cancelled before start — its synthetic done is rejected (already stopped)
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(false)
    // User sends again on B
    map = clearDoneCommitted(map, 'conv-b')
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(true)
  })
})

describe('commitAssistantReply persist targeting', () => {
  it('resolves commit id from explicit > streamOwner > active (never silent active-only)', () => {
    expect(
      resolveCommitConversationId({
        explicitId: 'conv-a',
        streamOwnerId: 'conv-b',
        activeConversationId: 'conv-c'
      })
    ).toBe('conv-a')
    expect(
      resolveCommitConversationId({
        explicitId: null,
        streamOwnerId: 'conv-a',
        activeConversationId: 'conv-b'
      })
    ).toBe('conv-a')
    expect(
      resolveCommitConversationId({
        explicitId: null,
        streamOwnerId: null,
        activeConversationId: 'conv-b'
      })
    ).toBe('conv-b')
  })

  it('does not apply A’s assistant to active UI when viewing B', () => {
    expect(shouldCommitToActiveUi('conv-a', 'conv-b')).toBe(false)
    expect(shouldCommitToActiveUi('conv-b', 'conv-b')).toBe(true)
  })

  it('appendAssistantMessage is pure and used as the persist source for a target id', () => {
    const base: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi' }
    ]
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'reply for A'
    }
    const next = appendAssistantMessage(base, assistant)
    expect(next).toHaveLength(2)
    expect(next[1].content).toBe('reply for A')
    // 目标会话 A 的 next 必须带 explicit id 去 persist — 调用方契约
    const persistTarget = resolveCommitConversationId({
      explicitId: 'conv-a',
      activeConversationId: 'conv-b'
    })
    expect(persistTarget).toBe('conv-a')
    expect(shouldCommitToActiveUi(persistTarget, 'conv-b')).toBe(false)
    // B 的 transcript 不被 next 污染
    const bMessages: ChatMessage[] = [{ id: 'u2', role: 'user', content: 'on B' }]
    expect(bMessages).toHaveLength(1)
    expect(appendAssistantMessage(bMessages, assistant)[0].content).toBe('on B')
    // 直播行预留 id：查找/DOM 与收束后历史行同一条，直播中历史列先藏起来
    expect(liveRowMessageId('a1')).toBe('a1')
    expect(liveRowMessageId('')).toBe('streaming')
    expect(liveRowMessageId(null)).toBe('streaming')
    const reserved: ChatMessage = { id: 'a-live', role: 'assistant', content: 'draft' }
    const liveTranscript = [...base, reserved]
    expect(historicalMessagesDuringLive(liveTranscript, 'a-live', true).map((m) => m.id)).toEqual([
      'u1'
    ])
    expect(historicalMessagesDuringLive(liveTranscript, 'a-live', false).map((m) => m.id)).toEqual([
      'u1',
      'a-live'
    ])
    expect(
      historicalMessagesDuringLive(liveTranscript, 'a-live', true, false).map((m) => m.id)
    ).toEqual(['u1', 'a-live'])
    expect(hasLiveAssistantBody({ streaming: '', liveSegmentCount: 0 })).toBe(false)
    expect(hasLiveAssistantBody({ streaming: 'hi' })).toBe(true)
    expect(hasLiveAssistantBody({ liveSegmentCount: 2 })).toBe(true)
    expect(hasLiveAssistantBody({ thinking: '思考' })).toBe(true)
    expect(hasLiveAssistantBody({ approvalWaiting: true })).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: true,
        hasLiveBody: false,
        historyHasReserved: true
      })
    ).toBe(false)
    expect(
      shouldRenderLiveAssistantRow({
        loading: true,
        hasLiveBody: false,
        historyHasReserved: false
      })
    ).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: true,
        hasLiveBody: true,
        historyHasReserved: true
      })
    ).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: false,
        hasLiveBody: true,
        historyHasReserved: true
      })
    ).toBe(false)
    const committed: ChatMessage = { id: 'a-live', role: 'assistant', content: 'final' }
    const upserted = upsertAssistantMessage(liveTranscript, committed)
    expect(upserted).toHaveLength(2)
    expect(upserted[1]).toEqual(committed)
    expect(upsertAssistantMessage(base, committed)[1].id).toBe('a-live')
  })
})


describe('background stream ownership UI gating', () => {
  it('background turn_start does not apply while another conversation is active', () => {
    expect(shouldApplyStreamToActive('conv-a', 'conv-b')).toBe(false)
    expect(shouldApplyStreamToActive('conv-b', 'conv-b')).toBe(true)
  })
})
