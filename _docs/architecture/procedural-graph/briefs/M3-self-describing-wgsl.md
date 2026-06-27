# Brief — M3: Self-describing WGSL primitives

**Milestone:** M3 ([implementation-plan.md](../implementation-plan.md)) ·
**Packages:** `@virtual-planet/graph`, `@virtual-planet/compiler` ·
**Depends on:** M2 ✅ ·
**Design authority:**
[wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md) ·
**Stream docs:** [schema-and-primitives.md](../schema-and-primitives.md),
[graph-and-compiler.md](../graph-and-compiler.md) ·
**Contract author:** Codex · **Recommended executor:** Codex.

## Objective

Load a reusable WGSL function module whose `/*--- ... ---*/` YAML frontmatter
describes its semantics and editor metadata. Infer mechanical port types from WGSL
function signatures, merge the two sources into the same `NodePrimitive` shape used
by hand-written registrations, and discover stable module dependencies.

This is a **scoped signature reader**, not a WGSL semantic parser. Graph IR remains
the program representation and no parse tree enters the public API.

## Files

- `packages/graph/src/primitive.ts` — optional metadata contracts *(update)*
- `packages/compiler/package.json` — direct `yaml` dependency *(update)*
- `package-lock.json` — dependency lock update *(update)*
- `packages/compiler/src/primitiveLoader.ts` — reader + frontmatter merge *(new)*
- `packages/compiler/src/primitiveLoader.test.ts` — acceptance gate *(new)*
- `packages/compiler/src/index.ts` — re-export loader *(update)*

No `@virtual-planet/schema`, `procedural-wgsl`, renderer, editor, linker, or codegen
files. Use `yaml` `^2.4.2`; do not add a WGSL parser dependency.

## Graph metadata additions

Add these public types in `packages/graph/src/primitive.ts`:

```ts
export interface InspectorSectionSpec {
	id: string;
	label?: string;
	order?: number;
	collapsed?: boolean;
	parent?: string;
}

export interface PrimitiveMetadata {
	description?: string;
	pure?: boolean;
	deterministic?: boolean;
	color?: string;
	icon?: string;
	keywords?: string[];
	sections?: InspectorSectionSpec[];
}

export interface FieldMetadata {
	wgslType?: string;
	description?: string;
	semantic?: string;
	unit?: string;
	widget?: string;
	min?: number;
	max?: number;
	default?: number | boolean | number[];
	range?: readonly [number, number];
	section?: string;
}
```

Extend existing types without breaking current primitives:

```ts
export interface PortSpec {
	// existing fields unchanged
	metadata?: FieldMetadata;
}

export interface ParamSpec {
	// existing fields unchanged
	metadata?: FieldMetadata;
}

export interface NodePrimitive {
	// existing fields unchanged
	metadata?: PrimitiveMetadata;
}
```

All fields are optional. Existing hand-written primitives and tests must remain
source-compatible. Metadata is plain serializable data; no TypeBox or UI objects.

## Frontmatter grammar

The source may contain at most one YAML frontmatter block, and
`loadWgslPrimitive` requires exactly one:

```wgsl
/*---
id: noise.perlin3d
entry: perlin3d
category: Noise
description: Classic Perlin noise over a 3D position.
pure: true
deterministic: true
color: "#5d8cff"
icon: perlin
keywords: [noise, fbm]

sections:
  - { id: frequency, label: Frequency, order: 10, collapsed: false }

inputs:
  position:
    semantic: body-direction
    space: body_dir
    unit: none
    section: frequency
  scale:
    unit: 1/m
    widget: slider
    min: 0.0001
    max: 1
    default: 0.002
    section: frequency

outputs:
  value:
    semantic: scalar-field
    range: [0, 1]
---*/
// @use noise.hash
fn perlin3d(position: vec3<f32>, scale: f32) -> f32 {
	// ...
}
```

Required top-level keys:

- `id`: non-empty string
- `category`: non-empty string
- `outputs`: mapping with exactly one output name

Optional top-level keys:

- `entry`: function name; may be omitted only when the source contains one function
- `description`, `pure`, `deterministic`, `color`, `icon`, `keywords`, `sections`
- `inputs`: mapping keyed by signature parameter name

Unknown top-level keys and wrong value types throw `Error`. YAML aliases are
disabled. The decoded value must be a plain mapping/array/scalar tree.

Input annotations are optional. An annotation for a name absent from the selected
signature throws. The single output annotation supplies the graph output name.
M3 does not support multiple/struct return values.

Field keys are limited to `description`, `semantic`, `space`, `unit`, `widget`,
`min`, `max`, `default`, `range`, and `section`. `space` must be a valid
`CoordinateSpace` and is assigned to `PortSpec.space`; it is not copied into
`FieldMetadata`. Unknown keys or invalid scalar/tuple types throw. Section IDs
referenced by fields must exist when `sections` is present.

## Dependency directive

WGSL has no native import syntax. M3 uses a WGSL-compatible line-comment directive:

```wgsl
// @use noise.hash
// @use math.remap
```

Module IDs match `[A-Za-z0-9][A-Za-z0-9._/-]*`. Preserve first-seen order and
deduplicate repeated IDs. Ignore `@use` text inside block comments. A line beginning
with `// @use` but containing an invalid or missing ID throws.

This is discovery only. M3 does not modify `WgslModule.dependencies`; a later
procedural-WGSL resolver can populate that field from loader output.

## Compiler public surface

In `packages/compiler/src/primitiveLoader.ts`:

```ts
import type { NodePrimitive } from '@virtual-planet/graph';

export interface WgslFnParameter {
	name: string;
	type: string;
}

export interface WgslFnSignature {
	name: string;
	parameters: WgslFnParameter[];
	returnType: string;
}

export interface WgslSignatureReader {
	readSignatures(source: string): WgslFnSignature[];
	readImports(source: string): string[];
}

export const textWgslSignatureReader: WgslSignatureReader;

export interface LoadWgslPrimitiveInput {
	moduleId: string;
	source: string;
	reader?: WgslSignatureReader;
}

export interface LoadedWgslPrimitive {
	primitive: NodePrimitive;
	imports: string[];
}

export function loadWgslPrimitive(input: LoadWgslPrimitiveInput): LoadedWgslPrimitive;
```

`loadWgslPrimitive` is pure and does not call `registerPrimitive`. Callers choose
when and where registration occurs.

## Signature-reader contract

The in-repo reader supports the deliberately bounded grammar required by M3:

- module-level `fn name(param: type, ...) -> returnType {`
- signatures may span lines and contain arbitrary whitespace
- parameter and return types may contain balanced angle brackets, such as
  `vec3<f32>` or `array<vec4<f32>, 4>`
- line comments and WGSL nested `/* ... */` comments are ignored
- text resembling `fn` inside comments is ignored
- duplicate function names, unterminated comments/signatures, unbalanced delimiters,
  missing parameter types, or missing return types throw `Error`

Attributes on parameters/returns, generic functions, pointer/resource types,
struct/tuple returns, and function declarations without bodies are out of scope.
The reader returns trimmed WGSL type strings but performs no semantic validation.

## Authoritative type mapping and merge

Signature types, never YAML, determine graph port types:

| WGSL | Graph `DataType` |
|------|------------------|
| `f32` | `f32` |
| `bool` | `bool` |
| `vec2<f32>` | `vec2f` |
| `vec3<f32>` | `vec3f` |
| `vec4<f32>` | `vec4f` |

Whitespace inside vector types is accepted and normalized for matching. Any other
selected-entry parameter or return type throws
`Error("Unsupported WGSL port type: ...")`. Resource handles and integer ports are
not introduced by M3.

The selected signature becomes:

- one `PortSpec` input per function parameter, preserving signature order
- one `PortSpec` output named by the sole `outputs` frontmatter key
- optional `PortSpec.space` values from YAML, defaulting to `none` by omission
- `params: []`
- `wgsl: { moduleId: input.moduleId, entry: signature.name }`
- `category` and optional `metadata` from frontmatter
- each port's `metadata.wgslType` from its exact trimmed signature type, merged with
  its YAML field metadata

Frontmatter cannot override inferred type, parameter order, entry name, or module
ID. Omit empty `metadata` objects so the loaded primitive deep-equals a hand-written
primitive using the same optional fields.

## Acceptance gate

`primitiveLoader.test.ts` must prove:

1. A multiline WGSL source using the example shape loads to the same
   `NodePrimitive` object as an explicitly hand-written expected object.
2. Signature parameter order and exact `wgslType` metadata are preserved.
3. `// @use` IDs are ordered and deduplicated.
4. A custom `WgslSignatureReader` can be injected.
5. A single function may omit `entry`; multiple functions require it.
6. Function-like text and `@use` text inside comments are ignored.
7. YAML cannot override mechanical types; an unsupported WGSL type throws.
8. Malformed frontmatter, unknown keys, mismatched input names, invalid section
   references, and invalid dependency directives throw.
9. Existing compiler and graph tests remain green.

Run:

```sh
npm run check -w @virtual-planet/graph
npm test -w @virtual-planet/graph
npm run check -w @virtual-planet/compiler
npm test -w @virtual-planet/compiler
```

## Out of scope

No full WGSL AST, Lezer/Use.GPU parser, WGSL validation/device compilation, automatic
registration, file-system resolver, source rewriting, codegen/linker changes,
multi-output structs, attributes, resource/pointer/integer ports, YAML-authored
types, CPU evaluator generation, editor UI, or procedural standard-library
migration.

## Done when

Both touched packages pass check/test gates, the loader output equals the
hand-written primitive shape, the scoped parser rejects malformed/unsupported input
deterministically, no parser tree is exported, and the full workspace tests remain
green.

## Handoff

→ **M9 — standalone editor contract** · architect pins the minimum vertical slice
using the completed graph/compiler/runtime surfaces, then implementation proceeds
behind the swappable graph-canvas adapter. M3 finishes the remaining compiler-side
prerequisite for that integration.
