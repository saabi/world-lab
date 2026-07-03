# Brief — geometry transforms, Slice A (`spherify` + `normalDisplace`)

**Type:** standard-library expansion · **Packages:** `@world-lab/procedural-wgsl`
(`math.normalize` WGSL module), `@world-lab/graph` (primitive + group registration) ·
**Depends on:** none · **Design authority:**
[node-model-design-notes.md §B](../node-model-design-notes.md#b-elemental-geometry--composable-transforms-decompose-cube-sphere)
(read this section in full before starting — it specifies the exact composition each
transform must be) · **Contract author:** Opus · **Recommended executor:** Cursor ·
**Status:** ready to route

## Objective

§B's design is explicit and already settled: most geometry transforms are **not** new WGSL —
they're **node groups** composing existing/near-existing elemental math ops, using the same
`groupToFunction`/`buildGroupModule` system that already restored `math.remap`/`sdf.opSubtract`
as real group-backed decompositions earlier this project. This brief is the **first slice**:
the two transforms §B calls out by name as unblocking `geometry.cubeSphere`'s decomposition.

- `transform.spherify` = `normalize(position)` — **literally** `math.normalize`, a group of
  exactly one node.
- `transform.normalDisplace` = `multiply(normal, height)` → `add(position, …)` — a two-node
  group over existing `math.multiply`/`math.add`.

Confirmed by grep: **`math.normalize` does not exist yet** as a primitive anywhere in
`packages/graph` or `packages/procedural-wgsl` — it's the one genuinely new atomic op this
slice needs; everything else is composition over what's already there.

## Fix

1. **Add `math.normalize` as an atomic primitive** (`(v: vec3f) -> vec3f`, `v / length(v)`,
   guard the zero-vector case however the existing `math.*` primitives handle equivalent edge
   cases — check `math.add`/`math.multiply`'s own module for the house style on domain
   guards, if any). Register in both `procedural-wgsl` (WGSL module) and `graph` (primitive +
   `evalCPU`), following the exact shape of a neighboring `math.*` primitive rather than
   inventing a new registration pattern.
2. **`transform.spherify`** — a node group (via `groupToFunction`/`buildGroupModule`) wrapping
   `math.normalize`. Follow the `math.remap`/`sdf.opSubtract` decomposition
   (`M-node-model-decomposition-fix.md`, landed `a29b4cc`) as the exact precedent for how a
   group-backed primitive is registered and compiled — same param-mapping approach, same
   "preserve output name" discipline that fix's own gate required.
3. **`transform.normalDisplace`** — a node group composing `math.multiply` then `math.add`
   (per §B's own worked example). Two-node group, same registration pattern as #2.
4. **Where these run:** §B specifies position transforms live in the **vertex stage** (per-
   vertex operation, no explicit loop node needed — the vertex stage's per-vertex invocation
   *is* the loop). Don't add a new loop/container node for this; these are ordinary field-
   subgraph nodes usable inside `stage.vertex`, same as any other primitive.

## Gate

1. `procedural-wgsl`/`graph`: `math.normalize` registered + resolvable; `evalCPU` matches a
   known case (e.g. `normalize([3,4,0]) = [0.6,0.8,0]`); WGSL validity check.
2. `graph`/`compiler`: both `transform.spherify` and `transform.normalDisplace` compile to
   inline WGSL at the call site (group semantics — zero runtime overhead, matching the
   `math.remap` precedent's own gate: a group compiles inline, not as a separate function
   call with branching).
3. `evalCPU` parity: `transform.spherify` on a known non-unit vector returns its normalized
   form; `transform.normalDisplace` on known position/normal/height inputs returns the
   expected offset position.
4. No id collision with any existing `transform.*`/`math.*` primitive.
5. `check` **and** `test` green for `procedural-wgsl`, `graph`, `compiler`, and the full
   workspace.
6. **Visual ⚠:** wire `geometry.plane → transform.spherify → stage.vertex → …` in a test
   graph (or the existing sample graph if convenient) and confirm the rendered geometry is
   visibly spherified, not just green tests.

## Out of scope

`transform.displace` as a standalone field-driven variant (only `normalDisplace`'s
normal-based form is this slice's scope, per §B's own worked example); `translate`/`rotate`/
`scale`/`twist`/`bend`/`affine` (later slices); decomposing `geometry.cubeSphere` itself into
`geometry.cube` + `transform.spherify` (a follow-on once this slice lands — don't touch
`cubeSphere`'s existing implementation in this brief).

## Handoff

→ `transform.spherify`/`normalDisplace` exist as real, group-backed, zero-overhead primitives
— the first concrete step toward decomposing `geometry.cubeSphere` into elemental,
reusable pieces (§B's stated goal), and directly reusable by the plane-orientation case
(`geometry.plane`'s existing width/height/rotation params) via composition later, per that
primitive's own brief note.
