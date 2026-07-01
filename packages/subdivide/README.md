# @world-lab/subdivide

Blender-style resizable pane layouts for Svelte 5. The layout tree engine and Svelte
components are both ported and extended from
[saabi/svelte-subdivide](https://github.com/saabi/svelte-subdivide) (see that package's own
`LICENSE` in this directory for its distinct attribution).

## Layout document

Serializable layout JSON uses `zone: string` on each pane (opaque key into a host zone registry) instead of upstream `childProps`:

```ts
import {
	createDefaultLayout,
	defaultSceneEditorLayout,
	parseLayoutDocument,
	buildRuntimeTree,
	serializeRuntime
} from '@world-lab/subdivide';

const doc = defaultSceneEditorLayout();
const { root, panes, dividers } = buildRuntimeTree(doc);
const roundTrip = serializeRuntime(root);
```

## Scene editor default

`defaultSceneEditorLayout()` is a horizontal split: left column (~22%) stacks `outliner`, `properties`, and `renderSettings`; right column (~78%) is `viewport`.

## Svelte components

```svelte
<script>
	import Subdivide from '@world-lab/subdivide/Subdivide.svelte';
</script>

<Subdivide bind:layout zones={zoneSnippets} />
```
