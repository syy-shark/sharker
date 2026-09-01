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
 * Shared embedded-browser types crossing the main ↔ preload ↔ renderer
 * boundary (window.maka.browser). The main-process logic that derives these
 * lives in apps/desktop/src/main/browser/logic.ts.
 */

export {
  BROWSER_START_PAGE_MARKER,
  BROWSER_START_PAGE_VERSION,
  browserStartPageDataUrl,
  buildBrowserStartPageHtml,
  isBrowserStartPageUrl,
  isBrowserStartSurfaceUrl,
  resolveBrowserStartTheme,
  type BrowserStartTheme,
} from './browser-start-page.js';

import { isBrowserStartPageUrl } from './browser-start-page.js';

/** Renderer-facing snapshot of one conversation's embedded browser. */
export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** https origin. */
  secure: boolean;
  /** A real page is loaded (not blank / about:) — gates the DOM empty state. */
  hasPage: boolean;
}

/** Where the embedded view sits, in renderer CSS px (1:1 with the window's content DIP). */
export interface BrowserViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BrowserAddressInputFailureReason = 'empty' | 'unsupported_scheme' | 'invalid_url';

export type BrowserAddressInputResult =
  | { ok: true; url: string }
  | { ok: false; reason: BrowserAddressInputFailureReason };

/**
 * Normalize a user-entered browser address before it crosses the IPC boundary.
 * Chrome-style omnibox: dotted tokens become HTTPS hosts, everything else
 * searches Google. Only http(s) and the local start-page data URL are allowed.
 */
export function normalizeBrowserAddressInput(input: string): BrowserAddressInputResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (isBrowserStartPageUrl(trimmed)) return { ok: true, url: trimmed };

  if (/^(javascript|vbscript|blob|file|about|data):/i.test(trimmed)) {
    return { ok: false, reason: 'unsupported_scheme' };
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: 'unsupported_scheme' };
      }
      return { ok: true, url: url.toString() };
    } catch {
      return { ok: false, reason: 'invalid_url' };
    }
  }

  if (trimmed.includes('.') && !/\s/.test(trimmed)) {
    try {
      return { ok: true, url: new URL(`https://${trimmed}`).toString() };
    } catch {
      return { ok: false, reason: 'invalid_url' };
    }
  }

  return {
    ok: true,
    url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
  };
}
