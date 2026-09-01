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
 * 本机 `memory/` 文件夹的增删改查。MEMORY.md 的 CAS 提交不在这里，
 * 由 Runtime Host mutate 路径处理。
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isPathInside } from '@maka/runtime/path-containment';
import {
  buildMemoryVaultTree,
  isHiddenMemoryVaultName,
  MEMORY_VAULT_FOLDERS,
  MEMORY_VAULT_MAX_FILE_BYTES,
  memoryVaultStarterContent,
  parseMemoryVaultRelativePath,
  todayEpisodicPath,
  type MemoryVaultListing,
} from '@maka/core/local-memory-vault';

const MEMORY_DIRECTORY = 'memory';

export type MemoryVaultIoResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

export function memoryVaultRoot(workspaceRoot: string): string {
  return join(workspaceRoot, MEMORY_DIRECTORY);
}

export async function ensureMemoryVault(workspaceRoot: string): Promise<MemoryVaultIoResult<string>> {
  const root = memoryVaultRoot(workspaceRoot);
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const folder of MEMORY_VAULT_FOLDERS) {
      await mkdir(join(root, folder), { recursive: true, mode: 0o700 });
    }
    const seeds = ['USER.md', 'TAXONOMY.md', todayEpisodicPath()] as const;
    for (const relative of seeds) {
      const path = join(root, relative);
      try {
        await stat(path);
      } catch {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, memoryVaultStarterContent(relative), { encoding: 'utf8', mode: 0o600 });
      }
    }
    return { ok: true, value: root };
  } catch {
    return { ok: false, message: 'Could not create the memory folder' };
  }
}

export async function listMemoryVault(workspaceRoot: string): Promise<MemoryVaultIoResult<MemoryVaultListing>> {
  const ensured = await ensureMemoryVault(workspaceRoot);
  if (!ensured.ok) return ensured;
  const root = ensured.value;
  const files: Array<{ path: string; updatedAt: number; sizeBytes: number }> = [];
  try {
    await collectMarkdown(root, '', files);
    return { ok: true, value: { root, nodes: buildMemoryVaultTree(files) } };
  } catch {
    return { ok: false, message: 'Could not read the memory folder' };
  }
}

export async function readMemoryVaultFile(
  workspaceRoot: string,
  relativePath: unknown,
): Promise<MemoryVaultIoResult<{ path: string; content: string; updatedAt: number }>> {
  const resolved = await resolveVaultFile(workspaceRoot, relativePath);
  if (!resolved.ok) return resolved;
  try {
    const content = await readFile(resolved.value.absolute, 'utf8');
    const info = await stat(resolved.value.absolute);
    return {
      ok: true,
      value: {
        path: resolved.value.relative,
        content,
        updatedAt: info.mtimeMs,
      },
    };
  } catch {
    return { ok: false, message: 'Memory file not found' };
  }
}

export async function writeMemoryVaultFile(
  workspaceRoot: string,
  relativePath: unknown,
  content: unknown,
): Promise<MemoryVaultIoResult<{ path: string; updatedAt: number }>> {
  if (typeof content !== 'string') return { ok: false, message: 'Memory file content must be text' };
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MEMORY_VAULT_MAX_FILE_BYTES) {
    return { ok: false, message: 'Memory file is too large' };
  }
  const resolved = await resolveVaultFile(workspaceRoot, relativePath, { create: true });
  if (!resolved.ok) return resolved;
  try {
    await mkdir(dirname(resolved.value.absolute), { recursive: true, mode: 0o700 });
    await writeFile(resolved.value.absolute, content, { encoding: 'utf8', mode: 0o600 });
    const info = await stat(resolved.value.absolute);
    return { ok: true, value: { path: resolved.value.relative, updatedAt: info.mtimeMs } };
  } catch {
    return { ok: false, message: 'Could not write the memory file' };
  }
}

export async function deleteMemoryVaultFile(
  workspaceRoot: string,
  relativePath: unknown,
): Promise<MemoryVaultIoResult<{ path: string }>> {
  const relative = parseMemoryVaultRelativePath(relativePath);
  if (!relative || relative === 'MEMORY.md') {
    return { ok: false, message: 'That memory file cannot be deleted' };
  }
  const resolved = await resolveVaultFile(workspaceRoot, relative);
  if (!resolved.ok) return resolved;
  try {
    await rm(resolved.value.absolute);
    return { ok: true, value: { path: resolved.value.relative } };
  } catch {
    return { ok: false, message: 'Could not delete the memory file' };
  }
}

async function collectMarkdown(
  root: string,
  prefix: string,
  files: Array<{ path: string; updatedAt: number; sizeBytes: number }>,
): Promise<void> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  for (const entry of entries) {
    if (isHiddenMemoryVaultName(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectMarkdown(root, relative, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const parsed = parseMemoryVaultRelativePath(relative);
    if (!parsed) continue;
    const info = await stat(join(root, relative));
    files.push({ path: parsed, updatedAt: info.mtimeMs, sizeBytes: info.size });
  }
}

async function resolveVaultFile(
  workspaceRoot: string,
  relativePath: unknown,
  options?: { create?: boolean },
): Promise<MemoryVaultIoResult<{ relative: string; absolute: string }>> {
  const relative = parseMemoryVaultRelativePath(relativePath);
  if (!relative) return { ok: false, message: 'Invalid memory file path' };
  const ensured = await ensureMemoryVault(workspaceRoot);
  if (!ensured.ok) return ensured;
  const absolute = join(ensured.value, relative);
  if (!isPathInside(ensured.value, absolute)) {
    return { ok: false, message: 'Memory path is not an allowed regular file' };
  }
  if (!options?.create) {
    try {
      const info = await stat(absolute);
      if (!info.isFile()) return { ok: false, message: 'Memory path is not an allowed regular file' };
    } catch {
      return { ok: false, message: 'Memory file not found' };
    }
  }
  return { ok: true, value: { relative, absolute } };
}
