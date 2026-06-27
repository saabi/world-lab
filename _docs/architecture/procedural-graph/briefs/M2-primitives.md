# Brief — M2: Primitive registration + CPU evaluators

**Milestone:** M2 ([implementation-plan.md](../implementation-plan.md)) ·
**Package:** `@virtual-planet/graph` · **Depends on:** M1 ✅ ·
**Stream doc:** [schema-and-primitives.md](../schema-and-primitives.md) ·
**Contract author:** Opus · **Recommended executor:** Sonnet (registry +
`math.*`) then Haiku (remaining noise/math primitives).

## Objective

Add the **primitive registry** and the first **standard-library primitives** with
CPU evaluators, so graphs reference real, typed building blocks and `evalCPU`
becomes the headless-testable surface. WGSL emission is **not** in scope — a
primitive only *declares* its WGSL module reference here (resolved/emitted later in
M5).

## Files

- `packages/graph/src/primitive.ts` — primitive types *(new)*
- `packages/graph/src/registry.ts` — `registerPrimitive` / `getPrimitive` / `listPrimitives` *(new)*
- `packages/graph/src/primitives/perlin3d.ts`, `remap.ts`, `clamp.ts`, `smoothstep.ts` *(new)*
- `packages/graph/src/primitives/index.ts` — registers the standard set (side-effect import) *(new)*
- `packages/graph/src/index.ts` — re-export `primitive.ts` + `registry.ts` *(update; keep existing exports)*
- `packages/graph/src/primitives.test.ts` — the gate *(new)*

No new dependencies. Reuse M1's `DataType` / `CoordinateSpace` from `./types.js`.

## Public surface (`primitive.ts`)

```ts
import type { CoordinateSpace, DataType } from './types.js';

/** A primitive's port declaration (a template; node instances get ids in the IR). */
export interface PortSpec {
	name: string;
	dataType: DataType;
	space?: CoordinateSpace;
}

export interface ParamSpec {
	name: string;
	type: 'f32' | 'i32' | 'bool';
	default: number | boolean;
	min?: number;
	max?: number;
}

/** Stable reference to the WGSL module that implements this primitive (declared, not used in M2). */
export interface WgslSourceRef {
	moduleId: string; // e.g. 'noise.perlin3d'
	entry: string; // e.g. 'perlin3d'
}

export type CpuValue = number | number[];

export interface CpuEvalContext {
	inputs: Record<string, CpuValue>;
	params: Record<string, number | boolean>;
}

export interface NodePrimitive {
	id: string; // e.g. 'noise.perlin3d'
	category: string;
	inputs: PortSpec[];
	outputs: PortSpec[];
	params: ParamSpec[];
	wgsl: WgslSourceRef;
	/** Optional CPU evaluator: returns each output by name. */
	evalCPU?: (ctx: CpuEvalContext) => Record<string, CpuValue>;
}
```

## Registry (`registry.ts`)

```ts
export function registerPrimitive(p: NodePrimitive): void; // throws on duplicate id
export function getPrimitive(id: string): NodePrimitive | undefined;
export function listPrimitives(): NodePrimitive[]; // insertion order
```

A module-level `Map<string, NodePrimitive>`. `registerPrimitive` throws if the id is
already registered.

## Standard primitives (M2 set)

Implement at least these four (the gate covers them); param/IO names are fixed so the
test is concrete:

| id | inputs | params | output | evalCPU |
|----|--------|--------|--------|---------|
| `noise.perlin3d` | `position: vec3f` | *(none)* | `value: f32` | standard 3D gradient (Perlin) noise; deterministic; range ≈ `[-1, 1]` |
| `math.remap` | `x: f32` | `inMin, inMax, outMin, outMax` | `value: f32` | `outMin + (x-inMin)/(inMax-inMin) * (outMax-outMin)` |
| `math.clamp` | `x: f32` | `min, max` | `value: f32` | `Math.min(max, Math.max(min, x))` |
| `math.smoothstep` | `x: f32` | `edge0, edge1` | `value: f32` | GLSL smoothstep: `t=clamp((x-edge0)/(edge1-edge0),0,1); t*t*(3-2t)` |

Each declares a `wgsl: { moduleId, entry }` (e.g. `{ moduleId: 'math.remap', entry: 'remap' }`) — the module need not exist yet. `primitives/index.ts` imports each file and registers it.

The remaining noise/math primitives from [schema-and-primitives.md](../schema-and-primitives.md) (Simplex, Worley, FBM, RidgedFBM, DomainWarp; Add, Multiply, Mix, Pow, Bias, Gain, …) are a **Haiku follow-on**: one file each, same shape, each with an `evalCPU` and a one-line numeric test. Not required for this gate.

## The gate (`primitives.test.ts`) — must pass

```ts
import { describe, expect, it } from 'vitest';
import { getPrimitive, listPrimitives } from './registry.js';
import './primitives/index.js'; // registers the standard set

describe('@virtual-planet/graph primitives', () => {
	it('registers and looks up primitives', () => {
		expect(getPrimitive('math.remap')).toBeDefined();
		expect(listPrimitives().map((p) => p.id)).toContain('noise.perlin3d');
	});

	it('remap maps linearly', () => {
		const out = getPrimitive('math.remap')!.evalCPU!({ inputs: { x: 0.5 }, params: { inMin: 0, inMax: 1, outMin: 0, outMax: 10 } });
		expect(out.value).toBeCloseTo(5);
	});

	it('clamp bounds its input', () => {
		const clamp = getPrimitive('math.clamp')!.evalCPU!;
		expect(clamp({ inputs: { x: 2 }, params: { min: 0, max: 1 } }).value).toBe(1);
		expect(clamp({ inputs: { x: -1 }, params: { min: 0, max: 1 } }).value).toBe(0);
	});

	it('smoothstep is 0 / 0.5 / 1 at edges and midpoint', () => {
		const ss = getPrimitive('math.smoothstep')!.evalCPU!;
		const params = { edge0: 0, edge1: 1 };
		expect(ss({ inputs: { x: 0 }, params }).value).toBe(0);
		expect(ss({ inputs: { x: 1 }, params }).value).toBe(1);
		expect(ss({ inputs: { x: 0.5 }, params }).value).toBeCloseTo(0.5);
	});

	it('perlin3d evalCPU is deterministic and bounded', () => {
		const perlin = getPrimitive('noise.perlin3d')!.evalCPU!;
		const ctx = { inputs: { position: [1.5, -2.0, 0.25] }, params: {} };
		const a = perlin(ctx).value as number;
		const b = perlin(ctx).value as number;
		expect(a).toBe(b);
		expect(Math.abs(a)).toBeLessThanOrEqual(1.0001);
	});
});
```

## Out of scope

No WGSL emit/codegen (the `wgsl` ref is declared only), no module resolution, no
compiler/slicing, no TypeBox param schemas, no node instantiation from a primitive,
no editor. **No new public exports beyond those listed.**

## Done when

`npm run check -w @virtual-planet/graph` and `npm test -w @virtual-planet/graph` are
green (M1's tests stay green too), and the public surface matches this brief.

## Handoff

→ **M4 — Dependency slicing** (critical path) · executor: **Opus** (algorithmic
core — pins the slice interface, then the traversal can be co-implemented/delegated)
· why: with the IR (M1) and a registry of typed primitives (M2) in place, the
compiler can walk a graph backward from requested outputs to the minimal sub-graph,
which every consumer depends on. (M3 — self-describing WGSL loader — is also
unblocked and can be interleaved when parallelizing.)
