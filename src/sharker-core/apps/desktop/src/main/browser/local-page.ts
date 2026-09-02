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
 * Workspace-scoped local HTML for the embedded browser. Only an existing
 * `.html` / `.htm` file whose realpath sits inside an allowed project root may
 * become a `file://` URL — never an arbitrary filesystem path.
 */

import { realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isInsideOrSamePath } from '../open-path-guard.js';

const HTML_EXTENSIONS = new Set(['.html', '.htm']);

export type WorkspaceHtmlFailure = 'not-html' | 'outside-workspace' | 'missing' | 'not-a-file';

export type WorkspaceHtmlResult =
  | { ok: true; url: string; path: string }
  | { ok: false; reason: WorkspaceHtmlFailure };

/** True when `path` looks like an HTML document (`.html` / `.htm`). */
export function isHtmlDocumentPath(path: string): boolean {
  return HTML_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * Resolve `input` (workspace-relative path, absolute path, or `file://`) to a
 * navigable `file://` URL when it names an HTML file inside one of `roots`.
 */
export function resolveWorkspaceHtmlPage(
  input: string,
  roots: readonly string[],
): WorkspaceHtmlResult {
  let sawHtmlCandidate = false;
  let sawMissing = false;
  let sawOutside = false;
  let sawNotAFile = false;

  for (const root of roots) {
    if (!root) continue;
    const candidate = parseLocalPagePath(input, root);
    if (!candidate || !isHtmlDocumentPath(candidate)) continue;
    sawHtmlCandidate = true;

    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      sawMissing = true;
      continue;
    }

    let realTarget: string;
    try {
      realTarget = realpathSync(candidate);
    } catch {
      sawMissing = true;
      continue;
    }

    if (!isHtmlDocumentPath(realTarget)) {
      continue;
    }
    if (!isInsideOrSamePath(realRoot, realTarget)) {
      sawOutside = true;
      continue;
    }

    try {
      const info = statSync(realTarget);
      if (!info.isFile()) {
        sawNotAFile = true;
        continue;
      }
    } catch {
      sawMissing = true;
      continue;
    }

    return { ok: true, url: pathToFileURL(realTarget).href, path: realTarget };
  }

  if (sawOutside) return { ok: false, reason: 'outside-workspace' };
  if (sawNotAFile) return { ok: false, reason: 'not-a-file' };
  if (sawMissing || sawHtmlCandidate) return { ok: false, reason: 'missing' };
  return { ok: false, reason: 'not-html' };
}

/**
 * True when the input is meant as a local HTML page (`file://`, `.html` path,
 * or a filesystem path) rather than an omnibox search / http(s) address.
 */
export function looksLikeLocalHtmlAttempt(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/^file:/i.test(trimmed)) return true;
  if (isWindowsDrivePath(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return isHtmlDocumentPath(trimmed) || trimmed.includes('/') || trimmed.includes('\\');
}

/** Human-readable rejection for a failed workspace-HTML resolve. */
export function workspaceHtmlErrorMessage(reason: WorkspaceHtmlFailure, raw: string): string {
  const shown = JSON.stringify(raw);
  switch (reason) {
    case 'missing':
      return `HTML file not found: ${shown}. Write the page first, then pass its workspace path to browser_navigate.`;
    case 'outside-workspace':
      return `That file is outside the project workspace and cannot be opened in the embedded browser: ${shown}.`;
    case 'not-a-file':
      return `Not an HTML file: ${shown}.`;
    case 'not-html':
      return `Not a navigable URL: ${shown}. Pass a full http:// or https:// URL, or a workspace .html / .htm path.`;
  }
}

function parseLocalPagePath(input: string, root: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^file:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'file:') return null;
      return fileURLToPath(url);
    } catch {
      return null;
    }
  }
  if (isWindowsDrivePath(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return isAbsolute(trimmed) ? trimmed : resolve(root, trimmed);
}

function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}
