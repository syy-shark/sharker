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

export type BrowserCopy = {
  unsupportedScheme: string;
  invalidUrl: string;
  openFailed: string;
  navigationFailed: string;
  navigationFailedDetail: string;
  panelAria: string;
  panelAriaWithTitle: (title: string) => string;
  insecure: string;
  backAria: string;
  back: string;
  forwardAria: string;
  forward: string;
  stopAria: string;
  refreshAria: string;
  stop: string;
  refresh: string;
  addressAria: string;
  addressPlaceholder: string;
  homeAria: string;
  home: string;
  closeAria: string;
  close: string;
  title: string;
  description: string;
  searchSubmit: string;
  searchAria: string;
};

const BROWSER_COPY = {
  zh: {
    unsupportedScheme: '嵌入式浏览器只支持打开 HTTP/HTTPS 网页地址。',
    invalidUrl: '这个地址无法识别，请检查网址后重试。',
    openFailed: '无法打开地址',
    navigationFailed: '浏览器导航失败',
    navigationFailedDetail: '页面暂时无法打开，请稍后重试。',
    panelAria: '嵌入式浏览器',
    panelAriaWithTitle: (title) => `嵌入式浏览器：${title}`,
    insecure: '这个站点用 HTTP 传输，连接未加密。',
    backAria: '浏览器后退',
    back: '后退',
    forwardAria: '浏览器前进',
    forward: '前进',
    stopAria: '停止加载页面',
    refreshAria: '刷新页面',
    stop: '停止',
    refresh: '刷新',
    addressAria: '搜索 Google 或输入网址',
    addressPlaceholder: '搜索 Google 或输入网址',
    homeAria: '打开新标签页',
    home: '新标签页',
    closeAria: '关闭浏览器页面',
    close: '关闭页面',
    title: '新标签页',
    description: '搜索 Google，或输入网址回车打开。',
    searchSubmit: '搜索',
    searchAria: '搜索 Google',
  },
  en: {
    unsupportedScheme: 'The embedded browser only supports HTTP and HTTPS addresses.',
    invalidUrl: 'This address is not valid. Check it and try again.',
    openFailed: 'Could not open address',
    navigationFailed: 'Browser navigation failed',
    navigationFailedDetail: 'The page could not be opened. Try again later.',
    panelAria: 'Embedded browser',
    panelAriaWithTitle: (title) => `Embedded browser: ${title}`,
    insecure: 'This site is served over HTTP, so the connection is not encrypted.',
    backAria: 'Go back in browser',
    back: 'Back',
    forwardAria: 'Go forward in browser',
    forward: 'Forward',
    stopAria: 'Stop loading page',
    refreshAria: 'Reload page',
    stop: 'Stop',
    refresh: 'Reload',
    addressAria: 'Search Google or enter an address',
    addressPlaceholder: 'Search Google or enter an address',
    homeAria: 'Open a new tab page',
    home: 'New tab',
    closeAria: 'Close browser page',
    close: 'Close page',
    title: 'New tab',
    description: 'Search Google, or type an address and press Enter.',
    searchSubmit: 'Search',
    searchAria: 'Search Google',
  },
} satisfies UiCatalog<BrowserCopy>;

export function getBrowserCopy(locale: UiLocale): BrowserCopy {
  return BROWSER_COPY[locale];
}
