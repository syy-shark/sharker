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
 * 用调用方注入的 fetch 调用三条已核对的 Devin v3 路径。
 * 构造函数不发请求，也不读取环境变量。密钥只出现在 Authorization 头里，失败文本会先打码。
 *
 * @see ./ARCH.md
 */

import {
  assertDevinApiKey,
  assertDevinOrgId,
  assertDevinSessionId,
  DEVIN_DOCUMENTED_API_ORIGIN,
  DevinTransportError,
  isAbortError,
  normalizeDevinCreateInput,
  type DevinCreateSessionInput,
  type DevinTaskTransport,
} from './contract.js';
import { parseDevinMessagePageBody, parseDevinSessionBody } from './parse.js';

/** 只依赖 ok、status 和 text，便于测试注入，也兼容全局 fetch 的 Response。 */
export interface DevinHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** 注入的 HTTP 函数。本模块没有默认的 global fetch。 */
export type DevinHttpFetch = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<DevinHttpResponse>;

/** HTTP transport 的配置。`fetch` 必填，避免无意中访问 api.devin.ai。 */
export interface DevinHttpTransportOptions {
  readonly orgId: string;
  readonly apiKey: string;
  readonly fetch: DevinHttpFetch;
  /** 默认是公开文档里的 https://api.devin.ai。测试可以换成不会出网的源站。 */
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
}

/** 创建只讲已核对 v3 路径的 transport。 */
export function createHttpDevinTransport(options: DevinHttpTransportOptions): DevinTaskTransport {
  assertDevinOrgId(options.orgId);
  assertDevinApiKey(options.apiKey);
  if (typeof options.fetch !== 'function') {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'fetch is required. This adapter does not call the network by itself.',
    });
  }
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEVIN_DOCUMENTED_API_ORIGIN);
  const apiKey = options.apiKey;

  return {
    async createSession(input, callOptions) {
      const normalized = normalizeDevinCreateInput(input);
      const payload = await requestJson(options.fetch, apiKey, {
        method: 'POST',
        url: sessionCollectionUrl(baseUrl, options.orgId),
        body: JSON.stringify(toCreateBody(normalized)),
        signal: callOptions?.signal ?? options.signal,
      });
      return parseDevinSessionBody(payload);
    },
    async getSession(sessionId, callOptions) {
      assertDevinSessionId(sessionId);
      const payload = await requestJson(options.fetch, apiKey, {
        method: 'GET',
        url: sessionUrl(baseUrl, options.orgId, sessionId),
        signal: callOptions?.signal ?? options.signal,
      });
      return parseDevinSessionBody(payload);
    },
    async listMessages(sessionId, query, callOptions) {
      assertDevinSessionId(sessionId);
      const first = normalizePageSize(query?.first);
      const payload = await requestJson(options.fetch, apiKey, {
        method: 'GET',
        url: messagesUrl(baseUrl, options.orgId, sessionId, { after: query?.after, first }),
        signal: callOptions?.signal ?? options.signal,
      });
      return parseDevinMessagePageBody(payload);
    },
  };
}

/** 公开 SessionCreateRequest 里本模块会发送的子集。未列出的字段不会出现在 JSON 里。 */
export function toCreateBody(input: DevinCreateSessionInput): {
  prompt: string;
  title?: string;
  tags?: readonly string[];
  playbook_id?: string;
  repos?: readonly string[];
  devin_mode?: DevinCreateSessionInput['devinMode'];
} {
  return {
    prompt: input.prompt,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.playbookId !== undefined ? { playbook_id: input.playbookId } : {}),
    ...(input.repos !== undefined ? { repos: input.repos } : {}),
    ...(input.devinMode !== undefined ? { devin_mode: input.devinMode } : {}),
  };
}

function sessionCollectionUrl(baseUrl: string, orgId: string): string {
  return `${baseUrl}/v3/organizations/${encodeURIComponent(orgId)}/sessions`;
}

function sessionUrl(baseUrl: string, orgId: string, sessionId: string): string {
  return `${sessionCollectionUrl(baseUrl, orgId)}/${encodeURIComponent(sessionId)}`;
}

function messagesUrl(
  baseUrl: string,
  orgId: string,
  sessionId: string,
  query: { readonly after?: string; readonly first?: number },
): string {
  const url = new URL(`${sessionUrl(baseUrl, orgId, sessionId)}/messages`);
  if (query.first !== undefined) url.searchParams.set('first', String(query.first));
  if (query.after !== undefined && query.after !== '') url.searchParams.set('after', query.after);
  return url.toString();
}

function normalizePageSize(first: number | undefined): number | undefined {
  if (first === undefined) return undefined;
  if (!Number.isInteger(first) || first < 1 || first > 200) {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'message page size must be an integer from 1 to 200, matching the documented maximum.',
    });
  }
  return first;
}

function normalizeBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'baseUrl must be an absolute http(s) URL.',
    });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'baseUrl must use http or https.',
    });
  }
  if (url.username !== '' || url.password !== '') {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'baseUrl must not embed credentials.',
    });
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

async function requestJson(
  fetchImpl: DevinHttpFetch,
  apiKey: string,
  request: { method: 'GET' | 'POST'; url: string; body?: string; signal?: AbortSignal },
): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
  if (request.body !== undefined) headers['content-type'] = 'application/json';
  let response: DevinHttpResponse;
  try {
    response = await fetchImpl(request.url, {
      method: request.method,
      headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    const message = redact(error instanceof Error && error.message ? error.message : 'Devin request failed', apiKey);
    throw new DevinTransportError({ kind: 'network', message });
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new DevinTransportError({ kind: 'network', message: 'Devin response body could not be read.' });
  }
  if (!response.ok) throw httpError(response.status, text, apiKey);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DevinTransportError({
      kind: 'invalid_response',
      message: 'Devin response was not JSON.',
    });
  }
}

function httpError(status: number, text: string, apiKey: string): DevinTransportError {
  const problem = readProblem(text);
  const title = redact(problem.title ?? `HTTP ${status}`, apiKey);
  const detail = problem.detail ? redact(problem.detail, apiKey) : undefined;
  const message = detail ? `Devin request failed (${status}): ${title}: ${detail}` : `Devin request failed (${status}): ${title}`;
  return new DevinTransportError({
    kind: 'http',
    message: redact(message, apiKey),
    status,
    title,
    ...(detail !== undefined ? { detail } : {}),
    ...(problem.errorCode !== undefined ? { errorCode: problem.errorCode } : {}),
  });
}

function readProblem(text: string): { title?: string; detail?: string; errorCode?: string } {
  try {
    const body = JSON.parse(text) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
    const record = body as Record<string, unknown>;
    return {
      ...(typeof record.title === 'string' && record.title.trim() !== '' ? { title: record.title } : {}),
      ...(typeof record.detail === 'string' && record.detail.trim() !== '' ? { detail: record.detail } : {}),
      ...(typeof record.error_code === 'string' && record.error_code.trim() !== ''
        ? { errorCode: record.error_code }
        : {}),
    };
  } catch {
    return {};
  }
}

function redact(value: string, secret: string): string {
  if (secret === '') return value;
  return value.split(secret).join('[redacted]').split(`Bearer ${secret}`).join('Bearer [redacted]');
}
