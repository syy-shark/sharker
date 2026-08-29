/**
 * 按会话记住对话柱滚动位置（对标 Codex app 26.406
 * “Preserved thread scroll position per conversation”）。
 * 只做窗口内内存快照：切对话 / 离开聊天页再回来仍在原处；不落盘、不跨窗口。
 */

/** 窗口内按会话记下的对话柱位置（含长线程窗口起点） */
export type TranscriptScrollSnapshot = {
  scrollTop: number
  distanceFromBottom: number
  scrollHeight: number
  clientHeight: number
  stickToBottom: boolean
  userLocked: boolean
  /** 读历史时钉住的窗口起点；贴底为 null，跟最近一段走 */
  transcriptWindowStart?: number | null
}

/** 对话柱滚动盒的几何，供快照与恢复使用 */
export type TranscriptScrollBox = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** 记下当前滚动盒与是否钉住长线程窗口 */
export function captureTranscriptScroll(
  el: TranscriptScrollBox,
  stickToBottom: boolean,
  userLocked: boolean,
  transcriptWindowStart: number | null = null
): TranscriptScrollSnapshot {
  const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
  return {
    scrollTop: el.scrollTop,
    distanceFromBottom: Math.max(0, maxTop - el.scrollTop),
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    stickToBottom,
    userLocked,
    transcriptWindowStart
  }
}

/** 按快照算出应写的 scrollTop，以及是否继续贴底 */
export function resolveRestoredScrollTop(
  el: Pick<TranscriptScrollBox, 'scrollHeight' | 'clientHeight'>,
  snap: TranscriptScrollSnapshot | null | undefined
): { scrollTop: number; stickToBottom: boolean; userLocked: boolean } {
  const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
  if (!snap) {
    return { scrollTop: maxTop, stickToBottom: true, userLocked: false }
  }
  if (snap.stickToBottom && !snap.userLocked) {
    return { scrollTop: maxTop, stickToBottom: true, userLocked: false }
  }
  const userLocked = snap.userLocked || !snap.stickToBottom
  if (el.scrollHeight >= snap.scrollHeight) {
    return {
      scrollTop: Math.min(Math.max(0, snap.scrollTop), maxTop),
      stickToBottom: false,
      userLocked
    }
  }
  return {
    scrollTop: Math.max(0, maxTop - snap.distanceFromBottom),
    stickToBottom: false,
    userLocked
  }
}

/** 内容还没画到保存时的高度（图 / mermaid）时先按距底占位，等高了再钉 scrollTop */
export function shouldDeferScrollRestore(
  el: Pick<TranscriptScrollBox, 'scrollHeight' | 'clientHeight'>,
  snap: TranscriptScrollSnapshot | null | undefined
): boolean {
  if (!snap || (snap.stickToBottom && !snap.userLocked)) return false
  return el.scrollHeight + 8 < snap.scrollHeight
}
