<script lang="ts">
	import type { Snippet } from 'svelte';
	import TabIcon from './TabIcon.svelte';
	import type { VerticalTab } from './verticalTabs.js';

	let {
		tabs,
		activeId,
		onSelect,
		content
	}: {
		tabs: VerticalTab[];
		activeId: string;
		onSelect: (id: string) => void;
		content: Snippet<[id: string]>;
	} = $props();

	const panelId = $derived(`editor-tabs-${tabs.map((t) => t.id).join('-')}`);
</script>

<div class="vertical-tabs">
	<div class="tab-rail" role="tablist" aria-label="Section tabs">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				class="tab-btn"
				class:active={activeId === tab.id}
				role="tab"
				id="{panelId}-tab-{tab.id}"
				aria-selected={activeId === tab.id}
				aria-controls="{panelId}-panel-{tab.id}"
				aria-label={tab.title}
				title={tab.title}
				onclick={() => onSelect(tab.id)}
			>
				<TabIcon name={tab.icon} />
			</button>
		{/each}
	</div>
	<div
		class="tab-content"
		role="tabpanel"
		id="{panelId}-panel-{activeId}"
		aria-labelledby="{panelId}-tab-{activeId}"
	>
		{@render content(activeId)}
	</div>
</div>

<style>
	.vertical-tabs {
		display: flex;
		flex: 1;
		min-height: 0;
		gap: 0;
	}

	.tab-rail {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		width: 36px;
		padding: 2px 0;
		background: rgba(8, 10, 20, 0.5);
		border-right: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px 0 0 6px;
		position: sticky;
		top: 0;
		align-self: flex-start;
	}

	.tab-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		margin: 2px auto;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #9ec0ff;
		cursor: pointer;
	}

	.tab-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.tab-btn.active {
		background: rgba(199, 166, 255, 0.2);
		color: #c7a6ff;
		box-shadow: inset 2px 0 0 #c7a6ff;
	}

	.tab-content {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 4px 8px 8px;
	}
</style>
