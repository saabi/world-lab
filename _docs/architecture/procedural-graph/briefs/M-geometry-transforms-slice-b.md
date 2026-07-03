# Brief — geometry transforms, Slice B (`translate` / `scale` / `rotate`)

**Type:** standard-library expansion · **Packages:** `@world-lab/procedural-wgsl`,
`@world-lab/graph` (primitive + group registration) · **Depends on:** Slice A ✅ landed
(`ec84b01`) · **Design authority:**
[node-model-design-notes.md §B](../node-model-design-notes.md#b-elemental-geometry--composable-transforms-decompose-cube-sphere)
(same section as Slice A) · **Contract author:** Opus · **Recommended executor:** Cursor ·
**Status:** ready to route

## Objective

Slice A landed `transform.spherify`/`transform.normalDisplace`. This is the next slice from
the same §B backlog (`translate`/`rotate`/`scale`/`twist`/`bend`/`affine`) — the three
"rigid" transforms. Confirmed by reading the actual registries: **no new atomic math ops are
needed for `translate`/`scale`** — both compose directly over primitives that already exist:

- `transform.translate` = `vector.add.vec3f(position, offset)` — verbatim, a one-node group.
  (`vector.add.vec3f(a: vec3f, b: vec3f) -> value: vec3f` already registered,
  `packages/graph/src/primitives/vector/index.ts`.)
- `transform.scale` = `vector.mulScalar.vec3f(position, factor)` — verbatim, a one-node group.
  **Uniform scale only** (`vector.mulScalar.vec3f(value: vec3f, scalar: f32) -> value: vec3f`
  already registered, same file). Per-axis non-uniform scale would need a component-wise
  vec3×vec3 multiply, which doesn't exist yet — leave that for a later slice, don't invent it
  here.
- `transform.rotate` needs one genuinely new thing, but it's an **extraction, not new
  invention**: `packages/graph/src/primitives/pipeline/planeGrid.ts` already implements
  "Euler XYZ rotation (radians): Rx then Ry then Rz" (its own comment says it "matches
  procedural-wgsl `plane_grid_euler_rotate`") as part of `geometry.plane`'s existing
  orientation feature. That primitive's own brief already flagged this as a known follow-on:
  "Composable `transform.*` nodes remain a follow-on." Extract this exact math into a
  standalone `transform.rotate(position: vec3f, rotX/rotY/rotZ: params) -> position: vec3f`
  primitive — same rotation convention, not a new one, so `geometry.plane`'s own orientation
  could later be re-expressed as `geometry.plane(unrotated) → transform.rotate` without any
  behavior change (not this brief's job to do that re-expression, just to make the math
  available standalone).

## Fix

1. **`transform.translate`** — a node group (via `groupToFunction`/`buildGroupModule`,
   same machinery as Slice A) wrapping `vector.add.vec3f`. `inputs: [position: vec3f, offset:
   vec3f]`, `outputs: [position: vec3f]`.
2. **`transform.scale`** — a node group wrapping `vector.mulScalar.vec3f`. `inputs: [position:
   vec3f, factor: f32]`, `outputs: [position: vec3f]`. Name the param/port `factor`, not
   `scale`, to avoid colliding with the primitive's own id/category naming.
3. **`transform.rotate`** — extract `planeGrid.ts`'s existing Euler-rotation math (and its
   WGSL counterpart, `plane_grid_euler_rotate` or wherever it's actually defined in
   `procedural-wgsl` — locate it, don't re-derive the rotation matrices from scratch) into a
   standalone primitive. `inputs: [position: vec3f]`, `params: { rotationX, rotationY,
   rotationZ: number (radians), default 0 }` (matching `geometry.plane`'s own param naming
   exactly — `rotationX`/`rotationY`/`rotationZ` per `planeGrid.ts`'s own `PlaneGridOptions`
   shape — for consistency, not a new naming convention), `outputs: [position: vec3f]`. At
   identity rotation (all zero), output must equal input exactly (bit-identical, matching the
   same "defaults preserve current behavior" discipline `geometry.plane`'s own brief required).
4. Register all three as **groups** (Slice A precedent), not hand-written WGSL — they compile
   inline at zero runtime cost, same as `spherify`/`normalDisplace`.

## Gate

1. `graph`/`procedural-wgsl`: each of the three registers + resolves; no id collision with any
   existing `transform.*`/`vector.*` primitive.
2. `evalCPU` parity: `translate` on a known position+offset returns the expected sum;
   `scale` on a known position+factor returns the expected scaled result; `rotate` at
   identity (all angles 0) returns the input unchanged (bit-identical); `rotate` at a known
   non-zero angle matches `planeGrid.ts`'s own existing rotation math for the same inputs
   (direct parity check against the function being extracted from, not just "looks about
   right").
3. `compiler`: all three compile inline (group semantics, zero runtime branching) — same gate
   shape Slice A's own `math.remap` precedent required.
4. `check` **and** `test` green for `graph`, `procedural-wgsl`, `compiler`, and the full
   workspace.
5. **Visual ⚠:** wire `geometry.plane → transform.rotate` (or `translate`/`scale`) into a test
   graph or the mesh preview (once `M-mesh-target-sink.md` lands) and confirm the rendered
   geometry visibly transforms as expected, not just green tests.

## Out of scope

Non-uniform (per-axis) scale (needs a new component-wise vec3×vec3 multiply primitive, not
yet built — later slice); `twist`/`bend`/`affine` (later slices, more exotic compositions);
re-expressing `geometry.plane`'s own orientation params in terms of the new
`transform.rotate` (a later, separate decision — this brief only makes the math available
standalone, it doesn't refactor `geometry.plane` itself); quaternion or axis-angle rotation
representations (Euler XYZ only, matching the existing convention).

## Handoff

→ `translate`/`scale`/`rotate` complete the "rigid transform" trio alongside Slice A's
`spherify`/`normalDisplace` — every elemental geometry op §B calls out by name now exists
except `twist`/`bend`/`affine` (later, more exotic slices) and non-uniform scale.
