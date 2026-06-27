# Brief — Params promotable to input ports

**Type:** core model · **Packages:** `@virtual-planet/graph` (IR + primitive model),
`@virtual-planet/compiler` (codegen), `@virtual-planet/graph-editor` (form/ports) ·
**Depends on:** M2 ✅, M3 ✅ · **Design authority:**
[schema-and-primitives.md → Params are promotable to inputs](../schema-and-primitives.md#params-are-promotable-to-inputs),
[parameter-and-form-schema.md](../parameter-and-form-schema.md) · **Contract author:**
Opus · **Recommended executor:** Cursor.

## Objective

Make every primitive param **wireable as an input port** (the default), so e.g.
`math.remap`'s `inMin/inMax/outMin/outMax` can be driven by another node, not only typed
into the form. Params not promotable (compile-time constants) are flagged in the schema and
stay form-only. Params and inputs become one model: a value that is either a **literal**
(form default) or **edge-driven**.

## Part 1 — Promotability metadata (`graph`)

Param schemas already carry TypeBox metadata. Add an annotation:

- A param is **promotable by default**. A schema marks the exceptions
  `x-const: true` (or `promotable: false`) — params that must remain literals because they
  change WGSL shape (loop/octave counts, array sizes, workgroup dims, code-path selectors).
- Expose a helper `promotableParams(primitive): string[]` deriving the wireable set.

## Part 2 — IR: param slot = literal | edge-driven

A node param resolves to either its literal value or an incoming edge. Keep it additive and
serialization-stable:

- An **input port** may be auto-generated for each promotable param (id = param name), so
  existing `Edge`/`PortRef` wiring drives it — **no new edge type**.
- `Node.params[name]` holds the **literal/default**; if an edge targets the port named
  `name`, the edge wins. (Document the precedence: connected edge > stored literal >
  schema default.)
- `validateGraph` already type-checks edges; a promoted-param port has the param's dataType.

## Part 3 — Codegen + evalCPU (`compiler` / primitive evaluators)

- **evalCPU:** for each promotable param, if an incoming value is present in
  `ctx.inputs`, use it; else use `ctx.params[name]`. (Adjust the `CpuEvalContext` plumbing
  so connected params arrive as inputs.)
- **WGSL codegen:** a connected param emits the upstream expression at the call site; an
  unconnected one emits the literal constant. Unchanged for `x-const` params (always
  literal).

## Part 4 — Editor form/ports (`graph-editor`)

- The node shows an input port for each promotable param (collapsible "show param inputs"
  is fine to avoid clutter).
- `InspectorPanel` / `ParamForm`: render an editable control for **unconnected** promoted
  params; for **connected** ones show the source (read-only, "driven by …"). `x-const`
  params always render a control. No second param system (param ADR).

## Gate

1. `graph`: `promotableParams(getPrimitive('math.remap'))` = the four bounds; a `constExpr`
   test primitive excludes its const param.
2. IR/eval: a graph wiring a node into `remap.inMin` — `evalCPU` uses the wired value;
   unconnected falls back to the form literal; precedence test.
3. compiler: generated WGSL uses the upstream expression when connected, the literal
   otherwise (string assertion).
4. `graph-editor`: connecting a param port disables its form control (component test);
   `sceneFree` + package gates green; `fe` check green.

## Out of scope

Auto-promoting `x-const` params; vector/struct param splitting into component ports
(later). **No new public exports beyond the helper + the port-generation path.**

## Handoff

→ With params wireable, ShaderToy-style effects and the planet shaping graph can route
computed values into any tunable. Pairs naturally with
[M-primitive-immutability.md](./M-primitive-immutability.md) (editing/cloning the WGSL that
declares those params).
