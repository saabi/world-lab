<script lang="ts">
	import '@world-lab/graph';
	import GraphEditor from '@world-lab/graph-editor/GraphEditor.svelte';
	import WebGpuToyLogo from '$lib/components/WebGpuToyLogo.svelte';
</script>

<svelte:head>
	<title>WebGPUToy</title>
</svelte:head>

<div class="page">
	<GraphEditor>
		{#snippet toolbarStart()}
			<WebGpuToyLogo variant="both" theme="dark" size={1.75} decorative />
		{/snippet}
	</GraphEditor>
</div>

<style>
	:global(html, body) {
		height: 100%;
		margin: 0;
		background: #04060d;
		color: #e8ecf8;
	}

	.page {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
