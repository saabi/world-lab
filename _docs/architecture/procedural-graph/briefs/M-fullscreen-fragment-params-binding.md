# Brief — Fullscreen-fragment consumer must bind the GraphParams uniform

**Type:** 🔴 fix (consumer left behind when param-uniforms were added) · **Packages:**
`@virtual-planet/runtime-webgpu` (`consumers/fullscreenFragment.ts`) · **Depends on:**
`emitGraphEval` param support ✅, preview-effective-doc fix ✅ · **Design authority:**
[parameter-and-form-schema.md](../parameter-and-form-schema.md),
[pipeline-as-graph.md](../pipeline-as-graph.md) · **Contract author:** Opus · **Recommended
executor:** Cursor.

## Problem

A pipeline graph with a numeric-param node (e.g. `constant.f32`) in the fragment field fails
to device-compile:

```
error: unresolved value 'params'
  let v_n_constant_f32_1_value: f32 = constantF32(params.p_n_constant_f32_1_value);
```

`emitGraphEval.ts` lowers numeric node params into a **`GraphParams` uniform**:
`collectParamFields` builds `p_<nodeId>_<param>` fields, the `graph_eval_*` body references
`params.<field>` (line ~283), and `buildParamsStructWgsl` (line 397) emits the struct. Three
consumers already wire this up — `planeScalarPreview.ts`, `vegetationPreview.ts`,
`vegetationCandidates.ts` each call `buildParamsStructWgsl(emitted.params)`, declare
`@group(0) @binding(1) var<uniform> … : GraphParams`, pack a buffer (`packParams`/
`packGraphParams`), and bind it.

**`consumers/fullscreenFragment.ts` was never updated.** It calls `emitGraphVec4Eval(...)` (so
the body references `params.…`) but its assembled `code` (line ~126) omits the struct +
uniform declaration, and its bind group (line ~175) binds only the ShaderToy uniforms at
binding 0. So `params` is undeclared → invalid shader → the `CreateRenderPipeline` /
`Submit` cascade. (Headless string-compile didn't catch it; only a real device compile does —
which the effective-doc fix newly enabled.)

## Fix

In `consumers/fullscreenFragment.ts`, mirror the working consumers (reuse the **existing**
helpers — no new path):

1. From `emitGraphVec4Eval`, take `emitted.params` (the `GraphParamField[]`).
2. Include `buildParamsStructWgsl(emitted.params)` in the assembled `code`, plus the
   `var<uniform>` declaration at the next free slot (`@group(0) @binding(1)`), with the **same
   var name the emitted body references** (`params`) — match the emit, don't rename.
3. Pack the field default values (+ `width`/`height`) into a uniform buffer (reuse the
   `packParams`/`packGraphParams` helper pattern) and add `{ binding: 1, resource: { buffer }}`
   to the bind group; destroy it alongside the existing uniform buffer.
4. Empty `emitted.params` must still work (struct carries `width`/`height`) — keep parity with
   the scalar path; don't special-case it away unless the scalar path does.

## Gate

1. **Headless:** for a pipeline graph whose fragment field includes a `constant.f32` node, the
   assembled fullscreen-fragment `code` contains `struct GraphParams` and a `var<uniform>`
   declaration of it, and **no** `params.…` reference is left undeclared (assert the struct +
   binding are present). Test in `runtime-webgpu`.
2. **Device compile (where available):** extend `gpu/wgslCompile`-style coverage (or the
   consumer's own device test, guarded on a real adapter) so this graph compiles a valid
   shader module — the `unresolved value 'params'` error is gone.
3. `check` **and** `test` green for `runtime-webgpu`; keep all prior tests green.
4. **Visual ⚠:** the reported graph (`value2d`/`vec4f`/`constant.f32` → fragment → display)
   renders in the Effect preview with no console pipeline errors. Screenshot.

## Out of scope

The full **params-as-inputs** feature (promotable params wireable as ports; `M-params-as-inputs`)
— this fix only binds the uniform the codegen already emits. Non-numeric param kinds beyond
what `collectParamFields` already handles. Per-param live-update UI.

## Handoff

→ Every device-compiled consumer (scalar, GPU, vegetation, **and now image/fullscreen**)
binds `GraphParams` consistently, so a node with a numeric param renders in the Effect
preview. Removes a whole class of "compiles to a string but the GPU rejects it" failures for
the image path.
