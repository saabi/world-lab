# Brief — extract a reusable instanced-mesh-draw consumer

**Type:** refactor / capability extraction, first step toward a generic particle-system
methodology · **Package:** `@world-lab/runtime-webgpu` (new
`consumers/instancedMeshDraw.ts`, `consumers/vegetationPreview.ts`) · **Depends on:** none ·
**Design authority:** this brief itself — traced by direct code reading, no pre-existing ADR
· **Contract author:** Opus · **Recommended executor:** Cursor · **Status:** ready to route

## Context — why this is the first of three, not a one-off

This is step one of a three-step plan to give this codebase a generic, primitive-based
methodology for particle systems (and anything else needing GPU instancing), rather than a
particle-specific vertical. The three capabilities identified, each already having working
precedent somewhere in the codebase, just siloed:

1. **Instanced draw** — already working in `vegetationPreview.ts` (this brief: extract it).
2. **Graph-driven compute dispatch** — the mesh-gen consumer already does this for a grid-sweep
   shape; a particle-update dispatch (N-particles-from-buffer, not grid-sweep) would be a
   sibling consumer reusing the same underlying codegen utilities (`emitGraphVec3Eval`,
   `buildParamsStructWgsl`) already shared between `meshGen.ts` and `emitGraphEval.ts` — later
   brief, not this one.
3. **Feedback/ping-pong** — the frame-graph pure core (`frameGraph/order.ts`) already models
   cross-frame feedback generically (`ChannelRead.previousFrame`, `RenderTarget.persistent`,
   `collectFeedbackTargets`); only the type model (`RenderTarget.format: GPUTextureFormat`) and
   `resolveTargetSizes` are texture-specific — later brief, not this one.

**This brief is scoped to #1 only.** Do not start #2 or #3's work here.

## Problem

`vegetationPreview.ts` (lines ~777-863) has a complete, working, visually-proven instanced
render path: build a template mesh (impostor quad or cone), upload a per-instance buffer
(`position: vec3f, vigor: f32` per candidate, `stepMode: 'instance'`), and
`drawIndexed(indexCount, candidateCount)`. This is genuinely reusable — the *shape* of "draw N
copies of a template mesh, each carrying its own per-instance data" has nothing
vegetation-specific about it — but it's currently inline, private code in one file, not
callable from anywhere else.

## Fix

- **New `packages/runtime-webgpu/src/consumers/instancedMeshDraw.ts`** exporting a function
  (e.g. `renderInstancedMesh`) that takes: a template mesh (positions/normals/indices — reuse
  `GeneratedMesh`'s shape from `meshGen.ts` for consistency rather than inventing a parallel
  type), an **existing** `GPUBuffer` for per-instance data (the caller creates and populates
  it — this function must not assume or require CPU `writeBuffer` internally, since a future
  compute-populated buffer needs to work here unchanged), the per-instance vertex layout
  (stride + attributes, since vegetation's is `vec3f + f32` but that shouldn't be hardcoded),
  instance count, the render pass/pipeline plumbing (bind group layout, uniforms) needed to
  actually draw. Model the exact parameter shape after what `vegetationPreview.ts` already
  does at lines ~817-862 — this is an extraction, not a redesign; don't add speculative
  flexibility beyond "accept an existing buffer + its layout" that isn't needed yet.
- **Migrate `vegetationPreview.ts`** to call this new function instead of its own inline
  pipeline/buffer code — vegetation's instance buffer is still created and populated exactly
  as today (CPU-computed candidates, `writeBuffer`), just handed to the shared function rather
  than the pipeline being built inline. No behavior change.
- **Do not** expose this as a graph-authorable primitive (e.g. a `draw.instanced` node) yet —
  that's a later step, once the compute-dispatch and feedback pieces exist too, so instancing
  can be demonstrated with a genuinely graph-driven instance source, not just vegetation's
  CPU-computed one.

## Gate

1. New unit tests for `instancedMeshDraw.ts`'s non-GPU-dependent logic (parameter validation,
   layout handling) where testable without a device; existing GPU-dependent tests skip
   cleanly headless, per this package's established pattern.
2. `vegetationPreview.ts`'s existing tests stay green, unchanged in behavior.
3. `check` **and** `test` green for `runtime-webgpu` and the full workspace.
4. **Visual ⚠:** confirm the vegetation preview (impostor and full/cone modes) renders
   pixel-identical to before the extraction — this is a refactor, the bar is "no visible
   change," not a new feature demonstration.

## On the bundled-sample requirement

This brief does not add a new bundled sample graph. It's an internal refactor with no new
graph-authorable primitive and no change in observable behavior — the existing vegetation
preview already covers the visual gate above. A sample graph becomes required once a later
brief exposes this as something a user can actually wire in the editor (e.g. a `draw.instanced`
consumer node) — noted here explicitly so the omission is a deliberate call, not an oversight.

## Out of scope

Compute-driven instance-buffer population (particles' actual need — tracked as capability #2
and #3 above, separate briefs). Any change to `generateVegetationCandidates` or vegetation's
own candidate algorithm. Exposing instancing as a graph-authorable node (later, once all three
capabilities exist — the point of sequencing this work is to prove each piece independently
before the particle-system integration brief).

## Handoff

→ Instanced mesh rendering is a reusable, shared consumer instead of vegetation-only inline
code — the first of three extracted capabilities. Once the compute-dispatch sibling consumer
(capability #2) and the frame-graph resource-kind generalization (capability #3) also land, a
particle system becomes an integration exercise over three already-proven pieces, not a new
system built from scratch.
