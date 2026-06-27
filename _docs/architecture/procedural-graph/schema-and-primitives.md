# Schema-driven architecture & primitive library

**Status:** architecture · **Scope:** `@virtual-planet/schema` (existing),
`packages/graph` (primitive registration), `packages/procedural-wgsl`. Part of
the [Procedural Graph System](./README.md).

## Schema as single source of truth

The existing `@virtual-planet/schema` package becomes the canonical metadata
system for the whole graph. **A procedural primitive is defined exactly once
through its schema; every other representation is derived automatically.** No
duplicate metadata anywhere.

A single primitive definition drives:

```
Schema
  ├─► TypeScript types          ├─► Graph node + ports
  ├─► Runtime validation        ├─► Port compatibility
  ├─► Serialization             ├─► Node appearance / category / icon / search
  ├─► Default values + units    ├─► Declarative component (e.g. <Perlin3D .../>)
  ├─► Property inspector        ├─► Compiler metadata
  ├─► Documentation             └─► WGSL generation metadata
```

Example primitive definition (conceptual):

```ts
const Perlin3D = definePrimitive({
  id: 'noise.perlin3d',
  inputs:  { position: Field.vec3() },
  outputs: { value: Field.float() },
  parameters: Type.Object({
    scale: quantity('1/m', { default: 0.002 }),
    octaves: Type.Integer({ default: 5 }),
    persistence: Type.Number({ default: 0.5 }),
    lacunarity: Type.Number({ default: 2.0 }),
  }),
  metadata: { category: 'Noise', color: '#5d8cff', icon: 'perlin', keywords: ['noise','fbm'] },
  wgsl: { module: 'noise.perlin3d', entry: 'perlin3d' },   // resolved by the compiler
});
```

Registration is declarative:

```
registerPrimitive(schema, wgslModuleRef, optionalCpuEvaluator)
```

Once registered, the primitive is immediately available to the editor, compiler,
serializer, documentation, declarative authoring, and runtime validation with no
extra code. Third-party packages contribute primitives the same way
(`@virtual-planet/noise`, `/erosion`, `/vegetation`, `/atmosphere`); the editor
and compiler discover them automatically.

**Guiding principle.** *Procedural primitives are defined exactly once.* The
schema is the single source of truth from which every UI, graph node, declarative
component, validation rule, serialization format, doc page, compiler description,
and WGSL pipeline is derived. Parameter UI and GPU packing policy:
[parameter-and-form-schema.md](./parameter-and-form-schema.md).

## Params are promotable to inputs

A primitive's **params and its input ports are the same kind of thing** — a value the
function consumes. The split is only "authored as a form control" vs "wired from another
node." So **every param is promotable to an input port by default**: an unconnected
promoted param uses its form value (the schema default/range drives the control); a
connected one is driven by the upstream node and the form control shows a "connected"
state. (`math.remap`'s `inMin/inMax/outMin/outMax` should therefore each be wireable, not
form-only.)

- **IR:** a node's param slot is either a **literal** (form value) or **edge-driven**
  (an input port with an incoming edge). Codegen and `evalCPU` use the upstream expression
  when connected, the literal otherwise.
- **Form:** renders a control for unconnected promoted params; connected ones show their
  source instead of an editable control.
- **Special cases — form-only / `constExpr`.** A param the schema marks **not promotable**
  must stay a literal: compile-time constants that change the *shape* of the WGSL (loop
  counts / octaves, array sizes, workgroup dimensions, a selector that switches code
  paths). These can't be a runtime input without dynamic loops/specialization. The schema
  flags them (`x-const`/`promotable: false`); everything else is promotable.

See [briefs/M-params-as-inputs.md](./briefs/M-params-as-inputs.md). This keeps the "defined
once" principle: promotability is schema metadata, so the form, ports, codegen, and
inspector all agree.

## Primitive library

The graph is built from reusable, schema-described primitives. Initial vocabulary
(inspired by — not depending on — Use.GPU's composable-function library):

- **Noise** — Perlin2D, Perlin3D, Simplex, Value, Worley, FBM, Ridged FBM, Domain Warp.
- **Math / shaping** — Add, Multiply, Divide, Clamp, Normalize, Remap, Smoothstep,
  Threshold, Bandpass, Curve, Pow, Bias, Gain, Mix, Min/Max, Invert, Mask.
- **Terrain analysis** — Altitude, Slope, Curvature, Ridge, Beach Mask, Erosion
  approximation, Exposure.
- **Vegetation** — Density Field, Peak Detect, Peak Prominence, Coverage Mask,
  Suppression Mask. (See [vegetation.md](./vegetation.md).)

Each primitive provides: schema, graph metadata, an **optional CPU evaluator**
(`evalCPU`, for editor preview, headless tests, and CPU consumers — see
[inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)), and a WGSL emitter /
module reference. Concrete capabilities like tessellation and mesh generation are
just more primitives (or compositions of them) with optional CPU support — not
engine-level subsystems. Third-party packages register additional primitives
without engine changes.

```ts
type NodePrimitive = {
  id: string;
  inputs: Port[]; outputs: Port[]; params: TSchema; // TypeBox object schema
  emitWGSL(ctx): WGSLExpr;          // or a WgslSourceRef — see graph-and-compiler.md
  evalCPU?(ctx): Value;
};
```

The reusable WGSL modules these reference live in `packages/procedural-wgsl/`
and are resolved by stable module ID — see
[graph-and-compiler.md](./graph-and-compiler.md).

## Self-describing WGSL primitives

A primitive does **not** have to be hand-written as a TypeScript `definePrimitive`
call. A primitive can instead be defined *directly in its `.wgsl` file*, with the
WGSL source as the authoritative definition. This is the ergonomic path for
**user-created functions** (e.g. in WebGPUToy) and keeps everything in one file —
no TypeScript wrapper required, automatic registration, and MCP publishing for
free.

**Dual approach: signature inference + annotation.** Two sources combine into one
primitive schema (policy:
[wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md)):

- **Signatures ⇒ mechanical types & wiring.** Reading the WGSL function signature
  yields input/output names, WGSL types, the return type, and module dependencies.
  This is everything the type system and port wiring need — not a full WGSL semantic
  AST.
- **Annotation ⇒ semantics & UX.** Signatures cannot know units, ranges, widget
  preferences, category, documentation, intent, safe defaults, or **inspector
  grouping** (sections / super-sections). The author supplies these in a YAML
  frontmatter block comment.

The two are merged into the complete primitive schema. Signature-derived types are
authoritative for wiring; YAML fills in editor/domain meaning.

**Format — YAML frontmatter in a block comment** (recommended over line-style
`/// @tag` annotations: easier to parse/validate with an off-the-shelf YAML
library, and it's just a WGSL comment, so it stays fully compatible with WGSL
tooling):

```wgsl
/*---
id: noise.perlin3d
category: Noise
description: Classic Perlin noise over 3D position.
pure: true
deterministic: true

inputs:
  position: { semantic: world-position, unit: m }

params:
  scale: { unit: 1/m, widget: slider, min: 0.0001, max: 1.0, default: 0.002 }

outputs:
  value: { range: [0, 1], semantic: scalar-field }
---*/
fn perlin3d(position: vec3<f32>, scale: f32) -> f32 {
  // ...
}
```

Merging the YAML above with the parsed signature produces the same shape a
TypeScript `definePrimitive` would (`id`, typed `inputs`/`outputs` with
`wgslType` + units/widgets/ranges/defaults).

**Editor grouping is metadata too.** The frontmatter can also declare how a
primitive's inputs/params are *grouped* in the inspector — sections and
super-sections, their order, and collapsed-by-default state — e.g. tagging a param
`section: Frequency` or declaring an ordered `sections:` list. The auto-generated
inspector renders these with the ported `EditorSuperSection` / `EditorParamSection`
/ `EditorSubsection` chrome (see
[editor.md → UI implementation](./editor.md#ui-implementation-sveltekit-app)).
Because grouping lives in the same single-source schema, the visual node, inspector,
declarative component, and MCP all present the same structure — no separately
authored layout.

**Authoring flow.** Write the function → read signature & dependencies →
validate WGSL (compile check) → draft an initial node schema from the signature →
prompt the author for any missing semantic metadata → save as a reusable graph node.
From a single self-documenting file, the editor gets the node palette entry,
property inspector, connection validation, UI components, and MCP API publishing —
see [editor.md](./editor.md) and
[collaboration-and-mcp.md](./collaboration-and-mcp.md). The signature+YAML
loader/merge step is described in [graph-and-compiler.md](./graph-and-compiler.md).
