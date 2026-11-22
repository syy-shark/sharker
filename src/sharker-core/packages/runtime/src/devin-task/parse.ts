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
 * 把公开的 Devin v3 JSON 收成内部快照。
 * 只读取核过的字段；缺必填字段时失败，不补造默认会话。
 *
 * @see ./ARCH.md
 */

import {
  assertDevinSessionId,
  DevinTransportError,
  isDevinSessionStatus,
  isDevinStatusDetail,
  projectDevinPhase,
  type DevinMessagePage,
  type DevinPullRequestRef,
  type DevinSessionMessage,
  type DevinSessionSnapshot,
} from './contract.js';

/** 解析公开 SessionResponse。未知的 status 会保留原字符串，phase 为 unknown。 */
export function parseDevinSessionBody(body: unknown): DevinSessionSnapshot {
  const record = requiredObject(body, 'Devin session response');
  const sessionId = requiredString(record, 'session_id');
  try {
    assertDevinSessionId(sessionId);
  } catch (error) {
    if (error instanceof DevinTransportError) {
      throw new DevinTransportError({
        kind: 'invalid_response',
        message: 'Devin session_id failed the local devin- prefix check and was not used in a URL.',
      });
    }
    throw error;
  }
  const status = requiredString(record, 'status');
  const tags = requiredStringArray(record, 'tags');
  const orgId = requiredNullableString(record, 'org_id');
  const createdAt = requiredInteger(record, 'created_at');
  const updatedAt = requiredInteger(record, 'updated_at');
  requiredFiniteNumber(record, 'acus_consumed');
  return {
    sessionId,
    url: requiredString(record, 'url'),
    status,
    documentedStatus: isDevinSessionStatus(status) ? status : null,
    statusDetail: optionalDetail(record),
    documentedStatusDetail: documentedDetail(record),
    phase: projectDevinPhase(status),
    title: optionalNullableString(record, 'title'),
    tags,
    pullRequests: parsePullRequests(record.pull_requests),
    structuredOutput: optionalPlainObject(record, 'structured_output'),
    orgId,
    createdAt,
    updatedAt,
  };
}

/** 解析公开的分页 SessionMessage 列表。 */
export function parseDevinMessagePageBody(body: unknown): DevinMessagePage {
  const record = requiredObject(body, 'Devin message page');
  if (!Array.isArray(record.items)) {
    throw invalid('Devin message page field items must be an array.');
  }
  const items = record.items.map((item, index) => parseMessage(item, index));
  const endCursor = optionalNullableString(record, 'end_cursor');
  const hasNextPage = record.has_next_page === undefined ? false : requiredBoolean(record, 'has_next_page');
  return { items, endCursor, hasNextPage, truncated: false };
}

function parseMessage(value: unknown, index: number): DevinSessionMessage {
  const record = requiredObject(value, `Devin message items[${index}]`);
  return {
    eventId: requiredString(record, 'event_id'),
    source: requiredString(record, 'source'),
    message: requiredString(record, 'message'),
    createdAt: requiredInteger(record, 'created_at'),
  };
}

function parsePullRequests(value: unknown): readonly DevinPullRequestRef[] {
  if (!Array.isArray(value)) {
    throw invalid('Devin session response field pull_requests must be an array.');
  }
  return value.map((item, index) => {
    const record = requiredObject(item, `Devin pull_requests[${index}]`);
    if (!('pr_state' in record)) throw invalid(`Devin pull_requests[${index}].pr_state is required.`);
    const state = record.pr_state;
    if (state !== null && typeof state !== 'string') {
      throw invalid(`Devin pull_requests[${index}].pr_state must be a string or null.`);
    }
    return { url: requiredString(record, 'pr_url'), state };
  });
}

function optionalDetail(record: Readonly<Record<string, unknown>>): string | null {
  if (!('status_detail' in record) || record.status_detail === null || record.status_detail === undefined) {
    return null;
  }
  if (typeof record.status_detail !== 'string') {
    throw invalid('Devin session response field status_detail must be a string or null.');
  }
  return record.status_detail;
}

function documentedDetail(record: Readonly<Record<string, unknown>>): DevinSessionSnapshot['documentedStatusDetail'] {
  const detail = optionalDetail(record);
  return detail && isDevinStatusDetail(detail) ? detail : null;
}

function optionalPlainObject(
  record: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> | null {
  if (!(field in record) || record[field] === null || record[field] === undefined) return null;
  if (!isPlainObject(record[field])) throw invalid(`Devin session response field ${field} must be an object or null.`);
  return record[field];
}

function optionalNullableString(record: Readonly<Record<string, unknown>>, field: string): string | null {
  if (!(field in record) || record[field] === null || record[field] === undefined) return null;
  if (typeof record[field] !== 'string') throw invalid(`Devin session response field ${field} must be a string or null.`);
  return record[field];
}

function requiredNullableString(record: Readonly<Record<string, unknown>>, field: string): string | null {
  if (!(field in record)) throw invalid(`Devin session response field ${field} is required.`);
  if (record[field] === null) return null;
  if (typeof record[field] !== 'string') throw invalid(`Devin session response field ${field} must be a string or null.`);
  return record[field];
}

function requiredObject(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) throw invalid(`${label} must be a JSON object.`);
  return value;
}

function requiredString(record: Readonly<Record<string, unknown>>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value === '') throw invalid(`Devin response field ${field} must be a non-empty string.`);
  return value;
}

function requiredStringArray(record: Readonly<Record<string, unknown>>, field: string): readonly string[] {
  const value = record[field];
  if (!Array.isArray(value)) throw invalid(`Devin session response field ${field} must be an array of strings.`);
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw invalid(`Devin session response field ${field} must be an array of strings.`);
    items.push(item);
  }
  return items;
}

function requiredInteger(record: Readonly<Record<string, unknown>>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid(`Devin session response field ${field} must be an integer.`);
  }
  return value;
}

function requiredFiniteNumber(record: Readonly<Record<string, unknown>>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(`Devin session response field ${field} must be a finite number.`);
  }
  return value;
}

function requiredBoolean(record: Readonly<Record<string, unknown>>, field: string): boolean {
  if (typeof record[field] !== 'boolean') throw invalid(`Devin message page field ${field} must be a boolean.`);
  return record[field];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): DevinTransportError {
  return new DevinTransportError({ kind: 'invalid_response', message });
}
