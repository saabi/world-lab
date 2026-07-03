<script lang="ts">
	import type { PortMatch } from '@world-lab/graph';
	import { filterPrimitives } from './nodePaletteModel.js';

	interface Props {
		matches: PortMatch[];
		onselect?: (primitiveId: string) => void;
		onclose?: () => void;
	}

	let { matches, onselect, onclose }: Props = $props();

	let searchQuery = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let menuRoot = $state<HTMLDivElement | null>(null);

	const filtered = $derived.by(() => {
		const primitives = matches.map((match) => match.primitive);
		const visible = filterPrimitives(primitives, searchQuery);
		const visibleIds = new Set(visible.map((primitive) => primitive.id));
		return matches.filter((match) => visibleIds.has(match.primitive.id));
	});

	$effect(() => {
		if (inputEl) {
			inputEl.focus();
		}
	});

	$effect(() => {
		const root = menuRoot;
		if (!root) return;

		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && root.contains(target)) return;
			onclose?.();
		};

		window.addEventListener('pointerdown', onPointerDown, true);
		return () => window.removeEventListener('pointerdown', onPointerDown, true);
	});

	function select(match: PortMatch) {
		onselect?.(match.primitive.id);
		onclose?.();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onclose?.();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={menuRoot}
	class="connect-menu nodrag nopan"
	role="dialog"
	aria-label="Connect compatible node"
	tabindex="-1"
	onkeydown={onKeydown}
>
	<input
		bind:this={inputEl}
		class="search nodrag nopan"
		type="search"
		placeholder="Search compatible nodes…"
		aria-label="Search compatible nodes"
		bind:value={searchQuery}
		onpointerdown={(event) => event.stopPropagation()}
	/>
	<div class="list">
		{#if filtered.length === 0}
			<p class="empty">No compatible nodes match “{searchQuery.trim()}”.</p>
		{:else}
			{#each filtered as match (match.primitive.id)}
				<button
					class="item"
					type="button"
					title={match.primitive.metadata?.help ??
						match.primitive.metadata?.description ??
						match.primitive.id}
					onclick={() => select(match)}
				>
					<span class="name">{match.primitive.id}</span>
					<span class="badge">→ {match.portName}</span>
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.connect-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 20;
		min-width: 220px;
		max-width: 320px;
		max-height: 240px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: #151a28;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
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

	.list {
		display: flex;
		flex-direction: column;
		gap: 3px;
		overflow: auto;
		min-height: 0;
	}

	.empty {
		margin: 4px 0;
		font-size: 10px;
		opacity: 0.65;
	}

	.item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 5px 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
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
