# Planet pipeline as a single graph — design & feasibility review

**Status:** design review (no implementation) · **Date:** 2026-06-27 (Opus) ·
**Objective:** assess reproducing the **existing single-planet pipeline** —
tessellation → vertex shading → fragment shading, as rendered today in `/scene` — as
**one procedural graph**, as a proof of concept. Explicitly **out of scope:** multiple
bodies, atmospheres, solar systems. Companion to
[planet-shaping-pipeline-graph.md](../../planet-shaping-pipeline-graph.md),
[runtime-and-tessellation.md](./runtime-and-tessellation.md),
[design-vs-implementation-audit.md](./design-vs-implementation-audit.md).

## TL;DR — feasibility is HIGH

**The current planet renderer already implements the model the user proposes**, in WGSL,
by hand. The PoC is largely a *re-expression* of existing, working shaders as a graph —
not new rendering research. The genuinely new work is three graph-engine capabilities
(multi-output compilation, stage entry points, an instance-input model) plus a faithful
codegen of the shaping kernel. Risk is concentrated in **numerical parity**, not in
whether the architecture supports the pipeline — it demonstrably does.

## 1. How the planet renders today (grounded in code)

Source: `fe/src/lib/planet/` — `render/buildRenderFrame.ts`, `patches/*`,
`gpu/wgsl/terrain/cubeSphereVertex.wgsl`, `gpu/wgsl/planet/{kernel,material,normal,shadow,lighting}.wgsl`.

**CPU, per frame (`buildRenderFrame` → `scheduleOrbitPatches`):**
1. Adaptive cube-sphere quadtree over the 6 faces, refined by **screen-space** patch
   size (`cubeSphereScheduler.ts`, `screenSpace.ts`).
2. **Cull** each patch — frustum planes (from `viewProj`), horizon, backface
   (`culling.ts`); there are also GPU compute variants (`patchCullCompute.wgsl`,
   `surfaceSchedulerCompute.wgsl`).
3. **Vertex-budget** + group by resolution (`vertexBudget.ts`, `flatBudget.ts`).
4. Upload a **storage buffer of patch descriptors** `array<CubeSpherePatchGpu>` (face +
   uv-rect + resolution) plus uniforms (`ViewUniforms`, `PlanetParams`, `ScaleContext`,
   lighting).

**GPU vertex (`vs_main`) — this is procedural tessellation, no mesh in memory:**
```
iid = instance_index → patches[iid]           // which patch (one instanced draw)
vid = vertex_index   → uv_local grid (res×res) // plane grid inside the patch
uv      = mix(patch.uv_min, patch.uv_max, uv_local)      // patch → cube-face uv
body_dir= cube_face_uv_to_unit_dir(face, uv)             // cube → unit sphere (inflate)
sample  = sample_planet(body_dir, planet, scale_ctx)     // the SHAPING KERNEL
world_radius = mix(radius, sample.world_radius_meters, displacement_blend)  // displace
world_pos    = world_dir * world_radius
```

**GPU fragment (`fs_main`):**
```
sample   = sample_planet(body_dir, …)                    // re-sampled (ideal-sphere coord)
material = surface_material(sample, …)                   // albedo/roughness/water
n_body   = planet_surface_normal(body_dir, …)            // finite-difference normal
shadow   = terrain_sun_shadow(world_pos, sun, …)         // self-shadow
color    = evaluate_pbr(material, normal, lights, shadow)
```

### The user's proposed design *is* the current design

> "the plane tessellator could be one of the primitives and instancing can create 6 cube
> sides that later can be inflated to a sphere and then adjusted to terrain height in a
> vertex shader."

That is line-for-line what `vs_main` does — with one refinement: it is not 6 fixed cube
sides but **N adaptive patches** (sub-rectangles of the 6 faces), chosen per frame by the
LOD scheduler. "6 cube sides" is the depth-0 case. The vertex-shader displacement, the
cube→sphere inflate, and the instanced plane grid are all already there.

## 2. Two tessellation modes — the PoC uses vertex-shader displacement

A subtle but important distinction the audit surfaced:

| Mode | What | Used by | Graph consumer |
|------|------|---------|----------------|
| **A. Vertex-shader tessellation** | Instanced plane grid, positions computed + displaced in `vs_main`; no vertex/index buffers stored | **The planet renderer (today)** | A **vertex** consumer that reads the patch-instance buffer |
| **B. Compute mesh-generation** | A compute pass evaluates a surface graph over a uv grid → vertex/index storage buffers | Cases needing a real mesh (collision, export, CPU preview) | A **mesh-gen/compute** consumer ([M-mesh-gen-consumer](./briefs/M-mesh-gen-consumer.md)) |

**The PoC must use Mode A** — it is what `/scene` does, needs no mesh storage, and is the
efficient path for a displaced sphere. (My earlier `M-mesh-gen-consumer` brief assumed
Mode B; that consumer is still valid for the editor's cube-sphere *preview* and for
collision/export, but it is **not** the planet render path. This review supersedes that
assumption for the planet PoC.) Both modes share the same *surface-mapping nodes* — they
differ only in whether geometry is procedural-in-vertex (A) or baked-to-buffer (B).

## 3. Tessellator types & the plane-primitive composition

The user's instinct generalizes cleanly. A tessellator is a **composition of nodes**, and
different tessellators are different compositions over the **same** plane-grid primitive:

```
gridUv (vid → res×res)                          ← vertex-stage input (host)
   │
   ▼  surface.plane            : gridUv → planar position           (flat patch)
   │  + patchTransform         : map planar → patch sub-rect of a cube face (uses instance faceId + uv-rect)
   │  + cubeToSphere (normalize): cube-face position → unit sphere dir   (inflate)
   ▼  = body_dir
   │
   ▼  displace(body_dir, heightField) : body_dir * world_radius_meters   (terrain)
   = world_pos
```

- **Plane tessellator** = `surface.plane` alone (already a primitive, M11.1).
- **Cube** = `surface.plane` + per-instance face transform (6 instances).
- **Cube-sphere** = the above + `cubeToSphere` normalize (the existing
  `cube_face_uv_to_unit_dir`).
- **Displaced planet** = cube-sphere + `displace` by the shaping graph's height output.

This is the proof that "different tessellators work": swap/extend the composition (a
cylinder or ring surface is a different `surface.*` node), the rest of the graph and the
runtime are unchanged. The current `surface.cubeSphere` primitive (M11.1) already bakes
plane→face→sphere into one node; the PoC can either keep it monolithic or decompose it
into the chain above to expose the user's "plane instanced into a cube" structure as
editable nodes — **recommended decomposed**, since editability of the tessellator is part
of the point.

## 4. CPU services & culling — coordination with a graph tessellator

**The scheduler/culler stays a runtime service; it does not become graph nodes.** This is
consistent with the locked ADR decision (mapping = graph/portable; scheduling = runtime —
[runtime-and-tessellation.md](./runtime-and-tessellation.md)). The coordination is a
**data interface**, not a merge:

```
runtime-cpu / patches scheduler            graph (vertex consumer)
  cameraPos, viewProj, viewport     ─┐
  → frustum planes (extractFrustum)  │
  → adaptive quadtree + cull + budget│  produces ──► patch-instance storage buffer
                                     │                       │ bound as a vertex-stage INPUT
  ScaleContext (meters/pixel, LOD)  ─┘                       ▼
                                            instance_index → patch descriptor
                                            vertex_index   → grid uv  ──► graph evaluates
```

So the graph's vertex consumer declares **host inputs**: a per-instance `patchDescriptor`
(face, uv-rect, resolution) and the two builtin indices, plus the camera/scale uniforms.
The runtime feeds them. `runtime-cpu` already owns the generic pieces this needs —
`frustumFromViewProjection` + `cullSpheres` (M7/M11.2) — and the planet app already owns
the full adaptive scheduler. **Frustum coordinates and culling never enter the graph;**
they shape *which instances exist*, and the graph runs per surviving instance. (The
existing GPU `patchCullCompute.wgsl` shows culling can itself be a compute consumer later,
but for the PoC the CPU scheduler is reused as-is.)

This answers the user's coordination question directly: the graph tessellator is **fed
by** the culling/scheduling service through an instance buffer; it does not duplicate or
contain it.

## 5. New graph-engine capabilities the PoC requires

The PoC is gated on capabilities that are **designed but unbuilt** (see the audit). In
dependency order:

1. **Instance / vertex-index input model** *(new).* The vertex stage has two builtin
   inputs (`instance_index`, `vertex_index`) and a per-instance storage buffer. The IR
   needs input ports for these, and the runtime needs to bind a host buffer to an
   instance input. *Small, but genuinely new — no current consumer is instanced.*
2. **Multi-output compile driver + consumer-stage model**
   ([M-multi-output-compile](./briefs/M-multi-output-compile.md)). The PoC is one graph
   with a **vertex** consumer (height → displaced position) and a **fragment** consumer
   (material, normal, shadow, pbr) that **share** `sample_planet`. The compiler must slice
   per stage and emit the shared shaping functions into *both* shaders — exactly the
   multi-output capability flagged as missing.
3. **Stage entry points + bind-group layout** (`M-stage-entrypoints`, follow-on). Wrap the
   vertex consumer as `@vertex fn`, the fragment as `@fragment fn`, with the bind groups
   the current shader uses (ViewUniforms, PlanetParams, ScaleContext, patch buffer).
4. **Faithful shaping-kernel codegen.** Reproduce `sample_planet`/`surface_material`/
   `planet_surface_normal`/`terrain_sun_shadow`/`evaluate_pbr` as graph nodes →
   `procedural-wgsl` modules. The node set is already enumerated in
   [planet-shaping-pipeline-graph.md](../../planet-shaping-pipeline-graph.md) (BodyDirection,
   LayerGate, MacroDistortion, MacroVoronoi, DetailFbm, HeightRemap, FineTextureNoise,
   PolarTerm, BiomeMaterial, NormalEstimator, WorldNormal, SelfShadow, PbrLighting).
5. **Coordinate-space-typed ports** are already in the IR (M1) and are *exactly* the guard
   the shaping pipeline needs (body_dir vs world_dir vs world_pos; the inverse
   planetRotation). Reuse, no new work.

## 5b. Two generality requirements (not redesign — already in scope)

These were always part of the purpose (README §4 WebGPUToy); stating them so the PoC
sequencing serves them, not just the planet.

### ShaderToy-equivalence — and why it is the *simpler* PoC #0

> "we must also be able to implement anything that can be done in ShaderToy or similar."

A ShaderToy effect is **the simplest possible consumer**: one **fragment** consumer over
a fullscreen triangle, with a fixed set of host/resource inputs and no tessellation, no
vertex displacement, no instancing, no multi-stage sharing. It is a strict *subset* of the
planet pipeline's machinery — so it should be **PoC #0, done before the planet**, because
it de-risks every new piece (fragment consumer + stage entry point + host inputs + the
uniform form + resource binds) on a trivial target where parity is "does it look like the
reference effect," not "match a double-precision terrain kernel."

ShaderToy's input set maps onto already-designed concepts (host/runtime + resource input
classes — [parameter-and-form-schema.md](./parameter-and-form-schema.md) class 2,
[inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)):

| ShaderToy | Virtual Planet concept | Status |
|-----------|------------------------|--------|
| `iResolution` | viewport host input | ✅ exists (`ViewUniforms.viewport`) |
| `iTime`, `iTimeDelta`, `iFrame` | `time` host input (+ frame counter) | ✅ time designed; frame counter trivial |
| `iMouse` | pointer host input — **raw pixel xy + click**, alongside M7's world ray | ⚠ M7 gives world ray; add raw `vec4` mouse |
| `iChannel0–3` (texture/cubemap) | image **resource** input, GPU-bound | ⚠ M8 = CPU views; **GPU bind is the audit gap** |
| `iChannel` (audio / video) | audio (FFT) / video resource input | ◻ designed (inputs-cpu-and-resources); not built |
| `iDate`, `iSampleRate` | host inputs | ◻ trivial when needed |
| raw `mainImage()` GLSL/WGSL body | a **self-describing fragment primitive** (M3 loader: signature + frontmatter) whose output feeds the fullscreen-fragment consumer | ✅ M3 mechanism exists; needs a fullscreen-fragment consumer + raw-body authoring affordance |

**The only genuinely missing piece beyond the audit's multi-output/stage-entry work is the
fullscreen-fragment consumer + the ShaderToy host-input bundle + resource GPU binds.** All
small, and all reused by the planet PoC.

### The schema-driven uniform form generalizes to *any* shader

> "the scene editor's schema-based property panel generator … duplicated as a form for
> sending data to the shaders … the same purpose as in the scene editor but more generally
> for any type of shader code."

This is exactly the
[parameter-and-form-schema ADR](./parameter-and-form-schema.md)'s "one shared form
generator" + "consumer uniform packing" pipeline — but the PoC must demonstrate it for an
**arbitrary shader's uniforms**, not only graph-primitive params. The chain is:
`shader/consumer declares params (schema/frontmatter) → shared SchemaForm renders controls
→ validated value bag → uniform packer → GPU uniform block bound to that shader`. A
ShaderToy-style raw shader exposes its tunables the same way a scene body exposes
appearance fields — same generator, different schema source. This is the unifying claim:
**the scene editor's property panel and a shader's uniform form are one mechanism over
different schemas.** (ADR updated to state this generality explicitly.)

## 6. Proposed PoC milestones (after the audit gaps land)

A two-stage plan: **PoC #0 (ShaderToy)** proves the machinery cheaply; **PoC #1 (planet)**
adds tessellation/vertex/multi-stage and ends in route parity.

| Step | Deliverable | Gate |
|------|-------------|------|
| **S0** | Fullscreen-fragment consumer + ShaderToy host inputs (`iResolution`/`iTime`/`iMouse`) + a self-describing fragment primitive; schema-driven uniform form feeding it | a hand-written WGSL `mainImage`-style effect runs in the editor, tunable via the generated form |
| **S1** | One `iChannel` image resource **GPU-bound** (closes the audit's resource-bind gap on the easy target) | a texture-sampling effect renders |
| **P0** | Instance-input model in IR + runtime (bind a per-instance buffer; `instance_index`/`vertex_index` inputs) | headless: a graph reads instance/vertex indices; unit test |
| **P1** | Tessellator composition nodes: `surface.plane` grid + `patchTransform` + `cubeToSphere` + `displace`; reproduce one patch's `body_dir`/`world_pos` | vitest parity vs `cube_face_uv_to_unit_dir` + `vs_main` math (CPU) |
| **P2** | Shaping/shading nodes → `procedural-wgsl` (the planet-shaping node set), validated against the existing WGSL numerically | per-node CPU parity vs current kernel (within tolerance) |
| **P3** | Compile the planet graph: vertex consumer (displace) + fragment consumer (material+normal+shadow+pbr), shared `sample_planet`, via `compileGraph` | generated shaders compile (`wgslCompile.test.ts`); shared fn emitted in both |
| **P4** | Wire into a runtime draw fed by the **existing** scheduler's patch buffer | renders a recognizable displaced planet |
| **P5** | **Route parity:** same body/camera/style → graph-rendered planet matches `/scene`'s hand-written pipeline | the M13-style parity test: lat/long debug grid stable under tessellation sweep; pixel/structural diff within tolerance |

P5 is the PoC success criterion and is the same gate `renderer-unification-plan.md`
defines for the eventual real migration — so the PoC doubles as the M13 spike.

## 7. Risks & open questions

- **Numerical parity (top risk).** The shaping kernel uses specific FBM/Voronoi/erosion
  math and scale-tag conventions (`freq`/`ratioR`/`pure`…). Graph codegen must reproduce
  it bit-closely or terrain will differ. Mitigation: P2 per-node CPU parity tests against
  the live WGSL; keep the existing WGSL modules and have nodes *reference* them
  (signature-level) rather than re-derive, where possible.
- **Vertex/fragment shared-sample consistency.** Today both stages call `sample_planet`
  (fragment uses the ideal-sphere fragment coord — `ideal-sphere-fragment-sampling.md`).
  The graph must preserve that the fragment consumer re-samples on the ideal coord, not
  the interpolated vertex one. The coordinate-space ports express this; the multi-output
  slicer must not "optimize" it into an interpolated varying.
- **Instance input is a new IR/runtime concept** — modest but on the critical path (P0).
- **Scheduler stays external** — the PoC reuses the planet app's scheduler; it is *not*
  graph-described. That's correct for now, but means the PoC is not yet a *fully*
  self-contained graph (the tessellation *budget/LOD* logic lives in the host). Flag for
  a later "scheduler as compute consumer" exploration; not needed for the PoC.
- **Gating:** the PoC's P3–P5 depend on the audit milestones (multi-output, stage
  entrypoints). It also overlaps M13's renderer-unification gate at P5 (parity). Sequence
  the audit capabilities first; the PoC is their first real exercise.

## 8. Recommendation

**Proceed — build enablers first, then prove on the easy target before the planet:**

1. **Multi-output compile driver + consumer-stage model**, then **stage entry points**
   (the orchestration tier — needed by both PoCs).
2. **PoC #0 — ShaderToy (S0–S1):** fullscreen-fragment consumer + ShaderToy host inputs +
   schema-driven uniform form + one GPU-bound image resource. This de-risks the fragment
   consumer, host inputs, the uniform form, and resource binds on a trivial target, and
   directly delivers the WebGPUToy generality requirement.
3. **PoC #1 — planet (P0–P5):** instance-input model, tessellator composition nodes,
   shaping-kernel codegen, vertex+fragment shared compile, runtime wiring, **route
   parity** with `/scene`.

The architecture is sound and the GPU pipeline already validates the planet model; the
work is re-expression + the orchestration tier, not redesign. Keep the existing
scheduler/culling as the runtime service that feeds the graph. Decompose the cube-sphere
tessellator into editable nodes so the "plane → instanced cube → inflated sphere →
displaced" structure is visible and editable. Doing the planet *and* matching ShaderToy
are the same engine proving two ends of its range — a single fragment effect and a full
displaced-terrain multi-stage pipeline — over one IR, compiler, and uniform-form mechanism.
