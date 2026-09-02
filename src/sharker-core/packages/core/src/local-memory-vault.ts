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
 * 本机记忆保险库：MEMORY.md 旁的可见文件夹树。
 * Agent 与设置页共用同一套相对路径规则。
 */

export const MEMORY_VAULT_FOLDERS = [
  'episodic',
  'people',
  'projects',
  'users',
  'sites',
  'agent',
  'concepts',
] as const;

export const MEMORY_VAULT_ROOT_FILES = ['MEMORY.md', 'USER.md', 'TAXONOMY.md'] as const;

export const MEMORY_VAULT_MAX_FILE_BYTES = 256 * 1024;

export type MemoryVaultFolder = (typeof MEMORY_VAULT_FOLDERS)[number];

export type MemoryVaultFileNode = {
  readonly kind: 'file';
  readonly name: string;
  readonly path: string;
  readonly updatedAt: number;
  readonly sizeBytes: number;
};

export type MemoryVaultDirNode = {
  readonly kind: 'dir';
  readonly name: string;
  readonly path: string;
  readonly children: readonly MemoryVaultNode[];
};

export type MemoryVaultNode = MemoryVaultFileNode | MemoryVaultDirNode;

export type MemoryVaultListing = {
  readonly root: string;
  readonly nodes: readonly MemoryVaultNode[];
};

const VAULT_FOLDER_SET = new Set<string>(MEMORY_VAULT_FOLDERS);
const VAULT_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}\.md$/;
const HIDDEN_NAMES = new Set([
  'PENDING.md',
  '.memory-bundle-transaction',
]);

export function isMemoryVaultFolder(value: string): value is MemoryVaultFolder {
  return VAULT_FOLDER_SET.has(value);
}

/** 校验保险库内相对路径：posix、一层文件夹、只允许 .md。 */
export function parseMemoryVaultRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replaceAll('\\', '/');
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..')) return undefined;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 1) {
    return VAULT_FILE_NAME.test(parts[0]) ? parts[0] : undefined;
  }
  if (parts.length === 2 && isMemoryVaultFolder(parts[0]) && VAULT_FILE_NAME.test(parts[1])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return undefined;
}

export function isMemoryVaultRootFile(path: string): boolean {
  return (MEMORY_VAULT_ROOT_FILES as readonly string[]).includes(path);
}

export function isHiddenMemoryVaultName(name: string): boolean {
  return (
    HIDDEN_NAMES.has(name) ||
    name.startsWith('.') ||
    name.endsWith('.bak') ||
    name.endsWith('.tmp')
  );
}

export function memoryVaultStarterContent(path: string, now = new Date()): string {
  const day = formatVaultDay(now);
  if (path === 'USER.md') {
    return ['# USER', '', '写你希望 Sharker 长期记住的身份与偏好。', ''].join('\n');
  }
  if (path === 'TAXONOMY.md') {
    return [
      '# TAXONOMY',
      '',
      '- episodic：按日流水',
      '- people / projects / users / sites：实体笔记',
      '- agent：助手自己的工作笔记',
      '- concepts：概念与结论',
      '',
    ].join('\n');
  }
  if (path === 'MEMORY.md') {
    return ['# Sharker Memory', '', '长期事实与偏好。按日流水写在 `episodic/`。', ''].join('\n');
  }
  if (path.startsWith('episodic/')) {
    return [`# ${day}`, '', `- ${formatVaultTime(now)} 开始记录。`, ''].join('\n');
  }
  const title = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
  return [`# ${title}`, '', ''].join('\n');
}

export function todayEpisodicPath(now = new Date()): string {
  return `episodic/${formatVaultDay(now)}.md`;
}

export function buildMemoryVaultTree(
  files: ReadonlyArray<{ path: string; updatedAt: number; sizeBytes: number }>,
): readonly MemoryVaultNode[] {
  const dirs = new Map<string, MemoryVaultFileNode[]>();
  for (const folder of MEMORY_VAULT_FOLDERS) dirs.set(folder, []);
  const roots: MemoryVaultFileNode[] = [];

  for (const file of files) {
    const path = parseMemoryVaultRelativePath(file.path);
    if (!path) continue;
    const node: MemoryVaultFileNode = {
      kind: 'file',
      name: path.split('/').pop() ?? path,
      path,
      updatedAt: file.updatedAt,
      sizeBytes: file.sizeBytes,
    };
    const slash = path.indexOf('/');
    if (slash === -1) {
      roots.push(node);
      continue;
    }
    const folder = path.slice(0, slash);
    dirs.get(folder)?.push(node);
  }

  const folderNodes: MemoryVaultDirNode[] = MEMORY_VAULT_FOLDERS.map((folder) => ({
    kind: 'dir',
    name: folder,
    path: folder,
    children: (dirs.get(folder) ?? []).sort(compareVaultFiles),
  }));

  return [
    ...MEMORY_VAULT_ROOT_FILES.flatMap((name) => roots.filter((file) => file.path === name)),
    ...roots.filter((file) => !isMemoryVaultRootFile(file.path)).sort(compareVaultFiles),
    ...folderNodes,
  ];
}

function compareVaultFiles(left: MemoryVaultFileNode, right: MemoryVaultFileNode): number {
  return left.name.localeCompare(right.name);
}

function formatVaultDay(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatVaultTime(now: Date): string {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
