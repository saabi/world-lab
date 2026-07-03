<script lang="ts">
	import { onMount } from 'svelte';
	import Section from '@world-lab/editor-ui/Section.svelte';
	import Subsection from '@world-lab/editor-ui/Subsection.svelte';
	import { listPrimitives, type NodePrimitive } from '@world-lab/graph';

	import {
		filterPaletteGroups,
		filterPrimitives,
		groupPrimitives,
		isPaletteGroupOpen,
		paletteGroupCount,
		primitiveBadge,
		togglePaletteGroupExpanded,
		type PaletteGroup,
		type PaletteMode
	} from './nodePaletteModel.js';
	import { loadPaletteState, savePaletteState } from './nodePaletteStorage.js';

	interface Props {
		onadd?: (primitiveId: string) => void;
	}

	let { onadd }: Props = $props();

	const allPrimitives = $derived(listPrimitives());

	let searchQuery = $state('');
	let paletteMode = $state<PaletteMode>('section');
	let expandedByMode = $state<Record<PaletteMode, Set<string>>>({
		section: new Set(),
		contract: new Set(),
		both: new Set()
	});

	const expandedGroups = $derived(expandedByMode[paletteMode]);

	const filteredPrimitives = $derived(filterPrimitives(allPrimitives, searchQuery));
	const visibleIds = $derived(new Set(filteredPrimitives.map((primitive) => primitive.id)));
	const groupedPrimitives = $derived(
		filterPaletteGroups(groupPrimitives(filteredPrimitives, paletteMode), visibleIds)
	);
	const searchActive = $derived(searchQuery.trim().length > 0);

	onMount(() => {
		const stored = loadPaletteState();
		paletteMode = stored.mode;
		expandedByMode = {
			section: new Set(stored.expandedByMode.section),
			contract: new Set(stored.expandedByMode.contract),
			both: new Set(stored.expandedByMode.both)
		};
	});

	function persistPaletteState() {
		savePaletteState({
			mode: paletteMode,
			expandedByMode: {
				section: [...expandedByMode.section],
				contract: [...expandedByMode.contract],
				both: [...expandedByMode.both]
			}
		});
	}

	function setPaletteMode(mode: PaletteMode) {
		paletteMode = mode;
		persistPaletteState();
	}

	function isGroupOpen(key: string): boolean {
		return isPaletteGroupOpen(key, expandedGroups, searchActive);
	}

	function toggleGroup(key: string) {
		expandedByMode = {
			...expandedByMode,
			[paletteMode]: togglePaletteGroupExpanded(key, expandedGroups)
		};
		persistPaletteState();
	}

	function subgroupDefaultOpen(key: string): boolean {
		return searchActive || isGroupOpen(key);
	}
</script>

{#snippet primitiveButton(primitive: NodePrimitive)}
	<button
		class="item"
		type="button"
		title={primitive.metadata?.help ?? primitive.metadata?.description ?? primitive.id}
		onclick={() => onadd?.(primitive.id)}
	>
		<span class="name">{primitive.id}</span>
		<span class="badge">{primitiveBadge(primitive, paletteMode)}</span>
	</button>
{/snippet}

{#snippet primitiveList(primitives: NodePrimitive[])}
	<div class="primitive-list">
		{#each primitives as primitive (primitive.id)}
			{@render primitiveButton(primitive)}
		{/each}
	</div>
{/snippet}

{#snippet renderSubgroup(group: PaletteGroup)}
	{#key `${searchQuery}:${group.key}`}
		<Subsection title={`${group.label} (${group.primitives.length})`} defaultOpen={subgroupDefaultOpen(group.key)}>
			{@render primitiveList(group.primitives)}
			{#if group.subgroups}
				{#each group.subgroups as subgroup (subgroup.key)}
					{@render renderSubgroup(subgroup)}
				{/each}
			{/if}
		</Subsection>
	{/key}
{/snippet}

{#snippet renderSectionGroup(group: PaletteGroup)}
	<Section
		title={`${group.label} (${paletteGroupCount(group)})`}
		open={isGroupOpen(group.key)}
		onToggle={() => toggleGroup(group.key)}
	>
		{#if group.subgroups && group.subgroups.length > 0}
			{#each group.subgroups as subgroup (subgroup.key)}
				{@render renderSubgroup(subgroup)}
			{/each}
		{/if}
		{@render primitiveList(group.primitives)}
	</Section>
{/snippet}

{#snippet renderContractGroup(group: PaletteGroup)}
	<Section
		title={`${group.label} (${group.primitives.length})`}
		open={isGroupOpen(group.key)}
		onToggle={() => toggleGroup(group.key)}
	>
		{@render primitiveList(group.primitives)}
	</Section>
{/snippet}

<div class="palette">
	<header class="palette-header">
		<input
			class="search"
			type="search"
			placeholder="Search nodes…"
			aria-label="Search primitives"
			bind:value={searchQuery}
		/>
		<div class="mode-switch" role="tablist" aria-label="Palette grouping mode">
			<button
				type="button"
				role="tab"
				class:active={paletteMode === 'section'}
				aria-selected={paletteMode === 'section'}
				onclick={() => setPaletteMode('section')}
			>
				Section
			</button>
			<button
				type="button"
				role="tab"
				class:active={paletteMode === 'contract'}
				aria-selected={paletteMode === 'contract'}
				onclick={() => setPaletteMode('contract')}
			>
				Contract
			</button>
			<button
				type="button"
				role="tab"
				class:active={paletteMode === 'both'}
				aria-selected={paletteMode === 'both'}
				onclick={() => setPaletteMode('both')}
			>
				Both
			</button>
		</div>
	</header>

	<div class="palette-body">
		{#if groupedPrimitives.length === 0}
			<p class="empty">No primitives match “{searchQuery.trim()}”.</p>
		{:else if paletteMode === 'contract'}
			{#each groupedPrimitives as group (group.key)}
				{@render renderContractGroup(group)}
			{/each}
		{:else}
			{#each groupedPrimitives as group (group.key)}
				{@render renderSectionGroup(group)}
			{/each}
		{/if}
	</div>
</div>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.palette-header {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 8px 6px;
		flex: 0 0 auto;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.search {
		width: 100%;
		box-sizing: border-box;
		font-size: 11px;
		padding: 5px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #0f1420;
		color: inherit;
	}

	.search:focus {
		outline: none;
		border-color: rgba(120, 170, 255, 0.55);
	}

	.mode-switch {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}

	.mode-switch button {
		font-size: 10px;
		padding: 4px 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
		opacity: 0.75;
	}

	.mode-switch button.active {
		opacity: 1;
		border-color: rgba(255, 255, 255, 0.35);
		background: #24304a;
	}

	.palette-body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 4px 8px 8px;
	}

	.empty {
		margin: 8px 0 0;
		font-size: 11px;
		opacity: 0.65;
	}

	.primitive-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 6px 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.item:hover {
		border-color: rgba(255, 255, 255, 0.28);
	}

	.name {
		font-size: 11px;
		font-weight: 500;
	}

	.badge {
		font-size: 10px;
		opacity: 0.6;
	}
</style>
