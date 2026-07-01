# @world-lab/graph

Typed Graph IR: nodes, ports (data + coordinate-space), validation, serialization.

This is the shared node-graph model the rest of the World Lab procedural stack is built on —
[`@world-lab/compiler`](../compiler) compiles it to WGSL, [`@world-lab/runtime-cpu`](../runtime-cpu)
and [`@world-lab/runtime-webgpu`](../runtime-webgpu) evaluate it, and
[`@world-lab/graph-editor`](../graph-editor) edits it visually. It has no rendering or UI
dependency of its own — just the graph data model, a primitive registry, and validation.

```ts
import { registerPrimitive, type GraphDocument, validateGraph } from '@world-lab/graph';
```

- **Primitives** (`src/primitives/*`) are self-registering: importing `@world-lab/graph` runs
  their `registerPrimitive(...)` calls as a side effect, which is why this package declares
  `"sideEffects": true` — a bundler tree-shaking it as side-effect-free would silently drop
  primitive registration.
- **Ports** carry both plain data types and coordinate-space metadata (`portMatch.ts`), so the
  compiler can validate and convert between spaces at connection time.
- **Contracts** (`contract.ts`) group primitives into swappable families (e.g. interchangeable
  noise functions) for the editor's node-swap UI.

See `_docs/architecture/procedural-graph/schema-and-primitives.md` and
`_docs/architecture/procedural-graph/implementation-plan.md` for the full design.
