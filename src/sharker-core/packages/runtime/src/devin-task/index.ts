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
 * `@sharker/runtime/devin-task` 的公开入口。
 * 这是接入准备，不是 Devin 官方 SDK，也不会在 import 时访问网络。
 *
 * @see ./ARCH.md
 */

export { DEVIN_DOCUMENTED_API_ORIGIN, DEVIN_DOCUMENTED_ROUTES } from './contract.js';

export {
  DEVIN_MODES,
  DEVIN_SESSION_STATUSES,
  DEVIN_STATUS_DETAILS,
  DEVIN_TERMINAL_STATUSES,
  DevinTransportError,
  assertDevinApiKey,
  assertDevinOrgId,
  assertDevinSessionId,
  isAbortError,
  isDevinMode,
  isDevinSessionStatus,
  isDevinStatusDetail,
  isDevinTerminalStatus,
  latestDevinMessage,
  normalizeDevinCreateInput,
  projectDevinPhase,
  toDevinFailure,
  withProjectedPhase,
} from './contract.js';

export type {
  DevinCreateSessionInput,
  DevinFailure,
  DevinMessagePage,
  DevinMode,
  DevinPullRequestRef,
  DevinSessionMessage,
  DevinSessionSnapshot,
  DevinSessionStatus,
  DevinStatusDetail,
  DevinTaskPhase,
  DevinTaskTransport,
  DevinTransportCallOptions,
} from './contract.js';

export { parseDevinMessagePageBody, parseDevinSessionBody } from './parse.js';

export {
  createHttpDevinTransport,
  toCreateBody,
  type DevinHttpFetch,
  type DevinHttpResponse,
  type DevinHttpTransportOptions,
} from './http-transport.js';

export {
  createMockDevinTransport,
  type CreateMockDevinTransportOptions,
  type DevinTransportCall,
  type MockDevinPollScript,
  type MockDevinTransport,
} from './mock-transport.js';

export {
  DEVIN_MESSAGE_PAGE_LIMIT,
  DevinTaskAdapter,
  type AcceptedDevinTask,
  type DevinAcceptResult,
  type DevinDispatchResult,
  type DevinListenOptions,
  type DevinListenResult,
  type DevinTaskAdapterOptions,
  type DevinTaskObservation,
  type DevinTaskRequest,
  type DispatchedDevinTask,
} from './adapter.js';
