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
 * 接收一条本地任务、经 transport 派发，并按调用方给定的次数轮询终态。
 * 这里没有定时调度器；不调用 listen 就不会继续读结果。
 *
 * @see ./ARCH.md
 */

import { randomUUID } from 'node:crypto';

import {
  assertDevinSessionId,
  DevinTransportError,
  isAbortError,
  isDevinTerminalStatus,
  latestDevinMessage,
  normalizeDevinCreateInput,
  toDevinFailure,
  withProjectedPhase,
  type DevinCreateSessionInput,
  type DevinFailure,
  type DevinSessionMessage,
  type DevinSessionSnapshot,
  type DevinTaskTransport,
  type DevinTransportCallOptions,
} from './contract.js';

/** 调用方交给 adapter 的本地任务。字段与创建会话的允许子集相同。 */
export interface DevinTaskRequest extends DevinCreateSessionInput {
  readonly localTaskId?: string;
}

/** 已通过本地校验、尚未派发的任务。 */
export interface AcceptedDevinTask {
  readonly localTaskId: string;
  readonly request: DevinCreateSessionInput;
}

/** 已从 transport 拿到会话快照的任务。 */
export interface DispatchedDevinTask extends AcceptedDevinTask {
  readonly session: DevinSessionSnapshot;
}

/** 一次监听看到的会话、消息和截断标记。 */
export interface DevinTaskObservation {
  readonly session: DevinSessionSnapshot;
  readonly messages: readonly DevinSessionMessage[];
  readonly latestDevinMessage: string | null;
  readonly messagesTruncated: boolean;
}

/** `accept` 的结果。失败时没有调用 transport。 */
export type DevinAcceptResult =
  | { readonly ok: true; readonly task: AcceptedDevinTask }
  | { readonly ok: false; readonly error: DevinFailure };

/** `dispatch` 的结果。远端会话进入 error 仍算派发成功，那是之后 listen 要看到的状态。 */
export type DevinDispatchResult =
  | { readonly ok: true; readonly task: DispatchedDevinTask }
  | { readonly ok: false; readonly error: DevinFailure };

/**
 * `listen` 的结果。
 * `ok: true` 表示已经读到公开终态：exit → succeeded，error → failed，suspended → suspended。
 * `ok: false` 表示本地没有完成这次监听。
 */
export type DevinListenResult =
  | {
      readonly ok: true;
      readonly outcome: 'succeeded' | 'failed' | 'suspended';
      readonly observation: DevinTaskObservation;
      readonly polls: number;
    }
  | {
      readonly ok: false;
      readonly outcome: 'timed_out' | 'aborted' | 'transport_error' | 'invalid_request';
      readonly error: DevinFailure;
      readonly observation?: DevinTaskObservation;
      readonly polls: number;
    };

/** 显式监听参数。不提供 sleep 且 intervalMs 为 0 时，轮询之间不设定时器。 */
export interface DevinListenOptions {
  /** 含本次在内的最大 getSession 次数，1 到 10000。 */
  readonly maxPolls: number;
  /**
   * 两次读取之间的等待。`maxPolls` 大于 1 时必填。
   * 传 0 表示紧循环；上限一小时，是本地保护，不是 Devin 的限制。
   */
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly onSnapshot?: (session: DevinSessionSnapshot, poll: number) => void;
  /** 默认 true。终态后继续读 messages。 */
  readonly includeMessages?: boolean;
}

/** adapter 依赖的 transport，以及可选的本地 id 生成器。 */
export interface DevinTaskAdapterOptions {
  readonly transport: DevinTaskTransport;
  readonly createLocalTaskId?: () => string;
}

/** 终态后最多跟随的消息页数。公开默认页大小是 100，这里固定请求 100。 */
export const DEVIN_MESSAGE_PAGE_LIMIT = 5;

/**
 * 任务接收、派发和结果监听。
 * 调度（何时再跑、要不要唤醒会话）留给调用方，不在这里。
 */
export class DevinTaskAdapter {
  private readonly transport: DevinTaskTransport;
  private readonly createLocalTaskId: () => string;

  constructor(options: DevinTaskAdapterOptions) {
    this.transport = options.transport;
    this.createLocalTaskId = options.createLocalTaskId ?? (() => `local-${randomUUID()}`);
  }

  /** 校验任务并分配本地 id。不访问 transport。 */
  accept(request: DevinTaskRequest): DevinAcceptResult {
    try {
      if (request === null || typeof request !== 'object') {
        throw new DevinTransportError({
          kind: 'invalid_request',
          message: 'task request must be an object.',
        });
      }
      const { localTaskId, ...createInput } = request;
      const normalized = normalizeDevinCreateInput(createInput);
      const id = localTaskId ?? this.createLocalTaskId();
      assertLocalTaskId(id);
      return { ok: true, task: { localTaskId: id, request: normalized } };
    } catch (error) {
      return { ok: false, error: toDevinFailure(error) };
    }
  }

  /** 把已接收的任务交给 transport.createSession。 */
  async dispatch(
    task: AcceptedDevinTask,
    options?: DevinTransportCallOptions,
  ): Promise<DevinDispatchResult> {
    try {
      assertLocalTaskId(task.localTaskId);
      const request = normalizeDevinCreateInput(task.request);
      const session = withProjectedPhase(await this.transport.createSession(request, options));
      return { ok: true, task: { localTaskId: task.localTaskId, request, session } };
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        return { ok: false, error: { kind: 'network', message: 'The Devin dispatch was aborted.' } };
      }
      return { ok: false, error: toDevinFailure(error) };
    }
  }

  /**
   * 轮询 getSession，直到公开终态、次数用尽或取消。
   * 多次轮询必须自带 intervalMs。终态默认再读消息，并取出最新一条 source=devin 的文本。
   */
  async listen(sessionId: string, options: DevinListenOptions): Promise<DevinListenResult> {
    try {
      assertDevinSessionId(sessionId);
    } catch (error) {
      return { ok: false, outcome: 'invalid_request', error: toDevinFailure(error), polls: 0 };
    }
    if (!Number.isInteger(options.maxPolls) || options.maxPolls < 1 || options.maxPolls > 10_000) {
      return {
        ok: false,
        outcome: 'invalid_request',
        error: { kind: 'invalid_request', message: 'maxPolls must be an integer from 1 to 10000.' },
        polls: 0,
      };
    }
    if (options.maxPolls > 1 && options.intervalMs === undefined) {
      return {
        ok: false,
        outcome: 'invalid_request',
        error: {
          kind: 'invalid_request',
          message: 'Set intervalMs when maxPolls is greater than 1. Pass 0 only to acknowledge a tight poll loop.',
        },
        polls: 0,
      };
    }
    const intervalMs = options.intervalMs ?? 0;
    if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 3_600_000) {
      return {
        ok: false,
        outcome: 'invalid_request',
        error: { kind: 'invalid_request', message: 'intervalMs must be a finite number from 0 to 3600000.' },
        polls: 0,
      };
    }
    const sleep = options.sleep ?? defaultSleep;
    const includeMessages = options.includeMessages !== false;
    let polls = 0;
    let latest: DevinSessionSnapshot | undefined;

    while (polls < options.maxPolls) {
      if (options.signal?.aborted) return aborted(polls, latest);
      polls += 1;
      let session: DevinSessionSnapshot;
      try {
        session = withProjectedPhase(await this.transport.getSession(sessionId, { signal: options.signal }));
      } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) return aborted(polls, latest);
        return {
          ok: false,
          outcome: 'transport_error',
          error: toDevinFailure(error),
          ...(latest ? { observation: observe(latest, [], false) } : {}),
          polls,
        };
      }
      latest = session;
      options.onSnapshot?.(session, polls);
      const outcome = terminalOutcome(session.status);
      if (outcome) {
        if (!includeMessages) {
          return { ok: true, outcome, observation: observe(session, [], false), polls };
        }
        try {
          const page = await readMessages(this.transport, sessionId, options.signal);
          return {
            ok: true,
            outcome,
            observation: observe(session, page.items, page.truncated),
            polls,
          };
        } catch (error) {
          if (isAbortError(error) || options.signal?.aborted) return aborted(polls, session);
          return {
            ok: false,
            outcome: 'transport_error',
            error: toDevinFailure(error),
            observation: observe(session, [], false),
            polls,
          };
        }
      }
      if (polls >= options.maxPolls || intervalMs === 0) continue;
      try {
        await sleep(intervalMs, options.signal);
      } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) return aborted(polls, latest);
        return {
          ok: false,
          outcome: 'transport_error',
          error: toDevinFailure(error),
          observation: observe(latest, [], false),
          polls,
        };
      }
    }

    return {
      ok: false,
      outcome: 'timed_out',
      error: {
        kind: 'network',
        message: `Devin session ${sessionId} was still non-terminal after ${polls} poll(s).`,
      },
      ...(latest ? { observation: observe(latest, [], false) } : {}),
      polls,
    };
  }
}

async function readMessages(
  transport: DevinTaskTransport,
  sessionId: string,
  signal: AbortSignal | undefined,
): Promise<{ items: DevinSessionMessage[]; truncated: boolean }> {
  const items: DevinSessionMessage[] = [];
  let after: string | undefined;
  for (let page = 0; page < DEVIN_MESSAGE_PAGE_LIMIT; page += 1) {
    const result = await transport.listMessages(
      sessionId,
      { first: 100, ...(after !== undefined ? { after } : {}) },
      signal ? { signal } : undefined,
    );
    items.push(...result.items);
    if (!result.hasNextPage) return { items, truncated: false };
    if (!result.endCursor || result.endCursor === after) return { items, truncated: true };
    if (page === DEVIN_MESSAGE_PAGE_LIMIT - 1) return { items, truncated: true };
    after = result.endCursor;
  }
  return { items, truncated: true };
}

function observe(
  session: DevinSessionSnapshot,
  messages: readonly DevinSessionMessage[],
  truncated: boolean,
): DevinTaskObservation {
  return {
    session: withProjectedPhase(session),
    messages,
    latestDevinMessage: latestDevinMessage(messages),
    messagesTruncated: truncated,
  };
}

function terminalOutcome(status: string): 'succeeded' | 'failed' | 'suspended' | null {
  if (!isDevinTerminalStatus(status)) return null;
  if (status === 'exit') return 'succeeded';
  if (status === 'error') return 'failed';
  return 'suspended';
}

function aborted(polls: number, session: DevinSessionSnapshot | undefined): DevinListenResult {
  return {
    ok: false,
    outcome: 'aborted',
    error: { kind: 'network', message: 'The Devin listen was aborted.' },
    ...(session ? { observation: observe(session, [], false) } : {}),
    polls,
  };
}

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  if (ms === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function assertLocalTaskId(localTaskId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(localTaskId)) {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'localTaskId contains unsupported characters.',
    });
  }
}
