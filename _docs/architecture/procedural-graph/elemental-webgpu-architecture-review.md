# Elemental WebGPU graph architecture review

**Status:** architecture recommendation
**Date:** 2026-07-03
**Scope:** procedural graph IR, compiler, standard library, CPU/WebGPU runtimes,
WebGPUToy, and the planned mesh, multi-draw, particle, vegetation, ShaderToy, and planet
work.

## Executive conclusion

The project has the correct high-level direction: one typed graph, reusable field
functions, per-consumer slicing, explicit pipeline resources, and a runtime frame graph.
The main risk is that new capabilities are still arriving as specialized TypeScript
consumers (`meshGen`, vegetation candidates, fullscreen fragment, instanced mesh draw)
before the generic resource and command model is complete.

The final architecture should not make every node look like a WGSL function. It should
make every authored capability graph-composable while recognizing six elemental node
kinds:

1. **Value functions** - pure typed expressions compiled into WGSL functions.
2. **Host inputs** - values or resources bound from a declared runtime context.
3. **Resources** - typed buffers, textures, samplers, meshes, and their lifetime policy.
4. **Shader kernels** - vertex, fragment, or compute entry points over value subgraphs.
5. **GPU commands and passes** - dispatch, draw, copy, render pass, and presentation.
6. **Groups** - reusable subgraphs over any compatible set of the above.

These kinds should share one graph document, type system, connection model, validation
surface, serialization format, and editor. They should not share one implementation
contract. A pure `vector.add` function, a persistent storage buffer, and a render pass
are all graph nodes, but only the first is a WGSL function.

This distinction produces a smaller core and more WebGPU coverage than adding separate
engine concepts for tessellation, particles, vegetation, multi-mesh rendering, MRT, or
feedback. Those become standard-library groups and samples built from the same elemental
resource, kernel, and command nodes.

## Material reviewed

This review reconciles:

- [pipeline-as-graph.md](./pipeline-as-graph.md)
- [graph-and-compiler.md](./graph-and-compiler.md)
- [schema-and-primitives.md](./schema-and-primitives.md)
- [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)
- [runtime-and-tessellation.md](./runtime-and-tessellation.md)
- [node-model-design-notes.md](./node-model-design-notes.md)
- [primitive-library.md](./primitive-library.md)
- [planet-pipeline-poc-feasibility.md](./planet-pipeline-poc-feasibility.md)
- [work-plan.md](./work-plan.md)
- [M-instanced-mesh-draw-extraction.md](./briefs/M-instanced-mesh-draw-extraction.md)
- the current `packages/graph`, `compiler`, `procedural-wgsl`, and
  `runtime-webgpu` contracts
- the root [ROADMAP.md](../../../ROADMAP.md)

The latest instanced-draw brief is a reasonable internal extraction and should proceed
as a behavior-preserving refactor. It should not define the final public graph API. Its
eventual graph-facing form belongs to the generic draw-command model described below.

## Current architectural strengths

The following decisions should be retained:

- **Typed graph IR as canonical authoring data.**
- **Backward dependency slicing per requested output or kernel.**
- **Stable WGSL module IDs and source linking.**
- **Self-describing WGSL for user-authored value functions.**
- **Schema-driven ports, parameters, forms, help, and serialization.**
- **Parameters promotable to input ports.**
- **Groups as reusable subgraphs with explicit interfaces.**
- **Host scheduling separate from portable procedural meaning.**
- **Frame order inferred from resource dependencies, with explicit cross-frame history.**
- **CPU evaluators optional and useful, but not a restriction on GPU capability.**
- **The graph editor, scene editor, MCP, and serialized documents sharing the same IR.**

The field-function layer is already close to the desired elemental model. The largest
changes are below that layer: types, resources, shader entry points, and GPU commands.

## Structural problems to correct

### 1. `NodePrimitive` conflates functions and structural nodes

Every primitive currently requires a `WgslSourceRef`. This forces structural nodes such
as `buffer.persist`, `stage.vertex`, and `target.display` to advertise fake or placeholder
WGSL modules. It also makes resolver coverage tests treat runtime commands as shader
functions.

Replace the single implementation shape with a discriminated union:

```ts
type PrimitiveImplementation =
  | { kind: 'wgsl-function'; moduleId: string; entry: string }
  | { kind: 'group'; definition: GroupDefinition }
  | { kind: 'host-input'; binding: HostBinding }
  | { kind: 'resource'; descriptor: ResourceDescriptor }
  | { kind: 'kernel'; stage: 'vertex' | 'fragment' | 'compute' }
  | { kind: 'command'; command: GpuCommandKind }
  | { kind: 'sink'; sink: PresentationSinkKind };
```

Common schema and metadata remain shared. Compilation and execution dispatch by
implementation kind.

### 2. The type system is too closed for WebGPU

The current value set is limited to `f32`, four vector forms, and `bool`. Resource and
pipeline types are a closed string union. Maximum WebGPU access requires a structural
type algebra:

```ts
type TypeRef =
  | { kind: 'scalar'; scalar: 'bool' | 'i32' | 'u32' | 'f32' | 'f16' }
  | { kind: 'vector'; element: ScalarType; width: 2 | 3 | 4 }
  | { kind: 'matrix'; element: 'f32' | 'f16'; columns: 2 | 3 | 4; rows: 2 | 3 | 4 }
  | { kind: 'array'; element: TypeRef; length?: number }
  | { kind: 'struct'; id: string; fields: StructField[] }
  | { kind: 'buffer'; element: TypeRef; access: BufferAccess; usages: BufferUsage[] }
  | { kind: 'texture'; dimension: TextureDimension; sample: SampleType;
      format?: GPUTextureFormat; access?: StorageTextureAccess }
  | { kind: 'sampler'; filtering: boolean; comparison: boolean }
  | { kind: 'mesh'; vertex: StructType; index?: ScalarType }
  | { kind: 'command'; command: GpuCommandKind };
```

This unlocks integer and bit operations, matrices, typed particle records, arbitrary
vertex layouts, storage textures, cubemaps, depth textures, samplers, atomics, indirect
arguments, and user-defined varyings without adding a new string type for every feature.

Serialization should use canonical structural objects. The editor may display short
aliases such as `vec3f` without storing the alias as the semantic type.

### 3. Coordinate spaces are domain-closed

`CoordinateSpace` currently hardcodes planet-specific names into the generic graph
package. Keep coordinate checking, but make spaces open nominal identifiers registered
by libraries:

```ts
type SemanticTag = string; // e.g. "space:world", "space:body", "unit:m", "color:linear-srgb"
```

Ports may carry multiple semantic tags. Libraries register explicit conversion
primitives. The core validates equality and known conversions without knowing planets,
colors, audio units, or application-specific frames.

### 4. Static collections and runtime buffers are conflated

The design currently proposes one `list<T>` that may either unroll static edges or loop
over a storage buffer. These have materially different lifetime, indexing, and codegen
semantics.

Use separate concepts:

- `tuple<T>` or `staticList<T>` for compile-time fan-in and unrolling.
- `array<T, N>` for fixed-size shader values.
- `buffer<T>` or `span<T>` for runtime GPU collections.
- `flow.map/reduce/forEach` groups over a declared collection domain.

This makes performance and legality visible instead of changing lowering based on what
happens to be connected.

### 5. Execution roots are duplicated

`GraphDocument.outputs`, `GraphDocument.consumers`, explicit `stage.*` nodes, and
`target.*` sinks overlap. This has already required synthetic outputs and consumer
derivation.

Use one rule:

- **Exports** name reusable graph values for APIs, groups, tests, and external consumers.
- **Kernel/pass/sink nodes** are execution roots.
- Runtime execution is derived only from reachable command and sink nodes.

Retire `ProceduralConsumer` side metadata after compatibility migration. `mesh-gen` is
not a WebGPU shader stage; it is a compute-kernel role or a standard-library group.

### 6. Runtime planning recognizes one hardcoded pipeline shape

`PipelineGraphPlan` currently searches for a geometry source, `buffer.persist`,
`stage.vertex`, `stage.fragment`, and `target.display` in a fixed chain. This proves a
vertical slice but cannot be the final planner.

The final planner should:

1. find sink and pass roots;
2. derive ordered commands within each pass;
3. derive resource read/write sets;
4. validate hazards and stage constraints;
5. topologically order passes;
6. allocate resources from descriptors and lifetime policy;
7. compile only kernels reachable from those passes;
8. encode commands.

No planner branch should know about planes, cube faces, vegetation, particles, or
ShaderToy.

## Final layered graph form

The final system is one graph with four semantic layers. Layers can be visually nested
or collapsed, but remain ordinary typed nodes and edges.

### Layer 1: value/function graph

Pure and mostly stage-independent operations:

```text
constructors, swizzles, casts
arithmetic, comparison, select
vector and matrix operations
noise, SDF, color conversion
coordinate transforms
sampling and domain mapping
user WGSL functions
```

Convenience behavior is expressed as groups. Examples:

```text
normalDisplace = add(position, mul(normal, height))
spherify       = normalize(position)
remap          = add(outMin, mul(div(sub(x, inMin), sub(inMax, inMin)),
                                 sub(outMax, outMin)))
```

### Layer 2: shader kernel graph

A kernel gives a value graph an invocation domain and legal built-ins:

- **Vertex:** vertex/instance indices, vertex attributes, resource reads, typed varyings.
- **Fragment:** typed varyings, position/front-facing/sample built-ins, derivatives,
  discard, color/depth outputs.
- **Compute:** global/local/workgroup IDs, storage reads/writes, atomics, barriers.

Kernel interfaces use structs, not the opaque `varyings` type. Interpolation attributes,
locations, built-ins, and stage restrictions are reflected in the schema.

Stage-specific operations declare capability constraints. For example, derivatives are
fragment-only; workgroup barriers are compute-only; position output is required for a
rendering vertex entry.

### Layer 3: resource and command graph

Elemental resources:

- buffer descriptor/view
- texture descriptor/view
- sampler
- imported asset binding
- transient/persistent/history lifetime

Elemental commands:

- `compute.dispatch`
- `compute.dispatchIndirect`
- `render.draw`
- `render.drawIndexed`
- `render.drawIndirect`
- buffer/texture copy
- clear
- query/resolve where supported

Elemental passes:

- compute pass with ordered dispatch commands
- render pass with typed color/depth attachments and ordered draw commands
- copy pass

Draw order within one render pass is explicit because it affects blending and depth.
Pass order is inferred from resource dependencies. This is simpler and more correct than
trying to infer both with one DAG.

### Layer 4: host and presentation graph

Host inputs declare their binding context:

- session/global
- playback/frame
- interaction surface
- write target
- read resource/channel
- scene/camera
- dispatch/draw invocation

Presentation sinks are thin adapters:

- canvas/display
- mesh inspector
- buffer inspector
- file/export
- CPU readback
- audio output

Preview sinks must not define engine semantics. `target.mesh`, for example, should
eventually become a mesh-inspector sink over a real mesh resource rather than also
defining tessellation.

## Elemental WebGPU surface

The graph should expose WebGPU declaratively, not reproduce the imperative JavaScript API
one method per node. The minimum complete surface is:

### Values and memory

- WGSL scalar, vector, matrix, array, and struct types.
- Typed uniform, storage, vertex, index, and indirect buffer views.
- Read-only/read-write access and resource usage derived from edges.
- Texture dimensions, sample types, formats, mip levels, array layers, and storage access.
- Filtering, non-filtering, and comparison samplers.
- Atomics and workgroup-local values in legal compute contexts.

### Shader behavior

- User-defined WGSL functions and groups.
- Typed entry-point structs and built-ins.
- Texture sample/load/store and buffer load/store.
- Derivatives, discard, interpolation, depth output, and multiple fragment outputs.
- Specialization/override constants and compile-time parameters.
- Explicit workgroup size.

### Commands and state

- Direct and indirect draw/dispatch.
- Vertex/index/instance buffer bindings.
- Raster topology, culling, front face, strip index format.
- Depth/stencil, blending, write masks, multisampling.
- Multiple color attachments as a list, not a separate `target.mrt` concept.
- Copy, clear, and readback.
- Timestamp/occlusion query support when a runtime capability is available.

### Capability and validation model

WebGPU features and limits vary by adapter. Nodes declare required capabilities; the
document remains portable and the runtime reports unsupported requirements before
execution. Validation should cover:

- type and semantic compatibility;
- stage legality;
- binding visibility and access;
- resource usage and read/write hazards;
- attachment format compatibility;
- pass cycles and history edges;
- adapter features and limits.

## Simplify and decompose the current catalogue

| Current/planned concept | Recommended final form |
|---|---|
| `math.*`, `vector.*`, noise, color | Keep as atomic value functions; generate typed variants where mechanical |
| `transform.*` | Keep as groups over elemental value/matrix functions |
| `geometry.fullscreenPlane` | Preset/group over grid domain + plane mapping; no dedicated engine path |
| `geometry.plane` | Split topology/domain from surface mapping and rigid transform; retain as convenience group |
| `geometry.cubeSphere` | Group: cube-face domain + mapping + normalize |
| `geometry.tessellate` / mesh-gen | Group over invocation domain + compute kernel + typed vertex/index buffer writes |
| `faceCount` and face-param scanning | Replace with explicit invocation-domain and instance data |
| `geometry`, `mesh`, vertex/index buffers | One typed `MeshResource` composed of buffer views |
| `buffer.vertex/index/storage/uniform` | One typed buffer descriptor plus views/usages |
| `buffer.persist` | Generic lifetime/cache policy, not geometry-specific and not WGSL |
| `buffer.pingPong` | Generic history resource or previous-frame edge for buffers and textures |
| `image` vs `texture` | One texture resource model with CPU/GPU views and asset provenance |
| `bindGroup` port | Remove from normal authoring; derive layouts from resource ports |
| opaque `varyings` | Typed struct with location/builtin/interpolation metadata |
| `stage.meshGen` | Remove; use `stage.compute` plus a mesh-generation group |
| `target.depth` | Texture attachment with a depth format |
| `target.mrt` | Render pass with a list of color attachments |
| `target.storage` | Storage buffer or storage texture resource |
| `target.mesh` | Mesh inspector/export sink over a `MeshResource` |
| `ProceduralConsumer` metadata | Replace with explicit kernel/pass/sink roots |
| ShaderToy-specific `host.i*` nodes | Keep aliases/presets over generic host-binding semantics |
| vegetation consumer | Group over field evaluation + compute dispatch + append/compact buffer + instanced draw |
| particle system | Group over emitter/update kernels + history buffer + instanced draw |

## Geometry and mesh decomposition

Geometry should be expressed through three independent concepts:

1. **Invocation/topology domain:** range, grid, triangle grid, indexed topology, instance
   range, imported index stream.
2. **Attribute mapping:** invocation data to position, normal, UV, tangent, color, or
   arbitrary user attributes.
3. **Materialization:** evaluate in a vertex kernel without storing a mesh, or evaluate in
   compute and write a `MeshResource`.

The same surface graph can therefore drive:

- procedural vertex generation (planet Mode A);
- stored mesh generation (preview, collision, export);
- CPU sampling for tests;
- bounds generation;
- scatter/placement.

This removes the current conceptual split between geometry nodes and surface nodes while
preserving both execution modes.

Normals should also be compositional:

- analytic normal supplied by the mapping;
- transformed normal;
- finite-difference normal over a position field;
- derivative/cross-product normal where stage-legal;
- imported normal attribute.

`normalDisplace` should not silently imply normal recomputation.

## Multi-mesh rendering

Multiple meshes sharing one output are not a special target feature:

```text
MeshResource A + material A + transform A -> render.drawIndexed --\
MeshResource B + material B + transform B -> render.drawIndexed ----> render.pass
instance buffer + template mesh             -> render.drawIndexed --/       |
                                                                              v
                                                                       display sink
```

The render pass owns attachments and load/store policy. Draw commands own pipeline state,
bindings, ranges, instances, and ordering. A `list<DrawCommand>` is an ordered command
collection, not ordinary multi-fan-in on a value port.

## Particle systems

A particle system is an integration group, not a new engine subsystem:

```text
host.deltaTime + emitter + previous ParticleBuffer + force subgraph
                              |
                              v
                    compute.dispatch(update)
                              |
                              v
                    next ParticleBuffer
                              |
                    history/ping-pong edge
                              |
                              v
template mesh/billboard + ParticleBuffer -> render.drawIndexed(instanced)
```

The generic prerequisites are:

- user-defined struct buffers;
- compute read/write bindings;
- dispatch domains;
- persistent/history resources;
- atomics and optional compaction;
- direct then indirect instance counts;
- vertex-stage instance-buffer reads;
- render draw/pass commands.

The first particle sample should use fixed capacity and one invocation per slot. Emission,
recycling, compaction, sorting, collisions, and indirect drawing are later graph
compositions. Planet-scale systems use body-local or camera-relative positions.

The instanced-draw extraction brief remains useful as an internal seam. The extracted API
should accept existing GPU buffers and avoid CPU ownership assumptions, as the brief
already requires. Do not promote that tactical consumer API directly into the graph IR;
promote the later generic draw command.

## Feedback and state

Feedback is not texture-specific. Generalize frame-graph targets into resources with
versioned access:

```text
read(resource, version = current | previous)
write(resource, version = next)
```

The executor realizes previous/next versions with ping-pong textures or buffers. The
same mechanism supports:

- ShaderToy buffer feedback;
- particle state;
- cellular automata;
- temporal accumulation;
- iterative solvers;
- GPU-generated instance streams.

This is simpler than separate `buffer.pingPong`, texture feedback, and particle-state
systems.

## Effects, purity, and caching

`pure` and `deterministic` booleans are insufficient for scheduling. Derive or declare an
effect summary:

```ts
interface EffectSummary {
  reads: ResourceAccess[];
  writes: ResourceAccess[];
  usesTime?: boolean;
  usesInteraction?: boolean;
  usesAtomics?: boolean;
  usesBarrier?: boolean;
  mayDiscard?: boolean;
  deterministic?: boolean;
}
```

The compiler uses effects for stage validation. The runtime uses resource accesses for
ordering, hazards, invalidation, and caching. Most summaries should be inferred from
ports and built-ins, with explicit metadata only for behavior not visible structurally.

## Custom-code escape hatches

Maximum flexibility cannot depend on waiting for a dedicated node for every WGSL or
WebGPU feature. Provide two controlled extension points:

1. **Custom WGSL function:** current self-describing function mechanism, for pure value
   logic.
2. **Custom kernel/pass definition:** declared entry stage, typed bindings, outputs,
   workgroup size or render interface, capability requirements, and WGSL source.

Both must reflect into the same type and validation system. Raw arbitrary JavaScript GPU
commands should remain plugin/runtime extensions rather than portable graph documents.

## Package responsibilities in the final form

### `@world-lab/graph`

- structural `TypeRef`;
- primitive-kind union;
- graph/group/kernel/pass/resource schemas;
- open semantic tags;
- structural validation and serialization.

### `@world-lab/compiler`

- value slicing and group lowering;
- WGSL reflection and linking;
- kernel interface generation;
- stage/capability/effect validation;
- bind-group and pipeline-layout derivation;
- compiled kernel bundle output.

### `@world-lab/procedural-wgsl`

- atomic value-function modules;
- reusable group definitions;
- no runtime pass or resource ownership.

### `@world-lab/runtime-webgpu`

- adapter capability negotiation;
- resource realization and lifetime management;
- pass ordering and hazard validation;
- pipeline/bind-group caching;
- command encoding and readback;
- no domain-specific planner branches.

### `@world-lab/runtime-cpu`

- typed value interpreter where evaluators exist;
- CPU resource views and host services;
- reference implementations and parity tests;
- explicit unsupported diagnostics for GPU-only operations.

### `@world-lab/graph-editor`

- editor projections for every primitive kind;
- nested value/kernel/pass views;
- resource and capability diagnostics;
- generic buffer/texture/mesh inspectors;
- no renderer-specific execution logic.

## Roadmap realignment

### Foundation 1: freeze the elemental contracts

Before adding more graph-facing consumers:

- adopt the primitive implementation union;
- adopt structural `TypeRef`;
- define typed structs and open semantic tags;
- distinguish static collections from runtime buffers;
- define exports versus execution roots.

Compatibility adapters can preserve existing documents and primitive registrations.

### Foundation 2: generic resources and frame execution

- generic buffer/texture/sampler descriptors;
- inferred read/write usage;
- transient, persistent, and history lifetimes;
- buffer and texture feedback;
- generic pass DAG and hazard validation.

This supersedes texture-only frame-graph assumptions.

### Foundation 3: generic kernels

- typed vertex/fragment/compute interfaces;
- built-in inputs and stage restrictions;
- arbitrary resource bindings;
- workgroup sizing and dispatch domains;
- typed varyings and fragment outputs.

This closes the Mode A vertex-displacement gap and provides the compute basis for
particles and mesh generation.

### Foundation 4: command graph

- draw, draw-indexed, dispatch, and indirect variants;
- render/compute/copy passes;
- attachment and pipeline-state descriptors;
- ordered draw collections;
- runtime pipeline and binding caches.

The current instanced-draw extraction is a useful internal precursor.

### Standard-library reconstruction

Rebuild specialized capabilities as groups and samples:

1. fullscreen effect;
2. graph-generated stored mesh;
3. procedural vertex-displaced grid;
4. multi-mesh render pass;
5. fixed-capacity particle system;
6. vegetation placement and instancing;
7. ShaderToy feedback;
8. planet patch rendering.

Each sample should use the same planner and executor. Adding one must not add a new
domain-specific executor.

### Audio graphs (parallel track)

Not Foundation-sequence dependent — the IR is already domain-agnostic (`audio` is a
`ResourceDataType` since M8) and audio's block consumer is CPU-only, sibling to `meshGen`/
vegetation, not a GPU executor. See [audio-graphs.md](./audio-graphs.md) for the full spec; its
phases place relative to this roadmap as follows:

- **Phase A** (block consumer, mic/file input, one `evalCPU` primitive) has no Foundation 2-4
  dependency at all — it only needs Foundation 1's contracts (primitive registration, `evalCPU`,
  open semantic tags for `space: 'time'` frames), already landed. Can be briefed and start
  independently, in parallel with Foundation 2/3/4, whenever it's prioritized.
- **Phase B** (multi-resolution spectrograms, overlap-add) needs a persistent-state-between-blocks
  model for sliding windows. This reuses the *lifetime concept* Foundation 2 generalizes
  (`ResourceLifetime.transient/persistent/history`, F2.1 ✅ landed), not `runtime-webgpu`'s GPU
  frame-graph itself — audio's persistent state is CPU-side, package-local to `runtime-cpu`. F2.1
  alone is sufficient to design Phase B's state model against; no need to wait for F2.3/F2.4.
- **Phase C** (optional GPU spectrogram visualization) is the one part of this spec that is a real
  Foundation 2 consumer — it needs actual GPU resource realization (F2.3) and a generalized
  executor (F2.4) to bind a spectrogram buffer as a texture input, the same "resource GPU binds"
  gap tracked in `pending_issues.md`. Do not start Phase C before F2.3 lands.

## Brief and documentation impact

### Continue

- **Instanced mesh draw extraction:** continue as an internal refactor, keeping GPU-buffer
  ownership external and behavior unchanged.
- **Mesh preview UX:** independent presentation work; it does not constrain engine design.
- **GPU mesh-gen fixes:** retain as correctness improvements to the current vertical slice.

### Reframe before creating follow-on briefs

- Graph-driven particle compute should be a generic typed-buffer compute-dispatch brief.
- Particle feedback should be generic resource history for buffers and textures.
- Graph-authorable instancing should be a generic render draw/pass brief.
- Multi-mesh rendering should consume the same draw/pass work, not get a separate target.
- Planet Mode A should consume generic vertex kernels, instance buffers, and draw commands.

### Documentation cleanup required

Some documents preserve superseded statements:

- `runtime-and-tessellation.md` says the graph has no stage knowledge, while
  `pipeline-as-graph.md` later makes stages explicit.
- `inputs-cpu-and-resources.md` alternates between runtime-only target descriptors and
  graph-authored target nodes.
- `primitive-library.md` mixes stale implementation status with intended taxonomy.
- `GraphDocument.consumers` remains documented even though explicit pipeline nodes are now
  the intended authoring model.

After this direction is approved, one ADR should become authoritative and the older
documents should link to it with explicit supersession notes rather than each carrying a
partially updated model.

## Generality acceptance matrix

The architecture is ready when these are compositions over the same elemental kernel:

| Capability | Required composition | Forbidden special case |
|---|---|---|
| ShaderToy image | fullscreen geometry + fragment kernel + render pass | dedicated fullscreen executor |
| Multi-pass effect | texture resources + pass dependencies + history | ShaderToy-only buffer model |
| Stored displaced mesh | compute domain + mapping + buffer writes | surface ID switch |
| Imported mesh | asset-bound mesh buffers + draw command | separate imported-mesh renderer |
| Multi-mesh scene | ordered draw commands + shared attachments | one target type per mesh count |
| Particles | struct buffer + compute + history + instanced draw | particle-only scheduler |
| Vegetation | field graph + compute append + instanced draw | vegetation-only render pipeline |
| Planet | instance buffer + procedural vertex kernel + render passes | planet branch in graph core |

## Decision summary

1. Keep one graph and one editor, but use distinct primitive implementation kinds.
2. Replace closed type strings with a structural WGSL/resource type algebra.
3. Make semantic spaces open and library-defined.
4. Separate static collections from runtime buffers.
5. Make explicit kernel/pass/sink nodes the only execution roots.
6. Model mesh generation as compute composition, not a pseudo shader stage.
7. Model multi-mesh and particles through generic draw, dispatch, resource, and history
   primitives.
8. Derive bind groups, usage flags, and pass order from typed resource edges.
9. Keep convenience nodes as groups; keep the atomic engine surface small.
10. Provide custom function and custom kernel escape hatches for features not yet covered by
    library nodes.

This form preserves every planned capability while reducing the number of privileged
subsystems. It also makes the strongest interpretation of the product goal practical:
users can work at a high level with groups such as cube-sphere, vegetation, or particles,
then open those groups and reach the elemental WebGPU resources, kernels, and commands
underneath.
