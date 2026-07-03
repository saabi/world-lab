# Brief — params-as-inputs, remainder (codegen + editor)

**Type:** core model, follow-on · **Packages:** `@world-lab/compiler` (evalCPU + WGSL
codegen), `@world-lab/graph-editor` (form/ports) · **Depends on:** Parts 1–2 ✅ landed (see
below) · **Design authority:** the original
[M-params-as-inputs.md](./M-params-as-inputs.md) (Parts 1–2 there are done; this brief is
Parts 3–4 only, rewritten for the current `@world-lab/*` scope) · **Contract author:** Opus ·
**Recommended executor:** Cursor · **Status:** ready to route

## What's already done (verified, not assumed)

`packages/graph/src/paramInputs.ts` fully implements Parts 1–2:

- `promotableParams(primitive)` — scalar/integer/boolean params not marked `x-const`.
- `paramInputPorts(primitive)` — synthetic input-port specs for those params.
- `resolveParamBindings(node, primitive, incomingEdges)` — precedence **connected edge >
  stored literal > schema default**, returning `{ kind: 'edge', from } | { kind: 'literal',
  value } | { kind: 'default' }` per param.

Confirmed by grep: **zero consumers** of these three exports anywhere in `packages/compiler`
or `packages/graph-editor` — Parts 3 and 4 haven't been started at all.

## Part 3 — evalCPU + WGSL codegen (`compiler`, `runtime-cpu`)

- **evalCPU side:** `packages/runtime-cpu/src/evalGraph.ts`'s `resolveParams(node,
  primitiveParams)` (line ~36) currently does `{ ...defaults, ...node.params }` — it has no
  concept of an incoming edge overriding a param. It needs the node's incoming edges (already
  available during graph evaluation — check how the caller obtains `incomingEdges` for port
  inputs elsewhere in this file) threaded through `resolveParamBindings`, and an edge-bound
  param's value read from the *already-evaluated upstream port result*, not from
  `node.params`.
- **WGSL codegen side — investigate before implementing:** `node.params` is read in exactly
  one place in `packages/compiler/src`: `groupCodegen.ts` (group/subgraph codegen, which
  inlines param values as call-site substitutions into the group's generated function body).
  No general, non-group per-node codegen path was found reading `node.params` directly — so
  it's unclear whether ordinary (non-group) node params currently reach WGSL via inline
  literal substitution at all, or via a different mechanism (e.g. a `GraphParams` uniform
  struct, referenced by an earlier landed brief, "Fullscreen-fragment params binding"). **First
  step: trace how a plain node's (non-group) params currently reach the generated WGSL for a
  simple case, e.g. `math.remap`'s bounds in the Worley sample graph, before writing the
  connected-vs-literal branch.** Don't assume the group-codegen mechanism generalizes without
  checking.
- Once the real mechanism is identified: a connected promotable param should emit the upstream
  port's expression at the call site (matching how connected *port* args already codegen);
  an unconnected one keeps emitting the literal/default exactly as today. `x-const` params are
  untouched (always literal, never promotable — already enforced by `paramInputPorts`).

## Part 4 — editor form/ports (`graph-editor`)

- A node with promotable params should expose an input port per param (id = param name,
  from `paramInputPorts`) — likely wired wherever `GraphNodeView.svelte`/`irAdapter.ts`
  currently derive a node's port list for xyflow. Consider a collapsed-by-default "show param
  inputs" toggle to avoid cluttering every node with extra handles (the original brief's
  suggestion; a UX judgment call for the executor, not a hard requirement).
- `InspectorPanel.svelte` (or wherever param controls render — check for a separate
  `ParamForm` component first): for each promotable param, if `resolveParamBindings` reports
  `kind: 'edge'`, render it as read-only with a "driven by `<node>.<port>`" label instead of
  an editable control; unconnected (`literal`/`default`) params render the existing editable
  control unchanged. `x-const` params always render their control, unconditionally.
- No second param system — this reuses the *same* `node.params` storage and the *same* param
  schema rendering already in place; only the connected/disconnected branching is new.

## Gate

1. `runtime-cpu`: a graph wiring a node into (e.g.) `math.remap`'s `inMin` port —
   `evalCPU` uses the wired upstream value; disconnected falls back to the literal/schema
   default; a precedence test (edge present + literal present → edge wins).
2. `compiler`: whatever the identified codegen mechanism turns out to be, a connected param
   emits the upstream expression in generated WGSL; unconnected emits the literal (string
   assertion against generated source).
3. `graph-editor`: connecting a param port disables its form control and shows the "driven
   by" label (component test); existing 176 tests stay green.
4. `check` **and** `test` green for `graph`, `compiler`, `runtime-cpu`, `graph-editor`, and
   the full workspace (`apps/webgputoy` consumes `graph-editor` transitively).
5. **Visual ⚠:** screenshot showing a param port wired on the canvas, its form control
   disabled/relabeled in the inspector, and the preview updating to reflect the wired value.

## Out of scope

Auto-promoting `x-const` params; vector/struct param splitting into component ports (a
separate, later brief per the original doc); any change to `paramInputs.ts` itself (Parts 1–2
are frozen/done — if something there turns out to be wrong, stop and flag it rather than
editing graph-core mid-task).

## Handoff

→ ShaderToy-style effects and any future planet-shaping graph can route computed values into
any tunable param, not just typed literals — closes the last standing gap between "params"
and "inputs" as one model.
