# Brief — Pipeline output reconciliation (target.display is the terminal)

**Type:** core gap-fix (validator/editor disagree on "the output") · **Packages:**
`@virtual-planet/graph` (validation reachability roots + sink helper),
`@virtual-planet/graph-editor` (stale-output cleanup on delete; pipeline output handling) ·
**Depends on:** pipeline nodes ✅, completeness validation ✅ (`validateGraphCompleteness`) ·
**Design authority:** [pipeline-as-graph.md](../pipeline-as-graph.md) · **Contract author:**
Opus · **Recommended executor:** Cursor.

## Problem

A pipeline graph's real terminal is the **`target.display`** node (`role: 'pipelineTarget'`,
`inputs: [color]`, **`outputs: []`** — a pure sink). But two subsystems disagree about what
"the output" is:

- The **runner** (`runtime-webgpu/src/pipelineGraph.ts`) finds `target.display`
  *structurally* (by primitive) and renders it — it ignores `doc.outputs`.
- The **validator** (`graph/src/validate.ts` `backwardReachable`, line ~94) roots
  reachability **only** at declared `doc.outputs.map(o => o.from.node)`.

So when a user builds `geometry.plane → buffer.persist → stage.vertex / stage.fragment →
target.display` but `doc.outputs` still references a stale value-output (e.g. the
cosine-palette sample seeds `outputs: [{ name:'image', from: n_effect.color }]`,
`graphBuilders.ts:142`, and `n_effect` was replaced), the validator:

1. emits `no-output-path` — "Output image references missing n_effect.color" (the error), and
2. roots reachability at nothing → flags **every** real pipeline node `dangling-node`
   ("Node n_plane … is not connected to any output"). Those N warnings are one root cause.

The editor gates preview/compile on `validateGraphFull(...).ok` (T-B), so the result is **no
render + an error** on a graph that is actually wired correctly. `target.display` has no
output port, so it can *never* be referenced by `doc.outputs` — the declared-value-output
mechanism is simply the wrong terminal model for a pipeline graph.

## Part 1 — Validator: pipeline-target nodes are implicit output sinks (`graph`)

In `graph/src/validate.ts`, `backwardReachable` must seed its walk from declared
`doc.outputs` **and** from every node that is a pipeline render sink. Add a small shared
helper so the validator and runner can't drift:

```ts
// graph/src/pipeline.ts (new) — single source of truth for "what terminates a graph"
export function isPipelineTarget(node: Node): boolean; // primitive role === 'pipelineTarget'
export function outputSinkNodeIds(doc: GraphDocument): string[]; // doc.outputs nodes ∪ pipeline targets
```

`backwardReachable` roots = `outputSinkNodeIds(doc)` (filtered to existing nodes). A wired
pipeline ending in `target.display` is then fully reachable even with **empty** `doc.outputs`
→ no `dangling-node` spam. (`isPipelineTarget` reads the registry, so it stays in the
registry-dependent `validateGraphCompleteness`, not structural `validateGraph`.)

## Part 2 — Editor: drop stale output refs on delete (`graph-editor`)

When a node is deleted, remove any `doc.outputs` entry (and matching consumer `outputs`
string) whose `from.node` is the deleted node — so deleting `n_effect` does not leave a
`no-output-path` error behind. Do this in the editor's node-delete mutation (the same place
edges to/from the node are pruned). A pipeline graph then carries **no** value-output; its
sink is the `target.display` node, recognised by Part 1.

(Out of scope here: a "designate output" UX. Pipeline graphs don't need one — the target
node *is* the output. Value/field graphs keep their existing single declared output.)

## Gate

1. **graph:** a wired pipeline (`geometry.plane → buffer.persist → stage.vertex /
   stage.fragment → target.display`) with `outputs: []` returns `ok: true` from
   `validateGraphFull` — no `dangling-node`, no `no-output-path`. A graph with a stale
   `doc.outputs` ref (node absent) still reports exactly one `no-output-path` error (the
   helper doesn't mask genuine stale declared outputs). Tests in `graph`.
2. **graph-editor:** deleting a node referenced by `doc.outputs` removes that output entry
   (no lingering `no-output-path`); reproduce the report's flow — load the cosine sample,
   replace `n_effect` with the pipeline, delete `n_effect` → validation clears. Test.
3. `check` **and** `test` green for `graph` and `graph-editor`; keep all prior tests green.
4. **Visual ⚠:** the user's worley→vec4f→fragment pipeline (screenshot in the report) shows
   **no validation error** and the preview renders. Screenshot.

## Out of scope

Preview-buffer **selection/format-adaptive** UX (separate brief — list a graph's output
buffers by kind: geometry/image/data/audio). Multi-target frame-graph ordering. Auto-seeding
a `target.display` for graphs that lack one (authoring affordance, later).

## Handoff

→ The validator and runner share one notion of "terminal" (`outputSinkNodeIds`); a
node-driven pipeline ending in `target.display` validates and renders without a phantom
value-output. Unblocks the preview-buffer-list work (the output list becomes trustworthy).
