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

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  deriveSharkerDataRoots,
  resolveSharkerClientDataRoot,
  resolveSharkerWorkspaceRoot,
} from '../workspace-root.js';

describe('Sharker workspace root resolver', () => {
  test('resolves Client-owned data outside every Host State Root', () => {
    assert.equal(
      resolveSharkerClientDataRoot({ platform: 'linux', homeDir: '/home/ada', env: {} }),
      '/home/ada/.config/Sharker',
    );
  });

  test('resolves release and development profiles under each platform application-data root', () => {
    const cases = [
      [
        { platform: 'darwin', homeDir: '/Users/ada', env: {} },
        '/Users/ada/Library/Application Support',
      ],
      [{ platform: 'linux', homeDir: '/home/ada', env: {} }, '/home/ada/.config'],
      [
        {
          platform: 'win32',
          homeDir: 'C:\\Users\\Ada',
          env: { APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming' },
        },
        'C:\\Users\\Ada\\AppData\\Roaming',
      ],
    ] as const;

    for (const [options, base] of cases) {
      const separator = options.platform === 'win32' ? '\\' : '/';
      for (const profileName of ['Sharker', 'Sharker Dev']) {
        const clientDataRoot = `${base}${separator}${profileName}`;
        assert.equal(
          resolveSharkerClientDataRoot({ ...options, profileName }),
          clientDataRoot,
          `${options.platform} ${profileName} Client Data Root`,
        );
        assert.equal(
          resolveSharkerWorkspaceRoot({ ...options, profileName }),
          `${clientDataRoot}${separator}workspaces${separator}default`,
          `${options.platform} ${profileName} Workspace Root`,
        );
      }
    }
  });

  test('derives all subordinate roots from an exact Client Data Root', () => {
    assert.deepEqual(deriveSharkerDataRoots('/custom/sharker-profile', { platform: 'linux' }), {
      clientDataRoot: '/custom/sharker-profile',
      workspaceRoot: '/custom/sharker-profile/workspaces/default',
    });
  });

  test('honors Linux XDG_CONFIG_HOME and falls back from Windows APPDATA', () => {
    assert.equal(
      resolveSharkerClientDataRoot({
        platform: 'linux',
        homeDir: '/home/ada',
        env: { XDG_CONFIG_HOME: '/var/config/ada' },
        profileName: 'Sharker Dev',
      }),
      '/var/config/ada/Sharker Dev',
    );
    for (const XDG_CONFIG_HOME of ['', 'relative/config']) {
      assert.equal(
        resolveSharkerClientDataRoot({
          platform: 'linux',
          homeDir: '/home/ada',
          env: { XDG_CONFIG_HOME },
        }),
        '/home/ada/.config/Sharker',
      );
    }
    assert.equal(
      resolveSharkerClientDataRoot({
        platform: 'win32',
        homeDir: 'C:\\Users\\Ada',
        env: {},
        profileName: 'Sharker Dev',
      }),
      'C:\\Users\\Ada\\AppData\\Roaming\\Sharker Dev',
    );
  });

  test('rejects a profile name that can escape its application-data root', () => {
    for (const profileName of ['', '.', '..', 'Sharker/Dev', 'Sharker\\Dev', 'Sharker\0Dev']) {
      assert.throws(
        () =>
          resolveSharkerClientDataRoot({
            platform: 'linux',
            homeDir: '/home/ada',
            env: {},
            profileName,
          }),
        /non-empty path segment/,
        JSON.stringify(profileName),
      );
    }
  });
});
