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

import type { UiCatalog, UiLocale } from '@maka/core/ui-locale';

export type SettingsSharedCopy = {
  modalLabel: string;
  contentLabel: string;
  sidebarLabel: string;
  navigationLabel: string;
  backToApp: string;
  close: string;
  loading: string;
  retry: string;
  save: string;
  cancel: string;
  copy: string;
  copied: string;
  failed: string;
  settingsLoadFailed: string;
  usageLoadFailed: string;
  runtimeHost: string;
  runtimeHostUnavailable: string;
  unknownError: string;
  unavailablePage: string;
  ready: string;
  showDetails: string;
  hideDetails: string;
  /**
   * SettingsSection group titles for pages whose own copy module has no
   * suitable label. Group titles live together (here, and in
   * settings-preferences-copy's `sections`) rather than beside each control's
   * copy: a group names a SET of settings, and keeping the set names adjacent
   * is what makes an inconsistent grouping visible when someone edits one.
   */
  groups: {
    memorySources: string;
    memorySourcesHelp: string;
    searchProvider: string;
    searchProviderHelp: string;
    searchBehavior: string;
    searchBehaviorHelp: string;
    memoryDocument: string;
    memoryDocumentHelp: string;
    memoryEntries: string;
    memoryEntriesHelp: string;
  };
};

const SETTINGS_SHARED_COPY_BY_LOCALE = {
  zh: {
    modalLabel: '设置',
    contentLabel: '设置内容',
    sidebarLabel: '设置侧栏',
    navigationLabel: '设置分组',
    backToApp: '返回应用',
    close: '关闭',
    loading: '正在加载设置',
    retry: '重试',
    save: '保存',
    cancel: '取消',
    copy: '复制',
    copied: '已复制',
    failed: '失败',
    settingsLoadFailed: '载入设置失败',
    usageLoadFailed: '载入使用统计失败',
    runtimeHost: 'Runtime Host',
    runtimeHostUnavailable: '这个 Runtime Host 当前不可用。请选择其他 Host，或在“项目”中重试连接。',
    unknownError: '出现错误，请稍后重试。',
    unavailablePage: '该设置页已纳入 Sharker 设置树，会随对应 runtime 能力一起工作。',
    showDetails: '展开详情',
    hideDetails: '收起详情',
    ready: '就绪',
    groups: {
      memorySources: '记忆',
      memorySourcesHelp: '本机记忆是可见的 Markdown 文件夹。助手会自动增删改查，你也可以在这里手改。',
      memoryDocument: '记忆文件夹',
      memoryDocumentHelp: '文件夹里的 Markdown 就是记忆。点文件预览，点编辑即可手改。',
      memoryEntries: '已记住的内容',
      memoryEntriesHelp: '可以筛选、手动添加，或把不再需要的条目归档。',
      searchProvider: '搜索服务商',
      searchProviderHelp: '联网搜索使用的服务商与凭据。',
      searchBehavior: '搜索行为',
      searchBehaviorHelp: '什么时候发起搜索，以及每次取回多少结果。',
    },
  },
  en: {
    modalLabel: 'Settings',
    contentLabel: 'Settings content',
    sidebarLabel: 'Settings sidebar',
    navigationLabel: 'Settings sections',
    backToApp: 'Back to app',
    close: 'Close',
    loading: 'Loading settings',
    retry: 'Try again',
    save: 'Save',
    cancel: 'Cancel',
    copy: 'Copy',
    copied: 'Copied',
    failed: 'Failed',
    settingsLoadFailed: 'Could not load settings',
    usageLoadFailed: 'Could not load usage statistics',
    runtimeHost: 'Runtime Host',
    runtimeHostUnavailable: 'This Runtime Host is unavailable. Choose another Host or retry the connection under Projects.',
    unknownError: 'Something went wrong. Try again.',
    unavailablePage: 'This page is part of the Sharker settings tree and will activate with its runtime capability.',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    ready: 'Ready',
    groups: {
      memorySources: 'Memory',
      memorySourcesHelp: 'Local memory is a visible markdown folder. The assistant can create, read, update, and delete files; you can also edit them here.',
      memoryDocument: 'Memory folder',
      memoryDocumentHelp: 'Markdown files in this folder are the memory. Open one to preview it, then Edit to change it.',
      memoryEntries: 'What Sharker remembers',
      memoryEntriesHelp: 'Filter entries, add one manually, or archive what is no longer needed.',
      searchProvider: 'Search provider',
      searchProviderHelp: 'The provider and credentials web search uses.',
      searchBehavior: 'Search behavior',
      searchBehaviorHelp: 'When a search runs, and how many results it returns.',
    },
  },
} satisfies UiCatalog<SettingsSharedCopy>;

export function getSettingsSharedCopy(locale: UiLocale): SettingsSharedCopy {
  return SETTINGS_SHARED_COPY_BY_LOCALE[locale];
}
