<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		defaultOpen = false,
		children
	}: {
		title: string;
		defaultOpen?: boolean;
		children: Snippet;
	} = $props();
</script>

<details class="subsection" open={defaultOpen}>
	<summary>{title}</summary>
	<div class="subsection-body">
		{@render children()}
	</div>
</details>

<style>
	.subsection {
		margin: 3px 0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.subsection > summary {
		list-style: none;
		cursor: pointer;
		user-select: none;
		padding: 4px 8px;
		background: rgba(255, 255, 255, 0.04);
		color: #aab2c8;
		font-size: 11px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.subsection > summary::-webkit-details-marker {
		display: none;
	}

	.subsection > summary::before {
		content: '▸';
		font-size: 9px;
		color: #9ec0ff;
		transition: transform 0.12s ease;
	}

	.subsection[open] > summary::before {
		transform: rotate(90deg);
	}

	.subsection > summary:hover {
		background: rgba(255, 255, 255, 0.07);
	}

	.subsection-body {
		padding: 4px 6px 6px;
	}
</style>
