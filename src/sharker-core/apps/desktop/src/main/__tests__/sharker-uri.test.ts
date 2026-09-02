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
  isSharkerUriCandidate,
  isSafeExternalScheme,
  parseSharkerUri,
} from '@sharker/ui/sharker-uri';

describe('Sharker URI safety boundary', () => {
  it('parses only supported settings and compose destinations', () => {
    assert.deepEqual(parseSharkerUri('sharker://settings/general'), {
      kind: 'settings',
      section: 'general',
    });
    assert.deepEqual(parseSharkerUri('sharker://compose?text=hello'), {
      kind: 'compose',
      text: 'hello',
    });
    assert.deepEqual(parseSharkerUri('sharker://compose/?text=%E4%BD%A0%E5%A5%BD'), {
      kind: 'compose',
      text: '你好',
    });
  });

  it('rejects malformed, case-variant, and oversized internal URIs', () => {
    const invalidInputs: unknown[] = [
      '',
      null,
      'https://example.com/',
      'Sharker://settings/account',
      'sharker://',
      'sharker:settings/account',
      `sharker://compose?text=${'x'.repeat(8192)}`,
    ];
    for (const input of invalidInputs) {
      assert.equal(parseSharkerUri(input as string), null, String(input));
    }
  });

  it('rejects widened settings, compose, and action namespaces', () => {
    const invalidHrefs = [
      'sharker://settings/zzz',
      'sharker://settings/',
      'sharker://settings/account/edit',
      'sharker://settings/account?force=1',
      'sharker://settings/account#section',
      'sharker://SETTINGS/account',
      'sharker://compose?text=',
      'sharker://compose?other=value',
      'sharker://compose/run?text=hi',
      'sharker://tool/Bash?cmd=ls',
      'sharker:///account',
      'sharker://user@settings/account',
      'sharker://settings:9999/account',
    ];
    for (const href of invalidHrefs) assert.equal(parseSharkerUri(href), null, href);
  });

  it('flags case-variant internal candidates without allowing navigation', () => {
    for (const href of [
      'sharker://settings/account',
      'Sharker://settings/account',
    ]) {
      assert.equal(isSharkerUriCandidate(href), true, href);
      if (!href.startsWith('sharker:')) assert.equal(parseSharkerUri(href), null, href);
    }
    for (const input of [
      'https://example.com/',
      'sharkerfake://oops',
      null,
    ]) {
      assert.equal(isSharkerUriCandidate(input as string), false, String(input));
    }
  });

  it('allows only explicit external schemes', () => {
    for (const href of [
      'http://example.com',
      'https://example.com/path?q=1',
      'mailto:user@example.com',
    ]) {
      assert.equal(isSafeExternalScheme(href), true, href);
    }

    const rejected: unknown[] = [
      '',
      null,
      'not a url',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'sharker://settings/account',
      'ftp://host',
    ];
    for (const href of rejected) {
      assert.equal(isSafeExternalScheme(href as string), false, String(href));
    }
  });
});
