# Brief — M4: Dependency slicing

**Milestone:** M4 ([implementation-plan.md](../implementation-plan.md)) ·
**Package:** `@virtual-planet/compiler` · **Depends on:** M1 ✅, M2 ✅ ·
**Stream doc:** [graph-and-compiler.md](../graph-and-compiler.md) (dependency
slicing) · **Contract author:** Opus · **Recommended executor:** Cursor (the
algorithm + gate are fully pinned below; it's backward reachability).

## Objective

Given a `GraphDocument` and a set of requested output names, compute the **minimal
sub-graph** needed to produce them — the nodes/edges reachable *backward* from those
outputs. Unrelated branches are excluded. This is the heart of per-consumer
compilation: every consumer asks for different outputs and gets a different slice.

## First cross-package dependency

This is the first package that depends on another workspace package. In
`packages/compiler/package.json` add:

```json
"dependencies": { "@virtual-planet/graph": "*" }
```

then run `npm install` from the repo root so the workspace symlink is created. Import
IR types from the package entry: `import type { GraphDocument } from '@virtual-planet/graph'`.

## Files

- `packages/compiler/src/slice.ts` — `sliceGraph` + types *(new)*
- `packages/compiler/src/index.ts` — re-export `slice.ts` *(update; keep `COMPILER_PACKAGE`)*
- `packages/compiler/src/slice.test.ts` — the gate *(new)*
- `packages/compiler/package.json` — add the dependency above *(update)*

The M0 `index.test.ts` identity test may stay (it still passes).

## Public surface (`slice.ts`)

```ts
import type { Edge, GraphDocument, GraphOutput, Node } from '@virtual-planet/graph';

export interface SliceRequest {
	outputs: string[]; // names referencing GraphDocument.outputs
}

export interface GraphSlice {
	nodes: Node[]; // minimal set, in the document's original node order
	edges: Edge[]; // only edges whose both endpoints are in `nodes`, original order
	outputs: GraphOutput[]; // the requested outputs, resolved
}

export function sliceGraph(doc: GraphDocument, request: SliceRequest): GraphSlice;
```

## Algorithm

1. Resolve each requested name against `doc.outputs`; **throw** `Error` on an unknown
   name (e.g. `Unknown output: <name>`).
2. Seed a `needed: Set<nodeId>` with each resolved output's `from.node`.
3. Fixpoint backward walk: while changes occur, for every `nodeId` in `needed`, find
   incoming edges (`edge.to.node === nodeId`) and add their `edge.from.node` to
   `needed`. A `visited` set / worklist prevents infinite loops on cycles.
4. `nodes` = `doc.nodes` filtered to `needed` (preserve original order).
5. `edges` = `doc.edges` filtered to those whose `from.node` **and** `to.node` are both
   in `needed` (preserve original order).
6. `outputs` = the resolved `GraphOutput`s for the requested names.

Slicing is reachability only — no type/space validation (that's M1's `validateGraph`),
no WGSL.

## The gate (`slice.test.ts`) — must pass

```ts
import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@virtual-planet/graph';
import { sliceGraph } from './slice.js';

// n_src feeds both n_h (height) and n_m (mask); n_iso is independent (noise).
function graph(): GraphDocument {
	return {
		version: '1',
		nodes: [
			{ id: 'n_src', primitive: 'noise.perlin3d',
			  inputs: [{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
			{ id: 'n_h', primitive: 'math.remap',
			  inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
			{ id: 'n_m', primitive: 'math.clamp',
			  inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
			{ id: 'n_iso', primitive: 'noise.perlin3d',
			  inputs: [{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
		],
		edges: [
			{ id: 'e_h', from: { node: 'n_src', port: 'value' }, to: { node: 'n_h', port: 'x' } },
			{ id: 'e_m', from: { node: 'n_src', port: 'value' }, to: { node: 'n_m', port: 'x' } },
		],
		outputs: [
			{ name: 'height', from: { node: 'n_h', port: 'value' } },
			{ name: 'mask', from: { node: 'n_m', port: 'value' } },
			{ name: 'noise', from: { node: 'n_iso', port: 'value' } },
		],
		consumers: [],
	};
}

describe('@virtual-planet/compiler sliceGraph', () => {
	it('keeps only the requested branch and excludes unrelated nodes', () => {
		const s = sliceGraph(graph(), { outputs: ['height'] });
		expect(s.nodes.map((n) => n.id).sort()).toEqual(['n_h', 'n_src']);
		expect(s.edges.map((e) => e.id)).toEqual(['e_h']);
	});

	it('keeps a shared node once across multiple outputs', () => {
		const s = sliceGraph(graph(), { outputs: ['height', 'mask'] });
		expect(s.nodes.map((n) => n.id).sort()).toEqual(['n_h', 'n_m', 'n_src']);
		expect(s.nodes.filter((n) => n.id === 'n_src')).toHaveLength(1);
	});

	it('slices an independent output to just its node', () => {
		const s = sliceGraph(graph(), { outputs: ['noise'] });
		expect(s.nodes.map((n) => n.id)).toEqual(['n_iso']);
		expect(s.edges).toEqual([]);
	});

	it('throws on an unknown output name', () => {
		expect(() => sliceGraph(graph(), { outputs: ['nope'] })).toThrow();
	});
});
```

## Out of scope

No WGSL generation, no module resolution, no linker, no per-consumer compile driver
(those are M5+), no type/space validation (M1), no editor. **No new public exports
beyond those listed.**

## Done when

`npm run check -w @virtual-planet/compiler` and `npm test -w @virtual-planet/compiler`
are green (after `npm install` links the new dependency), and the public surface
matches this brief.

## Handoff

→ **M5 — WGSL function generation + module resolver** · executor: Cursor (Opus pins
the `WgslModuleResolver` interface + codegen shape first) · why: with a minimal slice
per consumer, the compiler can emit only the WGSL functions that slice needs and
resolve their modules by stable id.
