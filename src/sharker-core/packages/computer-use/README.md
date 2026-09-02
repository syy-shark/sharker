<!--
  Licensed to the Apache Software Foundation (ASF) under one
  or more contributor license agreements.  See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership.  The ASF licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
-->

# `@sharker/computer-use`

`@sharker/computer-use` adapts Sharker's Runtime-owned Computer Use contracts to the
native `sharker-cu` executor. It owns backend selection, the executor process and
protocol lifecycle, host-side result decoding, display snapshot mapping, and
the cursor-overlay hook. Runtime owns the model-facing tools and session state;
Desktop supplies the executable and presentation dependencies.

## Public seam

The package exposes one root entry point through `src/index.ts`:

- `selectComputerUseBackend()` selects the available executor and builds the
  Runtime tool set. `CU_BACKEND_IDS` currently contains only `sharker-cu`.
- `createSharkerCuBackend()` adapts the native executor to Runtime's
  `CuDispatchBackend` contract.
- `SharkerCuService` supervises the executor process and owns the JSON-RPC request,
  cancellation, restart, and generation lifecycle.
- The `sharker-cu-protocol` exports decode and validate `sharker.cu/2` envelopes,
  snapshots, dispatch results, domain errors, and key chords.
- `resolveCuaDisplaySnapshots()` maps executor screenshots to Electron display
  coordinates without guessing when the display geometry is ambiguous.
- `createComputerUseOverlayHook()` projects action lifecycle events to a
  presentation-only cursor sink. It does not choose or authorize targets.

Other packages should import these exports from `@sharker/computer-use`, not from
undeclared internal source paths.

## Current platform boundary

The shipped selector enables Computer Use only when all of these conditions
hold:

1. the host platform is macOS (`process.platform === 'darwin'`);
2. the composition supplies a `sharker-cu` executable path; and
3. the composition supplies the executable's expected SHA-256 digest.

On another platform, with missing inputs, or when backend construction fails,
selection fails closed to `backendId: 'none'` with an empty tool set. This
package does not discover, download, or choose an unpinned executable.

The executable's build, provenance, signing, and distribution status are
separate release concerns. See
[`computer-use-provenance.md`](../../docs/computer-use-provenance.md) rather
than assuming that installing this workspace supplies a runnable binary.

Cross-platform work is tracked separately:

- [#3896](https://github.com/apache/sharker/issues/3896) — platform abstraction;
- [#3891](https://github.com/apache/sharker/issues/3891) — Linux backend;
- [#3785](https://github.com/apache/sharker/issues/3785) — Windows executor
  hardening and production evidence.

## Protocol and lifecycle

The host and executor communicate over line-delimited JSON-RPC using the
versioned `sharker.cu/2` protocol. `SharkerCuService` verifies that the executable is
usable and checks any configured digest before spawning it, completes a
`host.hello` handshake, and exposes the executor version, capabilities, limits,
and process generation. The product selector always supplies the required
digest.

Lifecycle and protocol failures remain distinct:

- `SharkerCuLifecycleError` reports unavailable, mismatched, aborted, or
  outcome-unknown process states;
- `SharkerCuRpcError` reports a JSON-RPC error response for one method; and
- `SharkerCuProtocolViolation` reports malformed or contradictory wire data.

An executor exit releases affected sessions and invalidates their observations.
Requests that may have reached the executor surface as outcome-unknown rather
than being replayed automatically. Runtime must re-observe before another
action.

## Ownership rules

- Keep provider-neutral Computer Use types and model-facing contracts in
  `@sharker/core` and `@sharker/runtime`.
- Keep native executor transport, decoding, and lifecycle handling in this
  package.
- Keep Electron windows, screen-lock integration, binary provisioning, and
  product status UI in `apps/desktop`.
- Add a second backend only after it has a real adapter and platform evidence;
  do not widen `CU_BACKEND_IDS` with a placeholder.
- Preserve fail-closed selection and snapshot-bound dispatch. Missing or stale
  authority must not fall back to global pointer or foreground input.

The cross-layer safety and evidence rules live in the
[`Computer Use foundation contract`](../../docs/computer-use-foundation-contract.md)
and [`host events contract`](../../docs/computer-use-host-events-contract.md).

## Verification

Install dependencies once at the repository root, then run:

```sh
npm --workspace @sharker/computer-use test
npm --workspace @sharker/computer-use run typecheck
```

The package tests cover protocol decoding, process lifecycle, backend behavior,
host-event propagation, display mapping, overlay projection, and the cumulative
Computer Use path.
