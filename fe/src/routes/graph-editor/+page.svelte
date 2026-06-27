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
	}

	.page {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}
</style>
