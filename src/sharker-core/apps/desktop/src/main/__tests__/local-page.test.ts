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
import {
  looksLikeLocalHtmlAttempt,
  resolveWorkspaceHtmlPage,
} from '../browser/local-page.js';

describe('workspace HTML pages', () => {
  it('looksLikeLocalHtmlAttempt accepts file URLs, html names, and paths', () => {
    assert.equal(looksLikeLocalHtmlAttempt('file:///etc/passwd'), true);
    assert.equal(looksLikeLocalHtmlAttempt('intro.html'), true);
    assert.equal(looksLikeLocalHtmlAttempt('docs/page.htm'), true);
    assert.equal(looksLikeLocalHtmlAttempt('/Users/me/page.html'), true);
    assert.equal(looksLikeLocalHtmlAttempt('https://example.com'), false);
    assert.equal(looksLikeLocalHtmlAttempt('react hooks'), false);
    assert.equal(looksLikeLocalHtmlAttempt('example.com'), false);
  });

  it('resolves a workspace-relative HTML file to file://', async () => {
    await withWorkspace(async (root) => {
      const file = join(root, 'intro.html');
      await writeFile(file, '<h1>hi</h1>', 'utf8');
      const real = await realpath(file);
      const result = resolveWorkspaceHtmlPage('intro.html', [root]);
      assert.deepEqual(result, { ok: true, url: pathToFileURL(real).href, path: real });
    });
  });

  it('accepts file:// and absolute paths inside the workspace', async () => {
    await withWorkspace(async (root) => {
      const file = join(root, 'page.htm');
      await writeFile(file, '<p>ok</p>', 'utf8');
      const real = await realpath(file);
      const viaFile = resolveWorkspaceHtmlPage(pathToFileURL(real).href, [root]);
      const viaAbs = resolveWorkspaceHtmlPage(real, [root]);
      assert.equal(viaFile.ok, true);
      assert.equal(viaAbs.ok, true);
      if (viaFile.ok && viaAbs.ok) {
        assert.equal(viaFile.url, pathToFileURL(real).href);
        assert.equal(viaAbs.path, real);
      }
    });
  });

  it('rejects missing, non-html, outside, and symlink-escaped files', async () => {
    await withWorkspace(async (root, outside) => {
      await writeFile(join(root, 'notes.txt'), 'secret', 'utf8');
      await writeFile(join(outside, 'evil.html'), '<p>no</p>', 'utf8');
      await symlink(join(outside, 'evil.html'), join(root, 'escape.html'));

      assert.deepEqual(resolveWorkspaceHtmlPage('missing.html', [root]), { ok: false, reason: 'missing' });
      assert.deepEqual(resolveWorkspaceHtmlPage('notes.txt', [root]), { ok: false, reason: 'not-html' });
      assert.deepEqual(resolveWorkspaceHtmlPage(join(outside, 'evil.html'), [root]), {
        ok: false,
        reason: 'outside-workspace',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('escape.html', [root]), {
        ok: false,
        reason: 'outside-workspace',
      });
      assert.deepEqual(resolveWorkspaceHtmlPage('file:///etc/passwd', [root]), {
        ok: false,
        reason: 'not-html',
      });
    });
  });
});

async function withWorkspace(
  run: (root: string, outside: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'sharker-local-html-'));
  const root = join(parent, 'project');
  const outside = join(parent, 'outside');
  await mkdir(root);
  await mkdir(outside);
  try {
    await run(await realpath(root), await realpath(outside));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}
