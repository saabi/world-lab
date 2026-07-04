# Preview monitors (TouchDesigner-style probes)

**Status:** architecture spec (proposed) · **Scope:** temporary, editor-scoped preview
taps on arbitrary output ports without adding `target.*` sink nodes. Part of the
[Procedural Graph System](./README.md).

## Summary

Authors debugging graphs should be able to **monitor any previewable output port** —
right-click → viewer — without mutating the authored `GraphDocument` with ghost sinks.
Monitors are **read-only observation points** (TouchDesigner viewers), distinct from
**execution roots** (`target.display`, `target.mesh`, `doc.outputs`).

The buffer-list preview model ([`M-preview-buffer-list.md`](./briefs/M-preview-buffer-list.md) ✅)
already routes `PreviewBuffer` entries to the correct panel via `previewFamily`. This spec
adds **probes**: session- or artifact-scoped `PortRef` sources unioned into that enumeration,
reusing `evaluateGraphOutput`, GPU/effect panels, and mesh preview paths unchanged.

## Problem

Today preview buffers come only from **authored surfaces**:

| Source today | How it appears |
|--------------|----------------|
| `doc.outputs` | Named value / field outputs |
| `target.display` / pipeline sinks | Image via incoming colour/texture port |
| `target.mesh` | Geometry-family mesh preview |

To inspect an **intermediate** port (e.g. noise before remap, a `vec3f` normal mid-chain),
authors must add a sink or declare an output — cluttering the graph, affecting execution
roots, markup export, and MCP views.

`M-preview-buffer-list.md` explicitly deferred *“inspecting arbitrary intermediate node
outputs”* as follow-on **node-probe preview**. Port context menus today only offer
**connect compatible node** (`GraphNodeView.svelte`), not monitor.

## Design fit

| Concern | Approach |
|---------|----------|
| Observe port `A.out` | `PreviewProbe { source: PortRef }` in **editor chrome** |
| Render | Existing `PreviewZone` + family → panel routing |
| CPU field eval | `evaluateGraphOutput(graph, portRef, ctx)` (already slices backward) |
| GPU / pipeline field | `EffectPreviewPanel` / `GpuPreviewPanel` with `output = portRef` |
| Mesh mid-chain | Mesh panel over local slice (no `target.mesh` node required) |
| Saved shipping graph | Unchanged `GraphDocument` — probes optional in `GraphArtifact` |
| Promote to deliverable | Explicit **Promote to output** → `doc.outputs` or real sink |

Monitors must **not** register in `discoverExecutionRoots`, `compileGraph` consumers, or
markup export.

## Monitors vs sinks vs outputs

| | Monitor (probe) | `doc.outputs` | `target.display` / `target.mesh` |
|--|-----------------|---------------|----------------------------------|
| Lives in `GraphDocument` | No | Yes | Yes |
| Execution root | No | Sometimes | Yes |
| Affects compile plan | No | Sometimes | Yes |
| Markup / MCP export | No | Yes | Yes |
| User intent | Debug / inspect | Named API surface | Render / deliverable |

**Rule:** monitors **observe**; targets **execute**.

Do **not** implement monitors as invisible `preview.fieldSink` nodes — that pollutes
execution-root discovery and undo history.

## Data model

### `PreviewProbe` (editor scope)

```ts
/** Editor / artifact chrome — never required in bare GraphDocument. */
interface PreviewProbe {
  id: string;                    // stable uuid; preview buffer id
  source: PortRef;               // monitored **output** port
  label?: string;                // default: `${nodeLabel}.${portName}`
  familyOverride?: PreviewFamily;
  pinned?: boolean;              // keep in list when pane unfocused
  paused?: boolean;              // stop eval (TD viewer pause)
}
```

### Persistence tiers

| Tier | Storage | Default behavior |
|------|---------|------------------|
| **Session** | `StoredEditorChrome` (`layoutStorage.ts`) | Cleared on new document |
| **Per-document** | `GraphArtifact` next to `layout` | Travels with saved graph file |
| **Never** | `GraphDocument.nodes` / `edges` | Keeps IR clean for embed / planet / MCP |

Recommended default: **session-only** probes; opt-in **save probes with document** via
artifact field `probes?: PreviewProbe[]`.

### Enumeration

Extend preview buffer discovery:

```ts
function enumeratePreviewBuffers(
  doc: GraphDocument,
  probes?: readonly PreviewProbe[]
): PreviewBuffer[];
```

For each probe:

1. Resolve port type via `outputPortDataType(doc, probe.source)`.
2. Build `PreviewBuffer` with `source: probe.source` (same shape as value outputs today).
3. Dedupe: if probe source equals an existing declared output/sink source, prefer single row
   (probe may still control label/pin).

`previewBufferPersistenceKey` / `sourceKey` already support port-based keys via
`previewPaneSelection.ts`.

## Authoring UX

### v1 (minimal)

1. **Output port** context menu / keyboard → **Monitor** (alongside connect menu).
2. Port shows a small **viewer badge** when probed.
3. Preview pane buffer list gains a row: `perlin3d · value`.
4. **Remove monitor** clears probe only.
5. **Input ports:** offer **Monitor source** → resolves wired upstream `PortRef`; disabled if
   unwired.

### v2 (optional)

- Detach monitor → floating subdivide pane (reuse multi-pane layout).
- Inline thumbnail on node (performance-gated).
- **Promote to output** → append `doc.outputs` or spawn real sink with user confirm.

`GraphNodeView.svelte` already handles `oncontextmenu` on ports — add menu item, not a new
interaction layer.

## Previewable ports

Gate monitors on types mappable through `previewFamily` (`previewBuffers.ts`):

| Family | Panel | Notes |
|--------|-------|-------|
| `data` | `CpuPreviewPanel` | `f32`, `vec*`, tuples, `storageBuffer` |
| `image` | `EffectPreviewPanel` / `GpuPreviewPanel` | `image`, `texture`, `renderTarget`; `vec4f` ambiguous → picker |
| `geometry` | `MeshPreviewPanel` | `mesh`, `geometry`, buffers — may need mesh-gen slice without sink |
| `audio` | `AudioPreviewPanel` | when audio consumer wired |

**Disabled / metadata-only:** `bindGroup`, `command`, `future<T>` (stream-graphs), unwired
pipeline handles.

Optional primitive metadata: `previewable: boolean | PreviewFamily` on port schema for edge
cases.

## Execution and performance

Monitors:

- **Do not** add edges, nodes, or consumers.
- **Do** slice/eval subgraph backward from `probe.source` (existing CPU/GPU paths).
- **Share** compile cache via `compileSignature` + per-probe `sourceKey`.
- **Lazy-eval** only visible / unpaused monitors in the active frame loop.
- **Soft cap** (e.g. 8 active GPU monitors) with warning — TD-style cost awareness.

Pipeline textures without `target.display`: monitor the **field output port** directly
(same as `resolvePreviewBufferPort` for sinks, minus sink node).

## Stream and audio monitors (forward-compatible)

When [stream-graphs.md](./stream-graphs.md) and [audio-graphs.md](./audio-graphs.md) land:

| Port type | Monitor UI |
|-----------|------------|
| `stream<T>` | table / last-N / rate sparkline |
| `audio` resource | waveform (block consumer) |
| `future<T>` | status badge only until resolved; optional await in offline mode |

Probes remain non-execution; stream sinks stay explicit `sink.*` nodes.

## Packages

| Package | Role |
|---------|------|
| `graph-editor` | `PreviewProbe` CRUD, port menu, `enumeratePreviewBuffers` extension, chrome persistence |
| `graph` | No IR change required for v1 |
| `runtime-cpu` / `runtime-webgpu` | Reuse existing eval/render entry points |
| `apps/webgputoy` | Default host |

## Non-goals (this spec)

- Monitors that **mutate** graph state or insert ghost nodes
- Auto-monitor every port on every edit
- Per-monitor independent time bases (use shared `previewFrameLoop`)
- Replacing `doc.outputs` for API-stable named exports
- Planet/scene embed requiring monitors in `GraphDocument`

## Phased delivery

### Phase A — Session probes + buffer list

- `PreviewProbe` type + in-memory store in editor session
- Port menu **Monitor** / **Remove monitor** on output ports
- `enumeratePreviewBuffers(doc, probes)` wired into `PreviewZone`
- Viewer badge on probed ports
- Unit tests: enumeration, dedupe, invalid port rejection

### Phase B — Persist with artifact + input “monitor source”

- `GraphArtifact.probes` round-trip (optional field)
- `StoredEditorChrome` sync when no artifact save
- Input port **Monitor source** (follow edge)
- **Promote to output** action

### Phase C — Mesh mid-chain + floating panes

- Mesh preview without `target.mesh` (local `evaluateMeshGenCpu` slice)
- Detach probe to dedicated subdivide pane
- Pause / lazy-eval policy

## Test gates

1. Headless: probe on scalar field → `enumeratePreviewBuffers` includes port; `previewFamily` correct
2. Probe does not change `discoverExecutionRoots(doc)` result
3. Remove node/port → stale probes pruned on graph sync
4. `check` + `test` green for `graph-editor`
5. Visual: right-click `noise.perlin3d` output → heatmap without adding sink; graph markup unchanged

## Related docs

- [stream-graphs.md](./stream-graphs.md) — `signal<T>` / `sink.host` for incremental pane updates
- [picking-and-collision.md](./picking-and-collision.md) — `signal<PickResult>` on monitored mesh ports
- [editor.md](./editor.md) — editor responsibilities, no planet rendering in package
- [briefs/M-preview-buffer-list.md](./briefs/M-preview-buffer-list.md) — buffer-list preview (landed); probes are the planned follow-on
- [stream-graphs.md](./stream-graphs.md) — stream port monitors
- [audio-graphs.md](./audio-graphs.md) — block audio preview
- [pipeline-as-graph.md](./pipeline-as-graph.md) — real targets vs debug monitors

## Open questions

1. Default persistence: session-only vs save probes with every document?
2. Should promoted outputs auto-name from probe label or prompt user?
3. Mesh mid-chain: require wired `position`+`normal` ports in slice or allow partial preview?
4. MCP: expose probes in artifact for agent debugging, or hide as editor-only?
