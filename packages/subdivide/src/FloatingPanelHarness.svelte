<script lang="ts">
	import Subdivide from './Subdivide.svelte';
	import { createDefaultLayout } from './layout/defaultLayout.js';
	import type { LayoutDocument } from './layout/types.js';
	import type { FloatingPanelSpec } from './floatingPanel.js';

	let {
		open = false,
		side = 'right',
		panelZone = 'main',
		stretch = false,
		zoneLabels = { main: 'Main' },
		onfloatingpaneltoggle
	}: {
		open?: boolean;
		side?: FloatingPanelSpec['side'];
		panelZone?: string;
		stretch?: boolean;
		zoneLabels?: Record<string, string>;
		onfloatingpaneltoggle?: (panelId: string) => void;
	} = $props();

	let layout = $state<LayoutDocument>(createDefaultLayout('main'));
</script>

{#snippet main(paneId)}
	<div data-testid="main-content" data-pane-id={paneId}>Main</div>
{/snippet}

{#snippet sidebar()}
	<div data-testid="sidebar-content">Sidebar</div>
{/snippet}

<div class="harness">
	<Subdivide
		bind:layout
		zones={{ main }}
		{zoneLabels}
		floatingPanels={[{ id: 'sidebar', zone: panelZone, side, open, stretch, snippet: sidebar }]}
		{onfloatingpaneltoggle}
	/>
</div>

<style>
	.harness {
		position: relative;
		width: 400px;
		height: 300px;
	}
</style>
