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
import test from 'node:test';
import { projectProtocolSessionIds } from '../../preload/projected-session-runtime-host.js';
import {
  NEW_TASK_WORKBAR_SESSION_ID,
  desktopSessionKey,
  isNewTaskWorkbarSessionId,
  parseDesktopSessionKey,
  projectRendererSessionId,
} from '../../shared/runtime-host-identity.js';

test('new-task workbar id is not a desktop session key', () => {
  assert.equal(isNewTaskWorkbarSessionId(NEW_TASK_WORKBAR_SESSION_ID), true);
  assert.equal(isNewTaskWorkbarSessionId(desktopSessionKey({
    hostId: 'host-a',
    sessionId: NEW_TASK_WORKBAR_SESSION_ID,
  })), false);
  assert.throws(() => parseDesktopSessionKey(NEW_TASK_WORKBAR_SESSION_ID));
});

test('renderer projection keeps the synthetic new-task id', () => {
  assert.equal(
    projectRendererSessionId('host-a', NEW_TASK_WORKBAR_SESSION_ID),
    NEW_TASK_WORKBAR_SESSION_ID,
  );
  assert.equal(
    projectRendererSessionId('host-a', 'session-1'),
    desktopSessionKey({ hostId: 'host-a', sessionId: 'session-1' }),
  );
});

test('protocol projection does not rewrite the new-task workbar id', () => {
  assert.deepEqual(
    projectProtocolSessionIds('host-a', {
      sessionId: NEW_TASK_WORKBAR_SESSION_ID,
      rootSessionId: 'session-1',
    }),
    {
      sessionId: NEW_TASK_WORKBAR_SESSION_ID,
      rootSessionId: desktopSessionKey({ hostId: 'host-a', sessionId: 'session-1' }),
    },
  );
});
