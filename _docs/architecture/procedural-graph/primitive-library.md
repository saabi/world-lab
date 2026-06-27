# Primitive library — full categorized catalogue

**Status:** living catalogue · **Date:** 2026-06-27 (Opus) · **Scope:** every procedural-
graph node **built ✅ / planned 📋 / discussed 💭**, organized by category, including the
pipeline node families (geometry/buffer/stage/target) from
[pipeline-as-graph.md](./pipeline-as-graph.md). Sources: built = `packages/graph/src/primitives/`
+ `packages/procedural-wgsl/`; discussed = the
[source conversation](../../conversations/node-editor-and-then-some.md) (esp. turns 37–38,
42, 50). Palette grouping = `group` → `category` ([editor.md](./editor.md)).

**Legend:** ✅ built & registered · 📋 planned (pinned/next) · 💭 discussed (not yet pinned)
· **LHF** = low-hanging fruit (a few hours each — mirrors an existing primitive pattern).

---

## Group: Fields — value-producing math (nest inside `stage.*` nodes)

### Noise · `group: Fields`
| id | status | notes |
|----|--------|-------|
| `noise.perlin3d` | ✅ | classic gradient noise |
| `noise.simplex` | ✅ | |
| `noise.worley` | ✅ | cellular |
| `noise.fbm` | ✅ | fractal sum over perlin |
| `noise.ridgedFbm` | ✅ | |
| `noise.ign` | ✅ | interleaved gradient (Use.GPU) |
| `noise.value` | 💭 LHF | value noise (turn 50) |
| `noise.perlin2d` | 💭 LHF | 2D variant |
| `noise.domainWarp` | 💭 | generic warp (terrain.domainWarp exists; generalize) |
| `noise.curl` | 💭 | curl noise (flow) |

### Math / shaping · `group: Fields`
| id | status | notes |
|----|--------|-------|
| `math.add` `math.multiply` `math.mix` `math.pow` | ✅ | |
| `math.clamp` `math.smoothstep` `math.remap` | ✅ | |
| `math.abs` `math.bias` `math.gain` | ✅ | |
| `math.divide` | 💭 LHF | |
| `math.min` `math.max` | 💭 LHF | |
| `math.normalize` | 💭 LHF | vec normalize |
| `math.invert` (1−x) | 💭 LHF | |
| `math.threshold` | 💭 LHF | step at edge |
| `math.bandpass` | 💭 LHF | |
| `math.curve` | 💭 | spline/curve remap |
| `math.dot` `math.cross` `math.length` `math.distance` | 💭 LHF | vector ops |
| `math.sin` `math.cos` `math.fract` `math.floor` | 💭 LHF | scalar math |

### SDF · `group: Geometry` (value SDFs; feed masks/shading)
| id | status | notes |
|----|--------|-------|
| `sdf.circle` `sdf.box` `sdf.segment` | ✅ | (Use.GPU) |
| `sdf.opUnion` `sdf.opSubtract` `sdf.opIntersect` | ✅ | CSG |
| `sdf.roundedBox` `sdf.hexagon` `sdf.triangle` | 💭 LHF | more 2D shapes |
| `sdf.sphere` `sdf.box3d` `sdf.torus` | 💭 | 3D SDFs |
| `sdf.opSmoothUnion` | 💭 LHF | smooth blend |

### Colour · `group: Effects`
| id | status | notes |
|----|--------|-------|
| `color.srgbToLinear` `color.linearToSrgb` | ✅ | (Use.GPU) |
| `color.hsv2rgb` | ✅ | |
| `color.rgb2hsv` `color.hsl2rgb` | 💭 LHF | |
| `color.tonemap` (ACES/Reinhard) | 💭 | |
| `color.palette` (cosine palette generator) | 💭 LHF | generalize effect.cosinePalette |

---

## Group: Domain — terrain / material / vegetation fields

### Terrain · `group: Domain` (harvested at parity from the planet shaders)
| id | status | notes |
|----|--------|-------|
| `terrain.domainWarp` `terrain.voronoi` `terrain.detailFbm` | ✅ | macro/detail relief |
| `terrain.heightRemap` | ✅ | height+water+erosion → world radius |
| `terrain.fineTextureNoise` `terrain.polarTerm` | ✅ | |
| `terrain.normalEstimator` `terrain.worldNormal` | ✅ | finite-diff + rotate |
| `terrain.selfShadow` | ✅ | sun self-shadow |
| `terrain.beachMask` `terrain.ridgeMask` `terrain.erosionApprox` `terrain.curvature` `terrain.slope` `terrain.altitude` | 💭 | from turn 50 / shaping node list |

### Material / lighting · `group: Domain`
| id | status | notes |
|----|--------|-------|
| `terrain.biomeMaterial` | ✅ | albedo/roughness/water |
| `material.pbrLighting` | ✅ | lit colour |
| `material.fresnel` `material.shadowSoftness` | 💭 LHF | |

### Vegetation · `group: Domain` (algorithm lives in `runtime-cpu/vegetation.ts`; expose as nodes)
| id | status | notes |
|----|--------|-------|
| `veg.densityField` (RGB suitability) | 💭 | low-freq ecology (turns 22, 50) |
| `veg.peakDetect` | 💭 | local-maxima placement (turns 26–28) |
| `veg.prominence` | 💭 | suppress soft plateaus |
| `veg.coverageMask` | 💭 | continuous grass coverage (turn 30) |
| `veg.suppressionMask` | 💭 | tree↔grass exclusion |

---

## Group: Inputs — host / runtime / resource (bound, not authored math)

### Host / runtime inputs · `group: Inputs`
| id | status | notes |
|----|--------|-------|
| `host.fragCoord` `host.iResolution` `host.iTime` | ✅ | ShaderToy host set (S0) |
| `host.iMouse` (normalized pointer) | 📋 | per interaction surface |
| `host.iFrame` `host.iTimeDelta` `host.iDate` | 💭 LHF | |
| `host.iChannelResolution` `host.iChannelTime` | 💭 | per-channel (multibuffer) |
| `input.camera` `input.frustum` `input.pointerRay` | 💭 | from `runtime-cpu` services |
| `procedural.uv` `procedural.metricPosition` | ✅ | per-sample coords |
| `input.positionSphere` `input.positionMeters` `input.altitude` `input.slope` `input.seed` | 💭 | standard graph inputs (turn 36) |

### Resource inputs · `group: Inputs` (image/mesh/audio — GPU-bound)
| id | status | notes |
|----|--------|-------|
| `resource.texture` (iChannel image) | 📋 | GPU bind = the audit's resource gap |
| `resource.mesh` | 💭 | imported geometry as input |
| `resource.audio` (FFT bands) | 💭 | reactive input |
| `resource.keyboard` | 💭 | input-device texture |

---

## Group: Geometry — emit vertices & faces  *(NEW — pipeline node family, 📋)*

> Generate geometry on the GPU. Outputs are **resource** edges (`geometry`/`vertexBuffer`/
> `indexBuffer`). Different tessellators = compositions over a plane grid (pipeline-as-graph).

| id | status | notes |
|----|--------|-------|
| `geometry.fullscreenPlane` | 📋 | 2-triangle fullscreen quad (replaces S0's hidden vertex WGSL) |
| `geometry.grid` | 📋 | parametric `res×res` plane grid (instanceable) |
| `geometry.cubeSphere` | 📋 | 6-face inflated sphere mesh (composition of grid + cubeFaceDir) |
| `geometry.tessellate` | 📋 | compute-shader mesh-gen over a surface mapping → vertex/index buffers ([M-mesh-gen-consumer](./briefs/M-mesh-gen-consumer.md)) |
| `geometry.emitVertices` | 💭 | low-level: write vertex attributes to a buffer |
| `geometry.emitIndices` / `geometry.emitFaces` | 💭 | low-level: write index/face buffer |
| `geometry.instancedPatch` | 💭 | per-instance patch grid (planet Mode-A: scheduler-fed) |
| `geometry.point` `geometry.line` | 💭 | debug/primitive topologies |

---

## Group: Buffers — GPU storage & persistence  *(NEW — pipeline node family, 📋)*

> WebGPU supports this: `GPUBuffer` with usage `VERTEX | INDEX | STORAGE | UNIFORM |
> COPY_SRC | COPY_DST`. A persisted buffer is created/written once and reused across frames.

| id | status | notes |
|----|--------|-------|
| `buffer.persist` | 📋 | cache a resource in GPU memory — **generate once, reuse next frame** (the user's "buffered so it doesn't regenerate") |
| `buffer.vertex` | 📋 | typed vertex buffer (VERTEX usage) |
| `buffer.index` | 📋 | index buffer (INDEX usage) |
| `buffer.storage` | 💭 | read/write storage buffer (compute I/O) |
| `buffer.upload` | 💭 | CPU data → GPU buffer (COPY_DST) |
| `buffer.readback` | 💭 | GPU → CPU (COPY_SRC + map) for debug/CPU consumers |
| `buffer.uniform` | 💭 | uniform block (params packing) |
| `buffer.pingPong` | 💭 | double-buffer for single-frame feedback (Game of Life, S0.5) |

---

## Group: Stages — pipeline stages  *(NEW — pipeline node family, 📋)*

> A stage node embeds a **field subgraph** (the value primitives above) + bindings, and is
> compiled by `compileGraph` + `assembleStageEntry` (both **built**). A `stage.*` node *is*
> a `ProceduralConsumer`.

| id | status | notes |
|----|--------|-------|
| `stage.fragment` | 📋 | fragment shader: varyings + field subgraph → colour → target |
| `stage.vertex` | 📋 | vertex shader: geometry + field subgraph → clip pos / varyings |
| `stage.compute` | 📋 | compute pass: storage I/O + field subgraph |
| `stage.meshGen` | 💭 | compute that emits vertex/index (pairs with `geometry.tessellate`) |

---

## Group: Targets — render targets & sinks  *(NEW — pipeline node family, 📋)*

> The pipeline's outputs. Targets are **nodes**; the runtime schedules/allocates them
> (frame-graph: ordering, ping-pong, per-target resolution, transient pool — pure core built).

| id | status | notes |
|----|--------|-------|
| `target.display` | 📋 | swapchain / canvas present (the visible sink) |
| `target.render` | 📋 | offscreen colour image buffer (ShaderToy Buffer A–D; read back as `resource.texture`) |
| `target.depth` | 💭 | depth attachment (terrain→atmosphere needs it) |
| `target.mrt` | 💭 | multiple render targets (G-buffer) |
| `target.storage` | 💭 | compute write target (data, not colour) |

---

## Low-hanging fruit (do anytime — mirror an existing pattern, headless)

These add immediate palette breadth with the established self-describing/`definePrimitive`
pattern, no new infrastructure:

- **Math:** `divide`, `min`, `max`, `normalize`, `invert`, `threshold`, `dot`, `cross`,
  `length`, `distance`, `sin`, `cos`, `fract`, `floor`.
- **Noise:** `value`, `perlin2d`.
- **SDF:** `roundedBox`, `hexagon`, `triangle`, `opSmoothUnion`.
- **Colour:** `rgb2hsv`, `hsl2rgb`, `palette`.
- **Host:** `iFrame`, `iTimeDelta`, `iDate`.

> The **buffer / geometry / stage / target** families are **not** low-hanging fruit —
> they need the resource-port system (R1–R2 in
> [pipeline-realignment-report.md](./pipeline-realignment-report.md)) first.

---

## Counts

Built ✅ ≈ 44 (noise 6, math 10, sdf 6, colour 3, surface 3, terrain 9, material 2,
host 3, effect 1, procedural 2). Planned 📋 = the geometry/buffer/stage/target families +
iMouse/resource.texture. Discussed 💭 = the rest above + future products (water, collision,
navigation, physics, atmosphere, LOD, debug — turn 38's procedural-consumers list).
