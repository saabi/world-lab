<script lang="ts">
	import { listPrimitives } from '@virtual-planet/graph';

	interface Props {
		onadd?: (primitiveId: string) => void;
	}

	let { onadd }: Props = $props();

	const primitives = $derived(listPrimitives());
</script>

<div class="palette">
	<h2 class="title">Primitives</h2>
	{#each primitives as primitive (primitive.id)}
		<button class="item" type="button" onclick={() => onadd?.(primitive.id)}>
			<span class="name">{primitive.id}</span>
			<span class="category">{primitive.category}</span>
		</button>
	{/each}
</div>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		height: 100%;
		overflow: auto;
	}

	.title {
		margin: 0 0 4px;
		font-size: 12px;
		font-weight: 600;
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
	}

	.item:hover {
		border-color: rgba(255, 255, 255, 0.28);
	}

	.name {
		font-size: 11px;
		font-weight: 500;
	}

	.category {
		font-size: 10px;
		opacity: 0.6;
	}
</style>
