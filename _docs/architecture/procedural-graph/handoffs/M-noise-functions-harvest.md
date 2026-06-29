# Handoff — M-noise-functions-harvest

**Brief:** [`../briefs/M-noise-functions-harvest.md`](../briefs/M-noise-functions-harvest.md)
**Assigned executor:** Cursor agent N1
**State:** accepted — awaiting commit approval.

## Result

Harvested the pinned first slice from `noise-functions.glsl` into six graph primitives plus a
shared resolver module `noise.hash2d`. Each primitive has matching WGSL (with self-describing
frontmatter), CPU evaluators with f32 bitcast hash semantics, loader-contract parity tests, and
dependency-closure linker tests.

**Review corrections (round 1):**
1. **CPU u32/f32 hash parity** — hash12/22/32 use `Math.imul` for u32 wrapping multiply.
2. **Cross-package source imports** — procedural-wgsl tests use `@virtual-planet/graph` package
   imports, not relative `graph/src/...` paths.

**Review corrections (round 2):**
1. **`u32ToUnitFloat`** — now mirrors WGSL `f32(u32) / f32(0xffffffffu)` via `Math.fround` on
   both the numerator cast and denominator (e.g. `hash12([1.5, -2.25])` → `0.3666651248931885`).
2. **Independent hash parity vectors** — `parityFixtures.ts` hard-codes hash12/22/32 reference
   outputs at positive, negative, integer, and fractional sample points; tests assert exact
   equality (not just range/determinism).
3. **Independent CPU evaluator fixtures** — all six primitives (including deriv, Worley,
   Voronoi) have hard-coded expected outputs kept internal to graph tests.
4. **API cleanup** — the reviewer removed the temporary production export of test fixtures
   and the redundant procedural-WGSL CPU-fixture test.

| Primitive id | Source fn | Status |
|--------------|-----------|--------|
| `noise.value2d` | `value12` | ✅ |
| `noise.perlin2d` | `perlin12` | ✅ |
| `noise.perlin2dDeriv` | `perlin12d` | ✅ (`sample: vec3f` = value + ∂x/∂y) |
| `noise.worley2d` | `worley12` | ✅ |
| `noise.voronoi2d` | `voronoi12` | ✅ (`smoothness` param 0.01–8, default 1) |
| `noise.blue2d` | `blue12` | ✅ |
| `noise.hash2d` | hash helpers | ✅ resolver-only (not a graph primitive) |

Source reference file `noise-functions.glsl` unchanged (already present with MIT header).

## Files changed

### `@virtual-planet/graph`
- `packages/graph/src/primitives/noise/hash2d.ts` — shared CPU hash12/22/32 helpers
- `packages/graph/src/primitives/noise/parityFixtures.ts` — independent WGSL/f32 parity vectors
- `packages/graph/src/primitives/noise/eval2d.ts` — CPU evaluators for all six primitives
- `packages/graph/src/primitives/noise/index.ts` — primitive registrations
- `packages/graph/src/primitives/noise/noise.test.ts` — registration, hash semantics, evalCPU parity
- `packages/graph/src/primitives/index.ts` — import noise harvest

### `@virtual-planet/procedural-wgsl`
- `packages/procedural-wgsl/src/modules/noise/harvest2d.ts` — hash2d + six WGSL modules with frontmatter
- `packages/procedural-wgsl/src/modules/noise/noise-harvest.test.ts` — loader parity, @use/dependency, linker closure
- `packages/procedural-wgsl/src/modules/index.ts` — register modules + export sources
- `packages/procedural-wgsl/src/index.test.ts` — `RESOLVER_ONLY_WGSL_MODULE_IDS`, new STANDARD_LIBRARY_ENTRIES

### Docs
- `_docs/architecture/procedural-graph/TASK_BOARD.md` — N1 state → complete (handoff ready)

## Gates run

| Gate | Result |
|------|--------|
| `npm run check --workspace @virtual-planet/graph` | ✅ pass |
| `npm test --workspace @virtual-planet/graph` | ✅ 83/83 (after round 2 fix) |
| `npm run check --workspace @virtual-planet/procedural-wgsl` | ✅ pass |
| `npm test --workspace @virtual-planet/procedural-wgsl` | ✅ 56/56 (after API cleanup) |
| `git -c core.whitespace=cr-at-eol diff --check` | ✅ pass |

## Contract compliance

| Requirement | Status |
|-------------|--------|
| First slice only (six primitives + hash2d) | ✅ |
| `position: vec2f` inputs, scalar `value` outputs | ✅ |
| `noise.perlin2dDeriv` → `sample: vec3f` | ✅ |
| `noise.voronoi2d` smoothness param contract | ✅ |
| `category: noise`, pure + deterministic metadata | ✅ |
| `noise.hash2d` dependency module + `@use` backed by `dependencies` | ✅ |
| CPU f32 bitcast/u32 wrapping semantics | ✅ (Math.imul + f32(u32)/f32 denom) |
| Loader-contract tests per self-describing module | ✅ |
| No duplicate ids vs existing 3D noise family | ✅ |
| No commit (delegated agent) | ✅ |

## Unresolved issues

None known.

## Working-tree notes

Unrelated untracked files remain untouched:

- `_docs/camera-near-far-geometry.html`
- `packages/graph/tsconfig.tsbuildinfo`
- `packages/runtime-webgpu/tsconfig.tsbuildinfo`

## Reviewer decision

**Accepted.** Exact u32/f32 hash parity, independent vectors for every hash component and
all six CPU evaluators, loader/resolver dependency coverage, and package boundaries are
correct. The reviewer removed the temporary test-fixture export from the production graph
API. Independent gates: graph 83/83, procedural-WGSL 56/56, both checks, diff-check clean.

## Commit record

Not committed; awaiting human commit approval.
