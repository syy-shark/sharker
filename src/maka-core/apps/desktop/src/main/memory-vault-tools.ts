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
 * 助手对本机记忆文件夹的增删改查工具（MakaMemoryVaultList/Read/Write/Delete）。
 */
import type { MakaTool } from '@maka/runtime/tool-runtime';
import { z } from 'zod';
import type { MemoryVaultListing } from '@maka/core/local-memory-vault';
import { parseMemoryVaultRelativePath } from '@maka/core/local-memory-vault';
import {
  deleteMemoryVaultFile,
  listMemoryVault,
  readMemoryVaultFile,
  writeMemoryVaultFile,
} from './memory-vault-io.js';

export interface MemoryVaultToolAuthority {
  workspaceRoot(): string;
  /** MEMORY.md 仍走 Runtime Host CAS，避免直接改文件打乱 bundle。 */
  replaceMemoryDocument(content: string): Promise<void>;
}

/** Agent 对本机记忆文件夹的增删改查。 */
export function buildMemoryVaultTools(authority: MemoryVaultToolAuthority): readonly MakaTool[] {
  const listTool: MakaTool<Record<string, never>, MemoryVaultListing> = {
    name: 'MakaMemoryVaultList',
    displayName: 'List memory files',
    description:
      'List the local memory vault (MEMORY.md, USER.md, TAXONOMY.md, and folders episodic/people/projects/users/sites/agent/concepts). Use this before reading or writing.',
    parameters: z.object({}).strict(),
    categoryHint: 'read',
    recoveryMode: 'replay_safe',
    impl: async () => unwrap(await listMemoryVault(authority.workspaceRoot())),
  };
  const readTool: MakaTool<{ path: string }, { path: string; content: string }> = {
    name: 'MakaMemoryVaultRead',
    displayName: 'Read a memory file',
    description:
      'Read one markdown file from the local memory vault. Path examples: MEMORY.md, USER.md, episodic/2026-09-01.md, people/alex.md.',
    parameters: z.object({ path: z.string().min(1) }).strict(),
    categoryHint: 'read',
    recoveryMode: 'replay_safe',
    impl: async ({ path }) => {
      const result = await readMemoryVaultFile(authority.workspaceRoot(), path);
      if (!result.ok) throw new Error(result.message);
      return { path: result.value.path, content: result.value.content };
    },
  };
  const writeTool: MakaTool<{ path: string; content: string }, { path: string }> = {
    name: 'MakaMemoryVaultWrite',
    displayName: 'Write a memory file',
    description:
      'Create or update one markdown file in the local memory vault. Put daily logs in episodic/YYYY-MM-DD.md, durable facts in MEMORY.md, user profile in USER.md, people/projects/sites notes in their folders. Do not store secrets.',
    parameters: z.object({ path: z.string().min(1), content: z.string() }).strict(),
    categoryHint: 'file_write',
    recoveryMode: 'idempotent',
    impl: async ({ path, content }) => {
      const relative = parseMemoryVaultRelativePath(path);
      if (relative === 'MEMORY.md') {
        await authority.replaceMemoryDocument(content);
        return { path: 'MEMORY.md' };
      }
      const result = await writeMemoryVaultFile(authority.workspaceRoot(), path, content);
      if (!result.ok) throw new Error(result.message);
      return { path: result.value.path };
    },
  };
  const deleteTool: MakaTool<{ path: string }, { path: string }> = {
    name: 'MakaMemoryVaultDelete',
    displayName: 'Delete a memory file',
    description:
      'Delete one markdown file from the local memory vault. MEMORY.md cannot be deleted; archive or edit it instead.',
    parameters: z.object({ path: z.string().min(1) }).strict(),
    categoryHint: 'file_write',
    recoveryMode: 'idempotent',
    impl: async ({ path }) => unwrap(await deleteMemoryVaultFile(authority.workspaceRoot(), path)),
  };
  return [listTool, readTool, writeTool, deleteTool];
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
