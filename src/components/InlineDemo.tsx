/**
 * 对话原生内联演示：无外框、透明背景、高度跟真实内容底边，嵌进助手正文如 Markdown。
 * 直播中父页不挂全树量高 ResizeObserver，只信估高与 iframe postMessage。
 * 假终端只给日志块套 macOS 三色灯；整页灰卡片会被拆掉。
 * @see ./ARCH.md
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  isInlineDemoPaintable,
  seedInlineDemoHeight,
  shouldMeasureInlineDemoInParent,
  writeCachedInlineDemoHeight
} from '../../shared/live-display'
import './InlineDemo.css'

export interface InlineDemoProps {
  /** 完整 HTML 片段或文档（CSS/JS 可内联） */
  html: string
  /** 可选轻标题；默认不显示，避免「外框感」 */
  caption?: string
  /** 工具参数 / 围栏仍在生成：节流刷新 iframe，做多少显示多少 */
  streaming?: boolean
}

type ThemeVars = Record<string, string>

function readHostTheme(): ThemeVars {
  const cs = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim()
    return v || fallback
  }
  const isDark = document.documentElement.classList.contains('theme-dark')
  return {
    text: pick('--text', isDark ? '#f4f4f5' : '#1d1d1f'),
    textSecondary: pick('--text-secondary', isDark ? 'rgba(244,244,245,0.72)' : 'rgba(29,29,31,0.72)'),
    textMuted: pick('--text-muted', isDark ? 'rgba(244,244,245,0.48)' : 'rgba(29,29,31,0.48)'),
    accent: pick('--accent', '#007aff'),
    accentSoft: pick('--accent-soft', 'rgba(0,122,255,0.14)'),
    border: pick('--glass-edge', isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)'),
    borderSoft: pick('--glass-edge-soft', isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
    bg: pick('--bg-base', isDark ? '#0b0d11' : '#e8eaed'),
    surface: pick('--glass-fill-raised', isDark ? '#2c313b' : 'rgba(255,255,255,0.28)'),
    surfaceNested: pick('--glass-fill-nested', isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.16)'),
    surfacePopover: pick('--glass-fill-popover', isDark ? '#1c2129' : 'rgba(255,255,255,0.4)'),
    danger: pick('--danger', '#ff3b30'),
    success: pick('--success', '#34c759'),
    radius: pick('--radius', '16px'),
    radiusSm: pick('--radius-sm', '12px'),
    font: pick('--font', 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif'),
    mono: pick('--mono', 'ui-monospace, SFMono-Regular, Menlo, monospace'),
    isDark: isDark ? '1' : '0'
  }
}

/** 把演示 HTML 打成透明 srcDoc：注入主题、解开根裁切、按内容底边 postMessage 高度。 */
function buildSrcDoc(html: string, theme: ThemeVars, demoId: string): string {
  const isDark = theme.isDark === '1'

  /**
   * 终端窗壳（对齐 macOS Terminal / 参考截图）：
   * - 左上三色灯 + 顶栏居中标题 user@host — zsh — 80×24
   * - 默认深色炭黑窗（浅色聊天里也用，命令色才好看）
   * - 浅色主题另有 .sharker-term--glass 水滴玻璃变体
   */
  const hostCss = `
:root {
  color-scheme: ${isDark ? 'dark' : 'light'};
  --text: ${theme.text};
  --text-secondary: ${theme.textSecondary};
  --text-muted: ${theme.textMuted};
  --accent: ${theme.accent};
  --accent-soft: ${theme.accentSoft};
  --border: ${theme.border};
  --border-soft: ${theme.borderSoft};
  --bg: ${theme.bg};
  --surface: ${theme.surface};
  --surface-nested: ${theme.surfaceNested};
  --surface-popover: ${theme.surfacePopover};
  --danger: ${theme.danger};
  --success: ${theme.success};
  --radius: ${theme.radius};
  --radius-sm: ${theme.radiusSm};
  --font: ${theme.font};
  --mono: ${theme.mono};
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 100%;
  /* max-content：高度跟内容，不跟 iframe 视口（否则 flex 子项被压矮，量到的还是裁切高度） */
  height: max-content !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
body {
  padding: 0;
}
body::-webkit-scrollbar,
html::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
/* 布局安全：文字/控件不溢出卡片，多栏可收缩 */
img, svg, video, canvas, table, pre, code {
  max-width: 100%;
}
button, input, select, textarea, a, [role="button"] {
  font: inherit;
  color: inherit;
  pointer-events: auto !important;
  cursor: pointer;
}
button:disabled, [aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}
/* 外层根：高度跟内容、不裁切。背景/边框由 harmonizeSurfaces 判断是否整页壳。 */
body > *:not(canvas):not(svg):not(script):not(style):not(link) {
  height: max-content !important;
  max-height: none !important;
  min-height: 0 !important;
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
}
.demo-card, .card, .panel, .box,
[class*="zone"], [class*="Zone"], [class*="card"], [class*="Card"] {
  max-width: 100%;
  min-width: 0;
  height: auto !important;
  max-height: none !important;
  overflow-wrap: anywhere;
  word-break: break-word;
}
/* 常见三栏/横向 flex：窄宽时换行，避免挤成竖条叠在一起 */
.row, .zones, .columns, .grid-3,
[style*="display:flex"], [style*="display: flex"] {
  max-width: 100%;
}
.hint, .tip, .callout, .note {
  background: var(--accent-soft);
  color: var(--text);
  border: 0.5px solid var(--border-soft);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}

/* —— macOS 终端窗：三色灯 + 居中标题 —— */
.sharker-term {
  --term-titlebar-h: 36px;
  --term-fg: rgba(232, 234, 237, 0.94);
  --term-fg-muted: rgba(232, 234, 237, 0.42);
  --term-chrome: #2a2d33;
  --term-chrome-border: rgba(255, 255, 255, 0.08);
  --term-body: #1c1e22;
  --term-shadow: 0 12px 40px rgba(0, 0, 0, 0.22), 0 1px 0 rgba(255,255,255,0.06) inset;

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 10px 0 12px;
  overflow: hidden;
  border: 0.5px solid var(--term-chrome-border);
  border-radius: 14px;
  background: var(--term-body);
  box-shadow: var(--term-shadow);
  color: var(--term-fg);
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.55;
}
/* 水滴玻璃变体（浅色聊天可选） */
.sharker-term--glass {
  --term-fg: rgba(29, 29, 31, 0.92);
  --term-fg-muted: rgba(29, 29, 31, 0.42);
  --term-chrome: rgba(255, 255, 255, 0.55);
  --term-chrome-border: rgba(255, 255, 255, 0.55);
  --term-body: linear-gradient(165deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.28) 100%);
  --term-shadow: 0 10px 28px rgba(60, 50, 40, 0.08), inset 0 0.5px 0 rgba(255,255,255,0.9);
  background: var(--term-body);
  backdrop-filter: blur(22px) saturate(1.45);
  -webkit-backdrop-filter: blur(22px) saturate(1.45);
}
.sharker-term-titlebar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: var(--term-titlebar-h);
  padding: 0 72px;
  background: var(--term-chrome);
  border-bottom: 0.5px solid var(--term-chrome-border);
  user-select: none;
}
.sharker-term-traffic {
  position: absolute;
  left: 12px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 7px;
  transform: translateY(-50%);
}
.sharker-term-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow:
    inset 0 -0.5px 0.5px rgba(0, 0, 0, 0.22),
    0 0.5px 0.5px rgba(255, 255, 255, 0.12);
}
.sharker-term-dot--close { background: #ff5f57; }
.sharker-term-dot--min { background: #febc2e; }
.sharker-term-dot--max { background: #28c840; }
.sharker-term-title {
  max-width: 100%;
  overflow: hidden;
  color: var(--term-fg-muted);
  font-family: var(--font);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sharker-term-body {
  margin: 0;
  padding: 10px 14px 12px;
  /* 终端日志也完整展开，不在块内再出滚动条 */
  overflow: visible !important;
  max-height: none !important;
  color: var(--term-fg);
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  font-family: var(--mono) !important;
  font-size: 12.5px !important;
  line-height: 1.45 !important;
}
/* 清掉容器黑底/定位/撑高；行距紧凑，不留演示用空槽 */
.sharker-term-body,
.sharker-term-body * {
  max-width: 100%;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
}
.sharker-term-body > * {
  background: transparent !important;
  background-image: none !important;
  border: none !important;
  box-shadow: none !important;
  margin: 0 !important;
  padding: 0 !important;
  color: var(--term-fg);
  font-family: var(--mono) !important;
  font-size: 12.5px !important;
  line-height: 1.45 !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
/* 空块 / 占位槽直接藏掉，避免大空白 */
.sharker-term-body .sharker-term-empty {
  display: none !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
/* 默认亮字；语义色由内联 span 的绿/红/青覆盖 */
.sharker-term-body,
.sharker-term-body * {
  color: var(--term-fg);
}
.sharker-term-body .ok,
.sharker-term-body .success,
.sharker-term-body .prompt-user,
.sharker-term-body .user {
  color: #3dd68c !important;
}
.sharker-term-body .err,
.sharker-term-body .error,
.sharker-term-body .fail {
  color: #ff7b72 !important;
}
.sharker-term-body .cmd,
.sharker-term-body .command,
.sharker-term-body .accent {
  color: #79c0ff !important;
}
.sharker-term-body .comment,
.sharker-term-body .muted {
  color: var(--term-fg-muted) !important;
}
/* 终端日志行：紧挨着，禁止被空 flex 子项撑开 */
.sharker-term-body .sharker-term-log {
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  white-space: pre-wrap !important;
  line-height: 1.45 !important;
}
.sharker-term-body .sharker-term-log > div,
.sharker-term-body .sharker-term-log > p,
.sharker-term-body .sharker-term-log > span {
  display: block;
  margin: 0 !important;
  padding: 0 !important;
  min-height: 0 !important;
  height: auto !important;
}

/* —— 提交历史等看板：去掉无意义的大空板 —— */
.sharker-history-fix,
[class*="commit-history"],
[class*="CommitHistory"],
[data-panel="history"] {
  min-height: 0 !important;
  height: auto !important;
}
.sharker-history-fix .sharker-empty-slot,
[class*="commit-history"] .empty,
[class*="commit-history"] .placeholder {
  display: none !important;
}
`

  // 注入脚本：只给「演示里的假终端块」套 macOS 窗壳，绝不包住整个内联可视化
  const enhanceScript = `
<script>
(function () {
  var id = ${JSON.stringify(demoId)};
  var isDark = ${isDark ? 'true' : 'false'};

  function parseRgb(color) {
    if (!color) return null;
    var m = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    m = color.match(/#([0-9a-f]{3,8})/i);
    if (m) {
      var hex = m[1];
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      if (hex.length < 6) return null;
      return {
        r: parseInt(hex.slice(0,2), 16),
        g: parseInt(hex.slice(2,4), 16),
        b: parseInt(hex.slice(4,6), 16)
      };
    }
    return null;
  }

  function luminance(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  function isDarkColor(color) {
    var c = parseRgb(color);
    if (!c) return false;
    // 透明不算
    if (color.indexOf('rgba') === 0 && /rgba\\([^)]*,\\s*0(?:\\.0+)?\\s*\\)/.test(color)) return false;
    return luminance(c) < 0.32;
  }

  /** 深色终端托盘：solid / gradient / inline style */
  function isVisuallyDarkPanel(el) {
    var style = window.getComputedStyle(el);
    if (isDarkColor(style.backgroundColor)) return true;
    var bgImg = style.backgroundImage || '';
    if (bgImg && bgImg !== 'none') {
      if (/#0[0-9a-f]{2,5}|#1[0-4][0-9a-f]{4}|rgb\\(\\s*([0-3]?\\d)\\s*,\\s*\\1\\s*,\\s*\\1/i.test(bgImg)) return true;
      if (/rgba?\\(\\s*([0-4]?\\d)\\s*,\\s*\\1\\s*,\\s*\\1/i.test(bgImg)) return true;
    }
    var inline = (el.getAttribute('style') || '') + ' ' + (el.className || '');
    if (/#0{3,6}\\b|#0d1117|#111|#1[a-e]1[a-e]1[a-e]|#21262d|#282c34|background:\\s*black/i.test(inline)) return true;
    return false;
  }

  /**
   * 像 shell / 命令日志输出（含「$ # 注释」这种演示日志）
   */
  function textLooksLikeShell(el) {
    var t = (el.innerText || el.textContent || '').trim();
    if (!t || t.length < 1) return false;
    if (/[$%]\\s*#/.test(t)) return true;               // $ # comment
    if (/^\\s*[$%#>]\\s/m.test(t)) return true;          // prompt 行
    if (/\\b[\\w.-]+@[\\w.-]+/.test(t) && /[%$#]/.test(t)) return true;
    if (/\\bgit\\s+(status|add|commit|log|diff|push|pull)\\b/i.test(t)) return true;
    if (/modified:\\s|Untracked files|Changes not staged|command not found/i.test(t)) return true;
    if (/^total \\d+/m.test(t) && /drwx|rw-|rwx/m.test(t)) return true;
    if (/^\\s*\\$\\s+\\S+/m.test(t)) return true;        // $ command
    return false;
  }

  function hasExplicitTermClass(el) {
    var c = (el.className && String(el.className)) || '';
    if (!c) return false;
    return /(?:^|\\s)(?:demo-terminal|demo-terminal-glass|terminal|console|shell|cmdline|xterm|iterm|term-log|cmd-log|output-log)(?:\\s|$)/i.test(c);
  }

  function alreadyWrapped(el) {
    return !!(el.closest && el.closest('.sharker-term'));
  }

  function hasOwnMacChrome(el) {
    if (el.querySelector && el.querySelector('.sharker-term-traffic, .sharker-term-dot')) return true;
    var nodes = el.querySelectorAll ? el.querySelectorAll('span, i, div') : [];
    var hasR = false, hasY = false, hasG = false;
    for (var i = 0; i < nodes.length && i < 40; i++) {
      var n = nodes[i];
      var st = window.getComputedStyle(n);
      var w = parseFloat(st.width), h = parseFloat(st.height);
      if (!(w >= 8 && w <= 16 && h >= 8 && h <= 16)) continue;
      var br = st.borderRadius;
      if (br.indexOf('50%') === -1 && parseFloat(br) < w / 2 - 1) continue;
      var rgb = parseRgb(st.backgroundColor);
      if (!rgb) continue;
      if (rgb.r > 180 && rgb.g < 120 && rgb.b < 120) hasR = true;
      else if (rgb.r > 180 && rgb.g > 140 && rgb.b < 100) hasY = true;
      else if (rgb.g > 150 && rgb.r < 120 && rgb.b < 120) hasG = true;
    }
    return hasR && hasY && hasG;
  }

  /** 完整可视化看板 / 含操作按钮区 —— 不包 */
  function looksLikeAppUi(el) {
    var t = (el.innerText || '').slice(0, 1200);
    // 单块日志里提到「工作区」可以，但同时出现多栏标签 + 操作按钮则是看板
    var zoneLabels = (t.match(/工作区|暂存区|本地仓库|WORKING|STAGING|REPO/g) || []).length;
    var buttons = el.querySelectorAll ? el.querySelectorAll('button, [role="button"]').length : 0;
    if (buttons >= 2 && zoneLabels >= 2) return true;
    if (/点按钮看|模拟演示 ·|重置演示|Git 三区流水线/u.test(t) && buttons >= 1) return true;
    if (buttons >= 3) return true;
    var kids = el.children ? el.children.length : 0;
    if (kids >= 5 && zoneLabels >= 2) return true;
    var rect = el.getBoundingClientRect();
    var bodyH = document.body ? document.body.scrollHeight : 0;
    if (bodyH > 160 && rect.height > bodyH * 0.7 && kids >= 3) return true;
    return false;
  }

  function defaultTitle(el) {
    var custom = el.getAttribute && (el.getAttribute('data-term-title') || el.getAttribute('data-title'));
    if (custom && custom.trim()) return custom.trim();
    var text = (el.innerText || '').trim();
    var m = text.match(/([\\w.-]+@[\\w.-]+)/);
    var userHost = m ? m[1] : 'shark@sharker';
    var shell = /\\bzsh\\b/i.test(text) ? 'zsh' : /\\bbash\\b/i.test(text) ? 'bash' : 'zsh';
    return userHost + ' \\u2014 ' + shell + ' \\u2014 80\\u00d724';
  }

  function forceReadableText(root) {
    var nodes = [root];
    if (root.querySelectorAll) {
      var qs = root.querySelectorAll('*');
      for (var i = 0; i < qs.length; i++) nodes.push(qs[i]);
    }
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (!n || n.nodeType !== 1) continue;
      var st = window.getComputedStyle(n);
      var c = parseRgb(st.color);
      // 过暗 / 过灰的字 → 提亮（模型常写 dark gray on black）
      if (c && luminance(c) < 0.55) {
        n.style.setProperty('color', 'rgba(232,234,237,0.92)', 'important');
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colorizeLogLine(line) {
    var esc = escapeHtml(line);
    var t = line.trim();
    if (!t) return '';
    if (/^#/.test(t) || /^\\$#/.test(t) || /^\\$\\s*#/.test(t) || /\\$#\\s/.test(t)) {
      return '<span class="comment">' + esc + '</span>';
    }
    if (/^\\[.*\\]/.test(t) || /\\bcommit:\\s/i.test(t) || /已暂存|写入|成功|ready/i.test(t)) {
      return '<span class="ok">' + esc + '</span>';
    }
    if (/error|not found|fatal|failed/i.test(t)) {
      return '<span class="err">' + esc + '</span>';
    }
    if (/^(git|npm|pnpm|yarn|cd|ls|pwd|cat|echo)\\b/.test(t) || /^\\$\\s+\\S/.test(t)) {
      return '<span class="cmd">' + esc + '</span>';
    }
    return esc;
  }

  /**
   * 终端日志：去掉空行/空槽，重排为紧密行。
   * 有 input 的可交互终端不重排，只压缩。
   */
  function densifyTerminalLog(root) {
    if (!root) return;
    var existing = root.querySelector && root.querySelector('pre.sharker-term-log');
    var log = existing || root.firstElementChild || root;

    if (log.querySelector && log.querySelector('input, textarea, button, [contenteditable="true"]')) {
      var nodes = log.querySelectorAll ? log.querySelectorAll('div, p, section, span, pre') : [];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var tx = (n.textContent || '').replace(/[\\u00a0\\u200b\\ufeff]/g, ' ').trim();
        if (!tx && !n.querySelector('input, textarea, button, img, svg')) {
          n.classList.add('sharker-term-empty');
        }
        n.style.setProperty('min-height', '0', 'important');
        n.style.setProperty('height', 'auto', 'important');
      }
      return;
    }

    var raw = (log.innerText || log.textContent || '').replace(/\\r\\n/g, '\\n');
    // 已紧密且无空行 → 不重复改 DOM（避免 MutationObserver 死循环）
    if (existing && !/\\n[ \\t\\u00a0]*\\n/.test(raw)) return;

    var lines = raw.split('\\n');
    var dense = [];
    for (var L = 0; L < lines.length; L++) {
      var line = lines[L].replace(/[ \\t\\u00a0]+$/g, '');
      if (line.trim() === '') continue;
      dense.push(line);
    }
    if (dense.length === 0) return;

    var html = dense.map(colorizeLogLine).filter(Boolean).join('\\n');
    var pre = document.createElement('pre');
    pre.className = 'sharker-term-log';
    pre.setAttribute('data-sharker-dense', '1');
    pre.innerHTML = html;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(pre);
  }

  /** 折叠空节点、去掉撑高 —— 再 densify 成无空行日志 */
  function compactTerminalContent(root) {
    if (!root) return;

    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      n.style.setProperty('min-height', '0', 'important');
      n.style.setProperty('height', 'auto', 'important');
      n.style.setProperty('max-height', 'none', 'important');
      var st = window.getComputedStyle(n);
      if ((parseFloat(st.paddingTop) || 0) > 4) n.style.paddingTop = '0';
      if ((parseFloat(st.paddingBottom) || 0) > 4) n.style.paddingBottom = '0';
      if ((parseFloat(st.marginTop) || 0) > 2) n.style.marginTop = '0';
      if ((parseFloat(st.marginBottom) || 0) > 2) n.style.marginBottom = '0';
    }

    // 空块（含只含 br / 空白）
    for (var k = all.length - 1; k >= 0; k--) {
      var el = all[k];
      if (!el || el.nodeType !== 1) continue;
      if (/^(SCRIPT|STYLE|BR|IMG|SVG|INPUT|TEXTAREA|CANVAS|VIDEO)$/i.test(el.tagName)) continue;
      var text = (el.textContent || '').replace(/[\\u00a0\\u200b\\ufeff\\s]/g, '');
      var hasMedia = el.querySelector && el.querySelector('img, svg, video, canvas, input, textarea, button');
      if (!text && !hasMedia) {
        el.classList.add('sharker-term-empty');
        el.setAttribute('aria-hidden', 'true');
      }
    }

    densifyTerminalLog(root);
  }

  /** 提交历史等：去掉大块空白占位，让内容贴着排 */
  function fixHistoryPanels() {
    var blocks = document.body.querySelectorAll('div, section, article');
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      if (el.closest && el.closest('.sharker-term')) continue;
      var head = (el.innerText || '').slice(0, 120);
      if (!/提交历史|commit history|HEAD\\s*[→\\->]/i.test(head) &&
          !(el.className && /history|commit-graph|git-log/i.test(String(el.className)))) {
        continue;
      }
      el.classList.add('sharker-history-fix');
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('height', 'auto', 'important');

      var kids = el.querySelectorAll ? el.querySelectorAll('div, li, span, p') : [];
      for (var j = 0; j < kids.length; j++) {
        var k = kids[j];
        k.style.setProperty('min-height', '0', 'important');
        // 大块空白槽：高度高但几乎无字
        var rect = k.getBoundingClientRect();
        var tx = (k.textContent || '').replace(/[\\u00a0\\s]/g, '');
        if (rect.height >= 48 && tx.length < 2 && !k.querySelector('button, input, img, svg, canvas')) {
          k.classList.add('sharker-empty-slot');
          k.style.display = 'none';
        }
      }

      // 历史列表更紧凑
      var lists = el.querySelectorAll('ul, ol');
      for (var u = 0; u < lists.length; u++) {
        lists[u].style.margin = '6px 0 0';
        lists[u].style.paddingLeft = '1.1em';
      }
    }
  }

  /**
   * 候选：显式终端类 / pre 日志 / 深色圆角「命令块」div
   * 绝不包整页看板。
   */
  function candidates() {
    var list = [];
    var nodes = document.body.querySelectorAll(
      'pre, code, div, section, article, p, span'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (alreadyWrapped(el)) continue;
      if (hasOwnMacChrome(el)) continue;
      if (el.closest && el.closest('button, a, input, select, textarea, label, .sharker-term')) continue;
      if (el === document.body || el === document.documentElement) continue;
      // span 只在整块是它自己时才考虑（避免拆碎）
      if (el.tagName === 'SPAN' && el.parentElement && el.parentElement.children.length > 1) continue;

      var named = hasExplicitTermClass(el);
      var shellText = textLooksLikeShell(el);
      var dark = isVisuallyDarkPanel(el);
      var isPre = el.tagName === 'PRE' || el.tagName === 'CODE';
      var style = window.getComputedStyle(el);
      var mono =
        isPre ||
        /mono|menlo|consolas|courier|sf mono|cascadia|ui-monospace/i.test(style.fontFamily);
      var radius = parseFloat(style.borderRadius) || 0;

      // 必须：显式类 或 像 shell 的文本
      if (!named && !shellText) continue;
      // 非显式类时：需要像终端托盘（深色 或 pre/等宽）
      if (!named) {
        if (!(isPre || dark || (mono && shellText))) continue;
        // 浅色等宽大段说明不包
        if (!dark && !isPre && !shellText) continue;
      }
      if (looksLikeAppUi(el)) continue;

      var rect = el.getBoundingClientRect();
      if (rect.width < 40) continue;
      if (rect.height > 0 && rect.height < 20) continue;
      // 假终端块通常是一条日志区，高度不会占满整页
      if (!named && rect.height > 380) continue;
      // 深色圆角块 + shell 文本 → 就是你图里那种黑条
      if (!named && dark && shellText && radius < 4 && !isPre && !mono) {
        // 允许无圆角的黑条
      }

      list.push(el);
    }

    // 最内层优先（真正日志块）
    return list.filter(function (el) {
      return !list.some(function (other) {
        return other !== el && el.contains(other);
      });
    });
  }

  function wrapTerminal(el) {
    if (alreadyWrapped(el) || hasOwnMacChrome(el) || looksLikeAppUi(el)) return;

    var shell = document.createElement('div');
    shell.className = 'sharker-term';
    var wantGlass =
      (el.getAttribute && el.getAttribute('data-term-style') === 'glass') ||
      (el.classList && el.classList.contains('demo-terminal-glass'));
    if (wantGlass) shell.classList.add('sharker-term--glass');
    shell.setAttribute('data-sharker-term', '1');

    var bar = document.createElement('div');
    bar.className = 'sharker-term-titlebar';
    bar.setAttribute('aria-hidden', 'true');

    var traffic = document.createElement('div');
    traffic.className = 'sharker-term-traffic';
    ;['close', 'min', 'max'].forEach(function (name) {
      var d = document.createElement('span');
      d.className = 'sharker-term-dot sharker-term-dot--' + name;
      traffic.appendChild(d);
    });
    bar.appendChild(traffic);

    var title = document.createElement('div');
    title.className = 'sharker-term-title';
    title.textContent = defaultTitle(el);
    bar.appendChild(title);

    var body = document.createElement('div');
    body.className = 'sharker-term-body';

    el.style.setProperty('background', 'transparent', 'important');
    el.style.setProperty('background-color', 'transparent', 'important');
    el.style.setProperty('background-image', 'none', 'important');
    el.style.setProperty('border', 'none', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('border-radius', '0', 'important');
    el.style.position = 'static';
    el.style.inset = 'auto';
    el.style.transform = 'none';
    el.style.margin = '0';
    el.style.padding = '0';
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
    el.style.width = '100%';
    el.style.minHeight = '0';
    el.style.setProperty('color', 'rgba(232,234,237,0.92)', 'important');

    var parent = el.parentNode;
    if (!parent) return;
    parent.insertBefore(shell, el);
    body.appendChild(el);
    shell.appendChild(bar);
    shell.appendChild(body);
    compactTerminalContent(body);
    forceReadableText(body);
  }

  function isNeutralGrey(c) {
    if (!c) return false;
    return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 32;
  }

  function isPaintSurface(el) {
    return el && /^(CANVAS|SVG|IMG|VIDEO|PATH|SCRIPT|STYLE|SOURCE|LINK|META)$/i.test(el.tagName);
  }

  /** 去掉整页灰壳的底/边/影，让演示贴进聊天正文 */
  function stripOuterShell(el) {
    if (!el || el.nodeType !== 1 || isPaintSurface(el)) return;
    el.style.setProperty('background', 'transparent', 'important');
    el.style.setProperty('background-color', 'transparent', 'important');
    el.style.setProperty('background-image', 'none', 'important');
    el.style.setProperty('border-color', 'transparent', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('outline', 'none', 'important');
  }

  /**
   * 根包装：解开 overflow:hidden + 固定高度，避免 flex 子项被 iframe 视口压矮。
   * 只动 html/body 和整页壳，不动 canvas、也不动四区那种内层卡片。
   */
  function unlockClip() {
    var html = document.documentElement;
    var body = document.body;
    if (!html || !body) return;
    ;[html, body].forEach(function (el) {
      el.style.setProperty('height', 'max-content', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('overflow-x', 'visible', 'important');
      el.style.setProperty('overflow-y', 'visible', 'important');
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('background-image', 'none', 'important');
    });
    var bodyW = Math.max(body.getBoundingClientRect().width, body.clientWidth || 0, 1);
    function unlockWrapper(el) {
      if (!el || el.nodeType !== 1 || isPaintSurface(el)) return;
      if (el.closest && el.closest('canvas, svg, img, video, .sharker-term')) return;
      el.style.setProperty('height', 'auto', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('overflow-x', 'visible', 'important');
      el.style.setProperty('overflow-y', 'visible', 'important');
    }
    var kids = body.children;
    for (var i = 0; i < kids.length; i++) unlockWrapper(kids[i]);
    var blocks = body.querySelectorAll('div, section, article, main, aside');
    for (var j = 0; j < blocks.length; j++) {
      var el = blocks[j];
      if (isPaintSurface(el)) continue;
      if (el.closest && el.closest('canvas, svg, img, video, .sharker-term')) continue;
      var r = el.getBoundingClientRect();
      if (r.width < bodyW * 0.88) continue;
      var st = window.getComputedStyle(el);
      var clips =
        st.overflow === 'hidden' ||
        st.overflow === 'auto' ||
        st.overflow === 'scroll' ||
        st.overflowY === 'hidden' ||
        st.overflowY === 'auto' ||
        st.overflowY === 'scroll';
      var maxH = parseFloat(st.maxHeight);
      var hasCap = st.maxHeight && st.maxHeight !== 'none' && isFinite(maxH) && maxH < 8000;
      var hasFixed = st.height && st.height.indexOf('px') !== -1 && parseFloat(st.height) > 0 && parseFloat(st.height) < 8000;
      if (clips || hasCap || hasFixed || el.parentElement === body) unlockWrapper(el);
    }
  }

  /** 是否整页外壳（满宽且里面还有多张卡片/列）。四区小卡本身不是壳。 */
  function isOuterShell(el, bodyW, bodyH) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < bodyW * 0.88) return false;
    var kids = 0;
    var named = 0;
    var ch = el.children || [];
    for (var i = 0; i < ch.length; i++) {
      if (ch[i].nodeType !== 1) continue;
      if (/^(SCRIPT|STYLE|LINK|BR)$/i.test(ch[i].tagName)) continue;
      kids++;
      var cls = String(ch[i].className || '');
      if (/zone|card|panel|col|column/i.test(cls)) named++;
    }
    if (kids >= 2 || named >= 2) return true;
    var selfCls = String(el.className || '');
    if (/zone/i.test(selfCls) && kids < 2) return false;
    if (el.parentElement === document.body && r.height > Math.max(bodyH * 0.5, 72)) return true;
    return false;
  }

  /** 把模型写死的灰/黑底换成宿主 token；整页壳直接透明，内层控件保留表面 */
  function harmonizeSurfaces() {
    var root = document.body;
    if (!root) return;
    stripOuterShell(document.documentElement);
    stripOuterShell(root);
    var bodyRect = root.getBoundingClientRect();
    var bodyW = Math.max(bodyRect.width, 1);
    var bodyH = Math.max(bodyRect.height, 1);
    var kids = root.children;
    for (var k = 0; k < kids.length; k++) {
      if (isPaintSurface(kids[k])) continue;
      if (isOuterShell(kids[k], bodyW, bodyH)) stripOuterShell(kids[k]);
    }
    var nodes = root.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.nodeType !== 1) continue;
      if (isPaintSurface(el)) continue;
      if (el.closest && el.closest('.sharker-term, canvas, svg, img, video')) continue;
      var st = window.getComputedStyle(el);
      var r = el.getBoundingClientRect();
      var coversRoot = r.width > bodyW * 0.88 && r.height > Math.max(bodyH * 0.5, 72);
      if (coversRoot && isOuterShell(el, bodyW, bodyH)) {
        stripOuterShell(el);
        continue;
      }
      var bg = parseRgb(st.backgroundColor);
      if (!bg || !isNeutralGrey(bg)) continue;
      var alphaMatch = (st.backgroundColor || '').match(/rgba\\([^,]+,[^,]+,[^,]+,\\s*([0-9.]+)/);
      var alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
      if (alpha < 0.08) continue;
      var lum = luminance(bg);
      if (coversRoot) {
        stripOuterShell(el);
        continue;
      }
      if (isDark) {
        if (lum < 0.08) {
          el.style.setProperty('background', 'var(--surface-nested)', 'important');
        } else if (lum < 0.3) {
          el.style.setProperty('background', 'var(--surface)', 'important');
        } else {
          continue;
        }
        var borderC = parseRgb(st.borderColor);
        if (borderC && isNeutralGrey(borderC)) {
          el.style.setProperty('border-color', 'var(--border-soft)', 'important');
        }
      } else {
        if (lum > 0.93) {
          stripOuterShell(el);
          continue;
        }
        if (lum > 0.78) {
          el.style.setProperty('background', 'var(--surface)', 'important');
          var borderL = parseRgb(st.borderColor);
          if (borderL && isNeutralGrey(borderL)) {
            el.style.setProperty('border-color', 'var(--border-soft)', 'important');
          }
        }
      }
    }
  }

  var lastReported = 0;

  /** 内容真实底边：含嵌套 flex/grid 卡片，不含 iframe 视口 clientHeight */
  function measureContentHeight() {
    var body = document.body;
    var html = document.documentElement;
    if (!body) return 48;
    var y = window.pageYOffset || (html && html.scrollTop) || body.scrollTop || 0;
    var maxBottom = 0;
    function considerRect(r, extra) {
      if (!r || !isFinite(r.bottom)) return;
      var bottom = r.bottom + y + (extra || 0);
      if (bottom > maxBottom) maxBottom = bottom;
    }
    try {
      var range = document.createRange();
      range.selectNodeContents(body);
      considerRect(range.getBoundingClientRect(), 0);
      var recs = range.getClientRects();
      for (var i = 0; i < recs.length; i++) considerRect(recs[i], 0);
    } catch (e) {}
    considerRect(body.getBoundingClientRect(), 0);
    if (html) considerRect(html.getBoundingClientRect(), 0);
    var nodes = body.querySelectorAll('*');
    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n];
      if (el.getAttribute && el.getAttribute('data-sharker-ignore-height')) continue;
      if (/^(SCRIPT|STYLE|LINK|META)$/i.test(el.tagName)) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      var mb = 0;
      try { mb = parseFloat(window.getComputedStyle(el).marginBottom) || 0; } catch (e2) {}
      considerRect(r, mb);
    }
    var kids = body.children;
    for (var k = 0; k < kids.length; k++) {
      var c = kids[k];
      if (/^(SCRIPT|STYLE|LINK|META)$/i.test(c.tagName)) continue;
      var cs = window.getComputedStyle(c);
      var mt = parseFloat(cs.marginTop) || 0;
      var cmb = parseFloat(cs.marginBottom) || 0;
      maxBottom = Math.max(maxBottom, (c.offsetTop || 0) + (c.offsetHeight || 0) + cmb);
      maxBottom = Math.max(maxBottom, (c.scrollHeight || 0) + mt + cmb);
    }
    return Math.max(Math.ceil(maxBottom + 10), 48);
  }

  function report() {
    try {
      unlockClip();
      var h = measureContentHeight();
      if (h < lastReported) h = lastReported;
      else lastReported = h;
      parent.postMessage({ type: 'sharker-inline-demo-height', id: id, height: h }, '*');
    } catch (e) {}
  }

  function reportSoon() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { report(); });
    });
  }

  /* —— 公式：KaTeX 优先；裸 LaTeX（G_{\\\\mu\\\\nu}）回退 Unicode —— */
  var SUB = {
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
    '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎',
    a:'ₐ',e:'ₑ',h:'ₕ',i:'ᵢ',j:'ⱼ',k:'ₖ',l:'ₗ',m:'ₘ',n:'ₙ',o:'ₒ',p:'ₚ',r:'ᵣ',s:'ₛ',t:'ₜ',u:'ᵤ',v:'ᵥ',x:'ₓ',
    mu:'μ',nu:'ν',rho:'ρ',lambda:'λ',alpha:'α',beta:'β',gamma:'γ',delta:'δ',theta:'θ',phi:'φ',psi:'ψ',omega:'ω'
  };
  var SUP = {
    '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾',n:'ⁿ',i:'ⁱ'
  };
  var GREEK = {
    alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',iota:'ι',
    kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',rho:'ρ',sigma:'σ',tau:'τ',upsilon:'υ',
    phi:'φ',chi:'χ',psi:'ψ',omega:'ω',
    Alpha:'Α',Beta:'Β',Gamma:'Γ',Delta:'Δ',Lambda:'Λ',Pi:'Π',Sigma:'Σ',Omega:'Ω',
    partial:'∂',infty:'∞',cdot:'·',times:'×',pm:'±',mp:'∓',leq:'≤',geq:'≥',neq:'≠',approx:'≈',
    leftarrow:'←',rightarrow:'→',leftrightarrow:'↔',sum:'∑',prod:'∏',int:'∫'
  };

  function mapChars(str, table) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      out += table[ch] != null ? table[ch] : ch;
    }
    return out;
  }

  function latexChunkToUnicode(src) {
    var s = String(src || '');
    // 去掉数学模式包裹
    s = s.replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '').replace(/^\$+|\$+$/g, '');
    s = s.replace(/\\\\/g, '\\');
    // \\frac{a}{b}
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, function (_, a, b) {
      return '(' + latexChunkToUnicode(a) + ')/(' + latexChunkToUnicode(b) + ')';
    });
    // 希腊与符号
    s = s.replace(/\\([A-Za-z]+)/g, function (_, name) {
      return GREEK[name] != null ? GREEK[name] : name;
    });
    // 下标/上标
    s = s.replace(/_\{([^{}]+)\}/g, function (_, x) {
      var u = latexChunkToUnicode(x);
      return mapChars(u, SUB) !== u ? mapChars(u, SUB) : '₍' + u + '₎';
    });
    s = s.replace(/_([A-Za-z0-9])/g, function (_, x) {
      return SUB[x] != null ? SUB[x] : '_' + x;
    });
    s = s.replace(/\^\{([^{}]+)\}/g, function (_, x) {
      var u = latexChunkToUnicode(x);
      return mapChars(u, SUP) !== u ? mapChars(u, SUP) : '⁽' + u + '⁾';
    });
    s = s.replace(/\^([A-Za-z0-9])/g, function (_, x) {
      return SUP[x] != null ? SUP[x] : '^' + x;
    });
    s = s.replace(/\\left|\\right|\\,|\\;|\\!|\\ |\\quad|\\qquad/g, '');
    s = s.replace(/[{}]/g, '');
    return s;
  }

  function looksLikeBareLatex(text) {
    return /\\[A-Za-z]+|[_^]\{|\\frac|\\partial|\\mu|\\nu|\\Lambda|\\pi|\\rho/.test(text);
  }

  function beautifyBareLatex(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest && parent.closest('script,style,textarea,code,pre,.katex,.sharker-math')) continue;
      var t = node.nodeValue;
      if (!t || !looksLikeBareLatex(t)) continue;
      var pretty = latexChunkToUnicode(t);
      if (pretty !== t) {
        var span = document.createElement('span');
        span.className = 'sharker-math';
        span.textContent = pretty;
        parent.replaceChild(span, node);
      }
    }
  }

  function renderMath() {
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\\\[', right: '\\\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\\\(', right: '\\\\)', display: false }
          ],
          throwOnError: false,
          strict: 'ignore'
        });
      }
    } catch (e) {}
    try {
      beautifyBareLatex(document.body);
    } catch (e) {}
  }

  var enhancing = false;
  var historyFixed = false;
  function enhance(opts) {
    if (enhancing) return;
    enhancing = true;
    var onlyNew = opts && opts.onlyNew;
    try {
      unlockClip();
      // 只给尚未套壳的假终端加壳；禁止反复 densify 破坏按钮/状态机
      candidates().forEach(wrapTerminal);
      if (!historyFixed) {
        fixHistoryPanels();
        historyFixed = true;
      }
      renderMath();
      harmonizeSurfaces();
      unlockClip();
    } catch (e) {}
    enhancing = false;
    reportSoon();
  }

  function watchImages() {
    if (!document.body) return;
    var imgs = document.body.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) continue;
      imgs[i].addEventListener('load', reportSoon);
      imgs[i].addEventListener('error', reportSoon);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enhance(); watchImages(); });
  } else {
    enhance();
    watchImages();
  }
  window.addEventListener('load', function () {
    enhance();
    watchImages();
    reportSoon();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { reportSoon(); }).catch(function () {});
  }
  try {
    var ro = new ResizeObserver(function () { reportSoon(); });
    ro.observe(document.documentElement);
    if (document.body) {
      ro.observe(document.body);
      var rootWidget = document.body.firstElementChild;
      while (rootWidget && /^(SCRIPT|STYLE|LINK)$/i.test(rootWidget.tagName)) {
        rootWidget = rootWidget.nextElementSibling;
      }
      if (rootWidget) ro.observe(rootWidget);
    }
  } catch (e) {}
  // 仅在新增节点时尝试套新终端壳，绝不重写已有交互 DOM
  try {
    var moTimer = null;
    new MutationObserver(function () {
      if (moTimer) clearTimeout(moTimer);
      moTimer = setTimeout(function () { watchImages(); enhance({ onlyNew: true }); }, 80);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  setTimeout(function () { enhance(); }, 0);
  setTimeout(function () { enhance(); }, 30);
  setTimeout(function () { renderMath(); reportSoon(); }, 100);
  setTimeout(function () { renderMath(); reportSoon(); }, 350);
  setTimeout(function () { renderMath(); reportSoon(); }, 900);
  window.addEventListener('load', function () {
    setTimeout(function () { renderMath(); reportSoon(); }, 50);
  });
})();
<\/script>
`

  const trimmed = html.trim()
  const isFullDoc = /<!DOCTYPE|<\s*html[\s>]/i.test(trimmed)
  /** KaTeX + 自动渲染；离线/CDN 失败时由 enhanceScript 里的 Unicode 回退接管 */
  const mathHead = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous" />
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"><\/script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"><\/script>
<style data-sharker-math>
  .katex { font-size: 1.05em; }
  .katex-display { margin: 0.4em 0; overflow-x: auto; overflow-y: hidden; }
  .sharker-math { font-family: "SF Pro Text", "Times New Roman", Times, serif; font-feature-settings: "tnum"; }
</style>
`
  const headInject = `<meta charset="utf-8" />${mathHead}<style data-sharker-host>${hostCss}</style>`

  if (isFullDoc) {
    if (/<head[^>]*>/i.test(trimmed)) {
      let out = trimmed.replace(/<head([^>]*)>/i, `<head$1>${headInject}`)
      if (/<\/body>/i.test(out)) {
        out = out.replace(/<\/body>/i, `${enhanceScript}</body>`)
      } else {
        out += enhanceScript
      }
      return out
    }
    return `<!DOCTYPE html><html><head>${headInject}</head><body>${trimmed}${enhanceScript}</body></html>`
  }

  return `<!DOCTYPE html><html><head>${headInject}</head><body>${trimmed}${enhanceScript}</body></html>`
}

/**
 * 对话流内无缝演示：默认展开、无外框/标题栏；iframe 高度只升不降。
 * 可选「收起演示」是演示后的一行小字，不包一层卡片。
 */
export function InlineDemo({ html, caption, streaming = false }: InlineDemoProps) {
  const reactId = useId()
  const demoId = useMemo(() => `demo-${reactId.replace(/:/g, '')}`, [reactId])
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(() => seedInlineDemoHeight(html, streaming))
  const [expanded, setExpanded] = useState(true)
  const [theme, setTheme] = useState<ThemeVars>(() => readHostTheme())
  /** 流式时节流刷新，避免每个字符都 reload iframe */
  const [paintHtml, setPaintHtml] = useState(html)
  const lastPaintLen = useRef(0)
  /** 本轮 srcDoc 内高度只升不降，避免 parent scrollHeight 把标签裁回去 */
  const highWaterRef = useRef(seedInlineDemoHeight(html, streaming))
  const heightSourceRef = useRef(html)

  /** iframe 报的内容高度：只抬高，永不压低 */
  const raiseHeight = (next: number) => {
    const h = Math.round(next)
    if (!Number.isFinite(h) || h < 48) return
    if (h <= highWaterRef.current) return
    highWaterRef.current = h
    writeCachedInlineDemoHeight(heightSourceRef.current, h)
    setHeight(h)
  }

  useEffect(() => {
    heightSourceRef.current = paintHtml || html
    raiseHeight(seedInlineDemoHeight(paintHtml || html, streaming))
  }, [html, paintHtml, streaming])

  useEffect(() => {
    if (!streaming) {
      setPaintHtml(html)
      lastPaintLen.current = html.length
      return
    }
    // 字符增长够多或首帧立刻画；中间 120ms 节流
    const grew = html.length - lastPaintLen.current >= 180
    const delay = lastPaintLen.current === 0 || grew ? 40 : 120
    const t = window.setTimeout(() => {
      setPaintHtml(html)
      lastPaintLen.current = html.length
    }, delay)
    return () => window.clearTimeout(t)
  }, [html, streaming])

  useEffect(() => {
    const refresh = () => setTheme(readHostTheme())
    refresh()
    const mo = new MutationObserver(refresh)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style']
    })
    return () => mo.disconnect()
  }, [])

  const paintable = isInlineDemoPaintable(paintHtml)
  const showFrame = paintable || streaming
  const srcDoc = useMemo(
    () =>
      paintable
        ? buildSrcDoc(paintHtml, theme, demoId)
        : '<!DOCTYPE html><html><body></body></html>',
    [paintHtml, theme, demoId, paintable]
  )

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'sharker-inline-demo-height') return
      if (data.id !== demoId) return
      if (typeof data.height === 'number' && Number.isFinite(data.height)) {
        raiseHeight(data.height)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [demoId])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !shouldMeasureInlineDemoInParent({ paintable, streaming })) return
    let ro: ResizeObserver | null = null
    const measure = () => {
      try {
        const doc = frame.contentDocument
        const body = doc?.body
        if (!doc || !body) return
        let maxBottom = 0
        const nodes = body.querySelectorAll('*')
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i]
          if (el.getAttribute('data-sharker-ignore-height')) continue
          if (/^(SCRIPT|STYLE|LINK|META)$/i.test(el.tagName)) continue
          const r = el.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) continue
          if (r.bottom > maxBottom) maxBottom = r.bottom
        }
        const bodyRect = body.getBoundingClientRect()
        if (bodyRect.bottom > maxBottom) maxBottom = bodyRect.bottom
        try {
          const range = doc.createRange()
          range.selectNodeContents(body)
          const rr = range.getBoundingClientRect()
          if (rr.bottom > maxBottom) maxBottom = rr.bottom
        } catch {
          /* ignore */
        }
        raiseHeight(Math.max(Math.ceil(maxBottom + 10), 48))
      } catch {
        /* sandbox 无 same-origin 时走 postMessage */
      }
    }
    const attach = () => {
      measure()
      try {
        const doc = frame.contentDocument
        if (!doc?.body) return
        ro?.disconnect()
        ro = new ResizeObserver(measure)
        ro.observe(doc.body)
        ro.observe(doc.documentElement)
        const rootWidget = doc.body.firstElementChild
        if (rootWidget) ro.observe(rootWidget)
      } catch {
        /* ignore */
      }
    }
    frame.addEventListener('load', attach)
    attach()
    return () => {
      frame.removeEventListener('load', attach)
      ro?.disconnect()
    }
  }, [srcDoc, paintable, streaming])

  const label = caption?.trim() || '内联演示'
  const frameH = expanded ? Math.max(height, streaming ? 96 : 48) : 0

  return (
    <div
      className={[
        'inline-demo',
        expanded ? 'inline-demo--expanded' : 'inline-demo--collapsed',
        streaming ? 'inline-demo--streaming' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-inline-demo
    >
      <div
        className="inline-demo-body"
        hidden={!expanded}
        aria-hidden={!expanded}
        style={expanded && showFrame ? { minHeight: frameH } : undefined}
      >
        {showFrame ? (
          <iframe
            ref={frameRef}
            className={`inline-demo-frame${paintable ? '' : ' inline-demo-frame--pending'}`}
            title={label}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            scrolling="no"
            style={{ height: frameH }}
          />
        ) : null}
        {streaming && !paintable ? (
          <div className="inline-demo-skeleton" aria-hidden>
            <span className="inline-demo-skeleton-bar" />
            <span className="inline-demo-skeleton-bar inline-demo-skeleton-bar--short" />
            <span className="inline-demo-skeleton-bar inline-demo-skeleton-bar--mid" />
          </div>
        ) : null}
      </div>
      {caption?.trim() && expanded ? <p className="inline-demo-caption">{caption.trim()}</p> : null}
      {streaming && expanded ? (
        <p className="inline-demo-live" aria-live="polite">
          <span className="inline-demo-live-dot" aria-hidden />
          {paintable ? '生成中' : '准备演示…'}
        </p>
      ) : null}
      {!streaming ? (
        <button
          type="button"
          className="inline-demo-fold"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起演示' : '展开演示'}
        </button>
      ) : null}
    </div>
  )
}

/** 是否为对话原生演示代码块语言 */
export function isInlineDemoLang(lang?: string): boolean {
  if (!lang) return false
  const l = lang.toLowerCase().split(/[\s{]/)[0]
  return (
    l === 'demo' ||
    l === 'demo-html' ||
    l === 'html-demo' ||
    l === 'visualization' ||
    l === 'viz' ||
    l === 'inline-demo'
  )
}

/** 从 fence info 解析 caption：demo title="交互示意" */
export function parseDemoMeta(className?: string): { caption?: string } {
  if (!className) return {}
  const titleEq = /(?:title|caption)\s*=\s*"([^"]+)"/.exec(className)
  if (titleEq) return { caption: titleEq[1] }
  const titleSp = /(?:title|caption)\s*=\s*'([^']+)'/.exec(className)
  if (titleSp) return { caption: titleSp[1] }
  const bare = /language-demo\s+(.+)$/.exec(className)
  if (bare && !bare[1].includes('=')) return { caption: bare[1].trim() }
  return {}
}
