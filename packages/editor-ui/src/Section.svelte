<script lang="ts">
	let {
		title,
		open = false,
		onToggle,
		children
	}: {
		title: string;
		open?: boolean;
		onToggle?: () => void;
		children: import('svelte').Snippet;
	} = $props();

	const contentId = $derived(`super-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
</script>

<section class="super-section" class:open>
	<button
		type="button"
		class="super-header"
		aria-expanded={open}
		aria-controls={contentId}
		onclick={() => onToggle?.()}
	>
		<span class="super-chevron" aria-hidden="true">▸</span>
		<span class="super-title">{title}</span>
	</button>
	{#if open}
		<div id={contentId} class="super-body">
			{@render children()}
		</div>
	{/if}
</section>

<style>
	.super-section {
		margin: 4px 0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.super-header {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 10px;
		border: none;
		background: rgba(92, 60, 0, 0.55);
		color: #f0e6d8;
		font: 600 12px/1.3 system-ui, sans-serif;
		cursor: pointer;
		text-align: left;
	}

	.super-header:hover {
		background: rgba(120, 80, 0, 0.65);
	}

	.super-chevron {
		font-size: 10px;
		color: #c9a87a;
		transition: transform 0.12s ease;
	}

	.super-section.open .super-chevron {
		transform: rotate(90deg);
	}

	.super-body {
		padding: 4px 6px 8px;
	}
</style>
