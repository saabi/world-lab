# Brief — M10: runtime-webgpu (phased)

**Milestone:** M10 ([implementation-plan.md](../implementation-plan.md)) ·
**Packages:** `@virtual-planet/runtime-webgpu`, `@virtual-planet/graph-editor` (preview pane) ·
**Depends on:** M9b ✅ ·
**Design authority:** [runtime-and-tessellation.md](../runtime-and-tessellation.md),
[inputs-cpu-and-resources.md](../inputs-cpu-and-resources.md) ·
**Contract author:** Opus · **Recommended executor:** Sonnet (GPU + editor wiring).

## Objective

Execute compiled graphs on the GPU via a **consumer abstraction**. First proof:
the same graph that CPU-previews on a plane in `/graph-editor` runs on WebGPU
with no graph changes — then extend to mesh-generation compute (vertex/index).

Delivered in **three serial sub-phases** (M10.1 → M10.3). Do not start N+1 until N is green.

```
GraphDocument → slice + generateWgsl → runtime-webgpu consumer → GPU output
```

**Out of scope:** tessellation scheduling/LOD (M11), vegetation (M12), resource GPU
binds (M10 may stub `ResourceDependency`), MCP (M14).

---

## M10.1 — Device, buffers, consumer types

### Objective

Framework-agnostic WebGPU helpers and the consumer contract. Headless-testable
buffer layout math; browser-only device request is optional at call sites.

### Files

- `packages/runtime-webgpu/src/types.ts` — `ConsumerKind`, `ConsumerExecuteInput`, `ConsumerResult` *(new)*
- `packages/runtime-webgpu/src/buffers.ts` — `alignTo`, `createStorageBuffer`, `writeBuffer` helpers *(new)*
- `packages/runtime-webgpu/src/buffers.test.ts` — alignment gate *(new)*
- `packages/runtime-webgpu/src/device.ts` — `requestGpuDevice()` *(new; browser)*
- `packages/runtime-webgpu/src/index.ts` — re-exports *(update)*

### Public surface

```ts
export type ConsumerKind = 'plane-scalar-preview' | 'plane-mesh';

export interface ConsumerExecuteInput {
	device: GPUDevice;
	graph: GraphDocument;
	output: PortRef;
	width: number;
	height: number;
}

export interface ScalarFieldResult {
	width: number;
	height: number;
	/** RGBA8 normalized scalars, row-major */
	pixels: Uint8Array;
}

export function alignTo(size: number, alignment: number): number;
```

### Gate

1. `alignTo` and buffer size helpers pass vitest without a GPU.
2. `npm run check -w @virtual-planet/runtime-webgpu` green.

---

## M10.2 — Plane scalar GPU preview consumer

### Objective

Compute shader (or render pass) evaluates the sliced graph's scalar output over a
UV grid on the GPU. Parity target: same default preview graph as `CpuPreviewPanel`.

Uses `@virtual-planet/compiler` `sliceGraph` + `generateWgsl` with an in-memory
module resolver (stubs for now where procedural-wgsl is incomplete).

### Files

- `packages/runtime-webgpu/src/consumers/planeScalarPreview.ts` — `executePlaneScalarPreview` *(new)*
- `packages/runtime-webgpu/src/consumers/planeScalarPreview.test.ts` — gate when WebGPU available; skip otherwise *(new)*
- `packages/runtime-webgpu/src/moduleResolver.ts` — minimal in-memory WGSL resolver *(new)*

### Gate

1. With WebGPU device: `executePlaneScalarPreview` returns `width×height` RGBA8 buffer.
2. Without WebGPU: tests skip cleanly (same pattern as `wgslCompile.test.ts`).

---

## M10.3 — Editor GPU preview pane

### Objective

Add `GpuPreviewPanel.svelte` beside CPU preview; toggle or tab between CPU/GPU.
Manual gate: default graph heatmap visible via GPU path in `/graph-editor`.

### Files

- `packages/graph-editor/src/GpuPreviewPanel.svelte` *(new)*
- `packages/graph-editor/src/GraphEditor.svelte` — preview zone split or toggle *(update)*
- `packages/graph-editor/package.json` — depend on `@virtual-planet/runtime-webgpu` *(update)*

### Gate

1. `npm run check` (fe) green.
2. Manual: `/graph-editor` → GPU preview shows noise→remap field.

---

## M10+ (follow-on, not blocking M10 gate)

- Mesh-generation compute consumer (`plane-mesh`) → vertex/index buffers
- Resource GPU binds for `ResourceDependency.id`

---

## Handoff

→ **M11 — Tessellation primitives** · plane/cube-face/cube-sphere mapping primitives;
scheduler consumes CPU frustum · after M10.3 green.

---

## Executor assignment

| Phase | Executor | Notes |
|-------|----------|-------|
| M10.1 | Sonnet | Types + buffer math |
| M10.2 | Sonnet | WGSL + compute; needs GPU for full gate |
| M10.3 | Composer | Svelte panel + manual smoke |

Implement **serialized**: M10.1 → M10.2 → M10.3.
