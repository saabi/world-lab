# Brief — Node-model foundation (resource ports · list<T> · groups · role/contract)

**Type:** foundational IR/compiler (the R1 keystone, folded) · **Packages:**
`@virtual-planet/graph` (IR), `@virtual-planet/compiler` (group inline-expansion) ·
**Depends on:** the current IR/compiler ✅ · **Design authority:**
[pipeline-as-graph.md](../pipeline-as-graph.md),
[node-model-design-notes.md](../node-model-design-notes.md),
[pipeline-realignment-report.md](../pipeline-realignment-report.md) · **Contract author:**
Opus · **Recommended executor:** Opus (foundational, headless), built in the slices below.

## Objective

Extend the node model with the four foundations everything else (geometry/buffer/stage/
target nodes, swap UX, decomposition into groups, dynamic lights) needs. **Additive** —
the existing value-port field graph + ~45 primitives + compiler are unchanged underneath.
Build in **independent, separately-gated slices** (each green on its own).

## Slice 1 — Resource ports (graph) — ✅ DONE (`<this commit>`)

**Reality check (workflow caught the original over-design):** the IR **already** has
`DataType = ValueDataType | ResourceDataType` (M8 added `image`/`mesh`/`audio`), and
`compatibleDataTypes` already validates edges by equality (+ a `vec2f→vec3f` promotion). So
resource ports do **not** need a parallel `resource:` field or new validation — just
**extend the type union**. Done: added `PipelineResourceType`
(`geometry`/`vertexBuffer`/`indexBuffer`/`renderTarget`/`bindGroup`/`storageBuffer`), kept
`ResourceDataType` (external inputs) clean for `ResourceDependency`. The existing
equality-based validation already gives geometry↔geometry ✓ / geometry↔f32 ✗ / cross-kind ✗.
**Gate met:** graph 66/66; union extension broke no exhaustive switches across packages.

## Slice 2 — Role / contract metadata + swap families + help (graph) — ✅ DONE

- **Mechanical contract:** `contractOf(primitive): string` — normalized port signature
  (e.g. `f32,f32->f32`). Includes coordinate space when present (e.g. `vec3f@body_pos`).
  Derived, not authored. **Implemented** in `contract.ts`.
- **Role:** optional `role?: string` on `PrimitiveMetadata` (e.g. `'positionTransform'`,
  `'colorSpace'`). Authored where a *semantic* family matters.
- **Swap families:** `swapFamily(primitive)` = role if set, else contract. `listSwapFamily(id)`
  returns same-family primitives.
- **Help/usage:** optional `help?` / `usage?` on `PrimitiveMetadata` — the **didactic**
  mechanism that **replaces aliases**. `math.min` help: "SDF union"; `math.max` help:
  "SDF intersection". No alias nodes.
- **Gate met:** graph 76/76; `add`/`multiply`/`min`/`max`/`subtract`/`divide` share contract
  `f32,f32->f32`; `swapFamily` groups them; role-tagged test primitives group across differing
  signatures; fe 0 errors.

(Editor "Change operation ▸" + palette collapse + tooltips consume this —
node-model-design-notes §C. The editor wiring is a later graph-editor task.)

## Slice 3 — Node groups = self-describing **functions** (graph + compiler) — ✅ DONE

- **Two forms, round-tripping:** JSON **subgraph** (subgraph description mapped to exposed ports)
  ↔ generated **WGSL function + frontmatter** (the compiled form).
- **Codegen = code-generate a function**, *not* inline-expand: emits
  `fn group_x(…) -> … { … inner_fn(…) … }` calling its dependencies, which are declared in
  frontmatter using `@use` annotations. The **existing linker** resolves function deps +
  tree-shakes — **no new inline pass**.
- **IR:** Added `GroupDefinition`, `GroupInterface` and input/output mappings to `@virtual-planet/graph`
  `types.ts`. Implemented `groupToFunction(def)` in `@virtual-planet/compiler` `groupCodegen.ts`
  to handle topological sort, inner variable assignments, argument bindings, and YAML frontmatter.
- **Gate met:** `g.normalDisplace` compiled to a valid WGSL function calling `multiply`/`add` with
  `// @use math.multiply` and `// @use math.add` directives; correctly parsed and loaded via
  `loadWgslPrimitive`; successfully compiled and linked within a graph via `compileGraph` + `textLinker`.
  All compiler/graph test packages green.

## Slice 4 — `list<T>` ports + lowering (graph + compiler) — ✅ DONE

- **Compatibility:** Added `ListDataType` union (`list<f32>`, `list<vec2f>`, etc.) to `DataType` in `@virtual-planet/graph`.
  Updated `compatibleDataTypes` to allow connection from `T` to `list<T>` and `storageBuffer` to `list<T>`.
- **Lowering:** Extended codegen in both `@virtual-planet/compiler` (`groupToFunction`) and `@virtual-planet/runtime-webgpu` (`emitGraphEval`):
  - **Static case:** Multiple edges connected to a `list<T>` input are lowered by unrolling them into an inline WGSL array constructor:
    `array<T, N>(val1, val2, ...)`
  - **Dynamic case:** A single edge from a `storageBuffer` is lowered by declaring an accumulator variable and emitting a WGSL `for` loop:
    `for (var i: u32 = 0u; i < arrayLength(&buf); i = i + 1u) { accum = accum + primitive(buf[i]); }`
- **Gate met:** A `list<f32>` input fed 3 edges compiles to an unrolled inline array expression; fed a `storageBuffer` compiles to a `for` loop with `arrayLength(&buf)`. All runtime-webgpu and ports unit tests green.


## Decomposition follow-on (after Slice 3)

With groups, refactor the audited decomposables (parity-preserving): `math.remap → group`,
`sdf.opSubtract → group(max + negate)`. **No aliases** — `sdf.opUnion`/`opIntersect` are
redundant with `math.min`/`max`; deprecate them in favour of `min`/`max` + **help tooltips**
("SDF union/intersection"). Keep `terrain.*` atomic (harvested at parity — do **not**
decompose). The elemental atoms (`add/subtract/multiply/divide/min/max`) are **already
added** ✅ as building blocks.

## Out of scope

The geometry/buffer/stage/target node *families* (consume this foundation — separate
briefs); the editor swap/group UI (graph-editor); the pass-graph executor; GPU runner.
**No AST.** Each slice ships independently.

## Handoff

→ With resource ports + role/contract + groups + list<T>, the pipeline node families
([M-pipeline-nodes-s0](./M-pipeline-nodes-s0.md)), the swap UX, the decomposition refactor,
and dynamic-light lighting all become "just nodes/metadata" over this foundation.
