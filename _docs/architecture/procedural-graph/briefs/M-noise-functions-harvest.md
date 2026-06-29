# Brief — Harvest documented GLSL noise functions

**Type:** standard-library expansion · **Packages:** `@virtual-planet/procedural-wgsl`,
`@virtual-planet/graph` · **Depends on:** M3 ✅, procedural-wgsl ✅ · **Design
authority:** [`primitive-library.md`](../primitive-library.md),
[`wgsl-parsing-and-codegen.md`](../wgsl-parsing-and-codegen.md) · **Recommended executor:**
Cursor / Composer.

## Objective

Promote selected functions from
[`../noise-functions.glsl`](../noise-functions.glsl) into first-class procedural graph
noise primitives.

The source file is a GLSL reference library with MIT provenance comments. Keep it as a
source/reference doc, and port selected functions to WGSL modules with graph primitive
registrations and CPU parity tests where practical.

## Source

[`../noise-functions.glsl`](../noise-functions.glsl) includes:

- hashes: `hash11`, `hash12`, `hash22`, `hash32`, `hash13`, `hash33`
- 1D/2D value and gradient noises: `value11`, `value12`, `perlin12`, `perlin12d`
- simplex / worley / voronoi: `simplex12`, `worley12`, `voronoi12`
- blue-noise-style helpers: `blue12`, `hilbert_blue12`
- domain/texture utilities: `crater12`, `gabor12`, `curl22`, `scratches12`

Existing built primitives already cover several 3D noise families (`noise.perlin3d`,
`noise.simplex`, `noise.worley`, `noise.fbm`, `noise.ridgedFbm`). Do not duplicate
existing ids. Prefer additive `noise.*2d` / utility ids only where they add clear value.

## Pinned first slice

Keep the first slice small and useful:

| Primitive id | Source fn | Notes |
|--------------|-----------|-------|
| `noise.value2d` | `value12` | cheap scalar field; useful baseline |
| `noise.perlin2d` | `perlin12` | 2D gradient noise |
| `noise.perlin2dDeriv` | `perlin12d` | one `sample: vec3f` output = `[value, dx, dy]` |
| `noise.worley2d` | `worley12` | 2D cellular |
| `noise.voronoi2d` | `voronoi12` | param `smoothness` |
| `noise.blue2d` | `blue12` | documented blue-noise helper |

Defer crater/gabor/scratches unless the executor has time after the first slice is green.
The executor must not expand past this table during the first task.

All primitives take `position: vec2f`. All scalar functions return `value: f32`.
`noise.voronoi2d` additionally has an authored `smoothness: f32` param with default `1`,
minimum `0.01`, and maximum `8`.

Use lowercase `category: noise`, matching the existing graph catalogue. Mark every
primitive pure and deterministic.

Create a private resolver module `noise.hash2d` containing the shared hash helpers.
Consumer modules declare `dependencies: ['noise.hash2d']`. If generated/embedded
`// @use noise.hash2d` directives are present, tests must prove the declared dependency
matches; comments alone are never dependency declarations.

## Requirements

1. Keep [`../noise-functions.glsl`](../noise-functions.glsl) in the repo as the source
   reference, preserving its license/provenance header.
2. For each selected function, add:
   - a `procedural-wgsl` module under `packages/procedural-wgsl/src/modules/noise/`
   - a graph primitive under `packages/graph/src/primitives/`
   - registration in the relevant `index.ts`
   - tests in both packages
3. Convert GLSL to WGSL deliberately:
   - `vec2` → `vec2f`, `vec3` → `vec3f`
   - GLSL `%` / integer operations must become valid WGSL
   - avoid ambiguous builtin shadowing
4. Use only frontmatter keys supported by `loadWgslPrimitive`:
   - `category: noise`
   - `keywords` includes `Fields`
   - description/pure/deterministic/inputs/params/outputs as appropriate
   - put provenance/license text in an ordinary WGSL comment referencing
     `noise-functions.glsl`; do not add unsupported `group` or `source` keys
5. Add CPU evaluators for all first-slice primitives. Preserve f32 bitcast/u32 wrapping
   semantics (`Math.fround`, `DataView`, `Math.imul` or equivalent) and test positive,
   negative, integer, and fractional sample points.
6. Do not add external runtime dependencies.
7. Add loader-contract tests for every self-describing source plus resolver/dependency
   closure tests. The loader still supports one return value; do not introduce struct or
   multi-output loader work for derivatives.

## Gate

- `npm run check --workspace @virtual-planet/graph`
- `npm test --workspace @virtual-planet/graph`
- `npm run check --workspace @virtual-planet/procedural-wgsl`
- `npm test --workspace @virtual-planet/procedural-wgsl`
- `git -c core.whitespace=cr-at-eol diff --check`

## Out of scope

No editor UI changes. No broad noise-node UX redesign. No pipeline graph work. Do not
change existing `noise.perlin3d` / `noise.simplex` semantics.

## Handoff

→ Selected documented noise functions are available as first-class graph primitives. Next
agent may expand the remaining `noise-functions.glsl` utilities or use them in terrain /
material graph examples.

Do not commit. Write the result to
[`../handoffs/M-noise-functions-harvest.md`](../handoffs/M-noise-functions-harvest.md)
before yielding.
