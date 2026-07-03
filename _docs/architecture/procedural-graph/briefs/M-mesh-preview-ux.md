# Brief — mesh preview UX: wireframe toggle + orbit camera

**Type:** UI polish · **Package:** `@world-lab/graph-editor` (`MeshPreviewPanel.svelte`),
`@world-lab/runtime-webgpu` (`consumers/surfaceMeshPreview.ts`) · **Depends on:**
`M-mesh-gen-gpu-output-fix.md` (**sequenced, not parallel** — that task is actively touching
`surfaceMeshPreview.ts` right now; do not start this until it lands and its changes are
reviewed) · **Contract author:** Opus · **Recommended executor:** Cursor · **Status:** ready
to route, queued

## Problem

Two related, currently-`pending_issues.md`-tracked gaps in the mesh preview pane, both
touching the same two files (bundled into one brief to avoid a second, overlapping
file-ownership split on the task board):

1. **No wireframe display mode.** `MeshPreviewPanel`/`surfaceMeshPreview.ts` renders solid
   `triangle-list` geometry with a simple Lambert fragment shader only (confirmed —
   `createRenderPipeline`'s `primitive: { topology: 'triangle-list', cullMode: 'back' }`,
   `surfaceMeshPreview.ts` line ~191) — no way to inspect edge topology or see displacement
   structure as lines.
2. **No orbit camera, despite the naming.** `viewProjection(aspect)` hard-codes a fixed
   `lookAt([2.2, 1.6, 2.2], [0, 0, 0], [0, 1, 0])` (line ~140-144) and the surrounding function
   is even named `renderSurfaceMeshPreview` / the module doc-comment says "orbit camera" — but
   there's no pointer input at all, and `MeshPreviewPanel.svelte` has no camera-control state
   or event handlers. The camera is entirely static today.

## Fix

### 1. Wireframe toggle

- Add a toggle in `MeshPreviewPanel.svelte` (solid ↔ wireframe), sharing the same mesh buffers
  and camera as the solid path — not a separate graph output or a second `MeshGenRequest`
  evaluation.
- **Investigate before implementing which mechanism is actually usable**, don't assume:
  `GPUPrimitiveState.polygonMode: 'line'` is the most direct option but isn't universally
  supported across WebGPU implementations/adapters (verify against `requestGpuDevice`'s
  actual adapter/feature-flag surface in this codebase before relying on it). If unsupported,
  fall back to a dedicated line-list edge pass (derive a line-list index buffer from the
  existing triangle indices — each triangle contributes 3 edges, dedupe shared edges between
  adjacent triangles) rendered as a second draw call over the same vertex buffer. Either way,
  keep it behind one clean toggle in the panel, not two different code paths the user has to
  reason about.

### 2. Orbit camera

- Implement drag-to-orbit (yaw/pitch around the origin) and scroll/pinch-to-dolly on the
  preview `<canvas>`, owned by `MeshPreviewPanel.svelte` (or a small extracted helper, e.g.
  `orbitCamera.ts`, if the state/math is substantial enough to warrant its own module —
  judgment call for the executor).
- Camera state (yaw/pitch/distance) lives in the **panel**, not the graph — this is
  editor/viewport chrome, independent of `target.mesh`/procedural outputs, matching how camera
  state is already scoped in every other preview panel in this codebase.
- Feed an updated `viewProj` uniform each frame (or on interaction, whichever avoids
  unnecessary redraws) while the graph still only supplies position/normal fields — no change
  to `MeshGenRequest`, `evaluateMeshGenCpu`, or `executeMeshGen`.
- Keep the existing default view (`lookAt([2.2, 1.6, 2.2], [0, 0, 0], [0, 1, 0])`) as the
  initial camera state so nothing changes visually until the user actually interacts.

## Gate

1. `packages/graph-editor`/`packages/runtime-webgpu`: existing tests stay green; new tests for
   whichever wireframe mechanism is chosen (line-list index derivation, if that path is taken,
   gets a unit test against a known triangle-index input); orbit-camera math (yaw/pitch/dolly
   → view matrix) gets a unit test independent of any GPU device.
2. `check` **and** `test` green for both packages and the full workspace.
3. **Visual ⚠:** toggle wireframe on a mesh with visible displacement (e.g. the bundled
   "Mesh — Displaced cube-sphere" sample) and confirm edges are visible and match the solid
   mesh's silhouette; drag to orbit and scroll to dolly, confirming the camera actually moves
   and the mesh stays correctly lit/oriented.

## Out of scope

Any change to how meshes are generated (`MeshGenRequest`/`evaluateMeshGenCpu`/
`executeMeshGen`) — this brief is presentation-only. Camera state persistence across preview-
pane reloads (a nice-to-have, not required). Wireframe/orbit controls for any other preview
panel type (image/effect/audio) — mesh preview only.

## Handoff

→ The mesh preview pane actually lives up to its own "orbit camera" naming and gains a
wireframe mode for inspecting topology/displacement structure — pure UX polish, no engine
changes.
