# @world-lab/compiler

Graph compiler: dependency slicing, WGSL codegen, module resolution, shader linking.

Takes a [`@world-lab/graph`](../graph) `GraphDocument` and a target output, and produces
compiled WGSL — slicing the graph down to only the nodes a given output actually depends on,
generating the per-node WGSL expressions, resolving standard-library module includes via
[`@world-lab/procedural-wgsl`](../procedural-wgsl), and linking the result into a single
shader module.

```ts
import { compileGraph } from '@world-lab/compiler';

const result = compileGraph(graphDocument, { outputId: 'terrainColor' });
// result.wgsl, result.entryPoints, ...
```

Compilation is pure and synchronous — no GPU device required. `@world-lab/runtime-webgpu` and
`@world-lab/runtime-cpu` consume its output; they own the actual device/CPU execution.

See `_docs/architecture/procedural-graph/wgsl-parsing-and-codegen.md` for the compilation
model, and `_docs/architecture/procedural-graph/briefs/M4-slicing.md` / `M5-codegen.md` /
`M6-linker.md` for how slicing, codegen, and linking were built up.
