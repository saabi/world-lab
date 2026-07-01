# @world-lab/editor-ui

Shared Svelte 5 editor chrome and parameter controls: collapsible sections/subsections,
vertical tabs, and a set of parameter controls (slider row, linear/log range, checkbox).
Generic UI building blocks with no dependency on the graph model, the scene editor, or any
other `@world-lab/*` package — usable standalone in any Svelte 5 (runes) project that wants
this look and feel.

```svelte
<script lang="ts">
	import Section from '@world-lab/editor-ui/Section.svelte';
	import SliderRow from '@world-lab/editor-ui/controls/SliderRow.svelte';
</script>

<Section title="Appearance">
	<SliderRow label="Roughness" bind:value={roughness} min={0} max={1} step={0.01} />
</Section>
```

Used by both [`@world-lab/graph-editor`](../graph-editor) (node inspector param forms) and
`apps/scene-editor` (the Appearance/Atmosphere/Render-settings param editors).
