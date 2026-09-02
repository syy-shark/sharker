/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * 嵌入式浏览器新标签：简约 Google 起始页（本地 data URL）。
 * 改 HTML 后递增 BROWSER_START_PAGE_VERSION。
 */

export const BROWSER_START_PAGE_MARKER = 'sharker-browser-start';

/** 改起始页内容时递增，迫使 WebContents 重新加载。 */
export const BROWSER_START_PAGE_VERSION = 1;

export type BrowserStartTheme = 'light' | 'dark';

/** 是否为本机生成的新标签 data URL（其它 data: 一律不认）。 */
export function isBrowserStartPageUrl(url: string): boolean {
  if (!url.startsWith('data:text/html')) return false;
  return url.includes(BROWSER_START_PAGE_MARKER);
}

/**
 * 应显示本地新标签（React 起始页），而不是盖一层原生网页。
 * 含空页、本机 data 起始页，以及误开成 `https://google/` 这种无 TLD 地址。
 */
export function isBrowserStartSurfaceUrl(url: string): boolean {
  if (!url || isBrowserStartPageUrl(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'google' && (parsed.pathname === '/' || parsed.pathname === '');
  } catch {
    return false;
  }
}

/** 读取当前 App 主题（html.theme-dark / theme-light）。 */
export function resolveBrowserStartTheme(
  root: ParentNode | null | undefined = typeof document !== 'undefined' ? document : null,
): BrowserStartTheme {
  const el =
    root && 'documentElement' in root
      ? (root as Document).documentElement
      : root instanceof Element
        ? root
        : typeof document !== 'undefined'
          ? document.documentElement
          : null;
  if (!el) return 'light';
  if (el.classList.contains('theme-dark') || el.getAttribute('data-theme') === 'dark') return 'dark';
  return 'light';
}

/** 简约 Google 新标签 HTML（按 App 主题着色）。 */
export function buildBrowserStartPageHtml(theme: BrowserStartTheme = 'light'): string {
  const isDark = theme === 'dark';
  const rootVars = isDark
    ? `color-scheme: dark;
    --text: #f2f4f8;
    --muted: rgba(242, 244, 248, 0.45);
    --soft: rgba(242, 244, 248, 0.68);
    --edge: rgba(255, 255, 255, 0.12);
    --fill: rgba(44, 49, 58, 0.82);
    --fill-hover: rgba(56, 62, 74, 0.92);
    --rim: inset 0 1px 0 rgba(255, 255, 255, 0.1);
    --shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    --accent: #6ea8ff;
    --accent-soft: rgba(110, 168, 255, 0.16);`
    : `color-scheme: light;
    --text: #1d1d1f;
    --muted: rgba(29, 29, 31, 0.48);
    --soft: rgba(29, 29, 31, 0.62);
    --edge: rgba(255, 255, 255, 0.55);
    --fill: rgba(255, 255, 255, 0.38);
    --fill-hover: rgba(255, 255, 255, 0.52);
    --rim: inset 0 1px 0 rgba(255, 255, 255, 0.75);
    --shadow: 0 8px 28px rgba(40, 35, 30, 0.08);
    --accent: #007aff;
    --accent-soft: rgba(0, 122, 255, 0.12);`;
  const bodyAura = isDark
    ? `radial-gradient(120% 70% at 50% 0%, rgba(220, 230, 245, 0.08) 0%, transparent 55%),
      linear-gradient(165deg, #1c2028 0%, #14181f 48%, #0d1015 100%)`
    : `radial-gradient(120% 70% at 50% 0%, rgba(255, 255, 255, 0.45) 0%, transparent 55%),
      linear-gradient(165deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%)`;
  const pageBg = isDark ? '#0b0d11' : 'transparent';
  const logoShadow = isDark
    ? 'drop-shadow(0 1px 0 rgba(255, 255, 255, 0.08))'
    : 'drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35))';

  return `<!DOCTYPE html>
<html lang="zh-CN" class="theme-${theme}" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>新标签页</title>
<!-- ${BROWSER_START_PAGE_MARKER} v${BROWSER_START_PAGE_VERSION} -->
<style>
  :root {
    ${rootVars}
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
      "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: var(--text);
    background: ${pageBg} !important;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: ${bodyAura};
  }
  body {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 24vh 20px 48px;
    min-height: 100%;
  }
  .wrap {
    position: relative;
    z-index: 1;
    width: min(640px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  .logo {
    font-size: clamp(48px, 8vw, 68px);
    font-weight: 500;
    letter-spacing: -0.04em;
    line-height: 1;
    margin: 0;
    user-select: none;
    filter: ${logoShadow};
  }
  .logo span:nth-child(1) { color: #4285f4; }
  .logo span:nth-child(2) { color: #ea4335; }
  .logo span:nth-child(3) { color: #fbbc05; }
  .logo span:nth-child(4) { color: #4285f4; }
  .logo span:nth-child(5) { color: #34a853; }
  .logo span:nth-child(6) { color: #ea4335; }
  form.search {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 52px;
    padding: 0 8px 0 18px;
    border-radius: 999px;
    border: 0.5px solid var(--edge);
    background: var(--fill);
    backdrop-filter: ${isDark ? 'none' : 'blur(28px) saturate(1.4)'};
    -webkit-backdrop-filter: ${isDark ? 'none' : 'blur(28px) saturate(1.4)'};
    box-shadow: var(--rim), var(--shadow);
    transition: box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  form.search:focus-within {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--fill-hover);
    box-shadow:
      var(--rim),
      0 0 0 3px var(--accent-soft),
      var(--shadow);
  }
  form.search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    font-size: 16px;
    color: var(--text);
  }
  form.search input::placeholder { color: var(--muted); }
  form.search button {
    flex-shrink: 0;
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--soft);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }
  form.search button:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }
  form.search button:active {
    transform: scale(0.98);
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1 class="logo" aria-label="搜索">
      <span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span>
    </h1>
    <form class="search" id="search" action="https://www.google.com/search" method="get" role="search">
      <input
        name="q"
        type="search"
        placeholder="搜索 Google 或输入网址"
        autocomplete="off"
        autofocus
        aria-label="搜索"
      />
      <button type="submit">搜索</button>
    </form>
  </div>
  <script>
    (function () {
      var form = document.getElementById('search');
      var input = form.querySelector('input[name="q"]');
      form.addEventListener('submit', function (e) {
        var q = (input.value || '').trim();
        if (!q) {
          e.preventDefault();
          return;
        }
        if (/^https?:\\/\\//i.test(q)) {
          e.preventDefault();
          location.href = q;
          return;
        }
        if (q.includes('.') && !q.includes(' ') && !q.includes('://')) {
          e.preventDefault();
          location.href = 'https://' + q;
        }
      });
    })();
  </script>
</body>
</html>`;
}

/** data: URL，可直接给嵌入式浏览器 loadURL。 */
export function browserStartPageDataUrl(theme?: BrowserStartTheme): string {
  const resolved = theme ?? resolveBrowserStartTheme();
  const html = buildBrowserStartPageHtml(resolved);
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
