/**
 * 网页内水滴玻璃样式（类似 Dark Reader 的注入思路，但做浅色磨砂而非反色）。
 * - 只 CSS，不改 DOM，降低崩溃风险
 * - 无法像改 App 一样 100% 重画任意站点，但能把大白底揉成通透玻璃感
 * @see ./ARCH.md
 */

/** 注入到访客页的玻璃 CSS */
export const PAGE_GLASS_INJECT_CSS = `
/* Sharker glass theme — safe inject */
html {
  background:
    linear-gradient(
      165deg,
      rgba(255, 255, 255, 0.22) 0%,
      rgba(236, 240, 246, 0.35) 45%,
      rgba(220, 226, 236, 0.4) 100%
    ) !important;
  background-attachment: fixed !important;
}
body {
  background-color: transparent !important;
  background-image: none !important;
}
/* 常见整页白底容器：略透，露出 html 玻璃底 */
body > div,
main,
#main,
#content,
#root,
#app,
[role="main"] {
  /* 不强制全部 transparent，避免布局/可读性崩 */
}
/* 顶层轻雾高光（不挡点击） */
html::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 2147483646 !important;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.28) 0%,
      rgba(255, 255, 255, 0.06) 22%,
      transparent 48%
    ),
    radial-gradient(
      120% 80% at 50% -10%,
      rgba(255, 255, 255, 0.35) 0%,
      transparent 55%
    ) !important;
}
html::after {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.22) !important;
  background: transparent !important;
}
/* 纯白背景弱化（常见内联/类名） */
[style*="background: #fff"],
[style*="background:#fff"],
[style*="background: white"],
[style*="background:white"],
[style*="background-color: #fff"],
[style*="background-color:#fff"],
[style*="background-color: white"],
[style*="background-color:white"],
[style*="background: rgb(255, 255, 255)"],
[style*="background-color: rgb(255, 255, 255)"] {
  background-color: rgba(255, 255, 255, 0.72) !important;
}
`

/** 是否应对该 URL 注入（跳过起始 data 页与特殊协议） */
export function shouldInjectGlass(url: string | undefined | null): boolean {
  if (!url) return false
  if (url.startsWith('data:')) return false
  if (url.startsWith('about:')) return false
  if (url.startsWith('chrome:')) return false
  if (url.startsWith('devtools:')) return false
  return url.startsWith('http://') || url.startsWith('https://')
}
