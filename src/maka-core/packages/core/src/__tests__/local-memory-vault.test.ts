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

import { test } from 'node:test';
import { expect } from './test-helpers.js';
import {
  buildMemoryVaultTree,
  parseMemoryVaultRelativePath,
  todayEpisodicPath,
} from '../local-memory-vault.js';

test('vault paths stay inside the memory folders and only accept markdown', () => {
  expect(parseMemoryVaultRelativePath('MEMORY.md')).toBe('MEMORY.md');
  expect(parseMemoryVaultRelativePath('episodic/2026-09-01.md')).toBe('episodic/2026-09-01.md');
  expect(parseMemoryVaultRelativePath('../etc/passwd')).toBe(undefined);
  expect(parseMemoryVaultRelativePath('/MEMORY.md')).toBe(undefined);
  expect(parseMemoryVaultRelativePath('episodic/note.txt')).toBe(undefined);
  expect(parseMemoryVaultRelativePath('secret/note.md')).toBe(undefined);
});

test('vault tree lists root files then the standard folders', () => {
  const tree = buildMemoryVaultTree([
    { path: 'episodic/2026-09-01.md', updatedAt: 2, sizeBytes: 12 },
    { path: 'MEMORY.md', updatedAt: 1, sizeBytes: 8 },
    { path: 'USER.md', updatedAt: 1, sizeBytes: 4 },
  ]);
  expect(tree[0]?.kind).toBe('file');
  expect(tree[0] && tree[0].kind === 'file' ? tree[0].path : '').toBe('MEMORY.md');
  expect(tree[1] && tree[1].kind === 'file' ? tree[1].path : '').toBe('USER.md');
  const episodic = tree.find((node) => node.kind === 'dir' && node.name === 'episodic');
  expect(episodic?.kind === 'dir' ? episodic.children[0]?.path : '').toBe('episodic/2026-09-01.md');
  expect(todayEpisodicPath(new Date(2026, 8, 1, 12, 0, 0))).toBe('episodic/2026-09-01.md');
});
