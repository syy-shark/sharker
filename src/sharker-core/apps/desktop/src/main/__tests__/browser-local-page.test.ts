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

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { resolveWorkspaceHtmlPage } from '../browser/local-page.js';

describe('resolveWorkspaceHtmlPage', () => {
  it('accepts a workspace-relative HTML file and a file:// URL inside the root', async () => {
    await withWorkspace(async (root) => {
      const file = join(root, 'intro.html');
      await writeFile(file, '<html><title>Hi</title></html>', 'utf8');
      const realFile = await realpath(file);
      const expected = pathToFileURL(realFile).href;

      assert.deepEqual(resolveWorkspaceHtmlPage('intro.html', [root]), {
        ok: true,
        url: expected,
        path: realFile,
      });
      assert.deepEqual(resolveWorkspaceHtmlPage(expected, [root]), {
        ok: true,
        url: expected,
        path: realFile,
      });
      assert.deepEqual(resolveWorkspaceHtmlPage(realFile, [root]), {
        ok: true,
        url: expected,
        path: realFile,
      });
    });
  });

  it('rejects missing files, non-html, directories, and escapes', async () => {
    await withWorkspace(async (root, outside) => {
      await writeFile(join(root, 'notes.txt'), 'nope', 'utf8');
      await mkdir(join(root, 'pages.html'), { recursive: true });
      const outsideHtml = join(outside, 'secret.html');
      await writeFile(outsideHtml, '<html></html>', 'utf8');
      await symlink(outsideHtml, join(root, 'escape.html'));

      assert.deepEqual(resolveWorkspaceHtmlPage('missing.html', [root]), {
        ok: false,
        reason: 'missing',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('notes.txt', [root]), {
        ok: false,
        reason: 'not-html',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('file:///etc/passwd', [root]), {
        ok: false,
        reason: 'not-html',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('https://example.com/page.html', [root]), {
        ok: false,
        reason: 'not-html',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('pages.html', [root]), {
        ok: false,
        reason: 'not-a-file',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage(outsideHtml, [root]), {
        ok: false,
        reason: 'outside-workspace',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('escape.html', [root]), {
        ok: false,
        reason: 'outside-workspace',
      });
    });
  });
});

async function withWorkspace(
  run: (root: string, outside: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sharker-local-html-'));
  const outside = await mkdtemp(join(tmpdir(), 'sharker-local-html-out-'));
  try {
    await run(await realpath(root), await realpath(outside));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}
