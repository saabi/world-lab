# Brief — Multi-output compile driver + consumer-stage model

**Type:** core capability (was missing — see
[design-vs-implementation-audit.md](../design-vs-implementation-audit.md)) ·
**Packages:** `@virtual-planet/graph` (consumer model), `@virtual-planet/compiler`
(driver) · **Depends on:** M4 ✅, M5 ✅, M6 ✅ · **Design authority:**
[graph-and-compiler.md](../graph-and-compiler.md),
[wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md) · **Contract author:**
Opus · **Recommended executor:** Cursor (it's composition of existing slice/codegen/link).

## Objective

Deliver the architecture's central promise: **one graph → many stage-specialized
shaders**. A graph declares N consumers (each a pipeline **stage** + a set of named
outputs); the compiler slices per consumer, generates + links a shader per consumer, and
returns a **bundle** — reporting which modules are shared across consumers vs. specialized.
This makes `GraphDocument.consumers` (currently inert metadata) the actual driver of
compilation, and turns "add an output" into a declaration rather than a hand-written pass.

This is pure composition of existing pieces (`sliceGraph` + `generateWgsl` + `ShaderLinker`)
— **no new WGSL parsing, no AST** (ADR-conformant: text in, text out).

## Part 1 — Consumer-stage model (`@virtual-planet/graph`)

Extend `ProceduralConsumer` **additively** (the field exists but is unused, so this is
safe):

```ts
export type PipelineStage = 'compute' | 'vertex' | 'fragment' | 'mesh-gen';

export interface ProceduralConsumer {
	type: string;                 // existing — keep (human/category label)
	outputs: string[];            // existing — GraphDocument.outputs names
	id?: string;                  // new — stable id (defaults to `type` if absent)
	stage?: PipelineStage;        // new — which WebGPU pipeline stage consumes it
}
```

Files: `packages/graph/src/types.ts` *(update)*; extend the existing graph type test to
construct a consumer with `stage`. Existing graphs/tests with `{ type, outputs }` must
still type-check (fields are optional).

## Part 2 — Compile driver (`@virtual-planet/compiler`)

```ts
// packages/compiler/src/compileGraph.ts  (new)
import type { GraphDocument, ProceduralConsumer } from '@virtual-planet/graph';
import type { WgslModuleResolver } from './codegen.js';
import type { ShaderLinker } from './linker.js';

export interface ConsumerShader {
	consumerId: string;
	stage: string;          // the consumer's stage (or 'unknown' if unspecified)
	outputs: string[];
	code: string;           // linked WGSL for this consumer's slice
	moduleIds: string[];    // modules included (emit order)
}

export interface GraphCompileResult {
	shaders: ConsumerShader[];
	/** Module ids used by more than one consumer (shared evaluation). */
	sharedModuleIds: string[];
}

/** Compile every consumer of `doc` (or an explicit subset) into its own shader. */
export function compileGraph(
	doc: GraphDocument,
	resolver: WgslModuleResolver,
	opts?: { consumers?: ProceduralConsumer[]; linker?: ShaderLinker }
): Promise<GraphCompileResult>;
```

**Algorithm** (per consumer, in `doc.consumers` order unless `opts.consumers` given):

1. `consumerId = consumer.id ?? consumer.type`.
2. `slice = sliceGraph(doc, { outputs: consumer.outputs })` — throws on unknown output
   (existing M4 behavior; let it propagate).
3. `gen = await generateWgsl(slice, resolver)` → `{ code, moduleIds }`.
4. `code = (opts.linker ?? textLinker)` is applied **if** an entry is resolvable;
   for M-multi-output keep it simple — the linked `code` is `gen.code` (the
   dependency-ordered library). *(Entry-point assembly per stage is a follow-on; this
   milestone proves the per-consumer slicing + bundling, not stage entry wrappers.)*
   Record `moduleIds = gen.moduleIds`, `stage = consumer.stage ?? 'unknown'`.
5. After all consumers: `sharedModuleIds` = module ids appearing in ≥2 consumers'
   `moduleIds` (deduped, stable order).

No type/space re-validation here (M1 owns that); no GPU.

Files: `packages/compiler/src/compileGraph.ts` *(new)*, `src/index.ts` re-export
*(update)*, `src/compileGraph.test.ts` *(new)*.

## The gate (`compileGraph.test.ts`)

Build a graph with **three** outputs sharing one upstream node, and three consumers of
different stages:

```ts
// outputs: height (→vertex), albedo (→fragment), peaks (→compute);
// height & albedo both depend on a shared `base` node → shared module expected.
const result = await compileGraph(doc, resolver);
expect(result.shaders.map((s) => s.consumerId).sort()).toEqual(['albedo', 'height', 'peaks']);
expect(result.shaders.find((s) => s.consumerId === 'height')!.stage).toBe('vertex');
// each shader contains only its slice's functions:
const peaks = result.shaders.find((s) => s.consumerId === 'peaks')!;
expect(peaks.code).not.toContain(/* an albedo-only fn name */);
// shared evaluation detected:
expect(result.sharedModuleIds).toContain(/* the shared base module id */);
```

Plus: a consumer requesting an unknown output → the returned promise rejects.

(Use the same in-memory resolver pattern as `codegen.test.ts`; register test primitives
whose `wgsl.moduleId`s are distinct so module sharing is observable.)

## Note: render targets are a separate (runtime) layer

A consumer also has a **write target** and may read other consumers' targets as channels;
resolution is **per-target** (see
[inputs-cpu-and-resources.md → render targets & pass graph](../inputs-cpu-and-resources.md#render-targets-per-target-resolution--the-pass-graph)).
This brief stays **shader-bundle only** — it does not bind targets or order passes. When
the consumer-stage model lands, consider an **optional** `target?` / `reads?` hint on
`ProceduralConsumer` for the later pass-graph executor; do not implement target binding or
the executor here (separate runtime follow-on).

## Out of scope

Per-stage entry-point wrappers (vertex `@vertex fn main(...)`, compute workgroup
attributes, bind-group layout generation) — a **follow-on** (`M-stage-entrypoints`) once
the bundle exists. Render-target binding, per-target resolution, and the pass-graph
executor — a separate runtime follow-on. Refactoring the existing previews onto the driver — opportunistic,
not here. Resource GPU binds — separate (audit item 2). **No new public exports beyond
those listed; no AST.**

## Done when

`npm run check`/`test -w @virtual-planet/graph` and `-w @virtual-planet/compiler` green
(existing tests stay green; the additive consumer fields don't break them).

## Handoff

→ **M-stage-entrypoints** (wrap each `ConsumerShader` with its stage's WGSL entry point +
bind-group layout, so the bundle is directly pipeline-ready) · executor: Opus pins the
per-stage wrapper contract · why: with per-consumer slicing + bundling proven, the
remaining step to real multi-pipeline output is the stage entry/bind-group layer. Then
existing previews can migrate onto `compileGraph` incrementally.
