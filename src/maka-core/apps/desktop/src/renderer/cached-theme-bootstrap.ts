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

import { isThemePalette } from '@maka/core/settings';
import { safeLocalStorageGet } from './browser-storage';
import { applyCachedFontAppearanceBeforeMount } from './theme';

// Apply the cached theme before React mounts so dark-theme users don't get
// a brief light-mode flash while settings.json loads. We persist the resolved
// theme to localStorage on every change (theme.ts), and this entry point
// reads it synchronously before the first paint. This is the standard
// "FOUC prevention via inline-script" pattern, but here it runs in the same
// JS bundle as the rest of the renderer so we don't need to relax the CSP
// `script-src 'self'` rule.
export function applyCachedThemeBeforeMount(): void {
  const cachedThemePreference = safeLocalStorageGet('maka-theme-v1');
  const shouldApplyDarkTheme =
    cachedThemePreference === 'dark' ||
    (cachedThemePreference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (shouldApplyDarkTheme) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  } else {
    document.documentElement.style.colorScheme = 'light';
  }
  // PALETTE-LEAK-0: restore the cached palette too (persisted by
  // applyThemePalette), not just light/dark — otherwise users get a first
  // paint in the unthemed zinc tokens that visibly snaps once app-shell
  // applies settings. Retired or unknown ids are ignored so a stale
  // localStorage value cannot write a selector with no CSS block.
  const cachedPalette = safeLocalStorageGet('maka-theme-palette-v1');
  if (cachedPalette && isThemePalette(cachedPalette) && cachedPalette !== 'default') {
    document.documentElement.setAttribute('data-maka-theme', cachedPalette);
  } else {
    document.documentElement.removeAttribute('data-maka-theme');
  }
  // Restore a cached non-default UI font scale (and seed the terminal size)
  // the same way, so the first paint is at the user's chosen size rather than
  // 1× snapping once app-shell applies settings.json.
  applyCachedFontAppearanceBeforeMount();
}
