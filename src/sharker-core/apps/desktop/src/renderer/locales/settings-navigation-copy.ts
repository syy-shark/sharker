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

import type { SettingsSection } from '@sharker/core/settings';
import type { UiCatalog, UiLocale } from '@sharker/core/ui-locale';
import type { SettingsNavGroup } from '../settings/nav-group-summary.js';

export type SettingsNavigationCopy = {
  groups: Record<SettingsNavGroup, string>;
  sections: Record<SettingsSection, { label: string; description: string }>;
};

const SETTINGS_NAVIGATION_COPY_BY_LOCALE = {
  zh: {
    groups: {
      preferences: '偏好',
      capabilities: '能力',
      activity: '活动',
    },
    sections: {
      general: { label: '通用', description: '显示名称与界面语言、隐私与通知、任务默认。' },
      appearance: { label: '外观', description: '界面主题与调色板。' },
      models: { label: '模型', description: '模型连接、API key 与 OAuth 订阅管理。' },
      usage: { label: '使用统计', description: 'token、模型、工具使用走势与配额追踪。' },
      'archived-tasks': { label: '已归档任务', description: '恢复或彻底删除已归档的任务。' },
      memory: { label: '记忆', description: '本机记忆文件夹，助手自动维护，也可以手改。' },
      search: { label: '联网搜索', description: '联网搜索供应商（如 Tavily）凭据与隐私边界。' },
    },
  },
  en: {
    groups: {
      preferences: 'Preferences',
      capabilities: 'Capabilities',
      activity: 'Activity',
    },
    sections: {
      general: { label: 'General', description: 'Display name and interface language, privacy and notifications, and task defaults.' },
      appearance: { label: 'Appearance', description: 'Interface theme and color palette.' },
      models: { label: 'Models', description: 'Model connections, API keys, and OAuth subscriptions.' },
      usage: { label: 'Usage', description: 'Token, model, tool usage trends, and quota tracking.' },
      'archived-tasks': { label: 'Archived tasks', description: 'Restore or permanently delete archived tasks.' },
      memory: { label: 'Memory', description: 'The local memory folder. The assistant maintains it; you can edit it too.' },
      search: { label: 'Web Search', description: 'Credentials and privacy boundaries for providers such as Tavily.' },
    },
  },
} satisfies UiCatalog<SettingsNavigationCopy>;

export function getSettingsNavigationCopy(locale: UiLocale): SettingsNavigationCopy {
  return SETTINGS_NAVIGATION_COPY_BY_LOCALE[locale];
}
