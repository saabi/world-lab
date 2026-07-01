# @world-lab/runtime-cpu

CPU-side graph evaluation: camera math, frustum culling, resource loading, and
`evaluateGraphOutput` — a reference evaluator that walks a [`@world-lab/graph`](../graph)
document directly (double precision, no GPU) rather than compiling it to a shader.

```ts
import { evaluateGraphOutput } from '@world-lab/runtime-cpu';
```

`evaluateGraphOutput` backs the graph editor's CPU preview pane
(`@world-lab/graph-editor`'s `CpuPreviewPanel.svelte`) — a way to see a graph's output without
a GPU device or a compile step. `vegetation.ts`'s CPU vegetation-placement pass is also used as
a parity check against `@world-lab/runtime-webgpu`'s GPU vegetation-candidate compute pass in
that package's tests.

See `_docs/architecture/procedural-graph/briefs/M7-cpu-runtime.md`.
