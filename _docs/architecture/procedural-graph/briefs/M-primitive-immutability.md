# Brief — Primitive immutability, clone-to-edit, real WGSL source

**Type:** editor correctness + model · **Packages:** `@virtual-planet/graph-editor`
(CodeView, primitive sources), `@virtual-planet/compiler` (resolver use), possibly
`@virtual-planet/graph` (user-primitive registry) · **Depends on:** M3 ✅, M9d.3 ✅
(CodeMirror), procedural-wgsl library ✅ · **Design authority:**
[schema-and-primitives.md](../schema-and-primitives.md),
[editor.md](../editor.md), [wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md)
· **Contract author:** Opus · **Recommended executor:** Cursor (⚠ has a visual gate).

## Problem (two bundled)

1. **Bug — incomplete WGSL displayed.** `graph-editor/src/primitiveSources.ts` returns a
   real source only for `noise.perlin3d` (a fixture); for every other selected node it
   calls `buildStubSource`, which fabricates a placeholder (`fn entry(...) -> f32 { return
   0.0; }`, `...` params, hardcoded `vec3<f32>`/`f32`). The **real** WGSL now lives in
   `@virtual-planet/procedural-wgsl`. CodeView must show the *real, complete* module source.
2. **Model — built-ins should be immutable + cloneable.** Standard-library primitives are
   canonical source. Showing them editable invites silent divergence. They should display
   **read-only** (as-is from source); to edit, the user **clones & renames** → a new
   editable **user primitive** (the self-describing WGSL path, M3).

## Part 1 — Real source (fix the bug)

- Resolve a primitive's WGSL from the **procedural-wgsl standard library resolver**
  (`createStandardLibraryResolver`) by `primitive.wgsl.moduleId`, returning the full module
  source (with its YAML frontmatter). Replace `buildStubSource` as the fallback path.
- Keep `SOURCE_FIXTURES`/`sourceOverrides` only for user/cloned primitives (Part 3).
- If a module genuinely has no source yet, show an explicit "no source" notice — **never**
  a fabricated stub presented as the code.

## Part 2 — Immutable display for built-ins

- A primitive is **built-in** (immutable) if it comes from the standard library / is
  registered by the engine; **user** (editable) if created via clone or self-describing
  load. Expose `isBuiltinPrimitive(id): boolean` (built-ins = the standard registered set;
  user primitives tracked in a separate registry/namespace, e.g. id prefix `user.`).
- CodeView for a built-in: CodeMirror **read-only**, with a clear "built-in · read-only"
  affordance and a **Clone** action. No Save for built-ins.

## Part 3 — Clone & rename

- **Clone** a built-in → copy its full source, assign a new user id (`user.<name>`,
  user-renamable), register it as a **user primitive** (M3 loader path: parse signature +
  YAML → schema), and make CodeView editable + Save-able for it.
- The cloned primitive appears in the palette; nodes can use it. Cloning does **not** mutate
  the original. User primitives persist with the document/editor chrome (decide: in the
  graph document vs a user-primitive store — recommend a user-primitive store keyed like
  documentStorage, since a primitive is reusable across graphs).
- Renaming updates the user id and references (or pin a stable internal id + editable
  display name — simpler; recommend stable id + display name).

## Gate

1. Select a `math.remap` node → CodeView shows the **real** `math.remap` WGSL from
   procedural-wgsl (not a `return 0.0` stub). Test: source contains the real `fn remap`
   body / not the stub marker.
2. Built-in CodeView is read-only (no Save); a **Clone** produces an editable `user.*`
   primitive whose CodeView is editable and whose edits do not affect the original
   (component/unit test).
3. `graph-editor` `sceneFree` + package gates green; `fe` check green.
4. **Manual ⚠:** select various nodes — each shows complete source; clone+edit a primitive
   and use it in the graph.

## Out of scope

Diffing user vs built-in; publishing user primitives to a shared library (WebGPUToy M17);
versioning. **No fabricated stubs anywhere.**

## Handoff

→ Real, immutable-or-cloned primitive source + wireable params
([M-params-as-inputs.md](./M-params-as-inputs.md)) make the editor honest about what code
runs — prerequisite for authoring the ShaderToy effects
([M-shadertoy-poc.md](./M-shadertoy-poc.md)) as real, editable primitives.
