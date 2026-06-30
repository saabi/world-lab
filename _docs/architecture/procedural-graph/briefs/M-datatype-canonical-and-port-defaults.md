# Brief — Canonical data types + input-port default values

**Type:** core robustness (type-aliasing bug + unconnected-input defaults) · **Packages:**
`@virtual-planet/graph` (canonicalizer, PortSpec/Port, validation), `@virtual-planet/compiler`
+ `@virtual-planet/runtime-webgpu` (emit), `@virtual-planet/runtime-cpu` (eval), the vector
primitives, `@virtual-planet/graph-editor` (form display) · **Depends on:** nothing ·
**Design authority:** [graph-and-compiler.md](../graph-and-compiler.md),
`node-model-design-notes.md` · **Contract author:** Opus · **Recommended executor:** Cursor.
**One owner, two parts** (they share `emitGraphEval.ts` + `types.ts` — do not split across
agents).

---

## Part A — One canonical data-type form, enforced at every boundary

### Problem
`vec2f` and `vec2<f32>` are the same WGSL type, but the graph has two vocabularies (canonical
short alias `vec2f` in `DataType`; WGSL long form `vec2<f32>` in shaders) bridged in **one
asymmetric place**: `wgslTypeToDataType` (`primitiveLoader.ts:148`) maps `vec2<f32>→vec2f` but
**throws** on the alias `vec2f`. Comparisons are raw string equality (`compatibleDataTypes`
`from === to`, `assertParamPortCompatible`, the `=== 'vec2f'` checks, `list<…>` slicing). So a
port that escapes the one normalizer — or a shader authored with the modern alias — fails to
connect. (Concrete: `mulScalarVec2f` declares `vec2<f32>`; canonical ports are `vec2f`.) There
are also **two duplicate `DataType→WGSL` helpers** (`wgslTypeFor` in `groupCodegen.ts` and
`emitGraphEval.ts`).

### Fix
1. **`canonicalDataType(s: string): DataType`** in `@virtual-planet/graph` — folds every
   spelling to the canonical short alias: `vec2<f32>`, `vec2< f32 >`, `vec2f` → `vec2f`
   (vec3/vec4/f32/i32/bool, and `list<…>` recursively). Single source of truth.
2. **Accept both forms on ingestion:** `wgslTypeToDataType` routes through `canonicalDataType`
   (so `vec2f` in a WGSL signature is valid, not a throw); keep the loud throw only for
   genuinely unknown types.
3. **Defensive compare:** `compatibleDataTypes` (and `assertParamPortCompatible`) normalize
   both sides before comparing.
4. **Consolidate** the two `wgslTypeFor` (DataType→WGSL) into one shared helper so the
   round-trip is provably consistent.
5. **Guard test (anti-regression):** assert every registered primitive's port `dataType` is
   already canonical, and a `canonicalDataType`/`wgslTypeToDataType` round-trip over both
   spellings. Include the reported case: a `vec2<f32>` port (`mulScalarVec2f`) connects to/from
   a `vec2f`-typed port.

---

## Part B — Input ports may declare a default value (unconnected → literal)

### Problem
`PortSpec`/`Port` have **no default**, and `emitGraphEval` **throws** `Missing edge for
node.port` on any unconnected non-list input. So an unconnected vector component (e.g.
`vector.vec4f.w`) can't compile and `evalCPU` reads `undefined`→NaN. Components should have
explicit, sensible defaults.

### Fix
1. **Add optional `default` to `PortSpec` and `Port`** (`number | boolean | number[]`, matching
   the port's `dataType`).
2. **Codegen** (`emitGraphEval`, and the group path if it shares the throw): an unconnected
   input **with a default** emits the literal (reuse a `formatParamValue`-style helper) instead
   of throwing; unconnected **without** a default keeps throwing.
3. **CPU eval** (`runtime-cpu`): fill unconnected inputs with their port `default` before
   `evalCPU`, so primitives need no per-node `?? 0`.
4. **Validation:** an unconnected input that has a `default` is **not** an `unconnected-input`
   warning (same treatment as a promotable param).
5. **Apply defaults** to the vector constructors (`vector.vec2f/vec3f/vec4f`): `x,y,z` default
   **0**; **`w` default `1`** (homogeneous-coordinate / opaque-colour convention — flag this
   choice for sign-off, it's the one judgement call). Apply to other primitives where a neutral
   default is obvious.
6. **Editor (minimal):** the node form shows a port's default as the value when unconnected
   (full literal-editing UX may be a follow-on — at least display it, don't render blank/NaN).

> **Relationship to params-as-inputs:** port-defaults and promotable-param literals both mean
> "unconnected input → literal." Keep them coherent (reuse the same literal-format helper); a
> future pass may unify them, but do **not** pull in the pending params-as-inputs codegen here.

---

## Gate

1. **Part A:** `mulScalarVec2f` (`vec2<f32>`) connects to and from a `vec2f` port in the editor
   and compiles; a primitive whose WGSL signature uses `vec2f` loads (no "Unsupported WGSL port
   type"); guard test (all ports canonical) + round-trip test green.
2. **Part B:** a `vector.vec4f` with an **unconnected** component compiles (emits its default
   literal) and `evalCPU` returns the default; no `unconnected-input` warning for defaulted
   ports.
3. `check` **and** `test` green for every touched package; WGSL validity for emitted code.
4. **Visual ⚠:** a `vec4f` with some components unconnected renders in the Effect preview (uses
   the defaults). Screenshot.

## Out of scope

Full **params-as-inputs** promotion/codegen (pending, separate); a rich per-port literal
editor (display-only is enough here); changing the canonical form away from the short alias.

## Handoff

→ A data type has one canonical form enforced everywhere (alias vs long-form can't desync), and
input ports can carry explicit defaults so unconnected vector components are well-defined.
Removes a class of silent connection failures and NaN/throw-on-unconnected.
