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

import type { UiLocale } from '@sharker/core/ui-locale';
import type { McpServerConfig } from '@sharker/core/mcp';

export type McpCatalogId = 'playwright';

export type McpCatalogEntry = {
  id: McpCatalogId;
  name: string;
  description: string;
  category: string;
  /** Text fallback glyph for entries without a library brand mark (see
      mcp-brand-marks.tsx). Branded entries render their real mark instead, so
      they omit this. */
  mark?: string;
  aliases?: string[];
  config: McpServerConfig;
  setupRequired?: boolean;
  setupLabel?: string;
  platform?: 'darwin';
};

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'playwright',
    name: '浏览器自动化',
    description: '让 Sharker 通过 Playwright 读取和操作真实网页。',
    category: '设计与开发',
    aliases: ['Chrome', 'Playwright', 'browser'],
    config: { enabled: true, command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
  },
];

type McpCatalogLocalizedCopy = Pick<McpCatalogEntry, 'name' | 'description' | 'category'> & {
  setupLabel: string | undefined;
};

const MCP_CATALOG_ENGLISH_COPY: Record<McpCatalogId, McpCatalogLocalizedCopy> = {
  playwright: {
    name: 'Browser automation',
    description: 'Let Sharker read and operate real web pages through Playwright.',
    category: 'Design and development',
    setupLabel: undefined,
  },
};

export function getMcpCatalog(locale: UiLocale): McpCatalogEntry[] {
  if (locale === 'zh') return MCP_CATALOG;
  return MCP_CATALOG.map((entry) => ({ ...entry, ...MCP_CATALOG_ENGLISH_COPY[entry.id] }));
}

export function catalogEntryMatches(entry: McpCatalogEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return [entry.id, entry.name, entry.description, entry.category, ...(entry.aliases ?? [])]
    .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}
