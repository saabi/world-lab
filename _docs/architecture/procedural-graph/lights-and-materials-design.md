# Lights as nodes, materials as library: design discussion

**Status:** draft design discussion, **not a contract** — no Fix steps, no Gate items; nothing here
should be routed as-is · **Origin:** user-proposed sketch (2026-07-09): typed light source nodes +
a collect node feeding a material/fragment shader, with the concern that "not all fragment shaders
are made for illumination, so the way to include them should be generic," and the requirement that
multiple light nodes feed one lights port · **Related:**
[node-model-design-notes.md §A](./node-model-design-notes.md) (the prior analysis this validates
against), [foundation-4-command-graph-plan.md](./foundation-4-command-graph-plan.md) (F4.2 is the
prerequisite), [planet-shaping-pipeline-graph.md](../../planet-shaping-pipeline-graph.md)
(`PbrLighting`/`SelfShadow` node rows) · **Author:** Opus

## The headline: the sketch is mostly landed machinery plus one real gap

The proposal maps almost one-to-one onto decisions this repo already made and mechanisms that
already work. What follows is verification of that claim, the one genuinely new engine piece, and
a recommended phasing.

## (A) What already exists — verified by direct read

- **"PBR over N lights" is the named motivating example of the existing collections design.**
  `node-model-design-notes.md` §A ("Collections & looping (e.g. PBR over N lights)") analyzed five
  approaches and recommended: one `list<T>` port kind, **lowering chosen by how the port is fed** —
  statically wired edges → compile-time unroll; a runtime storage buffer → data loop. It also
  already recommends the storage-buffer path as the eventual default *for scene lights
  specifically*, and names `forEach`/`reduce` container nodes as the later general mechanism
  ("lighting is the motivating reduce").
- **The dual lowering is landed, for vector element types.** `ListDataType`
  (`packages/graph/src/types.ts:18`) is `'tuple<f32>' | 'tuple<vec2f>' | 'tuple<vec3f>' |
  'tuple<vec4f>'`. `emitGraphEval.ts:330-355` detects tuple ports, collects **multiple edges into
  one port** (static path), and detects a single `storageBuffer`-typed upstream
  (`emitGraphEval.ts:351`) for the dynamic path, emitting a real
  `arrayLength(&…)`-bounded `for` loop (`emitGraphEval.ts:435-436`) — the count is data, not a
  compile-time constant, so a dynamic light count needs no recompile on that path. Validation
  already legalizes multi-fan-in specifically for tuple ports (`validate.ts`'s `multiple-inputs`
  exemption). Landed tests cover static unroll, storage-buffer loop, and mixed feeding.
- **The scene editor already has a proven light model to mirror.**
  `apps/scene-editor/src/lib/planet/scene/types.ts:270-282`: `SceneLight = {kind: 'directional' |
  'point', directionOrPosition: Vec3, color: Vec3, intensity, range}` — a tagged union, one struct
  for all list-member light types — and `CollectedLighting = {ambient: Vec3, lights: SceneLight[]}`
  with **ambient accumulated into a single vec3, not a list member**
  (`collectLights.ts:15-18`). `collectSceneLights` (`collectLights.ts:9`) walks the scene tree,
  resolves world transforms, and produces this — it is the natural future producer for a
  host-provided lights binding.
- **The PBR node is already enumerated.** `planet-shaping-pipeline-graph.md:237-238` lists
  `SelfShadow` (world/body position, light, shape subgraph → shadow factor) and `PbrLighting`
  (material, normal, **lights**, shadow factor → color) in the planet node set — this design is
  that row, generalized.
- **Structs exist in the type system but not in list lowering.** `TypeRef` has a struct kind
  (`types.ts:45`, `{kind:'struct'; id; fields: StructField[]}`), but no `ListDataType` member
  carries a struct, the tuple lowering casts its inner type straight to a `DataType` alias
  (`emitGraphEval.ts:340`, `inputDataType.slice(6, -1) as DataType`), and no registered primitive
  constructs a struct value in WGSL. This is the gap — see (C).

## (B) Recommended shape

1. **`Light` as a tagged struct value**, mirroring `SceneLight`'s proven layout: a `kind` tag
   (u32), `positionOrDirection: vec3f`, `color: vec3f`, `intensity: f32`, `range: f32` — spot
   lights add cone parameters (packing TBD at contract time; keep one struct for all list-member
   types, per the scene precedent, rather than per-type list ports).
2. **Ambient is not a list member.** A separate `ambient: vec3f` input on the material (or just an
   added term), matching `CollectedLighting`'s own split — ambient has no position/direction and
   summing it into the list would force every consumer to special-case `kind`.
3. **Source nodes** `light.directional` / `light.point` / `light.spot`, each a small constructor
   primitive: params/inputs in, one `Light` value out. Standard swap-family candidates
   (`role: 'lightSource'`) so the editor's "Change operation ▸" works across them.
4. **No mandatory collect node — the material's `lights` port is the collector.** `lights:
   list<Light>` with multi-edge fan-in, exactly the landed tuple mechanism. An optional, *generic*
   `list.combine` node (concatenate lists/values) is worth adding later for rig-reuse — author one
   light set, fan it into several materials — but as list infrastructure, not a light concept. This
   simplifies the original sketch by one node without losing anything.
5. **Lighting is library, not engine.** `material.pbr` is an ordinary function/group node: surface
   properties (albedo, normal, roughness, metallic, worldPos) + `lights` + `ambient` + view
   direction in, `vec4f` color out — wired into `stage.fragmentKernel`'s `color` input like any
   other field. An unlit graph never instantiates it; nothing about stages, kernels, binding
   derivation, or execution changes. This is the whole answer to "not all fragment shaders are made
   for illumination": illumination is opt-in composition, the same way noise is.

## (C) The one genuinely new engine piece: struct-valued list ports

Two options considered:

- **S1 — do it properly: `list<Light>` with struct elements.** Extend the list/tuple port typing to
  `TypeRef`-based element types (the design notes' own "`list<T>` port kind" recommendation —
  notably *not* more `ListDataType` string aliases, whose `as DataType` cast is exactly what
  can't express a struct), teach the static-unroll and storage-buffer lowerings to handle struct
  elements, emit the WGSL `struct Light {…}` declaration once per module, and add struct
  constructor emission (precedent: the `makeVec3f`-style vector constructors — a per-light-type
  constructor function is the same shape). CPU side: `evalCPU` returns a plain object matching the
  fields, mirroring how `SceneLight` already works.
- **S2 — the zero-engine-work cheat: parallel `tuple<vec4f>` ports** (one carrying
  position+kind, one carrying color+intensity), reassembled inside the material's WGSL. Works
  today; rejected — split-struct-across-parallel-ports is precisely the untyped correlation
  Foundation 1's structural types exist to prevent, and every future struct-shaped value
  (draw commands in F4.4, particles in F4.5) would inherit the precedent.

**Recommendation: S1**, scoped as its own engine milestone *before* the light library — and worth
noting it is not light-specific: F4.4's `list<DrawCommand>` and F4.5's particle records both want
struct-element collections, so this lands infrastructure three roadmap items already need. The
contract needs its own pre-drafting research pass (the `as DataType` cast, `dataTypeToWgsl`'s
struct handling, port-compatibility/coercion rules for structs, and editor rendering of
struct-typed ports are each potential surprises of exactly the kind F3.x pre-routing reviews kept
catching).

## (D) Two feeding modes — the camera parallel, made explicit

Same duality as F4.2's view/projection host binding: one port type, two producers.

1. **Graph-authored lights** (source nodes, multi-fan-in) → **static unroll** lowering. For
   standalone documents, samples, and WebGPUToy authoring. Count changes recompile — fine under
   F4.1's compile-once-per-signature model, where an edit *is* a recompile boundary.
2. **Host/scene-provided lights** (`host.sceneLights`, a `HostBinding` like `host.iTime`) →
   **storage buffer + count** → the landed dynamic-loop lowering. The producer is
   `collectSceneLights` output, GPU-packed. This is the design notes' own recommended default for
   scene lights and belongs to the scene-integration era (M13/renderer-unification) — phase two,
   but the struct is designed once so it drops into the same port.

## (E) Roadmap placement

- **Prerequisite: F4.2** — PBR without it is fake: specular needs the camera's view direction
  (F4.2's view/projection bindings) and lighting needs the `normal`/`worldPos` varyings (F4.2's
  N-varyings item). A lit material *sample* also wants depth (two objects, one casting no shadow
  but occluding correctly).
- **Slot:** the standard-library reconstruction list, immediately after F4.2 lands — and it *is*
  the planet PoC's `PbrLighting` row; one design serves both, so the PoC refresh (review §2.5)
  should point at this doc.
- **Shadows: explicitly deferred.** Shadow maps are per-light render passes — F4.4 command-graph
  territory (`SelfShadow` in the planet set is an analytic terrain shadow, a different, cheaper
  thing that needs no passes). Keep `Light` extensible (a later optional shadow-map resource
  reference is a binding-shaped addition), but design nothing now.

## Tentative contract shape, once scoped

1. **L1 — struct-valued list ports (engine).** `TypeRef`-based list element typing, struct WGSL
   declaration emission, struct constructors, both lowerings, `evalCPU` parity. Not light-specific;
   test fixture can be light-shaped. Routable independently of F4.2.
2. **L2 — light sources + `material.pbr` (library).** The three source nodes, the material group,
   ambient input, a bundled lit sample (visual gate per standing convention — needs F4.2 for
   varyings/camera, so sequenced after it).
3. **L3 — `host.sceneLights` (scene era).** Storage-buffer packing of `collectSceneLights` output +
   the host binding; gated with the M13/unification track, not before.

## Open questions this document deliberately does not resolve

- **Fan-in edge ordering:** radiance summation is mathematically order-independent but float
  addition isn't associative — the static unroll should define a deterministic edge order (document
  order, presumably, matching current tuple behavior) so renders are reproducible.
- **Spot parameter packing** (cone angles, falloff) — one struct with unused fields per kind vs. a
  `params: vec4f` bag; decide at L1/L2 contract time.
- **`list<T>` vs `tuple<T>`:** whether S1 generalizes the existing tuple machinery in place or
  introduces `list<T>` alongside it with tuples as the legacy alias — a naming/migration call for
  L1's pre-drafting research.
- **Uniform-array fallback:** the landed dynamic path is storage-buffer + `arrayLength`; whether a
  `MAX_LIGHTS` uniform-array variant is ever worth having (uniform-buffer-only targets) is deferred
  until something needs it.
