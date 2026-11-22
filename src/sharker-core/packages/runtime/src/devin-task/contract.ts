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
 * Devin 任务派发的内部契约与公开文档字段。
 *
 * `DevinSessionStatus` 等枚举抄自 Devin API v3 公开 OpenAPI（核验日期 2026-11-22）。
 * `DevinTaskPhase` 是本模块的投影，不是 Devin 响应字段。本文件不发网络请求。
 *
 * @see ./ARCH.md
 * @see ../../../../docs/architecture/devin-task-adapter.zh-CN.md
 */

/** 公开 curl 示例使用的 API 源站。默认值只用于拼 URL，不会主动发请求。 */
export const DEVIN_DOCUMENTED_API_ORIGIN = 'https://api.devin.ai';

/**
 * 公开迁移指南与 v3 OpenAPI 中本模块实际调用的三条路径。
 * `{org_id}`、`{devin_id}` 是文档里的路径参数名。
 */
export const DEVIN_DOCUMENTED_ROUTES = {
  createSession: '/v3/organizations/{org_id}/sessions',
  getSession: '/v3/organizations/{org_id}/sessions/{devin_id}',
  listMessages: '/v3/organizations/{org_id}/sessions/{devin_id}/messages',
} as const;

/** 公开 SessionResponse.status。用法示例把 exit、error、suspended 当作轮询终态。 */
export const DEVIN_SESSION_STATUSES = [
  'new',
  'claimed',
  'running',
  'exit',
  'error',
  'suspended',
  'resuming',
] as const;

/** 公开文档中的会话状态。 */
export type DevinSessionStatus = (typeof DEVIN_SESSION_STATUSES)[number];

/** 公开用法示例列为终态的 status。`running` + `status_detail=finished` 不在此列。 */
export const DEVIN_TERMINAL_STATUSES = ['exit', 'error', 'suspended'] as const;

/** 公开 SessionResponse.status_detail。 */
export const DEVIN_STATUS_DETAILS = [
  'working',
  'waiting_for_user',
  'waiting_for_approval',
  'finished',
  'inactivity',
  'user_request',
  'usage_limit_exceeded',
  'out_of_credits',
  'out_of_quota',
  'no_quota_allocation',
  'payment_declined',
  'org_usage_limit_exceeded',
  'user_usage_limit_exceeded',
  'total_session_limit_exceeded',
  'contract_expired',
  'error',
] as const;

/** 公开文档中的状态细节。 */
export type DevinStatusDetail = (typeof DEVIN_STATUS_DETAILS)[number];

/** 公开 SessionCreateRequest.devin_mode。 */
export const DEVIN_MODES = [
  'normal',
  'fast',
  'fusion',
  'lite',
  'ultra',
  'fast-ultra',
  'swe-2-medium',
  'swe-2-high',
  'swe-2-max',
] as const;

/** 公开文档中的 Devin 模式。 */
export type DevinMode = (typeof DEVIN_MODES)[number];

/**
 * 内部任务阶段。由 `status` 投影而来，便于调用方分支，不能写回 Devin API。
 */
export type DevinTaskPhase = 'in_progress' | 'succeeded' | 'failed' | 'suspended' | 'unknown';

/** 归一化后的 PR 引用，对应公开的 `pr_url` / `pr_state`。 */
export interface DevinPullRequestRef {
  readonly url: string;
  readonly state: string | null;
}

/** 从 SessionResponse 抽出的、与任务结果有关的字段。计费字段故意不投影。 */
export interface DevinSessionSnapshot {
  readonly sessionId: string;
  readonly url: string;
  readonly status: string;
  readonly documentedStatus: DevinSessionStatus | null;
  readonly statusDetail: string | null;
  readonly documentedStatusDetail: DevinStatusDetail | null;
  readonly phase: DevinTaskPhase;
  readonly title: string | null;
  readonly tags: readonly string[];
  readonly pullRequests: readonly DevinPullRequestRef[];
  readonly structuredOutput: Readonly<Record<string, unknown>> | null;
  readonly orgId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 公开 SessionMessage 的归一化形状。`source` 保留未知字符串，避免丢掉新枚举。 */
export interface DevinSessionMessage {
  readonly eventId: string;
  readonly source: string;
  readonly message: string;
  readonly createdAt: number;
}

/** 公开消息列表的一页。`truncated` 只在本地页数上限被截断时为 true。 */
export interface DevinMessagePage {
  readonly items: readonly DevinSessionMessage[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
  readonly truncated: boolean;
}

/** 创建会话时允许外发的字段，全部能在公开 SessionCreateRequest 里对上名字。 */
export interface DevinCreateSessionInput {
  readonly prompt: string;
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly playbookId?: string;
  readonly repos?: readonly string[];
  readonly devinMode?: DevinMode;
}

/** 单次 transport 调用可以取消。 */
export interface DevinTransportCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * 可替换的会话传输。HTTP 实现与本地 mock 都走这个接口。
 * 实现不得在构造时访问网络。
 */
export interface DevinTaskTransport {
  createSession(
    input: DevinCreateSessionInput,
    options?: DevinTransportCallOptions,
  ): Promise<DevinSessionSnapshot>;
  getSession(sessionId: string, options?: DevinTransportCallOptions): Promise<DevinSessionSnapshot>;
  listMessages(
    sessionId: string,
    query?: { readonly after?: string; readonly first?: number },
    options?: DevinTransportCallOptions,
  ): Promise<DevinMessagePage>;
}

/** 调用方可见的失败，不携带请求头或密钥。 */
export interface DevinFailure {
  readonly kind: 'invalid_request' | 'http' | 'network' | 'invalid_response';
  readonly message: string;
  readonly status?: number;
  readonly title?: string;
  readonly detail?: string;
  readonly errorCode?: string;
}

/** transport 与解析器抛出的失败。`failure.message` 与 `Error.message` 相同。 */
export class DevinTransportError extends Error {
  readonly failure: DevinFailure;

  constructor(failure: DevinFailure) {
    super(failure.message);
    this.name = 'DevinTransportError';
    this.failure = failure;
  }
}

/** 把任意异常收成不含密钥的失败。AbortError 留给调用方单独识别。 */
export function toDevinFailure(error: unknown): DevinFailure {
  if (error instanceof DevinTransportError) return error.failure;
  const message = error instanceof Error && error.message ? error.message : 'Unknown transport failure';
  return { kind: 'network', message };
}

/** 是否为取消导致的异常。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** 判断字符串是不是公开文档里的 session status。 */
export function isDevinSessionStatus(value: string): value is DevinSessionStatus {
  return (DEVIN_SESSION_STATUSES as readonly string[]).includes(value);
}

/** 判断字符串是不是公开文档里的 status_detail。 */
export function isDevinStatusDetail(value: string): value is DevinStatusDetail {
  return (DEVIN_STATUS_DETAILS as readonly string[]).includes(value);
}

/** 判断字符串是不是公开文档里的 devin_mode。 */
export function isDevinMode(value: string): value is DevinMode {
  return (DEVIN_MODES as readonly string[]).includes(value);
}

/**
 * 把公开 status 投影成内部阶段。
 * exit → succeeded，error → failed，suspended → suspended，
 * new / claimed / running / resuming → in_progress，其余 → unknown。
 */
export function projectDevinPhase(status: string): DevinTaskPhase {
  switch (status) {
    case 'new':
    case 'claimed':
    case 'running':
    case 'resuming':
      return 'in_progress';
    case 'exit':
      return 'succeeded';
    case 'error':
      return 'failed';
    case 'suspended':
      return 'suspended';
    default:
      return 'unknown';
  }
}

/** 公开用法示例里的终态。 */
export function isDevinTerminalStatus(status: string): boolean {
  return (DEVIN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * 本地路径安全检查：文档写明组织 id 以 `org-` 开头。
 * 正则不是官方语法，只拒绝空值、路径分隔符和空白。
 */
export function assertDevinOrgId(orgId: string): void {
  if (!/^org-[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(orgId)) {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message:
        'orgId must start with "org-" and contain only letters, digits, "_" or "-". This is a local path check, not an official grammar.',
    });
  }
}

/**
 * 本地路径安全检查：文档写明会话 id 以 `devin-` 开头。
 * 正则不是官方语法。
 */
export function assertDevinSessionId(sessionId: string): void {
  if (!/^devin-[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(sessionId)) {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message:
        'sessionId must start with "devin-" and contain only letters, digits, "_" or "-". This is a local path check, not an official grammar.',
    });
  }
}

/** 拒绝会破坏 Authorization 头的密钥。不要求 `cog_` 前缀，因为公开文档同时允许 PAT 与过渡期旧 key。 */
export function assertDevinApiKey(apiKey: string): void {
  if (typeof apiKey !== 'string' || apiKey.trim() === '' || /[\u0000-\u001f\u007f]/.test(apiKey)) {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'apiKey must be a non-empty string without control characters.',
    });
  }
}

/** 校验并收紧创建参数。空白 prompt 会在发请求前失败。 */
export function normalizeDevinCreateInput(input: DevinCreateSessionInput): DevinCreateSessionInput {
  if (typeof input?.prompt !== 'string' || input.prompt.trim() === '') {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: 'prompt must be a non-empty string.',
    });
  }
  const normalized: {
    prompt: string;
    title?: string;
    tags?: string[];
    playbookId?: string;
    repos?: string[];
    devinMode?: DevinMode;
  } = { prompt: input.prompt.trim() };
  if (input.title !== undefined) normalized.title = requiredToken(input.title, 'title');
  if (input.playbookId !== undefined) normalized.playbookId = requiredToken(input.playbookId, 'playbookId');
  if (input.tags !== undefined) normalized.tags = requiredTokenList(input.tags, 'tags');
  if (input.repos !== undefined) normalized.repos = requiredTokenList(input.repos, 'repos');
  if (input.devinMode !== undefined) {
    if (!isDevinMode(input.devinMode)) {
      throw new DevinTransportError({
        kind: 'invalid_request',
        message: 'devinMode is not one of the documented Devin modes.',
      });
    }
    normalized.devinMode = input.devinMode;
  }
  return normalized;
}

/** 用 status 重新计算 phase，避免 transport 自报的 phase 和 status 不一致。 */
export function withProjectedPhase(session: DevinSessionSnapshot): DevinSessionSnapshot {
  const phase = projectDevinPhase(session.status);
  return phase === session.phase ? session : { ...session, phase };
}

/** 取时间上最新的一条 `source === "devin"` 消息；同一时间戳保留列表中更靠后的一条。 */
export function latestDevinMessage(messages: readonly DevinSessionMessage[]): string | null {
  let best: DevinSessionMessage | undefined;
  let bestIndex = -1;
  messages.forEach((message, index) => {
    if (message.source !== 'devin') return;
    if (
      !best ||
      message.createdAt > best.createdAt ||
      (message.createdAt === best.createdAt && index > bestIndex)
    ) {
      best = message;
      bestIndex = index;
    }
  });
  return best?.message ?? null;
}

function requiredToken(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: `${field} must be a non-empty string when provided.`,
    });
  }
  return value.trim();
}

function requiredTokenList(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new DevinTransportError({
      kind: 'invalid_request',
      message: `${field} must be a non-empty string array when provided.`,
    });
  }
  return values.map((value, index) => requiredToken(value, `${field}[${index}]`));
}
