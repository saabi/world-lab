<script lang="ts">
	import { createToySolarSystemScene } from '$lib/planet/scene/solarSystem.js';
	import { getNode } from '$lib/planet/scene/sceneTree.js';
	import SystemMapPanel from '$lib/planet/components/SystemMapPanel.svelte';
	import SystemTreePanel from '$lib/planet/components/SystemTreePanel.svelte';

	let scene = $state(createToySolarSystemScene());
	let selectedId = $state<string | null>(null);

	const selectedNode = $derived(selectedId ? (getNode(scene, selectedId) ?? null) : null);
	const selectedBody = $derived(
		selectedNode && selectedNode.kind === 'body' ? selectedNode : null
	);
</script>

<div class="system-page">
	<aside class="system-sidebar">
		<SystemTreePanel bind:scene bind:selectedId />
		{#if selectedBody}
			<div class="edit-body">
				<span class="edit-name">{selectedBody.name}</span>
				<!-- Stub for the nested per-body editor route
				     (/system/{system}/planet/{name}/…); opens the legacy /planet editor
				     for now — loading the body's own params is future work. -->
				<a class="edit-link" href="/planet">Edit in planet editor →</a>
			</div>
		{/if}
		<p class="hint">Click a body in the map or tree to select and zoom to it.</p>
	</aside>
	<main class="system-main">
		<SystemMapPanel {scene} bind:selectedId />
	</main>
</div>

<style>
	.system-page {
		display: flex;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: #05070e;
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
	}

	.system-sidebar {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 300px;
		flex-shrink: 0;
		padding: 12px;
		box-sizing: border-box;
		overflow-y: auto;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
	}

	.system-main {
		flex: 1;
		min-width: 0;
		padding: 12px;
		box-sizing: border-box;
	}

	.system-main :global(.system-map) {
		height: 100%;
	}

	.system-main :global(.map-canvas) {
		height: calc(100% - 36px);
	}

	.edit-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 10px;
		background: rgba(8, 10, 20, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
	}

	.edit-name {
		font-weight: 600;
	}

	.edit-link {
		color: #9ec0ff;
		text-decoration: none;
		font-size: 12px;
	}

	.edit-link:hover {
		text-decoration: underline;
	}

	.hint {
		margin: 0;
		font-size: 11px;
		opacity: 0.6;
	}
</style>
