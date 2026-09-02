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

import type { Context, FiberState, Plugin } from './plugin-kernel.js';

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u;

export type SharkerPluginRootId = 'profile' | 'desktop-ui' | `session:${string}`;

export interface SharkerPluginPackage {
  readonly packageId: string;
  readonly host?: Plugin;
  readonly client?: Plugin;
  readonly contributions?: readonly SharkerPluginContribution[];
}

export interface SharkerPluginContribution {
  readonly id: string;
  readonly kind: 'tool' | 'ui' | 'hook' | 'service' | 'timer' | string;
}

export interface SharkerCompositionEntry {
  readonly id: string;
  readonly packageId?: string;
  readonly config?: unknown;
  readonly disabled?: boolean;
  readonly inject?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly isolate?: Readonly<Record<string, true | string>>;
  readonly intercept?: Readonly<Record<string, unknown>>;
  readonly children?: readonly SharkerCompositionEntry[];
}

export interface SharkerCompositionSnapshot {
  readonly schemaVersion: 1;
  readonly generation: number;
  readonly roots: {
    readonly profile: readonly SharkerCompositionEntry[];
    readonly desktopUi: readonly SharkerCompositionEntry[];
    readonly sessions: Readonly<Record<string, readonly SharkerCompositionEntry[]>>;
  };
}

export type SharkerCompositionOperation =
  | {
      readonly type: 'insert';
      readonly rootId?: SharkerPluginRootId;
      readonly parentId?: string;
      readonly entry: SharkerCompositionEntry;
      readonly position?: number;
    }
  | {
      readonly type: 'update';
      readonly entryId: string;
      readonly patch: Partial<Omit<SharkerCompositionEntry, 'id' | 'children'>>;
    }
  | {
      readonly type: 'move';
      readonly entryId: string;
      readonly parentId?: string;
      readonly position?: number;
    }
  | { readonly type: 'remove'; readonly entryId: string };

export interface SharkerCompositionApplyInput {
  readonly baseGeneration?: number;
  readonly operations: readonly SharkerCompositionOperation[];
}

export type SharkerCompositionEntryStatus =
  | 'disabled'
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | 'disposed';

export interface SharkerCompositionEntryInspection {
  readonly id: string;
  readonly rootId: SharkerPluginRootId;
  readonly parentId?: string;
  readonly packageId?: string;
  readonly config?: unknown;
  readonly disabled: boolean;
  readonly status: SharkerCompositionEntryStatus;
  readonly generation?: number;
  readonly waitingFor: readonly string[];
  readonly effects: readonly string[];
  readonly children: readonly SharkerCompositionEntryInspection[];
  readonly diagnostic?: string;
}

export interface SharkerPluginMountInput {
  readonly entryId: string;
  readonly rootId: string;
  readonly packageId: string;
  readonly config?: unknown;
}

export interface SharkerPluginMountInspection {
  readonly entryId: string;
  readonly rootId: string;
  readonly packageId: string;
  readonly enabled: boolean;
  readonly status: SharkerCompositionEntryStatus;
  readonly current?: { readonly generation: number };
  readonly waitingFor: readonly string[];
  readonly pendingCleanupEffects: number;
  readonly diagnostic?: { readonly message: string };
}

export interface SharkerRuntimeCompositionEntry {
  readonly entryId: string;
  readonly packageId: string;
  readonly generation: number;
  readonly contributions: readonly SharkerPluginContribution[];
}

export interface SharkerRuntimeCompositionSnapshot {
  readonly schemaVersion: 1;
  readonly rootId: string;
  readonly digest: `sha256:${string}`;
  readonly entries: readonly SharkerRuntimeCompositionEntry[];
}

export interface SharkerPluginMetadata {
  readonly rootId: SharkerPluginRootId;
  readonly entryId: string;
  readonly packageId: string;
  readonly generation: number;
}

export interface SharkerContributionIdentity {
  readonly entryId: string;
  readonly scopeId: string;
  readonly extensionId: string;
  readonly generation: number;
}

export interface SharkerContributionContext extends SharkerContributionIdentity {
  readonly signal: AbortSignal;
  readonly runtimeContext: Context;
  ownEffect(label: string, dispose: () => void | Promise<void>): void;
  dependency<T = unknown>(packageId: string): T;
}

export interface SharkerPluginTransaction {
  stage(label: string, register: () => () => void | Promise<void>, owner?: Context): void;
  commit(): void | Promise<void>;
  rollback(): void | Promise<void>;
}

declare module './plugin-kernel.js' {
  interface Context {
    sharker?: SharkerPluginMetadata;
    sharkerTransaction?: SharkerPluginTransaction;
  }
}

export class SharkerPluginRuntimeError extends Error {
  readonly name = 'SharkerPluginRuntimeError';

  constructor(
    readonly code:
      | 'invalid_package'
      | 'package_exists'
      | 'package_not_found'
      | 'package_in_use'
      | 'invalid_entry'
      | 'entry_exists'
      | 'entry_not_found'
      | 'dependency_cycle'
      | 'activation_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function validatePluginPackage(pkg: SharkerPluginPackage): void {
  validatePluginId(pkg.packageId, 'packageId');
  if (!pkg.host && !pkg.client) {
    throw new SharkerPluginRuntimeError(
      'invalid_package',
      `Plugin package ${pkg.packageId} has no host or client plugin`,
    );
  }
}

export function validateCompositionEntry(entry: SharkerCompositionEntry): void {
  validatePluginId(entry.id, 'entry id');
  if (entry.packageId !== undefined) {
    validatePluginId(entry.packageId!, 'packageId');
  }
  for (const key of Object.keys(entry.isolate ?? {})) validateServiceName(key);
  for (const key of Object.keys(entry.intercept ?? {})) validateServiceName(key);
  for (const dependency of Array.isArray(entry.inject)
    ? entry.inject
    : Object.keys(entry.inject ?? {})) {
    validateServiceName(dependency);
  }
  const childIds = new Set<string>();
  for (const child of entry.children ?? []) {
    validateCompositionEntry(child);
    if (childIds.has(child.id)) {
      throw new SharkerPluginRuntimeError(
        'entry_exists',
        `Entry ${entry.id} repeats child ${child.id}`,
      );
    }
    childIds.add(child.id);
  }
}

export function validatePluginRootId(rootId: string): asserts rootId is SharkerPluginRootId {
  if (
    rootId !== 'profile' &&
    rootId !== 'desktop-ui' &&
    !(rootId.startsWith('session:') && rootId.length > 'session:'.length)
  ) {
    throw new SharkerPluginRuntimeError('invalid_entry', `Invalid composition root: ${rootId}`);
  }
}

export function pluginIdentity(ctx: Context): SharkerContributionIdentity {
  const metadata = ctx.sharker;
  if (!metadata) {
    throw new SharkerPluginRuntimeError(
      'activation_failed',
      'Contribution registration requires a composition entry Context',
    );
  }
  return Object.freeze({
    entryId: metadata.entryId,
    scopeId: metadata.rootId,
    extensionId: metadata.packageId,
    generation: metadata.generation,
  });
}

export function ownPluginEffect(
  ctx: Context,
  label: string,
  dispose: () => void | Promise<void>,
): void {
  attachPluginEffect(ctx, label, dispose);
}

function attachPluginEffect(
  ctx: Context,
  label: string,
  dispose: () => void | Promise<void>,
): () => Promise<void> {
  return ctx.effect(() => dispose, label);
}

function registerPluginEffect(
  ctx: Context,
  label: string,
  register: () => () => void | Promise<void>,
): () => Promise<void> {
  let contributionDispose: (() => void | Promise<void>) | undefined;
  const release = ctx.effect(() => () => contributionDispose?.(), label);
  try {
    contributionDispose = register();
    return release;
  } catch (error) {
    void release().catch(() => undefined);
    throw error;
  }
}

export function registerPluginContribution(
  ctx: Context,
  label: string,
  register: () => () => void | Promise<void>,
): void {
  if (ctx.sharkerTransaction) {
    ctx.sharkerTransaction.stage(label, register, ctx);
    return;
  }
  registerPluginEffect(ctx, label, register);
}

export class SharkerPluginTransactionBuffer implements SharkerPluginTransaction {
  readonly #registrations: Array<{
    readonly label: string;
    readonly register: () => () => void | Promise<void>;
    readonly owner: Context;
  }> = [];
  #state: 'staging' | 'committed' | 'rolled_back' = 'staging';

  constructor(private readonly context: Context) {}

  stage(label: string, register: () => () => void | Promise<void>, owner = this.context): void {
    if (this.#state === 'committed') {
      registerPluginEffect(owner, label, register);
      return;
    }
    if (this.#state === 'rolled_back') {
      throw new SharkerPluginRuntimeError(
        'activation_failed',
        `Cannot stage contribution after transaction is ${this.#state}`,
      );
    }
    this.#registrations.push({ label, register, owner });
  }

  async commit(): Promise<void> {
    if (this.#state === 'committed') return;
    if (this.#state === 'rolled_back') {
      throw new SharkerPluginRuntimeError(
        'activation_failed',
        'Cannot commit a rolled back transaction',
      );
    }
    const registered: Array<() => Promise<void>> = [];
    try {
      for (const item of this.#registrations) {
        registered.push(registerPluginEffect(item.owner, item.label, item.register));
      }
      this.#state = 'committed';
      this.#registrations.length = 0;
    } catch (error) {
      this.#state = 'rolled_back';
      this.#registrations.length = 0;
      const cleanupErrors: unknown[] = [];
      for (const dispose of registered.reverse()) {
        try {
          await dispose();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Plugin transaction commit and rollback failed',
        );
      }
      throw error;
    }
  }

  rollback(): void {
    if (this.#state !== 'staging') return;
    this.#state = 'rolled_back';
    this.#registrations.length = 0;
  }
}

export function fiberStateName(state: FiberState): SharkerCompositionEntryStatus {
  return ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'][
    state
  ] as SharkerCompositionEntryStatus;
}

export function isCanonicalPluginId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && ID_PATTERN.test(value);
}

export const isCanonicalExtensionId = isCanonicalPluginId;

export function isCanonicalExtensionScopeId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

function validatePluginId(value: unknown, label: string): asserts value is string {
  if (!isCanonicalPluginId(value)) {
    throw new SharkerPluginRuntimeError('invalid_entry', `Invalid ${label}`);
  }
}

function validateServiceName(value: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,255}$/u.test(value)) {
    throw new SharkerPluginRuntimeError('invalid_entry', `Invalid service name: ${value}`);
  }
}
