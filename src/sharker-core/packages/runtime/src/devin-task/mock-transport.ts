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
 * 进程内的 Devin transport。脚本化成功、失败和轮询序列，供没有 Devin 凭据时验证派发与监听。
 * 它不代表官方服务，也不会把脚本里的对象发给任何主机。
 *
 * @see ./ARCH.md
 */

import {
  DevinTransportError,
  normalizeDevinCreateInput,
  projectDevinPhase,
  type DevinCreateSessionInput,
  type DevinMessagePage,
  type DevinSessionMessage,
  type DevinSessionSnapshot,
  type DevinTaskTransport,
} from './contract.js';

/** 某个会话的后续读取脚本。快照按 getSession 次数前进，停在最后一条。 */
export interface MockDevinPollScript {
  readonly snapshots: readonly DevinSessionSnapshot[];
  readonly messages?: readonly DevinSessionMessage[];
  readonly messageFailure?: DevinTransportError;
}

/** mock 记录的一次调用，测试用来确认没有多打、打错。 */
export interface DevinTransportCall {
  readonly op: 'createSession' | 'getSession' | 'listMessages';
  readonly sessionId?: string;
  readonly input?: DevinCreateSessionInput;
  readonly query?: { readonly after?: string; readonly first?: number };
}

/** 本地 mock 的脚本。未提供 createSession 时生成一条 status=new 的假会话。 */
export interface CreateMockDevinTransportOptions {
  readonly createSession?: (input: DevinCreateSessionInput) => DevinSessionSnapshot;
  readonly createFailure?: DevinTransportError;
  readonly sessions?: Readonly<Record<string, MockDevinPollScript>>;
}

/** 带调用记录的内存 transport。 */
export interface MockDevinTransport extends DevinTaskTransport {
  readonly calls: readonly DevinTransportCall[];
}

/** 创建一个不会出网的 Devin transport。 */
export function createMockDevinTransport(options: CreateMockDevinTransportOptions = {}): MockDevinTransport {
  const calls: DevinTransportCall[] = [];
  const created = new Map<string, DevinSessionSnapshot>();
  const cursors = new Map<string, number>();

  return {
    calls,
    async createSession(input) {
      const normalized = normalizeDevinCreateInput(input);
      calls.push({ op: 'createSession', input: normalized });
      if (options.createFailure) throw options.createFailure;
      const snapshot = options.createSession ? options.createSession(normalized) : defaultSnapshot(normalized);
      created.set(snapshot.sessionId, snapshot);
      return snapshot;
    },
    async getSession(sessionId) {
      calls.push({ op: 'getSession', sessionId });
      const script = options.sessions?.[sessionId];
      if (script) {
        if (script.snapshots.length === 0) {
          throw new DevinTransportError({
            kind: 'invalid_response',
            message: `Mock session ${sessionId} has no snapshots.`,
          });
        }
        const index = cursors.get(sessionId) ?? 0;
        const snapshot = script.snapshots[Math.min(index, script.snapshots.length - 1)];
        cursors.set(sessionId, index + 1);
        if (!snapshot) {
          throw new DevinTransportError({
            kind: 'invalid_response',
            message: `Mock session ${sessionId} has no snapshots.`,
          });
        }
        return snapshot;
      }
      const known = created.get(sessionId);
      if (!known) {
        throw new DevinTransportError({
          kind: 'invalid_request',
          message: `Mock session ${sessionId} was not created or scripted.`,
        });
      }
      return known;
    },
    async listMessages(sessionId, query) {
      calls.push({ op: 'listMessages', sessionId, ...(query !== undefined ? { query } : {}) });
      const script = options.sessions?.[sessionId];
      if (script?.messageFailure) throw script.messageFailure;
      const page: DevinMessagePage = {
        items: script?.messages ? [...script.messages] : [],
        endCursor: null,
        hasNextPage: false,
        truncated: false,
      };
      return page;
    },
  };
}

function defaultSnapshot(input: DevinCreateSessionInput): DevinSessionSnapshot {
  return {
    sessionId: 'devin-mock',
    url: 'https://example.test/mock/devin-mock',
    status: 'new',
    documentedStatus: 'new',
    statusDetail: null,
    documentedStatusDetail: null,
    phase: projectDevinPhase('new'),
    title: input.title ?? null,
    tags: input.tags ? [...input.tags] : [],
    pullRequests: [],
    structuredOutput: null,
    orgId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}
