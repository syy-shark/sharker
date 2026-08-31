/**
 * 内置浏览器批注（对标 Codex Annotation mode / Comment on the page）。
 * 点元素或拖选区域后写成 composer Selection 芯片，不灌整页进对话柱。
 * Comment on the page 用官方 When a bug is visible… / Write and save… / Comments work best…。
 * 不发明 @Browser / Computer Use / Adjust 样式预览。
 * @see shared/ARCH.md
 */

/** Official built-in browser mode (learn.chatgpt.com/docs/browser: Turn on Annotation mode). */
export const ANNOTATION_MODE_LABEL = 'Annotation mode'
/** Official Comment on the page leftover (learn.chatgpt.com/docs/browser). Skip @Browser / Adjust. */
export const BROWSER_COMMENTS_INTRO =
  'When a bug is visible only in the rendered page, use browser comments to give ChatGPT precise feedback.'
export const BROWSER_WRITE_SAVE_HINT = 'Write and save your comment.'
export const BROWSER_NAME_PROBLEM_HINT =
  'Comments work best when you name the problem and the result you want:'

export const BROWSER_COMMENT_PREFIX = '__SHARKER_BROWSER_COMMENT__'

export type BrowserCommentKind = 'element' | 'area'

export type BrowserCommentPick = {
  kind: BrowserCommentKind
  url: string
  selector: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  viewport: { width: number; height: number }
  /** ⌘/Ctrl+点：立刻写入芯片，不弹备注框（对标 Codex Hold Cmd while clicking） */
  immediate?: boolean
}

/** Shift+点或拖选 → 区域；普通点击 → 元素（对标 Codex hold Shift and click to select an area） */
export function browserCommentPickKind(
  event: { shiftKey?: boolean },
  dragged: boolean
): BrowserCommentKind {
  return event.shiftKey || dragged ? 'area' : 'element'
}

/** ⌘/Ctrl+点立刻提交批注 */
export function shouldSubmitBrowserCommentImmediately(event: {
  metaKey?: boolean
  ctrlKey?: boolean
}): boolean {
  return Boolean(event.metaKey || event.ctrlKey)
}

/** http(s) / file 页可批注；起始 data URL 与 about: 不行 */
export function canAnnotateBrowserUrl(url: string): boolean {
  const raw = String(url || '').trim()
  if (!raw) return false
  if (/^(data:|about:)/i.test(raw)) return false
  return /^(https?:|file:)/i.test(raw)
}

/** 官方 ⌘.：切换浏览 / 批注（仅浏览器聚焦时由宿主判断） */
export function isBrowserAnnotateToggleChord(event: {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}): boolean {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === '.'
}

/** 已在批注中可关掉；起始页不打开 */
export function shouldToggleBrowserAnnotate(url: string, annotating: boolean): boolean {
  return annotating || canAnnotateBrowserUrl(url)
}

/** 从 webview console-message 抽出批注点 */
export function parseBrowserCommentMessage(message: string): BrowserCommentPick | 'cancel' | null {
  const raw = String(message || '')
  if (!raw.startsWith(BROWSER_COMMENT_PREFIX)) return null
  const json = raw.slice(BROWSER_COMMENT_PREFIX.length)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const rec = parsed as Record<string, unknown>
  if (rec.type === 'cancel') return 'cancel'
  const kind = rec.kind === 'area' ? 'area' : rec.kind === 'element' ? 'element' : ''
  if (!kind) return null
  const url = String(rec.url || '').trim()
  const selector = String(rec.selector || '').trim()
  const text = String(rec.text || '').replace(/\s+/g, ' ').trim()
  const immediate = shouldSubmitBrowserCommentImmediately({
    metaKey: Boolean(rec.immediate || rec.metaKey),
    ctrlKey: Boolean(rec.ctrlKey)
  })
  const rect = rec.rect && typeof rec.rect === 'object' ? (rec.rect as Record<string, unknown>) : {}
  const viewport =
    rec.viewport && typeof rec.viewport === 'object' ? (rec.viewport as Record<string, unknown>) : {}
  const box = {
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    width: Math.max(0, Number(rect.width) || 0),
    height: Math.max(0, Number(rect.height) || 0)
  }
  return {
    kind,
    url,
    selector,
    text,
    rect: box,
    viewport: {
      width: Math.max(1, Number(viewport.width) || 1),
      height: Math.max(1, Number(viewport.height) || 1)
    },
    ...(immediate ? { immediate: true } : {})
  }
}

/** 芯片 / 模型看到的摘录：可见文本在前，避免芯片只露长 URL */
export function formatBrowserCommentExcerpt(pick: BrowserCommentPick): string {
  const url = String(pick.url || '').trim()
  const lines: string[] = []
  const text = String(pick.text || '').trim()
  if (text) lines.push(text)
  if (pick.kind === 'area') {
    const { x, y, width, height } = pick.rect
    lines.push(`Area ${Math.round(x)},${Math.round(y)} ${Math.round(width)}×${Math.round(height)}`)
  } else if (pick.selector) {
    lines.push(pick.selector)
  }
  if (url) lines.push(url)
  return lines.join('\n')
}

/** 批注气泡贴在选区下方，给输入框留边 */
export function placeBrowserCommentPopover(
  rect: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  host: { width: number; height: number }
): { top: number; left: number } {
  const sx = host.width / Math.max(1, viewport.width)
  const sy = host.height / Math.max(1, viewport.height)
  const top = Math.min(rect.y * sy + rect.height * sy + 8, host.height - 148)
  const left = Math.min(Math.max(rect.x * sx, 8), host.width - 248)
  return { top: Math.max(8, top), left: Math.max(8, left) }
}

/** 注入访客页：开批注后点元素或拖选区域，经 console-message 回传 */
export function browserCommentAnnotateScript(): string {
  const prefix = JSON.stringify(BROWSER_COMMENT_PREFIX)
  return `(function(){
  if (window.__sharkerBrowserComment) return;
  var PREFIX = ${prefix};
  var state = { on: false, drag: null, hl: null, box: null };
  function emit(payload){ try { console.log(PREFIX + JSON.stringify(payload)); } catch (e) {} }
  function clear(){
    if (state.hl) { try { state.hl.style.outline = ''; } catch (e) {} state.hl = null; }
    if (state.box && state.box.parentNode) state.box.parentNode.removeChild(state.box);
    state.box = null;
  }
  function cssPath(el){
    if (!el || el.nodeType !== 1) return '';
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id;
    var parts = [];
    var node = el;
    for (var i = 0; i < 5 && node && node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() !== 'html'; i++) {
      var tag = node.tagName.toLowerCase();
      var sel = tag;
      var parent = node.parentElement;
      if (parent) {
        var same = [];
        for (var c = 0; c < parent.children.length; c++) {
          if (parent.children[c].tagName === node.tagName) same.push(parent.children[c]);
        }
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(sel);
      node = parent;
    }
    return parts.join('>');
  }
  function label(el){
    if (!el) return '';
    var t = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('alt') || '').replace(/\\s+/g, ' ').trim();
    return t.slice(0, 160);
  }
  function viewport(){ return { width: window.innerWidth || 1, height: window.innerHeight || 1 }; }
  function pick(el, kind, rect){
    var r = rect || (el && el.getBoundingClientRect ? el.getBoundingClientRect() : { x:0,y:0,width:0,height:0 });
    return {
      type: 'pick',
      kind: kind,
      url: String(location.href || ''),
      selector: kind === 'element' ? cssPath(el) : '',
      text: kind === 'element' ? label(el) : '',
      rect: { x: r.x || r.left || 0, y: r.y || r.top || 0, width: r.width || 0, height: r.height || 0 },
      viewport: viewport()
    };
  }
  function ensureBox(){
    if (state.box) return state.box;
    var box = document.createElement('div');
    box.setAttribute('data-sharker-ann-box', '1');
    box.style.cssText = 'position:fixed;z-index:2147483646;border:1.5px solid #007aff;background:rgba(0,122,255,0.12);pointer-events:none;';
    document.documentElement.appendChild(box);
    state.box = box;
    return box;
  }
  window.__sharkerBrowserComment = {
    set: function(on){ state.on = !!on; if (!on) { state.drag = null; clear(); } },
    on: function(){ return state.on; }
  };
  document.addEventListener('keydown', function(e){
    if (!state.on || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    emit({ type: 'cancel' });
  }, true);
  document.addEventListener('mousemove', function(e){
    if (!state.on) return;
    if (state.drag) {
      var box = ensureBox();
      var x = Math.min(state.drag.x, e.clientX);
      var y = Math.min(state.drag.y, e.clientY);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.width = Math.abs(e.clientX - state.drag.x) + 'px';
      box.style.height = Math.abs(e.clientY - state.drag.y) + 'px';
      return;
    }
    var el = e.target;
    if (!(el instanceof Element) || el === state.hl) return;
    if (state.hl) try { state.hl.style.outline = ''; } catch (err) {}
    state.hl = el;
    try { el.style.outline = '2px solid #007aff'; el.style.outlineOffset = '1px'; } catch (err) {}
  }, true);
  document.addEventListener('mousedown', function(e){
    if (!state.on || e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('[data-sharker-ann-box]')) return;
    e.preventDefault();
    e.stopPropagation();
    state.drag = { x: e.clientX, y: e.clientY, t: e.target, shift: !!e.shiftKey, meta: !!(e.metaKey || e.ctrlKey) };
  }, true);
  document.addEventListener('mouseup', function(e){
    if (!state.on || !state.drag) return;
    e.preventDefault();
    e.stopPropagation();
    var start = state.drag;
    state.drag = null;
    var dx = e.clientX - start.x;
    var dy = e.clientY - start.y;
    var dragged = Math.hypot(dx, dy) >= 6;
    var kind = (start.shift || e.shiftKey || dragged) ? 'area' : 'element';
    var immediate = !!(start.meta || e.metaKey || e.ctrlKey);
    clear();
    var payload;
    if (kind === 'element') payload = pick(start.t, 'element');
    else if (dragged) {
      var x = Math.min(start.x, e.clientX);
      var y = Math.min(start.y, e.clientY);
      payload = pick(null, 'area', { x: x, y: y, width: Math.abs(dx), height: Math.abs(dy) });
    } else {
      payload = pick(start.t, 'area');
    }
    if (immediate) payload.immediate = true;
    emit(payload);
  }, true);
  document.addEventListener('click', function(e){
    if (!state.on) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
})();`
}

/** 开关访客页批注层；脚本未注入时先注入 */
export function browserCommentSetScript(on: boolean): string {
  return `${browserCommentAnnotateScript()}window.__sharkerBrowserComment&&window.__sharkerBrowserComment.set(${on ? 'true' : 'false'});document.documentElement.style.cursor=${on ? "'crosshair'" : "''"};`
}
