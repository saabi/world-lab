# Proposal — Group function round-trip (`functionToGroup`)

**Status:** proposal for review and analysis · **Not an ADR** · **Not yet a routable brief** ·
**Packages:** `@virtual-planet/compiler`, `@virtual-planet/graph`, `@virtual-planet/graph-editor` ·
**Design authority:** [node-model-design-notes.md](./node-model-design-notes.md) §E,
[wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md), [editor.md](./editor.md)

---

## Why this document exists

[node-model-design-notes.md](./node-model-design-notes.md) §E defines **two representations**
for node groups:

| Representation | Role |
|----------------|------|
| **JSON subgraph** (`GroupDefinition`) | Canonical authoring; contract inferred from exposed ports |
| **WGSL function + YAML frontmatter** | Compiled / portable / hand-authorable form |

The **forward** path is implemented: `groupToFunction()` in
`packages/compiler/src/groupCodegen.ts` emits a self-describing WGSL function that calls
registered primitive entries. The **inverse** path — decomposing a group function back into
nodes for editor drill-in, CodeView edits, and TouchDesigner-style zoom — is **not built**.

This proposal analyzes whether the **Use.GPU linker** (`@use-gpu/shader`) can support that
inverse path, what semantics an invertible group dialect needs, and how it composes with
existing ADR policy. It is for architect review before any brief is routed.

**Related pending work:** editor "Save as group" / collapse-to-node UX
(`pending_issues.md`); built-in groups (`math.remap`, `transform.*`) should be inspectable
as subgraphs when zoomed in.

---

## Question under review

> Could the Use.GPU linker be used for node-group function code analysis — to separate a
> group `fn` back into graph nodes — as long as the function is declared as a group and obeys
> restricted semantics (mainly pure `let` bindings and primitive function calls)?

**Short answer:** **Yes, partially.** Use `@use-gpu/shader` behind an adapter as **parser,
symbol checker, and dependency validator** — not as the decomposition engine. Node separation
belongs in a dedicated **`functionToGroup()`** pass that inverts the **group emission
grammar** `groupToFunction()` already produces.

---

## Current forward path (what inversion must match)

`groupToFunction(def)` emits:

```wgsl
// @use noise.perlin3d
// @use math.remap
fn normalDisplace(position: vec3f, scale: f32) -> vec3f {
  let v_n1_value: f32 = perlin3d(position);
  let v_r1_out: f32 = remap(v_n1_value, 0.0, 1.0, 0.0, scale);
  return v_r1_out;
}
```

Properties the inverter can rely on today:

- **Single output** — `interface.outputs.length === 1` (enforced at codegen for Profile A v1).
- **SSA-like temps** — `let v_<sanitizedNodeId>_<sanitizedPortId>: <type> = <entry>(…);`
- **Node metadata (proposed R2)** — `// @node <nodeId>` comment immediately before each statement;
  inverter prefers `@node` over sanitized `v_*` names when CodeView renames temps.
- **Callees** — registered primitive `entry` names from `callableWgslSource(primitive)`.
- **Dependencies** — `// @use <moduleId>` comments mirror `dependencies` set.
- **Interface** — YAML frontmatter is authoritative for group `id`, inputs, outputs, params.
- **Topological order** — body statements follow a DAG from inputs toward the return node.

**Known gaps (rev. 2 — must fix before lossless round-trip):**

| Gap | Issue | Proposed fix |
|-----|-------|--------------|
| Sanitized names | `v_*` temps cannot reliably recover original node ids; collisions possible | Emit `// @node <nodeId>` in `groupCodegen.ts` per statement |
| Literal args | Ambiguous between primitive **params** and **port defaults** | Inverter uses primitive registry `param` vs `port.default` metadata — not heuristics |
| Multi-output primitives | `groupCodegen` emits one `let` per output port with repeated `callExpr` | Profile A: restrict to single-output primitives **or** define suffix encoding `v_<node>_<portId>` with one call + destructuring (see § Multi-output encoding) |

Codegen also supports **Profile B** shapes that are harder to invert (see §Invertibility
profiles below): static `for` loops over `storageBuffer` tuple ports, `coerce_*` wrappers from
`emitCoercion`, and inlined group-param literals.

Built-in groups already store canonical `GroupDefinition` JSON under
`packages/procedural-wgsl/src/groups/` — inversion is primarily needed for **user-authored
code**, **CodeView edits**, and **imported WGSL** that claims to be a group.

---

## Role of Use.GPU / `@use-gpu/shader`

Per [wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md), the linker adapter may use
`@use-gpu/shader/wgsl` for `getSymbolTable`, `getShakeTable`, `getDeclarations`, and
`linkBundle`. M6 linker is **not yet landed** (`packages/compiler/src/linker/` absent);
`apps/scene-editor/vite-wgsl.ts` `#include` expansion is the precursor.

| Task | Use.GPU linker / Lezer | Owner |
|------|------------------------|-------|
| Parse WGSL module | ✅ adapter-internal | `use-gpu-adapter` or `functionToGroup` |
| Resolve `// @use` / `use` deps | ✅ | linker |
| List callees, validate symbols exist | ✅ | linker + primitive registry |
| Linked-module compile check | ✅ | `WgslValidator` |
| Rebuild `GraphDocument` subgraph | ❌ not linker's job | **`functionToGroup`** |
| Map `let v_*` → nodes and edges | ❌ | restricted-pattern extractor |
| Infer group interface from free WGSL | ❌ | frontmatter (+ inference rules) |

**ADR alignment:** Lezer `Tree` stays **inside** the adapter; Graph IR remains authoritative;
no semantic WGSL AST as compiler public API. Round-trip gates operate on **strings and
`GroupDefinition`**, not AST shape.

Use.GPU is **not** the signature SoT for M3 (`WgslSignatureReader` preferred). For
`functionToGroup`, the same caution applies: symbol tables assist validation; the invertible
grammar is defined relative to **`groupToFunction` output**, not general WGSL semantics.

---

## Proposed `GroupInvertibilityProfile`

Define an explicit profile — the contract for "this function may be decomposed into nodes."

### Profile A — `group-v1` (Phase 1 target)

Matches the common case of `groupToFunction` output **without** dynamic tuple loops.

**Required structure**

1. One exported group `fn` per module, plus YAML frontmatter (`id`, `inputs`, `outputs`,
   `params`).
2. Body statements only:
   - `let v_<nodeId>_<portId>: <type> = <callee>(<args>);`
3. `<callee>` resolves to exactly one **registered primitive** `entry` (registry lookup by
   `entry` + `moduleId` from `@use`).
4. **Arguments:** function parameters (group inputs), other `v_*` temps, numeric/bool literals,
   `array<T,N>(…)` tuple unrolls.
5. **Return:** `return v_<outputNode>_<outputPort>;`
6. **No** user-authored `if` / `switch` / scratch locals beyond generated temps.
7. **Coercions:** either rejected in hand-authored invertible groups, or recognized as known
   `coerce_*` patterns emitted by `groupToFunction` (inverter peels or fails with diagnostic).

**Rejected (fail closed with actionable message)**

- Arbitrary control flow, multiple returns, unknown callees
- Calls to inline WGSL helpers not registered as primitives
- Multiple competing top-level `fn` bodies without a single designated group entry
- Primitives with `evalCPU` only and no `callableWgslSource` on the WGSL path
- Integer group params (already rejected by `groupToFunction`)

### Profile B — `group-v1-loops` (deferred)

Includes the static `for` loop form `groupCodegen` emits for `storageBuffer` dynamic tuple
ports. Inversion requires reconstructing loop-carried wiring and is **not** Phase 1. Editor
should fall back to "edit subgraph visually" when Profile B is detected.

### Multi-output encoding (Profile A extension)

When a primitive has multiple output ports, `groupCodegen.ts` today emits repeated calls:

```wgsl
let v_n_out0: f32 = foo(...);
let v_n_out1: vec3f = foo(...);
```

**Profile A v1 (strict):** reject multi-output primitives in invertible groups until encoding
is defined — document in editor with actionable diagnostic.

**Profile A v1.1 (proposed):** emit one statement with tuple destructuring or named fields:

```wgsl
// @node n1
let v_n1: FooOutputs = foo(...);
let v_n1_out0: f32 = v_n1.x;
let v_n1_out1: vec3f = v_n1.yzw;
```

Or a single `@node` block comment listing `(nodeId, portId)` pairs. Inverter reconstructs one
node with multiple output ports from the shared `@node` id.

### Argument provenance (`@arg` per occurrence)

`portDefault` is **not** a static primitive-argument category — the same formal parameter may be
**wired**, mapped to a **group input**, taken from **group param**, or filled from a **literal
default** depending on the node occurrence in the subgraph.

`groupToFunction` emits **`// @arg <nodeId>_<portId> <provenance>`** for every non-temp argument:

| Provenance | Meaning |
|------------|---------|
| `wired` | edge from upstream `v_*` temp |
| `groupInput` | group interface input name |
| `groupParam` | group param name |
| `literalDefault` | unwired port — literal from port default or node.params |

Inverter uses **emitted `@arg` comments only** — not registry heuristics or literal shape guessing.

---

## Proposed `functionToGroup` algorithm

```
1. Parse YAML frontmatter → GroupInterface (authoritative for ports/params)
2. Parse WGSL body (Lezer via Use.GPU adapter, or a narrow scanner for Profile A)
3. For each statement block:
     a. Read `// @node <nodeId>` if present; else recover from `v_*` naming (fail if ambiguous)
     b. Read `// @arg <nodeId>_<portId> wired|groupInput|groupParam|literalDefault` for each arg
     c. primitive = registry.byEntry(callee) constrained by @use moduleId
     d. edges from args referencing other v_* temps
     e. apply provenance from `@arg` — do not infer from registry
4. Verify DAG (topological order matches statement order)
5. Merge into existing subgraph by `@node` id when present (R3): preserve `name`, `position`,
   unrelated nodes; update params and edges only
6. Emit GroupDefinition { subgraph, interface }
7. Round-trip gate: structural graph equivalence (see § Test gates)
```

### Test gates (round-trip)

Round-trip correctness is **structural graph equivalence**, not normalized WGSL string compare:

1. **Node multiset** — same `(primitive, params)` per `@node` id after `functionToGroup(groupToFunction(g))`
2. **Edge multiset** — same `(fromPort, toPort)` pairs
3. **Interface equality** — group inputs, outputs, params unchanged
4. **WGSL compile** — emitted function still passes `WgslValidator` (secondary gate)

Property test: `equivalentGraph(g, functionToGroup(groupToFunction(g)))` for all built-in
groups in `packages/procedural-wgsl/src/groups/`.

**Use.GPU linker role in step 2–3:** load module, `getDeclarations` / symbol table to
cross-check callees and `@use` deps before pattern extraction.

**Editor integration (R3 — future brief):**

- Group node → Code view → on save, if body changed and Profile A validates → **merge** parsed
  nodes into existing subgraph by `@node` id (preserve editor `name`, `position`, unrelated nodes).
- Built-in groups: prefer stored `GroupDefinition` over inversion; clone-on-edit replaces
  with user-owned copy (`pending_issues.md`).

---

## What this does *not* replace

| Path | When to use |
|------|-------------|
| Subgraph → function (`groupToFunction`) | Save as group, visual authoring, built-ins |
| Function → subgraph (`functionToGroup`) | Code view edit, import, explode group |
| Subgraph only (no invert) | Profile B loops, arbitrary WGSL, heavy coercions |

Inversion is **not** a general WGSL decompiler. It is the inverse of a **deliberately narrow
emission grammar** — the same design choice as M9b's constrained markup subset for IR
round-trip ([editor.md](./editor.md)).

---

## Open questions for review

1. ~~**Naming stability**~~ → **Resolved (proposal):** prefer `// @node` metadata; `v_*` is display-only
2. **Coercion policy** — peel `coerce_*` into implicit cast edges, or treat any coercion as
   non-invertible?
3. **Package placement** — `functionToGroup` in `@virtual-planet/compiler` next to
   `groupToFunction`, or a sibling `groupDecompile.ts` to keep codegen/decode symmetric?
4. **M6 sequencing** — can Profile A ship with a minimal Lezer scanner before the full linker
   adapter lands, as long as round-trip tests use structural equivalence?
5. **Built-in inspectability** — always load `GroupDefinition` from `procedural-wgsl` JSON;
   only invoke `functionToGroup` when no canonical subgraph exists (import path).
6. **Multi-output v1** — strict reject vs v1.1 tuple destructuring (see § Multi-output encoding)

---

## Suggested phasing (if approved)

| Phase | Deliverable | Gate |
|-------|-------------|------|
| **R1** | Document `GroupInvertibilityProfile` in §E or this proposal promoted to spec addendum | Architect sign-off |
| **R2** | `@node` / `@arg` emission in `groupCodegen.ts` + `functionToGroup` Profile A + structural equivalence vitest on built-in groups | `npm test` in `compiler` |
| **R3** | CodeView save: merge-by-`@node` preserving editor metadata + zoom-into-group UX | Manual + vitest |
| **R4** | Profile B loops (optional) | Only if storageBuffer groups need CodeView edit |

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Use.GPU grammar diverges from browser WGSL | Profile A validated by round-trip + `WgslValidator`; not general parse |
| Hand-authored WGSL looks like a group but isn't | Fail closed; frontmatter required; registry-only callees |
| Drift between `groupToFunction` and `functionToGroup` | Shared naming helpers; structural equivalence test `equivalentGraph(g, f(g))` |
| Scope creep into owned WGSL AST | Extractor operates on Lezer tree or line patterns internally only |

---

## Related documents

- [node-model-design-notes.md](./node-model-design-notes.md) §E — group = function + contract
- [wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md) — linker / Use.GPU policy
- [graph-and-compiler.md](./graph-and-compiler.md) — M6 linker milestone
- [editor.md](./editor.md) — multi-level editing, CodeView
- `packages/compiler/src/groupCodegen.ts` — forward emitter
- `pending_issues.md` — node groups UX, built-in inspectability
