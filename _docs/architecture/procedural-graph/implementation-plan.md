# Implementation plan

**Status:** build plan · **Scope:** turns the [README §5 roadmap](./README.md#5-implementation-roadmap)
into concrete, dependency-ordered milestones with packages, deliverables, and test
gates. Part of the [Procedural Graph System](./README.md).

## Principles

- **Generic first.** Every milestone in Stages A–C is domain-agnostic and validated
  on a plane + primitives. No milestone waits on planets/terrain.
- **Independently shippable & testable.** Each milestone ends green on
  `npm run check` (tsc/svelte-check) and `vitest`, per repo convention. Packages
  live under `packages/*` (workspace), mirroring `@virtual-planet/schema`'s layout
  (`package.json` with `check`/`test`, `src/index.ts`, `tsconfig.json`).
- **CPU before GPU.** The compiler and primitives are proven through CPU evaluators
  and string-level WGSL assertions before any GPU pipeline exists, so most of the
  engine is testable headlessly.
- **Reuse what's here.** Build the IR on TypeBox (`@virtual-planet/schema`);
  generalize `fe/vite-wgsl.ts`'s include resolver into the linker; use
  `packages/subdivide` for the editor's split-pane layout; gate WGSL with the
  existing `fe/src/lib/planet/gpu/wgslCompile.test.ts` device harness.

## Package targets

```
packages/
  schema/            existing (TypeBox) — extended with graph node/port metadata
  graph/             NEW — Graph IR, ports (data + coordinate-space), validation, serialization
  compiler/          NEW — dependency slicing, WGSL codegen, module resolver, ShaderLinker
  procedural-wgsl/   NEW — reusable WGSL function modules (standard library)
  runtime-cpu/       NEW — frustum, pointer/picking, resource sampling, CPU eval host
  runtime-webgpu/    NEW — buffers, pipelines, bind groups, consumers, scheduler
  graph-editor/      NEW — reusable Svelte editor components
  mcp-server/        NEW — AI/agent access over the Graph IR
  subdivide/         existing — Svelte split-pane layout (reused by the editor UI)
apps/
  graph-editor/      NEW — standalone editor app (SvelteKit; canonical save = Graph
                     IR JSON; svelte/compiler only for the optional live-doc mode)
```

## Milestones

### Stage A — Typed graph foundation (generic core)

| # | Goal | Key deliverables | Test gate |
|---|------|------------------|-----------|
| **M0** ✅ | Scaffold packages | `graph`, `compiler`, `procedural-wgsl`, `runtime-cpu`, `runtime-webgpu`, `graph-editor`, `mcp-server` as workspaces with `check`/`test` stubs | `npm install` (root) links all; `npm run check -w …` green on stubs |
| **M1** ✅ | Graph IR on TypeBox | `GraphDocument`/`GraphNode`/`GraphEdge`/`Port` (data type **+ coordinate-space tag**), field types, validation + serialization in `packages/graph` | vitest: build a 2-node graph, round-trip serialize; **reject** a type-mismatched edge and a space-mismatched edge — **5/5 green** |
| **M2** | Primitives + CPU eval | `registerPrimitive`, `NodePrimitive` (schema, `evalCPU?`, `WgslSourceRef`); noise + math primitives with CPU evaluators | vitest: `evalCPU` determinism (perlin), `remap`/`clamp`/`smoothstep` numerics |
| **M3** | Self-describing WGSL | YAML-frontmatter + WGSL signature parse → merged primitive schema (loader in `compiler`) | vitest: load a `.wgsl` with frontmatter; assert merged schema == hand-written `definePrimitive` |

### Stage B — Compiler & linker

| # | Goal | Key deliverables | Test gate |
|---|------|------------------|-----------|
| **M4** | Dependency slicing + multi-output | backward slice from requested outputs → minimal sub-graph per consumer | vitest: request a subset; assert minimal node set; unrelated branch excluded |
| **M5** | WGSL gen + module resolver | `WgslModuleResolver` (stable IDs → sources; generalizes `vite-wgsl` resolution); emit reusable `fn …` per slice | vitest: compile a slice to a WGSL string; only needed functions/imports present |
| **M6** | ShaderLinker + WGSL tree-shake | minimal `ShaderLinker` (start from `vite-wgsl`'s recursive inliner, typed + dependency-ordered) | vitest: dead helper removed; **optional** real compile via `wgslCompile.test.ts` when a device exists |

### Stage C — CPU runtime + standalone editor (first usable product)

| # | Goal | Key deliverables | Test gate |
|---|------|------------------|-----------|
| **M7** | CPU runtime services | `runtime-cpu`: camera frustum (planes from view-proj), pointer→world ray, time | vitest: frustum planes & ray from known matrices |
| **M8** | Resource inputs | image/mesh/audio typed ports with CPU views (pixel array, attributes, FFT bands) | vitest: sample a pixel; read a mesh attribute; FFT band from a sample buffer |
| **M9** | Standalone editor | `apps/graph-editor` + `graph-editor` components (schema-driven palette/inspector, space-typed `PortView`, `ValidationPanel`); `subdivide` panes (+ ported scene-editor section chrome); **graph canvas via `@xyflow/svelte` behind a swappable adapter** (IR stays canonical); plane mapping primitive + CPU preview | manual/Playwright: connect ports (invalid rejected live), edit a param, see a CPU-evaluated field on a plane |
| **M9b** | Multi-level editing | `MarkupView` + `CodeView`; **canonical save = Graph IR JSON**; IR→Svelte **printer** (export, no compiler) + constrained-subset parser (editable import); primitive-code edits re-register & ripple; stable deterministic printers. *Optional/deferred:* sandboxed compile-and-run "live document" (the only mode needing `svelte/compiler` at runtime) | vitest: IR→markup→IR round-trip is identity on the declarative subset; `Player` renders exported markup (parse→IR→render) to the same output as the source IR; editing a primitive's WGSL updates its ports & flags broken edges |

### Stage D — GPU runtime & first generic consumers

| # | Goal | Key deliverables | Test gate |
|---|------|------------------|-----------|
| **M10** | runtime-webgpu | buffers/pipelines/bind groups; consumer abstraction; mesh-generation compute primitive (→ vertex/index) | render a plane mapping primitive to a GPU mesh in the editor |
| **M11** | Tessellation primitives | plane / cube-face / cube-sphere mapping primitives (compositions); scheduler consuming the CPU frustum service | cube-sphere mesh in editor; LOD scheduling stub culls off-frustum patches |
| **M12** | Vegetation consumer | dual-frequency fields, peak detection, coverage-vs-instance, metric coords; CPU candidate-gen first, then WGSL compute via the `patches/` streaming budget | vitest: deterministic candidate set per cell; instanced render of peaks |

### Stage E — Existing-renderer migration (adoption, gated)

| # | Goal | Key deliverables | Test gate |
|---|------|------------------|-----------|
| **M13** | Planet shaping graph | express the `PlanetShapingPipeline` node set as primitives; generate cube-sphere **and** surface-patch shaders from one graph | **route-parity test**: same body/camera/style → matching `RenderFrame`; lat/long debug grid stable under a tessellation sweep |

> M13 is **gated by [renderer-unification-plan.md](../../renderer-unification-plan.md)**:
> its contract work (explicit param/scale + coordinate-space types, parity tests,
> debug views) must land first. This gate governs *this consumer's adoption*, not
> Stages A–D, which proceed independently.

### Stage F — Collaboration, MCP, platform

| # | Goal | Key deliverables | Test gate |
|---|------|------------------|-----------|
| **M14** | Document & session model | server-backed `GraphDocument`/`GraphSession` store; patch-based editing; dirty state; temporary docs | apply patch; `409` on stale base; multi-tab broadcast |
| **M15** | MCP server | `mcp-server`: documents/sessions tools, primitive listing, compile/diagnostics; auth + scopes; audit log | list primitives & get/patch a session over MCP; scope enforcement rejects out-of-scope ops |
| **M16** | Embedded editor + shared surfaces | mount `graph-editor` in `apps/planet`; move cube-sphere **mapping** into a shared standard-library document | a cube-sphere mapping authored in standalone opens & edits in the planet app |
| **M17** | WebGPUToy | public sharing, presets, third-party primitive plugins, generated-WGSL inspection | (longer horizon) |

## Critical path & parallel tracks

```
M0 → M1 → M2 → M4 → M5 → M6 ─┐
                M2 → M3 ─────┤ (self-describing primitives, parallel)
M7, M8 (after M2) ───────────┤ (CPU runtime, parallel to compiler)
                             └→ M9 (first usable editor) → M9b (multi-level editing)
M9 → M10 → M11 → M12         (GPU + generic consumers)
M11/M13 require renderer-unification contracts → M13
M9 → M14 → M15 / M16 → M17   (collaboration & platform)
```

**Smallest end-to-end vertical slice** (proves the whole spine before breadth):
`M0 → M1 → M2 → M4 → M5 → minimal M9` — author a noise→remap graph on a plane and
see it CPU-evaluated in the editor. Then `M10` swaps the same graph onto the GPU
with no graph changes — the first proof that "the graph describes it, the consumer
runs it."

**Parallelizable once M2 lands:** self-describing WGSL (M3), CPU runtime (M7–M8),
and the procedural-wgsl standard library can grow on separate tracks; the editor
(M9) integrates them.

## Definition of done (per milestone)

1. `npm run check` and `vitest` green for every touched workspace.
2. New public surface documented in the relevant stream doc (link both ways).
3. No engine-level special-casing of any consumer (tessellation/terrain/vegetation
   remain primitives or compositions) — enforced by review against
   [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md).
4. If it touches WGSL, it compiles under `wgslCompile.test.ts` where a device is
   available.
