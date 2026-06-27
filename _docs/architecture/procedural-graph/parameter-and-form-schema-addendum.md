# Addendum — resources, host inputs & inspector boundaries

**Status:** architecture addendum · **Parent:**
[parameter-and-form-schema.md](./parameter-and-form-schema.md) · **Audience:**
Codex and other agents before **M9** (graph inspector), **M10** (GPU resource
bind), **M14** (resource document store), or any work that touches asset pickers,
pointer/time plumbing, or graph input ports.

> **Read the parent ADR first.** This addendum does not change the three-class
> model; it pins how **class 2** (host/runtime) and **resource ports** interact
> with the shared form generator so M9 does not fork a fourth parameter model.

---

## Decision (summary)

| Concern | Goes in `NodePrimitive.params` / `SchemaForm`? | Inspector UI | Owner milestone |
|---------|-----------------------------------------------|--------------|-----------------|
| Scalar authored params (`scale`, `octaves`, wrap mode enum) | **Yes** — TypeBox + `x-*` | `ParamForm` section | M3 ✅ / M9 |
| **Resource ports** (`image`, `mesh`, `audio`) | **No** — typed graph **input ports** | Port binding + asset picker | M9 UI; M14 persistence; M10 GPU |
| **Host inputs** (`time`, `pointer`, camera, frustum) | **No** — injected per frame | Read-only port row or host debug panel | M7 ✅ CPU services; M9 display |
| **Procedural inputs** (`uv`, `position`, …) | **No** — wired from upstream nodes | Canvas edges | M9 |
| Binary payloads (pixels, mesh buffers, PCM) | **Never** in params or graph JSON | N/A | Runtime resolver only |

**One inspector shell, two editing models:** params use the shared form generator;
inputs use a **port panel** (connections + optional asset binding). Do not teach
`SchemaForm` about textures, uploads, or pointer rays.

---

## What is already landed (do not re-design)

| Piece | Package | Notes |
|-------|---------|-------|
| `DataType` includes `'image' \| 'mesh' \| 'audio'` | `@virtual-planet/graph` | M8 ✅; edge validation is exact type match |
| `GraphDocument.resources?: ResourceDependency[]` | `@virtual-planet/graph` | Serializable **stubs** `{ id, type }` only — no bytes |
| CPU views + resolver | `@virtual-planet/runtime-cpu` | `ImageCpuView`, `MeshCpuView`, `AudioCpuView`, `createCpuResourceResolver` |
| `NodePrimitive.params: TSchema` | `@virtual-planet/graph` | M3 ✅; TypeBox object schema is param SSOT |
| `sectionsOf`, `x-section`, `x-scale-behavior`, `Unit` incl. `1/m` | `@virtual-planet/schema` | M3 ✅ |
| `SchemaForm.svelte` | `fe/` | Scalar widgets only; no resource widgets yet |

M8 explicitly excluded: decoding/loading, uploads, editor UI, GPU textures. Those
are **not** gaps to paper over inside `@virtual-planet/schema`.

---

## Resource inputs vs authored params

Resources are **inputs to the graph** (class 2), not per-node parameter values.
See [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md).

### Port carries the handle; params carry sampling options

Split concerns on primitives that consume assets:

```
sample.image
  inputs:
    image   : image          ← port (edge or asset bind)
  params:
    wrapU   : enum           ← TypeBox (repeat, clamp, mirror)
    filter  : enum           ← TypeBox (nearest, linear)
    channel : integer        ← TypeBox
```

The **asset** is whatever satisfies the `image` port at runtime. **How** to sample
it is authored params — same form generator, no special case.

### Document flow (target — brief-owned exact shape in M9/M14)

1. Author selects an image for an unconnected / bindable `image` port in the
   inspector.
2. Host ensures a `ResourceDependency { id, type: 'image' }` exists on
   `GraphDocument.resources` (stable id, serializable).
3. Host records the binding (exact mechanism is **M9 brief-owned** — options:
   edge from a `resource.image` source node, or a `portBindings` map on the node /
   document; do not invent a third storage bag without an ADR amendment).
4. Session startup: host decodes bytes → `CpuResourceBinding` →
   `createCpuResourceResolver` (M8 API). Graph document still has no pixels.
5. M10: same `id` → GPU texture/buffer bind in `runtime-webgpu`.

### Do not

- Add `image` / `mesh` / `audio` to `fieldKind` or `SchemaForm` as upload widgets.
- Store `Uint8Array`, `Float32Array`, or file blobs in `node.params` or
  `ParamValues`.
- Put resource pickers in M3 YAML `params:` frontmatter — YAML `params` remain
  **scalar WGSL signature parameters** only (per M3 brief).
- Extend `ParamSpec` or reintroduce a parallel param list (removed at M3).

---

## Host / runtime inputs (time, pointer, camera, …)

These are **not** form fields and **not** resource documents.

| Input | Typical exposure | Inspector behavior |
|-------|------------------|-------------------|
| `time` | Standard-library input primitive or implicit consumer bind | Read-only: "Host: time" |
| `pointer` / mouse | `runtime-cpu` projects screen → world ray | Read-only; optional debug overlay in standalone app |
| `camera`, `frustum`, `viewportSize` | Consumer / host injection | Host panels or read-only port metadata |
| Body context (`planetRotation`, radius) | Host merge at pack time | Not graph inspector scope |

Pointer is **not** a resource and **not** a param. If a graph needs mouse
interaction, wire an `input.pointer` (or similar) **port** whose value the host
fills each frame — same class-2 path as `time`.

Open question in [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)
(frustum/pointer as graph inputs vs services) remains valid; M9 may show both:
ports on primitives **and** services consumed by schedulers outside the graph.
Do not resolve that by stuffing pointer into `params`.

---

## Inspector architecture (M9 contract guidance)

`InspectorPanel` should compose **at least two regions** (chrome may reuse
`EditorParamSection` / `EditorVerticalTabs` from `fe/`):

```
┌─ Inspector ──────────────────────────────────────┐
│  Parameters   → ParamForm(schema, node.params)   │  ← class 1
│  Inputs       → PortBindingList                  │  ← class 2 + edges
│  Outputs      → read-only port metadata          │
└──────────────────────────────────────────────────┘
```

**`PortBindingList` responsibilities (M9 brief should pin):**

- Show each input port: name, `dataType`, `space`, connected edge or binding state.
- For value types: highlight compatible ports when dragging connections (existing
  `validateGraph` rules).
- For `image` / `mesh` / `audio`: when unconnected, offer **Bind asset…** (picker
  UI); when connected via edge, show source node; hide upload if edge present.
- For known host-sourced ports: read-only label, no fake editable number.

**`ParamForm` responsibilities:** unchanged from parent ADR — walk
`fields(primitive.params)`, `Value.Check` on commit, sections from
`sectionsOf(primitive.params)` (not from `PrimitiveMetadata`).

Public conceptual types for M9 briefs (names illustrative):

```ts
interface PortBindingState {
	portId: string;
	name: string;
	dataType: DataType;
	space?: CoordinateSpace;
	/** Edge from another node's output, document resource id, or host catalog id. */
	source?: { kind: 'edge'; edgeId: string }
		| { kind: 'resource'; resourceId: string }
		| { kind: 'host'; inputId: string };
}

interface NodeInspectorProps {
	primitive: NodePrimitive;
	params: Record<string, unknown>;
	inputs: PortBindingState[];
	onParamsChange: (next: Record<string, unknown>) => void;
	onPortBindingChange: (portId: string, binding: PortBindingState['source']) => void;
}
```

Keep `PortBindingState` in `graph-editor` (Svelte), not in `@virtual-planet/graph`,
unless a brief explicitly needs serializable binding shape in the IR.

---

## Optional future: `x-resource-ref` on param strings

If a primitive must reference a document resource **by id** without an `image`
port (rare — prefer ports), add a schema annotation in a **separate brief**:

```ts
export const X_RESOURCE_REF = 'x-resource-ref';
// value on field: 'image' | 'mesh' | 'audio'
// param value: ResourceDependency.id (string)
```

Widget: asset picker filtered by kind; validation: id exists in
`GraphDocument.resources` with matching `type`. **Not implemented** at M3/M8; do
not add until a concrete primitive needs it.

Distinct from `x-ref` (scene tree paths) — different resolver, different picker.

---

## Milestone ownership (avoid scope creep)

| Milestone | This addendum requires |
|-----------|------------------------|
| **M3** ✅ | Params only in TypeBox; no resource widgets in loader |
| **M9** | `InspectorPanel` = `ParamForm` + `PortBindingList`; no per-primitive handwritten inspectors; asset picker stub OK (inline file → session binding) before M14 |
| **M10** | GPU bind for `ResourceDependency.id`; no change to param schema |
| **M14** | Durable resource documents, upload, collaboration; `resources[]` ids resolve against store |
| **M13** | Planet shaping params stay class-1 graph params; host context merged at pack |

---

## Explicit anti-patterns (agents)

1. **Fourth param model** — e.g. `ResourceParamSpec`, YAML `resources:` on
   primitives, or inspector-only JSON parallel to `node.params`.
2. **SchemaForm upload control** — file input that writes bytes into params.
3. **Mouse as slider** — editable pointer components in the param form.
4. **Merging classes in `ParamValues`** — expanding to `unknown` or nested objects
   for assets; keep scalar JSON-serializable params.
5. **Svelte in `graph` / `compiler`** — asset UI stays in `graph-editor` / `fe/`.
6. **WGSL AST for frontmatter** — unchanged from WGSL ADR; resource policy does not
   change signature reading.

---

## Related docs

| Doc | Relationship |
|-----|--------------|
| [parameter-and-form-schema.md](./parameter-and-form-schema.md) | Parent ADR — three classes, form generator |
| [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) | Input categories, CPU services, resource port semantics |
| [briefs/M8-resource-inputs.md](./briefs/M8-resource-inputs.md) | Landed graph + runtime-cpu surface |
| [editor.md](./editor.md) | Inspector shell, schema-driven palette |
| [collaboration-and-mcp.md](./collaboration-and-mcp.md) | Resource documents vs graph documents |
| [briefs/M3-self-describing-wgsl.md](./briefs/M3-self-describing-wgsl.md) | YAML `params` = scalar signature params only |

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-27 | Initial addendum: resource/host input vs param form boundaries, inspector two-panel model, milestone ownership, anti-patterns for M9+ |
