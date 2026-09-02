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

import type { TaskLedgerStore } from '@sharker/core/task-ledger';
import { AiSdkBackend } from '@sharker/runtime/ai-sdk-backend';

import { buildBuiltinTools, type BuildBuiltinToolsOptions } from '@sharker/runtime/builtin-tools';

import { buildChildAgentTools, buildParentAgentTools } from '@sharker/runtime/subagent-tools';

import { listRunnableBuiltinAgentDefinitions } from '@sharker/runtime/agent-catalog';

import { type SharkerTool } from '@sharker/runtime/tool-runtime';

import { type SessionManager } from '@sharker/runtime/session-manager';

type ChildAgentAuthority = Pick<
  SessionManager,
  'spawnChildSession' | 'listChildAgents' | 'readChildAgentOutput'
>;

export type HostChildAgentBackendCapabilities = Pick<
  ConstructorParameters<typeof AiSdkBackend>[0],
  'spawnChildSession' | 'listChildAgents' | 'readChildAgentOutput'
>;

export interface HostChildAgentToolComposition {
  readonly parentTools: readonly SharkerTool[];
  readonly childTools: readonly SharkerTool[];
}

/** Composes the parent control tools and the exact catalog-child capability union. */
export function createHostChildAgentToolComposition(input: {
  readonly taskLedger: TaskLedgerStore;
  readonly builtinTools: BuildBuiltinToolsOptions;
  readonly hostTools?: readonly SharkerTool[];
  readonly worktreePatchWriteBackAvailable?: boolean;
}): HostChildAgentToolComposition {
  const builtinTools = buildBuiltinTools(input.builtinTools);
  const childTools = buildChildAgentTools([...builtinTools, ...(input.hostTools ?? [])]);
  const definitions = listRunnableBuiltinAgentDefinitions({
    tools: childTools,
    worktreeChildExecutorAvailable: input.worktreePatchWriteBackAvailable,
  });
  return Object.freeze({
    parentTools: Object.freeze(
      buildParentAgentTools({ taskLedger: input.taskLedger, definitions }),
    ),
    childTools: Object.freeze(childTools),
  });
}

/** Binds one root backend to the child authority of its owning Session. */
export function bindHostChildAgentBackend(
  authority: ChildAgentAuthority,
  parentSessionId: string,
): HostChildAgentBackendCapabilities {
  return {
    spawnChildSession: (input) =>
      authority.spawnChildSession(parentSessionId, {
        spawnedBy: {
          parentRunId: input.parentRunId,
          parentTurnId: input.parentTurnId,
          toolCallId: input.toolCallId,
        },
        agentProfile: input.agentProfile,
        ...(input.subagentId ? { subagentId: input.subagentId } : {}),
        prompt: input.prompt,
        ...(input.swarm ? { swarm: input.swarm } : {}),
        abortSignal: input.abortSignal,
        ...(input.onReady ? { onReady: input.onReady } : {}),
        ...(input.onEvent ? { onEvent: input.onEvent } : {}),
      }),
    listChildAgents: () => authority.listChildAgents(parentSessionId),
    readChildAgentOutput: (input) => authority.readChildAgentOutput(parentSessionId, input),
  };
}
