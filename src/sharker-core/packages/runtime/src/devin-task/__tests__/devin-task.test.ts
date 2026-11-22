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
 * 覆盖任务接收、派发和结果监听的正常路径与失败路径。
 * 全部使用注入的 fetch 或内存 mock，不访问 api.devin.ai。
 *
 * @see ../ARCH.md
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DEVIN_MESSAGE_PAGE_LIMIT, DevinTaskAdapter } from '../adapter.js';
import {
  DEVIN_DOCUMENTED_API_ORIGIN,
  DEVIN_DOCUMENTED_ROUTES,
  DEVIN_SESSION_STATUSES,
  DevinTransportError,
  projectDevinPhase,
  type DevinHttpFetch,
  type DevinHttpResponse,
  type DevinSessionSnapshot,
} from '../index.js';
import { createHttpDevinTransport } from '../http-transport.js';
import { createMockDevinTransport, type DevinTransportCall } from '../mock-transport.js';

const ORG_ID = 'org-abc123';
const SESSION_ID = 'devin-abc123';
const API_KEY = 'cog_test_secret';

describe('Devin task phase', () => {
  test('projects only the documented terminal statuses as finished work', () => {
    assert.deepEqual(
      DEVIN_SESSION_STATUSES.map((status) => [status, projectDevinPhase(status)]),
      [
        ['new', 'in_progress'],
        ['claimed', 'in_progress'],
        ['running', 'in_progress'],
        ['exit', 'succeeded'],
        ['error', 'failed'],
        ['suspended', 'suspended'],
        ['resuming', 'in_progress'],
      ],
    );
    assert.equal(projectDevinPhase('queued'), 'unknown');
  });
});

describe('DevinTaskAdapter acceptance and mock dispatch', () => {
  test('rejects a blank prompt before calling the transport', () => {
    const transport = createMockDevinTransport();
    const adapter = new DevinTaskAdapter({ transport });

    const rejected = adapter.accept({ prompt: '   ', title: 'unused' });

    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.equal(rejected.error.kind, 'invalid_request');
    assert.equal(transport.calls.length, 0);
  });

  test('accepts a task locally and dispatches the trimmed prompt', async () => {
    const transport = createMockDevinTransport({
      createSession: (input) => snapshot('new', { title: input.title ?? null, tags: input.tags ? [...input.tags] : [] }),
    });
    const adapter = new DevinTaskAdapter({ transport, createLocalTaskId: () => 'local-1' });

    const accepted = adapter.accept({
      prompt: '  Fix the failing test  ',
      title: 'Failure',
      tags: ['sharker'],
      devinMode: 'lite',
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.task.localTaskId, 'local-1');
    assert.equal(accepted.task.request.prompt, 'Fix the failing test');
    assert.equal(transport.calls.length, 0);

    const dispatched = await adapter.dispatch(accepted.task);
    assert.equal(dispatched.ok, true);
    if (!dispatched.ok) return;
    assert.equal(dispatched.task.session.sessionId, SESSION_ID);
    assert.equal(dispatched.task.session.phase, 'in_progress');
    assert.deepEqual(transport.calls[0], {
      op: 'createSession',
      input: {
        prompt: 'Fix the failing test',
        title: 'Failure',
        tags: ['sharker'],
        devinMode: 'lite',
      },
    });
  });

  test('returns a scripted create failure without pretending the task was dispatched', async () => {
    const transport = createMockDevinTransport({
      createFailure: new DevinTransportError({
        kind: 'http',
        message: 'Devin request failed (403): Forbidden',
        status: 403,
        title: 'Forbidden',
      }),
    });
    const adapter = new DevinTaskAdapter({ transport, createLocalTaskId: () => 'local-1' });
    const accepted = adapter.accept({ prompt: 'Do the task' });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;

    const dispatched = await adapter.dispatch(accepted.task);

    assert.equal(dispatched.ok, false);
    if (dispatched.ok) return;
    assert.equal(dispatched.error.status, 403);
    assert.equal(dispatched.error.title, 'Forbidden');
    assert.equal(transport.calls.length, 1);
  });

  test('listens until exit and keeps the latest devin message', async () => {
    const seen: string[] = [];
    const transport = createMockDevinTransport({
      sessions: {
        [SESSION_ID]: {
          snapshots: [
            snapshot('running', { statusDetail: 'working', documentedStatusDetail: 'working' }),
            snapshot('exit', {
              pullRequests: [{ url: 'https://example.test/pr/1', state: 'open' }],
              structuredOutput: { summary: 'done' },
            }),
          ],
          messages: [
            { eventId: 'e1', source: 'user', message: 'please fix it', createdAt: 1 },
            { eventId: 'e2', source: 'devin', message: 'older note', createdAt: 2 },
            { eventId: 'e3', source: 'devin', message: 'patch is ready', createdAt: 3 },
          ],
        },
      },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, {
      maxPolls: 5,
      intervalMs: 0,
      onSnapshot: (session) => seen.push(session.status),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.polls, 2);
    assert.deepEqual(seen, ['running', 'exit']);
    assert.equal(result.observation.latestDevinMessage, 'patch is ready');
    assert.deepEqual(result.observation.session.pullRequests, [
      { url: 'https://example.test/pr/1', state: 'open' },
    ]);
    assert.deepEqual(result.observation.session.structuredOutput, { summary: 'done' });
    assert.equal(result.observation.messagesTruncated, false);
    assert.deepEqual(
      transport.calls.map((call) => call.op),
      ['getSession', 'getSession', 'listMessages'],
    );
  });

  test('treats a Devin error status as an observed failure, not a transport failure', async () => {
    const transport = createMockDevinTransport({
      sessions: {
        [SESSION_ID]: {
          snapshots: [snapshot('error', { statusDetail: 'error', documentedStatusDetail: 'error' })],
          messages: [{ eventId: 'e1', source: 'devin', message: 'the command failed', createdAt: 4 }],
        },
      },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, { maxPolls: 3, intervalMs: 0 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome, 'failed');
    assert.equal(result.observation.session.phase, 'failed');
    assert.equal(result.observation.latestDevinMessage, 'the command failed');
  });

  test('stops on suspended and does not send a follow-up message', async () => {
    const transport = createMockDevinTransport({
      sessions: {
        [SESSION_ID]: {
          snapshots: [snapshot('suspended', { statusDetail: 'inactivity', documentedStatusDetail: 'inactivity' })],
          messages: [],
        },
      },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, { maxPolls: 3, intervalMs: 0 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome, 'suspended');
    assert.deepEqual(
      transport.calls.map((call) => call.op),
      ['getSession', 'listMessages'],
    );
  });

  test('does not treat running plus finished as terminal', async () => {
    const transport = createMockDevinTransport({
      sessions: {
        [SESSION_ID]: {
          snapshots: [snapshot('running', { statusDetail: 'finished', documentedStatusDetail: 'finished' })],
        },
      },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, { maxPolls: 1 });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.outcome, 'timed_out');
    assert.equal(result.observation?.session.statusDetail, 'finished');
    assert.equal(result.observation?.session.phase, 'in_progress');
    assert.deepEqual(ops(transport.calls), ['getSession']);
  });

  test('refuses a multi-poll listen that does not choose an interval', async () => {
    const transport = createMockDevinTransport({
      sessions: { [SESSION_ID]: { snapshots: [snapshot('running')] } },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, { maxPolls: 2 });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.outcome, 'invalid_request');
    assert.equal(transport.calls.length, 0);
  });

  test('stops when the poll budget runs out on a still-running session', async () => {
    let sleeps = 0;
    const transport = createMockDevinTransport({
      sessions: { [SESSION_ID]: { snapshots: [snapshot('running')] } },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, {
      maxPolls: 2,
      intervalMs: 25,
      sleep: async () => {
        sleeps += 1;
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.outcome, 'timed_out');
    assert.equal(result.polls, 2);
    assert.equal(sleeps, 1);
  });

  test('aborts before the first read and again while waiting', async () => {
    const transport = createMockDevinTransport({
      sessions: { [SESSION_ID]: { snapshots: [snapshot('running'), snapshot('exit')] } },
    });
    const adapter = new DevinTaskAdapter({ transport });
    const already = new AbortController();
    already.abort();

    const immediate = await adapter.listen(SESSION_ID, {
      maxPolls: 3,
      intervalMs: 0,
      signal: already.signal,
    });
    assert.equal(immediate.ok, false);
    if (!immediate.ok) assert.equal(immediate.outcome, 'aborted');
    assert.equal(immediate.polls, 0);
    assert.equal(transport.calls.length, 0);

    const controller = new AbortController();
    const waited = await adapter.listen(SESSION_ID, {
      maxPolls: 3,
      intervalMs: 10,
      signal: controller.signal,
      sleep: async () => {
        controller.abort();
      },
    });
    assert.equal(waited.ok, false);
    if (!waited.ok) {
      assert.equal(waited.outcome, 'aborted');
      assert.equal(waited.observation?.session.status, 'running');
    }
    assert.deepEqual(ops(transport.calls), ['getSession']);
  });

  test('reports a message read failure after a terminal session without dropping the snapshot', async () => {
    const transport = createMockDevinTransport({
      sessions: {
        [SESSION_ID]: {
          snapshots: [snapshot('exit')],
          messageFailure: new DevinTransportError({
            kind: 'http',
            message: 'Devin request failed (500): HTTP 500',
            status: 500,
            title: 'HTTP 500',
          }),
        },
      },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, { maxPolls: 2, intervalMs: 0 });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.outcome, 'transport_error');
    assert.equal(result.error.status, 500);
    assert.equal(result.observation?.session.status, 'exit');
  });

  test('can stop on a terminal status without reading messages', async () => {
    const transport = createMockDevinTransport({
      sessions: { [SESSION_ID]: { snapshots: [snapshot('exit')] } },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, {
      maxPolls: 2,
      intervalMs: 0,
      includeMessages: false,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.observation.latestDevinMessage, null);
    assert.deepEqual(ops(transport.calls), ['getSession']);
  });
});

describe('HTTP Devin transport', () => {
  test('builds the documented create, read, and message requests with an injected fetch', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('global fetch must not be used');
    }) as typeof fetch;
    try {
      const seen: Array<{ url: string; init: { method: string; headers: Record<string, string>; body?: string } }> = [];
      let sessionReads = 0;
      let messageReads = 0;
      const fetchImpl: DevinHttpFetch = async (url, init) => {
        seen.push({ url, init });
        if (init.method === 'POST') return jsonResponse(sessionJson('new'));
        if (url.includes('/messages')) {
          messageReads += 1;
          if (messageReads === 1) {
            return jsonResponse({
              items: [{ event_id: 'e1', source: 'user', message: 'start', created_at: 1 }],
              has_next_page: true,
              end_cursor: 'cursor-1',
            });
          }
          if (messageReads > DEVIN_MESSAGE_PAGE_LIMIT) {
            throw new Error('message pagination did not stop');
          }
          return jsonResponse({
            items: [{ event_id: 'e2', source: 'devin', message: 'ready', created_at: 2 }],
            has_next_page: false,
            end_cursor: null,
          });
        }
        sessionReads += 1;
        return jsonResponse(sessionReads === 1 ? sessionJson('running') : sessionJson('exit'));
      };
      const transport = createHttpDevinTransport({ orgId: ORG_ID, apiKey: API_KEY, fetch: fetchImpl });
      assert.equal(seen.length, 0);
      const adapter = new DevinTaskAdapter({ transport, createLocalTaskId: () => 'local-http' });
      const accepted = adapter.accept({
        prompt: 'Investigate the failure',
        playbookId: 'playbook-1',
        repos: ['apache/sharker'],
        devinMode: 'normal',
      });
      assert.equal(accepted.ok, true);
      if (!accepted.ok) return;

      const dispatched = await adapter.dispatch(accepted.task);
      assert.equal(dispatched.ok, true);
      if (!dispatched.ok) return;
      const listened = await adapter.listen(dispatched.task.session.sessionId, {
        maxPolls: 4,
        intervalMs: 0,
      });

      assert.equal(listened.ok, true);
      if (!listened.ok) return;
      assert.equal(listened.outcome, 'succeeded');
      assert.equal(listened.polls, 2);
      assert.equal(listened.observation.latestDevinMessage, 'ready');
      assert.equal(listened.observation.session.url, 'https://example.test/sessions/devin-abc123');

      const created = seen[0];
      assert.ok(created);
      assert.equal(created.init.method, 'POST');
      assert.equal(created.url, `${DEVIN_DOCUMENTED_API_ORIGIN}${DEVIN_DOCUMENTED_ROUTES.createSession.replace('{org_id}', ORG_ID)}`);
      assert.equal(created.init.headers.authorization, `Bearer ${API_KEY}`);
      assert.deepEqual(JSON.parse(created.init.body ?? '{}'), {
        prompt: 'Investigate the failure',
        playbook_id: 'playbook-1',
        repos: ['apache/sharker'],
        devin_mode: 'normal',
      });
      assert.equal(Object.hasOwn(JSON.parse(created.init.body ?? '{}'), 'apiKey'), false);

      const messageUrls = seen.filter((call) => call.url.includes('/messages')).map((call) => new URL(call.url));
      assert.equal(messageUrls.length, 2);
      assert.equal(
        messageUrls[0]?.pathname,
        DEVIN_DOCUMENTED_ROUTES.listMessages.replace('{org_id}', ORG_ID).replace('{devin_id}', SESSION_ID),
      );
      assert.equal(messageUrls[0]?.searchParams.get('first'), '100');
      assert.equal(messageUrls[0]?.searchParams.get('after'), null);
      assert.equal(messageUrls[1]?.searchParams.get('after'), 'cursor-1');
      assert.equal(
        seen.filter((call) => call.init.method === 'GET' && !call.url.includes('/messages')).map((call) => new URL(call.url).pathname)[1],
        DEVIN_DOCUMENTED_ROUTES.getSession.replace('{org_id}', ORG_ID).replace('{devin_id}', SESSION_ID),
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('returns the documented problem body for an unauthorized create and redacts the key', async () => {
    const fetchImpl: DevinHttpFetch = async () =>
      jsonResponse(
        {
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: `rejected ${API_KEY}`,
          error_code: 'unauthorized',
        },
        401,
      );
    const transport = createHttpDevinTransport({ orgId: ORG_ID, apiKey: API_KEY, fetch: fetchImpl });
    const adapter = new DevinTaskAdapter({ transport, createLocalTaskId: () => 'local-401' });
    const accepted = adapter.accept({ prompt: 'This should not run remotely' });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;

    const dispatched = await adapter.dispatch(accepted.task);

    assert.equal(dispatched.ok, false);
    if (dispatched.ok) return;
    assert.equal(dispatched.error.kind, 'http');
    assert.equal(dispatched.error.status, 401);
    assert.equal(dispatched.error.title, 'Unauthorized');
    assert.equal(dispatched.error.errorCode, 'unauthorized');
    assert.match(dispatched.error.message, /\[redacted\]/);
    assert.equal(dispatched.error.message.includes(API_KEY), false);
    assert.equal(dispatched.error.detail?.includes(API_KEY), false);
  });

  test('does not copy a non-JSON error body into the failure', async () => {
    const transport = createHttpDevinTransport({
      orgId: ORG_ID,
      apiKey: API_KEY,
      fetch: async () => ({
        ok: false,
        status: 500,
        async text() {
          return `<html>${API_KEY}</html>`;
        },
      }),
    });

    await assert.rejects(transport.getSession(SESSION_ID), (error: unknown) => {
      assert.ok(error instanceof DevinTransportError);
      assert.equal(error.failure.kind, 'http');
      assert.equal(error.failure.status, 500);
      assert.equal(error.message.includes(API_KEY), false);
      assert.equal(error.message.includes('<html>'), false);
      return true;
    });
  });

  test('rejects unsafe ids and undocumented modes before fetch', async () => {
    let calls = 0;
    const fetchImpl: DevinHttpFetch = async () => {
      calls += 1;
      throw new Error('fetch should not be called');
    };
    assert.throws(
      () => createHttpDevinTransport({ orgId: 'org-abc/../../admin', apiKey: API_KEY, fetch: fetchImpl }),
      (error: unknown) => error instanceof DevinTransportError && error.failure.kind === 'invalid_request',
    );
    const transport = createHttpDevinTransport({ orgId: ORG_ID, apiKey: API_KEY, fetch: fetchImpl });
    await assert.rejects(transport.createSession({ prompt: 'x', devinMode: 'turbo' as 'normal' }), (error: unknown) => {
      assert.ok(error instanceof DevinTransportError);
      assert.equal(error.failure.kind, 'invalid_request');
      return true;
    });
    await assert.rejects(transport.listMessages(SESSION_ID, { first: 201 }), (error: unknown) => {
      assert.ok(error instanceof DevinTransportError);
      assert.equal(error.failure.kind, 'invalid_request');
      return true;
    });
    await assert.rejects(transport.getSession('session-without-prefix'), (error: unknown) => {
      assert.ok(error instanceof DevinTransportError);
      assert.equal(error.failure.kind, 'invalid_request');
      return true;
    });
    assert.equal(calls, 0);
  });

  test('rejects a session body that omits a documented required field', async () => {
    const transport = createHttpDevinTransport({
      orgId: ORG_ID,
      apiKey: API_KEY,
      fetch: async () => jsonResponse({ ...sessionJson('exit'), pull_requests: undefined }),
    });

    await assert.rejects(transport.getSession(SESSION_ID), (error: unknown) => {
      assert.ok(error instanceof DevinTransportError);
      assert.equal(error.failure.kind, 'invalid_response');
      assert.match(error.message, /pull_requests/);
      return true;
    });
  });

  test('follows at most the local message page limit', async () => {
    let pages = 0;
    const transport = createHttpDevinTransport({
      orgId: ORG_ID,
      apiKey: API_KEY,
      fetch: async (url) => {
        if (!url.includes('/messages')) return jsonResponse(sessionJson('exit'));
        pages += 1;
        return jsonResponse({
          items: [{ event_id: `e${pages}`, source: 'devin', message: `page ${pages}`, created_at: pages }],
          has_next_page: true,
          end_cursor: `cursor-${pages}`,
        });
      },
    });
    const adapter = new DevinTaskAdapter({ transport });

    const result = await adapter.listen(SESSION_ID, { maxPolls: 2, intervalMs: 0 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(pages, DEVIN_MESSAGE_PAGE_LIMIT);
    assert.equal(result.observation.messagesTruncated, true);
    assert.equal(result.observation.latestDevinMessage, `page ${DEVIN_MESSAGE_PAGE_LIMIT}`);
  });
});

function snapshot(status: string, overrides: Partial<DevinSessionSnapshot> = {}): DevinSessionSnapshot {
  const resolvedStatus = overrides.status ?? status;
  const documentedStatus = (DEVIN_SESSION_STATUSES as readonly string[]).includes(resolvedStatus)
    ? (resolvedStatus as DevinSessionSnapshot['documentedStatus'])
    : null;
  return {
    sessionId: SESSION_ID,
    url: 'https://example.test/sessions/devin-abc123',
    documentedStatus,
    statusDetail: null,
    documentedStatusDetail: null,
    title: 'task',
    tags: [],
    pullRequests: [],
    structuredOutput: null,
    orgId: ORG_ID,
    createdAt: 10,
    updatedAt: 11,
    ...overrides,
    status: resolvedStatus,
    phase: projectDevinPhase(resolvedStatus),
  };
}

function sessionJson(status: string): Record<string, unknown> {
  return {
    session_id: SESSION_ID,
    url: 'https://example.test/sessions/devin-abc123',
    status,
    status_detail: status === 'running' ? 'working' : null,
    tags: ['sharker'],
    org_id: ORG_ID,
    created_at: 10,
    updated_at: 11,
    acus_consumed: 0,
    pull_requests: [{ pr_url: 'https://example.test/pr/1', pr_state: 'open' }],
    title: 'Hello',
    structured_output: null,
  };
}

function jsonResponse(body: unknown, status = 200): DevinHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function ops(calls: readonly DevinTransportCall[]): string[] {
  return calls.map((call) => call.op);
}
