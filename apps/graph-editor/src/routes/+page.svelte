<script lang="ts">
	import '@virtual-planet/graph';
	import GraphEditor from '@virtual-planet/graph-editor/GraphEditor.svelte';
</script>

<svelte:head>
	<title>Graph Editor</title>
</svelte:head>

<div class="page">
	<GraphEditor />
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
