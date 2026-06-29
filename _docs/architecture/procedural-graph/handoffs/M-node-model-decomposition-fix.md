# Handoff — M-node-model-decomposition-fix

**Brief:** [`../briefs/M-node-model-decomposition-fix.md`](../briefs/M-node-model-decomposition-fix.md)
**Assigned executor:** Cursor agent D1
**State:** landed.

## Result

Implemented group-backed decomposition for `math.remap` and `sdf.opSubtract` with the pinned group-param model, canonical `GroupDefinition`s under `packages/procedural-wgsl/src/groups/`, generated module sources via `groupToFunction()` + `loadWgslPrimitive()`, new `math.negate` primitive/module, and renamed scalar min/max WGSL entries to `mathMin`/`mathMax`.

**Review corrections:** `groupToFunction()` derives param WGSL types from TypeBox (`f32`/`bool`), rejects integer/unsupported schemas, validates full param mapping contract (every schema property mapped, compatible target port types; repeated mappings preserved). Four new compiler tests cover boolean round-trip, unmapped properties, incompatible targets, and integer rejection.

Both `math.remap` and `sdf.opSubtract` are **genuinely group-backed**: their standard-library module sources are emitted at load time from canonical `GroupDefinition`s, declare dependencies through the M3 `@use` → `dependencies` path, and link successfully with all callee modules present.

`math.remap` retains public contract: input `x`, params `inMin`/`inMax`/`outMin`/`outMax`, output `value`, canonical arg order `x, inMin, inMax, outMin, outMax`.

## Files changed

### `@virtual-planet/graph`
- `packages/graph/src/types.ts` — `GroupParamMapping`, `GroupInterface.params?`, `GroupDefinition.params?`
- `packages/graph/src/primitives/negate.ts` — new `math.negate` registration
- `packages/graph/src/primitives/min.ts` — `wgsl.entry` → `mathMin`
- `packages/graph/src/primitives/max.ts` — `wgsl.entry` → `mathMax`
- `packages/graph/src/primitives/index.ts` — register `negate`

### `@virtual-planet/compiler`
- `packages/compiler/src/groupCodegen.ts` — param mappings, schema-ordered param args, separate `params:` frontmatter with TypeBox metadata serialization; **review fix:** schema-derived param WGSL types, full param contract validation
- `packages/compiler/src/groupCodegen.test.ts` — params/frontmatter classification test; **review fix:** boolean round-trip, unmapped schema, incompatible port, integer rejection tests

### `@virtual-planet/procedural-wgsl`
- `packages/procedural-wgsl/package.json` — direct deps on `@virtual-planet/graph`, `@virtual-planet/schema`
- `packages/procedural-wgsl/src/groups/buildGroupModule.ts` — `buildGroupModule()`, node templates
- `packages/procedural-wgsl/src/groups/math.remap.ts` — canonical `MATH_REMAP_GROUP`
- `packages/procedural-wgsl/src/groups/sdf.opSubtract.ts` — canonical `SDF_OP_SUBTRACT_GROUP`
- `packages/procedural-wgsl/src/groups/index.ts` — generated `MATH_REMAP_MODULE`, `SDF_OP_SUBTRACT_MODULE`
- `packages/procedural-wgsl/src/groups/groups.test.ts` — parity, dependency, linker tests
- `packages/procedural-wgsl/src/modules/math/remap.ts` — re-exports generated group module
- `packages/procedural-wgsl/src/modules/sdf/ops.ts` — re-exports generated `sdf.opSubtract`
- `packages/procedural-wgsl/src/modules/math/negate.ts` — new atomic module
- `packages/procedural-wgsl/src/modules/math/min.ts` — entry `mathMin`
- `packages/procedural-wgsl/src/modules/math/max.ts` — entry `mathMax`
- `packages/procedural-wgsl/src/modules/math/minmax.test.ts` — no `fn min(` / `fn max(` declarations
- `packages/procedural-wgsl/src/modules/index.ts` — register `math.negate`
- `packages/procedural-wgsl/src/modules/use-deps.test.ts` — regression guard (preserved/improved)
- `packages/procedural-wgsl/src/index.test.ts` — entry map updates

### `@virtual-planet/graph-editor`
- `packages/graph-editor/src/primitiveSources.ts` — skip synthetic frontmatter when module source is already self-describing
- `packages/graph-editor/src/primitiveSources.test.ts` — expect decomposed remap source

### Docs / lockfile
- `_docs/architecture/procedural-graph/STATUS.md` — active cleanup marked complete
- `package-lock.json` — workspace link updates

## Gates run

| Gate | Result |
|------|--------|
| `npm run check --workspace @virtual-planet/graph` | ✅ pass |
| `npm test --workspace @virtual-planet/graph` | ✅ 77/77 |
| `npm run check --workspace @virtual-planet/compiler` | ✅ pass |
| `npm test --workspace @virtual-planet/compiler` | ✅ 42/42 (after review corrections) |
| `npm run check --workspace @virtual-planet/procedural-wgsl` | ✅ pass |
| `npm test --workspace @virtual-planet/procedural-wgsl` | ✅ 35/35 |
| `npm run check --workspaces` | ✅ pass (fe + all packages) |
| `npm test --workspaces` | ⚠️ exits 1 — pre-existing: `@virtual-planet/graph-editor-app` has no `test` script; all other workspaces green |
| `git -c core.whitespace=cr-at-eol diff --check` | ✅ pass |

Additional packages verified green as part of workspace runs: graph-editor 57/57, runtime-cpu 23/23, runtime-webgpu 41/41 (+ skips), schema 18/18, fe 330/330.

## Contract compliance

| Requirement | Status |
|-------------|--------|
| `GroupInterface.params?: GroupParamMapping[]` with `name` + `target: PortRef` | ✅ |
| `GroupDefinition.params?: TSchema` as sole param metadata source | ✅ |
| `groupToFunction()` emits inputs then params; separate frontmatter sections | ✅ |
| Canonical groups under `packages/procedural-wgsl/src/groups/` | ✅ |
| Module sources generated via `groupToFunction()` + `loadWgslPrimitive()` | ✅ |
| Elemental ops in graph + procedural-wgsl (add/subtract/multiply/divide/min/max/negate) | ✅ |
| `math.remap` decomposed subtract/divide/multiply/add chain | ✅ |
| `math.remap` public contract (x + 4 params + value output) | ✅ — graph registration unchanged; loader parity test passes |
| `sdf.opSubtract` decomposed max + negate; inputs a/b, output distance | ✅ |
| Scalar min/max ids preserved; WGSL entries `mathMin`/`mathMax` | ✅ |
| Parity tests graph registration vs generated contracts | ✅ `groups.test.ts` |
| Dependencies via M3 loader, not inert `// @use` comments | ✅ `use-deps.test.ts` + generated modules set `dependencies` |
| No `sdf.opUnion`/`opIntersect` alias expansion | ✅ unchanged (deprecated help text retained) |
| Do not touch M-pipeline-nodes-s0 | ✅ |
| Do not commit | ✅ uncommitted |

**Deviations:** none material. Graph-editor `getDefaultPrimitiveSource` now passes through self-describing group module sources without wrapping a second frontmatter block (required for clone/load correctness).

## Unresolved issues

None blocking M-pipeline-nodes-s0 prep.

- `npm test --workspaces` still fails on `@virtual-planet/graph-editor-app` missing `test` script (pre-existing infra gap, not introduced here).

## Working-tree notes

- Do **not** commit `packages/graph/tsconfig.tsbuildinfo` or `packages/runtime-webgpu/tsconfig.tsbuildinfo` (untracked artifacts).
- `package-lock.json` updated for procedural-wgsl workspace deps.
- All changes are uncommitted per assignment.

## Recommended next action

Rebase and begin [`M-pipeline-nodes-s0`](../briefs/M-pipeline-nodes-s0.md). Optionally add a `test` script stub to `apps/graph-editor` so `npm test --workspaces` is a clean gate.

## Reviewer decision

**Accepted.** The corrections satisfy the pinned TypeBox-backed group-param contract:
numeric and boolean types are derived from the schema, unsupported integer mappings fail
explicitly, every schema property must be mapped, repeated mappings remain valid, and
target-port compatibility is checked.

Independent re-review gates:

- compiler check + 42/42 tests
- all workspace checks
- all available workspace tests via `npm test --workspaces --if-present`
- `git -c core.whitespace=cr-at-eol diff --check`

## Commit record

`a29b4cc` — `M-node-model-decomposition-fix: restore generated node groups`
