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
import { describe, it } from 'node:test';

import {
  browserStartPageDataUrl,
  isBrowserStartSurfaceUrl,
  normalizeBrowserAddressInput,
} from '../browser.js';

describe('browser address input normalization', () => {
  it('returns stable rejection reasons for non-navigable input', () => {
    assert.deepEqual(normalizeBrowserAddressInput('   '), { ok: false, reason: 'empty' });
    assert.deepEqual(normalizeBrowserAddressInput('javascript:alert(1)'), {
      ok: false,
      reason: 'unsupported_scheme',
    });
    assert.deepEqual(normalizeBrowserAddressInput('http://'), { ok: false, reason: 'invalid_url' });
    assert.deepEqual(normalizeBrowserAddressInput('file:///etc/passwd'), {
      ok: false,
      reason: 'unsupported_scheme',
    });
  });

  it('treats dotted tokens as hosts and everything else as a Google search', () => {
    assert.deepEqual(normalizeBrowserAddressInput('example.com'), {
      ok: true,
      url: 'https://example.com/',
    });
    assert.deepEqual(normalizeBrowserAddressInput('react hooks'), {
      ok: true,
      url: 'https://www.google.com/search?q=react%20hooks',
    });
    const start = browserStartPageDataUrl('light');
    assert.deepEqual(normalizeBrowserAddressInput(start), { ok: true, url: start });
  });

  it('treats the local start page and bare https://google/ as the new-tab surface', () => {
    assert.equal(isBrowserStartSurfaceUrl(''), true);
    assert.equal(isBrowserStartSurfaceUrl('https://google/'), true);
    assert.equal(isBrowserStartSurfaceUrl('https://www.google.com/'), false);
    assert.equal(isBrowserStartSurfaceUrl(browserStartPageDataUrl('dark')), true);
  });
});
