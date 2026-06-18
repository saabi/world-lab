# Flat patch upload — packed buckets through `RenderFrame` to the GPU

**Status:** proposal · **Scope:** `render/RenderBackend.ts`, `render/passes/terrainPass.ts`,
`render/WebGLBackend.ts`, `params/gpuBuffers.ts`, `patches/flatBudget.ts`,
`patches/cubeSphere.ts` (all owned here) · **one ~3-line change in
`components/PlanetViewport.svelte`** (spaceflight-agent owned — the only
coordination point). · **Driver:** finish the flat-buffer readback — today the
schedule still materializes `CubeSpherePatch` objects and a `Map`, and
`terrainPass` re-walks them through `encodeCubeSpherePatches` to pack 32-byte GPU
records. Both copies are per-frame garbage.

## Where we are (after the flat-budget commit)

```
WASM walk ─► flat f64 candidate buffer (7 f64/patch)
          ─► budgetAndGroupFlat ─► CubeSpherePatch[] survivors + Map<res, []>   ← objects (1)
PlanetViewport ─► frame.cubeSpherePatches = survivors
               ─► frame.orbitSchedule.buckets = Map
terrainPass.prepareCubeBuckets ─► for each res: encodeCubeSpherePatches(bucket)  ← re-walk (2)
                                  ─► writeBuffer(visibleBuffer, packed 32B/patch)
```

Two avoidable costs at the GPU boundary:
1. **Survivor objects + `Map`** — `budgetAndGroupFlat` builds `CubeSpherePatch`
   objects only so that
2. **`encodeCubeSpherePatches`** can iterate them and write the 32-byte records
   (`gpuBuffers.ts:56`): `face:u32, uvMin:vec2f, uvMax:vec2f, resolution:u32,
   morph:f32, pad:u32` (`CUBE_SPHERE_PATCH_BYTE_SIZE = 32`).

The objects exist *only* to be packed. The budget already knows each survivor's
face/uv/resolution as numbers — it can write the GPU records directly.

### What actually reads the objects (verified)
- `terrainPass.prepareCubeBuckets` (`terrainPass.ts:306`) — iterates
  `frame.orbitSchedule.buckets` per `RESOLUTION_LEVELS`, calls
  `uploadCubeSpherePatches`. **The only structural consumer.**
- `frame.cubeSpherePatches` — read **only for `.length`**
  (`WebGLBackend.ts:26` patch-count stat; `PlanetViewport` assigns it). Nearly
  vestigial.

## Target

The schedule emits, per resolution bucket, a **GPU-ready byte block** (32-byte
stride, already in upload layout). `terrainPass` does a straight `writeBuffer` —
no objects, no `encodeCubeSpherePatches`.

```
WASM walk ─► flat f64 candidate buffer
          ─► packBudgetedBuckets ─► PackedBucket[] (resolution, instanceCount, data: bytes)
PlanetViewport ─► frame.orbitSchedule.packedBuckets = …
terrainPass ─► for each PackedBucket: writeBuffer(visibleBuffer, data)            ← no re-walk
```

## Contract change (`RenderBackend.ts`, mine)

```ts
export interface PackedBucket {
	resolution: number;
	instanceCount: number;
	/** GPU upload bytes: instanceCount × CUBE_SPHERE_PATCH_BYTE_SIZE, ready to writeBuffer. */
	data: Uint8Array;
}

export interface OrbitScheduleMeta {
	packedBuckets: PackedBucket[];   // replaces `buckets: Map<number, CubeSpherePatch[]>`
	patchCount: number;              // replaces frame.cubeSpherePatches.length
	candidatePatches: number;
	budgetDropped: number;
	vertexBudget: number;
}
```

`RenderFrame.cubeSpherePatches` is **removed** (its only read was `.length` →
now `orbitSchedule.patchCount`). `SurfacePatch[]` is untouched.

## File-by-file

| File | Owner | Change |
|------|-------|--------|
| `render/RenderBackend.ts` | me | Add `PackedBucket`; swap `buckets`→`packedBuckets`, add `patchCount`; drop `RenderFrame.cubeSpherePatches`. |
| `patches/flatBudget.ts` | me | `packBudgetedBuckets(view, count, maxVertices, maxPatches, pool)` — same selection/coarsen logic, but writes survivors straight into per-resolution byte blocks (32B layout) instead of objects. Returns `PackedBucket[]` + `dropped` + `patchCount` + `estimatedVertices`. |
| `patches/cubeSphere.ts` | me | `scheduleOrbitPatches` returns the packed form; object/JS fallback packs via the same layout (or a thin `encode` of its survivors). |
| `params/gpuBuffers.ts` | me | Factor the 32-byte record writer so both `encodeCubeSpherePatches` (object path) and `packBudgetedBuckets` (flat path) share one layout fn. Add `uploadPackedBucket(device, buffer, data)`. |
| `render/passes/terrainPass.ts` | me | `prepareCubeBuckets` iterates `packedBuckets`, `writeBuffer` directly; drop `encodeCubeSpherePatches`/`uploadCubeSpherePatches` call. Stats use `patchCount`. |
| `render/WebGLBackend.ts` | me | `patchCount: frame.orbitSchedule?.patchCount ?? 0`. Verify the WebGL cube path (if any) — see risks. |
| `components/PlanetViewport.svelte` | **spaceflight agent** | **The only cross-agent edit.** ~3 lines, below. |

### The cross-agent diff (`PlanetViewport.svelte` ~488–514)

```diff
-  cubeSpherePatches = scheduled.patches;
   orbitSchedule = {
-    buckets: scheduled.buckets,
+    packedBuckets: scheduled.packedBuckets,
+    patchCount: scheduled.patchCount,
     candidatePatches: scheduled.candidatePatches,
     budgetDropped: scheduled.budgetDropped,
     vertexBudget: scheduled.vertexBudget
   };
   …
   return {
     …
-    cubeSpherePatches,
     surfacePatches,
     orbitSchedule,
```

`scheduleOrbitPatches`'s return type changes, so this is a typed, compiler-guided
edit — `npm run check` flags every site. Nothing else in `PlanetViewport`
touches patch internals.

## Buffer lifetime / aliasing (the one correctness contract)

`PackedBucket.data` aliases a **reused per-schedule pool** (one byte block per
active resolution, ≤ `RESOLUTION_LEVELS.length`), not a fresh allocation. Safe
because:
- The render consumes `packedBuckets` **the same frame**, before the next schedule.
- The frame-coherent cache returns the *same* `OrbitScheduleResult` on a **hit**
  → no schedule ran → pool bytes intact.
- A **miss** overwrites the pool *and* replaces the cached result in one step →
  the stale result is dropped, never read against fresh bytes.

So a small pool sized to `MAX_CUBE_PATCHES × 32` per resolution is sufficient;
misses are already throttled (~every ≤4 frames) so even per-miss allocation of
≤5 blocks is cheap. Document the "consume before next schedule" rule on
`PackedBucket`.

## Migration (each step shippable, `npm run check` green)

1. **Additive contract.** Add `packedBuckets`/`patchCount` to `OrbitScheduleMeta`
   as optional; keep `buckets`/`cubeSpherePatches`. Schedule populates both.
   `terrainPass` prefers `packedBuckets` when present. **No PlanetViewport change
   yet** — proves the GPU path on real frames behind a runtime A/B (eyeball cube
   render: identical). Still allocates objects, so no win yet — this is the
   de-risk step.
2. **Flip the producer.** `packBudgetedBuckets` stops building objects;
   `scheduleOrbitPatches` returns packed only. Apply the PlanetViewport diff
   (the cross-agent moment). Remove `cubeSpherePatches` from `RenderFrame` and
   the object `buckets` from `OrbitScheduleMeta`. **The allocation win lands here.**
3. **Cleanup.** `encodeCubeSpherePatches`/`uploadCubeSpherePatches` keep only the
   shared layout writer; delete the object-iterating bucket upload. `flatBudget`'s
   object materializer stays **only** if the WebGL fallback needs it (below).

## Risks / open checks

- **WebGL cube path.** WebGLBackend only reads `.length` in the audit, implying
  it doesn't render cube buckets itself (or does so elsewhere). **Before step 2**,
  confirm: if WebGL renders cube patches from objects, either (a) decode
  `packedBuckets` in WebGL, or (b) keep `budgetAndGroupFlat`'s object form for the
  WebGL backend only. Don't delete the object path until this is settled.
- **No headless GPU verification.** The upload bytes are identical to today's
  `encodeCubeSpherePatches` output (same layout fn) — assert that *in a unit test*
  (`packBudgetedBuckets` bytes == `encodeCubeSpherePatches(objectSurvivors)`),
  which is headless. The remaining "does it draw" check is the same eyeball A/B
  every GPU change needs.
- **Stats.** `candidatePatches`/`budgetDropped`/`vertexBudget` are unchanged;
  `patchCount` replaces `cubeSpherePatches.length` exactly.

## Payoff

Removes the last per-frame object churn on the cube schedule path: no survivor
objects, no `Map`, no `encodeCubeSpherePatches` re-walk — the budget writes GPU
bytes once. Complements the flat-budget commit (which already removed the
candidate-explosion objects). Net: schedule → GPU with zero `CubeSpherePatch`
allocations on the hot path.

## Coordination ask

Everything except the `PlanetViewport.svelte` diff is mine and can land as
step 1 (additive, no contract break) immediately. Step 2 needs the spaceflight
agent to apply (or approve) the ~3-line `RenderFrame`-assembly diff above, since
it owns that file. The change is typed and compiler-checked, not behavioral —
the camera/navigation code is untouched.
