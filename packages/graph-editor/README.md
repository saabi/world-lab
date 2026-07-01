# @world-lab/graph-editor

Reusable Svelte 5 components and editing logic for [`@world-lab/graph`](../graph) documents —
node canvas, inspector, primitive palette, validation panel, code/markup views, and per-target
preview panels (CPU, GPU, effect, mesh, audio). This package is deliberately **field-graph
only**: it edits typed node graphs and does not import a host application's own scene tree,
`$lib`/`$app` modules, or app-specific routes (`packages/graph-editor/src/sceneFree.test.ts` is
an ADR guard test enforcing exactly that boundary).

```svelte
<script lang="ts">
	import GraphEditor from '@world-lab/graph-editor/GraphEditor.svelte';
</script>

<GraphEditor bind:graph onchange={handleChange} />
```

Both apps in this monorepo build on it: `apps/webgputoy` is a thin SvelteKit shell around it
(nearly all its logic and tests live here, not in the app); `apps/scene-editor` embeds it as
the per-node procedural-material editor inside the larger scene/solar-system editor.

Depends on `@world-lab/{graph,schema,compiler,procedural-wgsl,runtime-cpu,runtime-webgpu,
editor-ui,subdivide}` — it's the integration point where the whole graph engine meets a UI.

See `_docs/architecture/procedural-graph/editor.md` and
`_docs/architecture/procedural-graph/editor-and-scene-integration.md`.
