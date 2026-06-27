# Agent Task Board — 2026-06-27

> **Protocol:** You are an AI coding agent. Read this entire file. Pick ONE unclaimed
> task from the board below that best fits your current context and capabilities.
> Claim it by editing this file: change the task's `Status` from `⬜ UNCLAIMED` to
> `🔵 CLAIMED — <your-agent-name>` and save. Then execute the task. When done,
> update status to `✅ DONE — <your-agent-name>` and record the commit hash.
>
> **Rules:**
> 1. Pick ONLY ONE task. Choose the one you're most capable of based on your context.
> 2. Edit ONLY THIS FILE to claim, then work ONLY on the files listed for your task.
> 3. Do NOT touch files owned by other tasks.
> 4. Run the gate commands listed for your task before marking done.
> 5. Commit your work with a descriptive message, then update this file with the hash.
> 6. All commands run from `fe/`. Set path first: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`
> 7. Use Svelte 5 runes syntax (`$state`, `$effect`, `$derived`). Event attrs: `onclick` not `on:click`.
>
> **Branch:** `water_separation`
> **Baseline:** All green — `svelte-check` 0 errors, build passes, 330/330 tests pass.

---

## Task Board

| # | Task | Package(s) | Wave | Status | Commit |
|---|------|-----------|------|--------|--------|
| 1 | `procedural.metricPosition` graph primitive | `graph` | 1 | ✅ DONE — Cursor | `814a8a1` |
| 2 | `emitGraphVec3Eval` + `positionExpr` codegen | `runtime-webgpu` | 2 (after 1+8) | ⬜ UNCLAIMED | — |
| 3 | Vegetation buffer layout + types | `runtime-webgpu` | 1 | 🔵 CLAIMED — Cursor | — |
| 4 | Vegetation compute consumer + parity | `runtime-webgpu` | 3 (after 2+3) | ⬜ UNCLAIMED | — |
| 5 | M9d.3 CodeMirror syntax highlighting | `graph-editor` + `subdivide` | 1 | ⬜ UNCLAIMED | — |
| 6 | STATUS ledger update + line-ending fix | docs + 1 WGSL | 1 | ⬜ UNCLAIMED | — |
| 7 | MCP server scaffold tools | `mcp-server` | 1 | ⬜ UNCLAIMED | — |
| 8 | Procedural-WGSL `metricPosition` module | `procedural-wgsl` | 1 | ✅ DONE — Cursor | `715b1f6` |

**Wave constraints:**
- Wave 1 tasks (1, 3, 5, 6, 7, 8) have zero dependencies — claim any of these freely.
- Wave 2 task (2) requires Tasks 1 + 8 to be `✅ DONE` first.
- Wave 3 task (4) requires Tasks 2 + 3 to be `✅ DONE` first.
- Do NOT claim a task whose wave dependencies are not yet DONE.

---

## Task 1 — `procedural.metricPosition` Graph Primitive

**Package:** `packages/graph/` only
**Difficulty:** Small
**Why this exists:** The M12.2 GPU vegetation consumer needs a `metricPosition` primitive to inject world-space position into field graphs (the same way `procedural.uv` injects UV coordinates). See `_docs/architecture/procedural-graph/briefs/M12.2-vegetation-gpu.md` §"Prerequisites".

### Files you own

| File | Action |
|------|--------|
| `packages/graph/src/primitives/metricPosition.ts` | CREATE |
| `packages/graph/src/primitives/index.ts` | EDIT — add one import line |
| Test file (new or extend existing) | CREATE/EDIT |

### Detailed instructions

1. **Read** `packages/graph/src/primitives/uv.ts` — your implementation follows the exact same pattern.

2. **Create `metricPosition.ts`:**
   ```ts
   // Register procedural.metricPosition — a vec3f position injected by the consumer.
   // Analogous to procedural.uv but for 3D metric-space position.
   import { Type } from '@virtual-planet/schema';
   import { registerPrimitive } from '../registry.js';

   registerPrimitive({
       id: 'procedural.metricPosition',
       category: 'procedural',
       params: Type.Object({}),
       inputs: [],
       outputs: [{ id: 'position', name: 'position', dataType: 'vec3f', direction: 'out' }],
       wgsl: { entry: 'metricPosition', arguments: [] },
       evalCPU: (_inputs, _params, ctx) => {
           // Consumer provides ctx.metricPosition as [x, y, z]
           const pos = (ctx as Record<string, unknown>).metricPosition;
           if (!pos || !Array.isArray(pos) || pos.length < 3) {
               return { position: [0, 0, 0] };
           }
           return { position: [...pos] };
       }
   });
   ```
   Adjust to match the actual `registerPrimitive` signature and `NodePrimitive` type from `packages/graph/src/primitive.ts`. Read that file first to see the real types.

3. **Edit `packages/graph/src/primitives/index.ts`** — add at the end:
   ```ts
   import './metricPosition.js';
   ```

4. **Add tests** — create a test or extend `packages/graph/src/primitives/surfaces.test.ts`. Verify:
   - `getPrimitive('procedural.metricPosition')` returns a non-null primitive
   - It has zero inputs and one output with `dataType: 'vec3f'` and `id: 'position'`
   - The primitive's category is `'procedural'`

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm run check -w @virtual-planet/graph
npm test -w @virtual-planet/graph
```

All existing tests pass + ≥1 new test passes.

---

## Task 2 — `emitGraphVec3Eval` + `positionExpr` Codegen

**Package:** `packages/runtime-webgpu/` (emitGraph files only)
**Difficulty:** Medium
**Wave:** 2 — requires Tasks 1 + 8 to be DONE first. **Check the board above before claiming.**
**Why this exists:** The vegetation compute shader needs to emit `evaluate_density(position) -> vec3<f32>` and `evaluate_placement(position) -> f32`. This requires a vec3-output codegen path and a way to inject position expressions.

### Files you own

| File | Action |
|------|--------|
| `packages/runtime-webgpu/src/emitGraphVec3Eval.ts` | CREATE |
| `packages/runtime-webgpu/src/emitGraphVec3Eval.test.ts` | CREATE |
| `packages/runtime-webgpu/src/emitGraphEval.ts` | EDIT — add `positionExpr` + `metricPosition` support |
| `packages/runtime-webgpu/src/emitGraphEval.test.ts` | EDIT — add tests |
| `packages/runtime-webgpu/src/index.ts` | EDIT — add re-export |

### Detailed instructions

1. **Read** `packages/runtime-webgpu/src/emitGraphEval.ts` thoroughly. The function `emitGraphScalarEval` emits WGSL variable declarations by walking the graph topologically. It currently hardcodes `procedural.uv` as `vec2<f32>(u, v)`.

2. **Edit `emitGraphEval.ts` — add `positionExpr` support:**

   Change the `emitGraphScalarEval` signature to accept an optional options object:
   ```ts
   export function emitGraphScalarEval(
       doc: GraphDocument,
       output: PortRef,
       opts?: { positionExpr?: string }
   ): EmittedGraphEval
   ```

   In the node-walking loop, add a case for `procedural.metricPosition` (similar to the existing `procedural.uv` case):
   ```ts
   if (node.primitive === 'procedural.metricPosition') {
       const posPort = node.outputs[0];
       if (!posPort) throw new Error('procedural.metricPosition missing output port');
       const expr = opts?.positionExpr ?? 'vec3<f32>(u, v, 0.0)';
       body.push(`let ${portVar(node.id, posPort.id)}: vec3<f32> = ${expr};`);
       continue;
   }
   ```

   This block goes right after the existing `procedural.uv` block (~line 185-192).

3. **Create `emitGraphVec3Eval.ts`:**
   - Export `emitGraphVec3Eval(doc, output, opts?)` — structurally identical to `emitGraphScalarEval` but:
     - Validates output port has `dataType: 'vec3f'` (not `'f32'`)
     - Error message says `emitGraphVec3Eval requires vec3f output`
   - Internally, you can factor out the shared walk logic or duplicate it. Duplication is acceptable for M12.2 scope.
   - Must support both `procedural.uv` and `procedural.metricPosition`

4. **Create `emitGraphVec3Eval.test.ts`:**
   - Build a test graph: `procedural.metricPosition` → some primitive that outputs vec3f → output
   - Verify `resultExpr` is set correctly
   - Verify `body` contains the position variable declaration
   - Verify `params` are collected for parameterized nodes
   - For a simpler test: single `procedural.metricPosition` node with a direct vec3f output

5. **Add test to `emitGraphEval.test.ts`:**
   - Test that `emitGraphScalarEval` with `{ positionExpr: 'my_pos' }` uses that expression for `procedural.metricPosition` nodes

6. **Update `index.ts`** — add: `export { emitGraphVec3Eval } from './emitGraphVec3Eval.js';`

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm run check -w @virtual-planet/runtime-webgpu
npm test -w @virtual-planet/runtime-webgpu
```

All existing tests pass + ≥3 new tests pass.

---

## Task 3 — Vegetation Buffer Layout + Types

**Package:** `packages/runtime-webgpu/` (vegetationType/Buffer files only — NOT consumers/ or emitGraph*)
**Difficulty:** Medium
**Why this exists:** The GPU vegetation compute shader writes 64-byte candidate records to a storage buffer. We need TypeScript types mirroring the CPU types (without importing them at runtime) and encode/decode helpers.

### Files you own

| File | Action |
|------|--------|
| `packages/runtime-webgpu/src/vegetationTypes.ts` | CREATE |
| `packages/runtime-webgpu/src/vegetationBuffer.ts` | CREATE |
| `packages/runtime-webgpu/src/vegetationBuffer.test.ts` | CREATE |
| `packages/runtime-webgpu/src/types.ts` | EDIT — extend `ConsumerKind` |

### Detailed instructions

1. **Read** `_docs/architecture/procedural-graph/briefs/M12.2-vegetation-gpu.md` — sections "Types", "Candidate storage-buffer layout", "Capacity and overflow behavior", and "ConsumerKind extension".

2. **Read** `packages/runtime-cpu/src/vegetation.ts` (lines 1-50) — your GPU types must mirror these field names and validation semantics. Do NOT import from `runtime-cpu` at runtime.

3. **Create `vegetationTypes.ts`:**
   - Duplicate all relevant types from `runtime-cpu/vegetation.ts`:
     - `Density3`, `VegetationChannel`, `VegetationPatch`, `VegetationCandidateConfig`
   - Add GPU-specific types from the M12.2 brief:
     - `VegetationCandidateGpuRecord` (ix, iy, channel, position, localMeters, density, placement, prominence, vigor)
     - `VegetationGraphBinding` (graph: GraphDocument, output: PortRef)
     - `VegetationCandidateComputeInput` (device, patch, config, density binding, placement binding, maxCandidates)
     - `VegetationCandidateComputeResult` (patchId, gridWidth, gridHeight, candidateCount, overflowed, candidates array)
   - Export `computeVegetationGridSize(patch, spacingMeters)` — same loop bounds as M12.1:
     ```ts
     // ix = 0, 1, … while (ix + 0.5) * spacing < widthMeters
     export function computeVegetationGridSize(
         patch: VegetationPatch, spacingMeters: number
     ): { gridWidth: number; gridHeight: number } {
         let gw = 0;
         while ((gw + 0.5) * spacingMeters < patch.widthMeters) gw++;
         let gh = 0;
         while ((gh + 0.5) * spacingMeters < patch.heightMeters) gh++;
         return { gridWidth: gw, gridHeight: gh };
     }
     ```
   - Import `GraphDocument` and `PortRef` from `@virtual-planet/graph`

4. **Create `vegetationBuffer.ts`:**
   ```ts
   import { alignTo } from './buffers.js';
   import type { VegetationCandidateGpuRecord, VegetationChannel, Density3 } from './vegetationTypes.js';

   export const VEGETATION_CANDIDATE_STRIDE = 64; // bytes per GPU record

   export function vegetationCandidateBufferByteLength(maxCandidates: number): number {
       return alignTo(maxCandidates * VEGETATION_CANDIDATE_STRIDE, 4);
   }

   export function decodeVegetationCandidates(
       data: ArrayBuffer, count: number
   ): VegetationCandidateGpuRecord[] {
       const view = new DataView(data);
       const results: VegetationCandidateGpuRecord[] = [];
       for (let i = 0; i < count; i++) {
           const base = i * VEGETATION_CANDIDATE_STRIDE;
           results.push({
               ix: view.getUint32(base + 0, true),
               iy: view.getUint32(base + 4, true),
               channel: view.getUint32(base + 8, true) as VegetationChannel,
               // offset 12 = padding
               position: [
                   view.getFloat32(base + 16, true),
                   view.getFloat32(base + 20, true),
                   view.getFloat32(base + 24, true),
               ],
               // offset 28 = padding
               localMeters: [
                   view.getFloat32(base + 32, true),
                   view.getFloat32(base + 36, true),
               ],
               density: [
                   view.getFloat32(base + 40, true),
                   view.getFloat32(base + 44, true),
                   view.getFloat32(base + 48, true),
               ] as unknown as Density3,
               placement: view.getFloat32(base + 52, true),
               prominence: view.getFloat32(base + 56, true),
               vigor: view.getFloat32(base + 60, true),
           });
       }
       return results;
   }
   ```
   Check if `alignTo` exists in `./buffers.ts`. If not, implement it inline: `(n: number, align: number) => Math.ceil(n / align) * align`.

   Also export an `encodeVegetationCandidate` helper for tests:
   ```ts
   export function encodeVegetationCandidate(
       record: VegetationCandidateGpuRecord, view: DataView, offset: number
   ): void { /* write fields at their offsets */ }
   ```

5. **Create `vegetationBuffer.test.ts`** (headless, no GPU needed):
   - Test: `VEGETATION_CANDIDATE_STRIDE === 64`
   - Test: `vegetationCandidateBufferByteLength(10)` is a multiple of 4 and ≥ 640
   - Test: `vegetationCandidateBufferByteLength(0) === 0`
   - Test: round-trip — encode a synthetic record, decode it, verify all fields match
   - Test: `computeVegetationGridSize` — a 3×3m patch with 1m spacing → `{ gridWidth: 3, gridHeight: 3 }`

6. **Edit `types.ts`** — add `'vegetation-candidates'` to the `ConsumerKind` union type.

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm run check -w @virtual-planet/runtime-webgpu
npm test -w @virtual-planet/runtime-webgpu
```

All existing tests pass + ≥5 new tests pass.

---

## Task 4 — Vegetation Compute Consumer + CPU/GPU Parity

**Package:** `packages/runtime-webgpu/` (consumers/ + fixtures/ + index + package.json)
**Difficulty:** Large
**Wave:** 3 — requires Tasks 2 + 3 to be DONE first. **Check the board above before claiming.**
**Why this exists:** This is the core M12.2 deliverable — a WebGPU compute shader that produces vegetation candidates with exact parity to the M12.1 CPU algorithm.

### Files you own

| File | Action |
|------|--------|
| `packages/runtime-webgpu/src/consumers/vegetationCandidates.ts` | CREATE |
| `packages/runtime-webgpu/src/consumers/vegetationCandidates.test.ts` | CREATE |
| `packages/runtime-webgpu/src/fixtures/vegetationParity.ts` | CREATE |
| `packages/runtime-webgpu/src/index.ts` | EDIT — add re-exports |
| `packages/runtime-webgpu/package.json` | EDIT — add runtime-cpu devDep |

### Detailed instructions

1. **Read the FULL brief:** `_docs/architecture/procedural-graph/briefs/M12.2-vegetation-gpu.md` — every section. This is a complex GPU compute task.

2. **Read the CPU reference:** `packages/runtime-cpu/src/vegetation.ts` (full file) and `packages/runtime-cpu/src/vegetation.test.ts` — understand the peak algorithm, the `twoPeakSamplers` test fixture, and the expected outputs.

3. **Read the existing consumer pattern:** `packages/runtime-webgpu/src/consumers/planeScalarPreview.ts` — your consumer follows this structure (device setup, pipeline creation, buffer management, dispatch, readback).

4. **Create `fixtures/vegetationParity.ts`:**
   - Create the `fixtures/` directory if needed
   - Export `PARITY_PATCH`: `{ id: 'test-patch', origin: [0,0,0], tangentX: [1,0,0], tangentY: [0,1,0], widthMeters: 3, heightMeters: 3 }`
   - Export `PARITY_CONFIG`: `{ spacingMeters: 1, channel: 0, placementThreshold: 0.5, densityThreshold: 0.1, minProminence: 0.05 }`
   - Export `PARITY_DENSITY_GRAPH`: a `GraphDocument` with `procedural.metricPosition` → a stub node that outputs constant `[0.8, 0.2, 0.1]` as vec3f. You'll need to register a test primitive or use existing primitives. The simplest approach: create a test-only WGSL module `test.vegetationParityDensity` whose `fn` just returns a constant vec3.
   - Export `PARITY_PLACEMENT_GRAPH`: `procedural.metricPosition` → a test primitive implementing the two-peak placement (peaks at `(0.5,0.5)` strength 1 and `(2.5,1.5)` strength 0.9, else 0). Study `packages/runtime-cpu/src/vegetation.test.ts`'s `twoPeakSamplers` for exact values.
   - Export `parityResolver()`: `createStandardLibraryResolver()` augmented with the two test WGSL sources.
   - Export `cpuSamplersFromParityModules()` for the CPU-side comparison.

5. **Create `consumers/vegetationCandidates.ts`:**

   **Validation (before any GPU work):**
   - Validate `patch.widthMeters > 0`, `patch.heightMeters > 0`, `config.spacingMeters > 0`
   - Validate `config.channel` is 0, 1, or 2
   - Validate `config.placementThreshold`, `config.densityThreshold`, `config.minProminence` are finite non-negative
   - Throw `RangeError` with descriptive messages on failure

   **Shader composition:**
   - Slice both density and placement graphs for their respective outputs
   - Use `generateWgsl` + `createStandardLibraryResolver()` (or the provided resolver) for both
   - Use `emitGraphVec3Eval` for density (with `positionExpr: 'position'`)
   - Use `emitGraphScalarEval` for placement (with `positionExpr: 'position'`)
   - Compose WGSL: uniform structs (`VegetationPatchParams` + `GraphParams`), merged module functions, `evaluate_density` and `evaluate_placement` wrapper fns, and the main compute kernel

   **Compute kernel WGSL structure:**
   ```wgsl
   @group(0) @binding(0) var<uniform> patch_params: VegetationPatchParams;
   @group(0) @binding(1) var<uniform> graph_params: GraphParams;
   @group(0) @binding(2) var<storage, read_write> meta: VegetationResultMeta;
   @group(0) @binding(3) var<storage, read_write> candidates: array<VegetationCandidateGpu>;

   @compute @workgroup_size(8, 8, 1)
   fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
       let ix = gid.x; let iy = gid.y;
       if (ix >= patch_params.grid_width || iy >= patch_params.grid_height) { return; }
       // Position calculation, peak detection, candidate emission...
   }
   ```

   **Peak algorithm must match M12.1 exactly:**
   1. Position from grid: `(ix + 0.5) * spacing` on tangent axes
   2. Sample placement at center and 4 neighbors (±spacing on each axis)
   3. Center **strictly greater** than all 4 neighbors
   4. `prominence = center - max(neighbors)` ≥ `min_prominence`
   5. `center >= placement_threshold`
   6. Sample density; `density[channel] >= density_threshold`
   7. `vigor = center * density[channel]` (clamped 0-1)
   8. Atomic append to candidates buffer; set `overflowed` if at capacity

   **Buffer readback:**
   - Map meta buffer → read `candidate_count` and `overflowed`
   - Map candidates buffer → `decodeVegetationCandidates(data, count)`

6. **Create `consumers/vegetationCandidates.test.ts`:**

   ```ts
   const hasWebGPU =
       typeof globalThis.navigator !== 'undefined' &&
       'gpu' in globalThis.navigator &&
       globalThis.navigator.gpu !== undefined;
   ```

   Tests:
   - `it.skipIf(!hasWebGPU)('GPU parity with CPU two-peak fixture')` — run both CPU and GPU on PARITY fixtures, assert same candidate count (2), same positions/density/vigor (exact f32 equality)
   - `it.skipIf(!hasWebGPU)('plateau placement produces zero candidates')` — constant placement=1 everywhere → no peaks → 0 candidates
   - `it('throws RangeError for invalid patch')` — headless, no GPU
   - `it('throws RangeError for invalid config')` — headless, no GPU
   - `it('reports overflow when maxCandidates=1')` — can be headless: validate input + assert logic, or skipIf GPU

7. **Update `package.json`** — add `"@virtual-planet/runtime-cpu": "workspace:*"` to `devDependencies`

8. **Update `index.ts`** — add re-exports:
   ```ts
   export { executeVegetationCandidateCompute } from './consumers/vegetationCandidates.js';
   export type { VegetationPatch, VegetationCandidateConfig, /* etc */ } from './vegetationTypes.js';
   ```

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm run check -w @virtual-planet/runtime-webgpu
npm test -w @virtual-planet/runtime-webgpu
npm run check
npm test
```

All existing tests pass + ≥6 new headless tests + ≥2 GPU-conditional tests (skipped without WebGPU is OK).

---

## Task 5 — M9d.3 CodeMirror Syntax Highlighting

**Package:** `packages/graph-editor/` (primary) + `packages/subdivide/` (one-line edit)
**Difficulty:** Large
**Why this exists:** Replace plain `<textarea>` editors in the graph editor with CodeMirror 6 for syntax-colored WGSL and PlanetGraph markup editing.

### Files you own

| File | Action |
|------|--------|
| `packages/graph-editor/package.json` | EDIT — add CodeMirror deps |
| `packages/graph-editor/src/codemirror/index.ts` | CREATE |
| `packages/graph-editor/src/codemirror/theme.ts` | CREATE |
| `packages/graph-editor/src/codemirror/planetMarkupLanguage.ts` | CREATE |
| `packages/graph-editor/src/codemirror/wgslStreamLanguage.ts` | CREATE |
| `packages/graph-editor/src/codemirror/primitiveSourceLanguage.ts` | CREATE |
| `packages/graph-editor/src/codemirror/wgslStreamLanguage.test.ts` | CREATE |
| `packages/graph-editor/src/codemirror/primitiveSourceLanguage.test.ts` | CREATE |
| `packages/graph-editor/src/codemirror/theme.test.ts` | CREATE |
| `packages/graph-editor/src/CodeMirrorEditor.svelte` | CREATE |
| `packages/graph-editor/src/CodeView.svelte` | EDIT |
| `packages/graph-editor/src/MarkupView.svelte` | EDIT |
| `packages/subdivide/src/Pane.svelte` | EDIT — one-line guard |

### Detailed instructions

1. **Read the FULL contract:** `_docs/architecture/procedural-graph/briefs/M9d3-code-highlighting.md` — this is the complete spec with exact colors, CSS, lifecycle patterns, and test requirements.

2. **Add CodeMirror deps** to `packages/graph-editor/package.json` `dependencies`:
   ```json
   "@codemirror/view": "^6",
   "@codemirror/state": "^6",
   "@codemirror/language": "^6",
   "@codemirror/commands": "^6",
   "@codemirror/lang-xml": "^6",
   "@lezer/highlight": "^1"
   ```
   Then run `npm install` from `fe/`.

3. **Create `codemirror/theme.ts`:**
   - `graphEditorTheme: Extension` — dark theme: bg `#0d1018`, text `#dbe4ff`, caret `#dbe4ff`, selection `rgba(93, 140, 255, 0.25)`, gutter hidden
   - `graphEditorHighlightStyle: HighlightStyle` — keywords `#7aa2ff`, strings `#9ece6a`, comments `#565f89`, numbers `#ff9e64`, types `#2ac3de`, tags `#bb9af7`, attributes `#7dcfff`

4. **Create `codemirror/wgslStreamLanguage.ts`:**
   - Minimal `StreamLanguage` for visual-only WGSL highlighting
   - Token classes: keywords (`fn`, `var`, `let`, `const`, `struct`, `return`, `if`, `else`, `for`, `while`, `loop`, `switch`, `case`, `break`, `continue`, `true`, `false`), types (`f32`, `i32`, `u32`, `bool`, `vec2`, `vec3`, `vec4`, `mat2x2`-`mat4x4`, `texture_2d`, `sampler`), attributes (`@`-prefixed), comments (`//`, `/* */`), numbers
   - NOT a spec-accurate WGSL lexer — approximate is fine

5. **Create `codemirror/primitiveSourceLanguage.ts`:**
   - Handle composite format: `/*---` YAML frontmatter `---*/` then WGSL body
   - Export `splitPrimitiveSource(text): { frontmatter: string; body: string }`
   - Highlight YAML keys in frontmatter region, delegate body to `wgslStreamLanguage`

6. **Create `codemirror/planetMarkupLanguage.ts`:** — wraps `@codemirror/lang-xml`

7. **Create `CodeMirrorEditor.svelte`:**
   - Use the EXACT lifecycle pattern from the brief (§"Svelte lifecycle"):
     - `$state` for `view` and `hostEl`
     - `onMount` creates `EditorView`, `onDestroy` destroys it
     - `$effect` for inbound value sync with `syncing` flag
     - `updateListener` for outbound changes
   - CSS: `.cm-host` with `min-height: 0`, `overflow: hidden`, border, border-radius
   - Use `spellcheck={false}` via EditorView content attributes

8. **Update `CodeView.svelte`** — replace `<textarea class="editor">` with `<CodeMirrorEditor>`. Keep header, Save, dirty tracking unchanged.

9. **Update `MarkupView.svelte`** — replace `<textarea class="code">` with `<CodeMirrorEditor>`. Keep debounced parse, editing flag unchanged.

10. **Update `packages/subdivide/src/Pane.svelte`** — find `isEditableTarget` function, add `.cm-editor` and `.cm-content` to its element check so right-click inside CodeMirror doesn't open the pane zone menu.

11. **Tests (headless):**
    - `primitiveSourceLanguage.test.ts`: `splitPrimitiveSource` correctly splits a sample primitive source
    - `wgslStreamLanguage.test.ts`: highlight assigns keyword/type tags to `fn` and `vec3<f32>`
    - `theme.test.ts`: exports don't throw

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm install
npm run check -w @virtual-planet/graph-editor
npm test -w @virtual-planet/graph-editor   # sceneFree.test.ts must still pass!
npm run check -w @virtual-planet/subdivide
npm test -w @virtual-planet/subdivide
npm run check
npm run build
```

All existing tests pass + ≥3 new tests. `sceneFree.test.ts` must remain green.

---

## Task 6 — STATUS Ledger Update + Line-Ending Fix

**Scope:** Docs only + one WGSL file restore
**Difficulty:** Tiny (5 minutes)
**Why this exists:** The STATUS ledger still says "pin the M12.2 contract" but it's already pinned. Also there's a cosmetic line-ending diff on one WGSL file.

### Files you own

| File | Action |
|------|--------|
| `_docs/architecture/procedural-graph/STATUS.md` | EDIT |
| `fe/src/lib/planet/gpu/wgsl/debug/materialDebug.wgsl` | RESTORE (git checkout) |

### Detailed instructions

1. **Edit `STATUS.md`:**

   **In the progress ledger table** (after the M12.1 row), add two new rows:
   ```
   | M12.2 contract — GPU vegetation candidate compute | 📌 pinned | contract reviewed | `2055094` |
   | M9d.3 contract — syntax highlighting | 📌 pinned | optional parallel | `d66e045` |
   ```

   **In "Current front"** section, replace:
   ```
   - **Active:** pin the **M12.2 GPU vegetation candidate compute** contract per the
     handoff in [briefs/M12-vegetation.md](./briefs/M12-vegetation.md).
   ```
   With:
   ```
   - **Active:** implement **M12.2 GPU vegetation candidate compute** per the
     pinned contract at [briefs/M12.2-vegetation-gpu.md](./briefs/M12.2-vegetation-gpu.md).
     Contract pinned at commit `2055094`.
   - **Parallel (optional):** implement **M9d.3 syntax highlighting** per the pinned
     contract at [briefs/M9d3-code-highlighting.md](./briefs/M9d3-code-highlighting.md).
   ```

2. **Restore `materialDebug.wgsl`:**
   ```bash
   git checkout -- fe/src/lib/planet/gpu/wgsl/debug/materialDebug.wgsl
   ```
   The working-tree diff was purely line-ending normalization (LF→CRLF) with no functional changes.

3. **Commit:**
   ```bash
   git add _docs/architecture/procedural-graph/STATUS.md
   git commit -m "Update STATUS ledger for M12.2/M9d.3 contracts and clean working tree"
   ```

### Gate

```bash
git diff --stat  # should show 0 files (clean working tree after commit)
```

---

## Task 7 — MCP Server Scaffold Tools

**Package:** `packages/mcp-server/` only
**Difficulty:** Small
**Why this exists:** The MCP server (M15) will provide AI/agent access to Graph IR. We're scaffolding basic read-only tool functions now to make the package useful and establish the API surface.

### Files you own

| File | Action |
|------|--------|
| `packages/mcp-server/src/index.ts` | EDIT |
| `packages/mcp-server/src/index.test.ts` | EDIT |
| `packages/mcp-server/package.json` | EDIT — add dependencies |

### Detailed instructions

1. **Read** `packages/mcp-server/src/index.ts` and `packages/mcp-server/src/index.test.ts` to see current stubs.

2. **Read** `packages/graph/src/registry.ts` — understand `getPrimitive`, `getRegisteredIds` or equivalent API.

3. **Read** `packages/graph/src/validate.ts` — understand `validateGraph`.

4. **Edit `package.json`** — add dependencies:
   ```json
   "dependencies": {
       "@virtual-planet/graph": "workspace:*",
       "@virtual-planet/schema": "workspace:*"
   }
   ```

5. **Edit `index.ts`** — implement and export:

   ```ts
   // Ensure all primitives are registered
   import '@virtual-planet/graph/primitives';
   import { getPrimitive, type GraphDocument } from '@virtual-planet/graph';
   import { validateGraph } from '@virtual-planet/graph';

   export interface PrimitiveInfo {
       id: string;
       category: string;
       inputs: string[];
       outputs: string[];
   }

   export interface ValidationResult {
       valid: boolean;
       errors: string[];
   }

   export interface PortInfo {
       id: string;
       name: string;
       dataType: string;
   }

   export interface NodeDescription {
       id: string;
       category: string;
       params: Record<string, unknown>;
       inputs: PortInfo[];
       outputs: PortInfo[];
       wgslEntry: string;
   }

   export function listPrimitives(): PrimitiveInfo[] { /* ... */ }
   export function validateGraphDocument(doc: GraphDocument): ValidationResult { /* ... */ }
   export function describeNode(primitiveId: string): NodeDescription | null { /* ... */ }
   ```

   Adapt the imports to match the actual API from `@virtual-planet/graph`. You'll need to explore `packages/graph/src/index.ts` to see what's exported. The registry might expose `getAllPrimitives()` or you might need to iterate known IDs.

6. **Edit `index.test.ts`:**
   - Test: `listPrimitives()` returns array with ≥15 entries
   - Test: each entry has non-empty `id` and `category`
   - Test: `describeNode('procedural.uv')` returns object with correct output port
   - Test: `describeNode('nonexistent.thing')` returns `null`
   - Test: `validateGraphDocument` with a valid simple graph returns `{ valid: true, errors: [] }`

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm install
npm run check -w @virtual-planet/mcp-server
npm test -w @virtual-planet/mcp-server
```

All tests pass (≥4 new tests).

---

## Task 8 — Procedural-WGSL `metricPosition` Module

**Package:** `packages/procedural-wgsl/` only
**Difficulty:** Small
**Why this exists:** The standard library module resolver needs to be able to resolve `procedural.metricPosition` so that WGSL codegen can find and link it. This is a stub — consumers override the function body at shader composition time.

### Files you own

| File | Action |
|------|--------|
| `packages/procedural-wgsl/src/modules/procedural/metricPosition.ts` | CREATE |
| `packages/procedural-wgsl/src/modules/index.ts` | EDIT — register module |
| `packages/procedural-wgsl/src/index.test.ts` | EDIT — add test |

### Detailed instructions

1. **Read** `packages/procedural-wgsl/src/modules/procedural/uv.ts` — your file follows the exact same pattern.

2. **Read** `packages/procedural-wgsl/src/modules/index.ts` — see how modules are registered with their IDs and entries.

3. **Create `modules/procedural/metricPosition.ts`:**
   - Export a WGSL source string (the pattern varies — check `uv.ts` for the exact export shape)
   - WGSL content:
     ```wgsl
     // metricPosition is a consumer-injected stub.
     // Consumers (e.g., vegetation compute) override this function body
     // with their own world-space position calculation.
     fn metricPosition() -> vec3<f32> {
         return vec3<f32>(0.0, 0.0, 0.0);
     }
     ```

4. **Edit `modules/index.ts`:**
   - Import your module
   - Register it with id `procedural.metricPosition` and entry `metricPosition`
   - Follow the exact pattern used for `procedural.uv` and other modules

5. **Edit `index.test.ts`:**
   - Add test: `createStandardLibraryResolver()` successfully resolves module for `procedural.metricPosition`
   - Add test: the resolved source string contains `fn metricPosition`

### Gate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm run check -w @virtual-planet/procedural-wgsl
npm test -w @virtual-planet/procedural-wgsl
```

All existing tests pass + ≥1 new test passes.

---

## After All Tasks Complete

Once all 8 tasks show `✅ DONE` on the board above, the orchestrator (user or lead agent) should:

1. Run the full gate:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
   cd fe
   npm run check
   npm run build
   npm test
   ```
2. Update `_docs/architecture/procedural-graph/STATUS.md` with M12.2 completion
3. Delete this file: `git rm _TASK_BOARD.md`
4. Merge to `main` or continue to M12.3
