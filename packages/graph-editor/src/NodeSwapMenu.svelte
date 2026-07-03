<script lang="ts">
	import { listSwapFamily, type NodePrimitive } from '@world-lab/graph';
	import { focusTrap } from './focusTrap.js';
	import { filterPrimitives } from './nodePaletteModel.js';

	interface Props {
		currentPrimitiveId: string;
		onselect?: (primitiveId: string) => void;
		onclose?: () => void;
	}

	let { currentPrimitiveId, onselect, onclose }: Props = $props();

	let searchQuery = $state('');
	let menuRoot = $state<HTMLDivElement | null>(null);

	const candidates = $derived(listSwapFamily(currentPrimitiveId));
	const filtered = $derived(filterPrimitives(candidates, searchQuery));

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

	function select(primitive: NodePrimitive) {
		if (primitive.id === currentPrimitiveId) {
			onclose?.();
			return;
		}
		onselect?.(primitive.id);
		onclose?.();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={menuRoot}
	class="swap-menu nodrag nopan"
	role="dialog"
	aria-label="Replace node"
	tabindex="-1"
	use:focusTrap={{ onEscape: () => onclose?.() }}
>
	<input
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
			{#each filtered as primitive (primitive.id)}
				<button
					class="item"
					class:current={primitive.id === currentPrimitiveId}
					type="button"
					title={primitive.metadata?.help ?? primitive.metadata?.description ?? primitive.id}
					onclick={() => select(primitive)}
				>
					<span class="name">{primitive.id}</span>
					{#if primitive.id === currentPrimitiveId}
						<span class="badge">current</span>
					{:else if primitive.metadata?.description}
						<span class="badge">{primitive.metadata.description}</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.swap-menu {
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

	.item.current {
		border-color: rgba(93, 140, 255, 0.45);
		background: #24304a;
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
