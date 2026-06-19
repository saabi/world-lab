<script lang="ts">
	import { collectSceneLighting } from '../scene/collectLights.js';
	import {
		isNodeEnabled,
		listSceneTreeRows,
		nodeKindLabel,
		setNodeEnabled
	} from '../scene/sceneTree.js';
	import { createDefaultPlanetScene } from '../scene/defaults.js';
	import { createToySolarSystemScene } from '../scene/solarSystem.js';
	import type { PlanetScene, SceneNode } from '../scene/types.js';

	interface Props {
		scene: PlanetScene;
		illuminationOn: boolean;
	}

	let { scene = $bindable(), illuminationOn }: Props = $props();

	const rows = $derived(listSceneTreeRows(scene));
	const collected = $derived(collectSceneLighting(scene, illuminationOn));
	const activeLightCount = $derived(collected.lights.length);
	const ambientActive = $derived(
		collected.ambient[0] > 0 || collected.ambient[1] > 0 || collected.ambient[2] > 0
	);

	function isLightNode(node: SceneNode): boolean {
		return (
			node.kind === 'directional_light' ||
			node.kind === 'point_light' ||
			node.kind === 'ambient_light'
		);
	}

	/** Richer label for bodies (type · radius · stand-in), plain kind otherwise. */
	function kindLabel(node: SceneNode): string {
		if (node.kind === 'body') {
			const km = Math.round(node.radiusMeters / 1000).toLocaleString();
			return `${node.bodyType.replace('_', ' ')} · ${km} km${node.standIn ? ' · stand-in' : ''}`;
		}
		return nodeKindLabel(node.kind);
	}

	function rowActive(node: SceneNode): boolean {
		return isNodeEnabled(scene, node.id) && node.enabled;
	}

	function toggleEnabled(nodeId: string, enabled: boolean) {
		scene = setNodeEnabled(scene, nodeId, enabled);
	}
</script>

<aside class="scene-tree-panel" aria-label="Scene tree">
	<h2>Scene Tree</h2>
	<div class="preset-row">
		<button type="button" onclick={() => (scene = createDefaultPlanetScene())}>Default</button>
		<button type="button" onclick={() => (scene = createToySolarSystemScene())}>
			Toy Solar System
		</button>
	</div>
	<p class="scene-readout">
		{#if illuminationOn}
			Active lights: {activeLightCount} · Ambient: {ambientActive ? 'on' : 'off'}
		{:else}
			Illumination off — enable in editor
		{/if}
	</p>
	<ul class="tree-list">
		{#each rows as { node, depth } (node.id)}
			<li class="tree-row" class:inactive={!rowActive(node)} style:--depth={depth}>
				<label class="tree-label">
					<input
						type="checkbox"
						checked={node.enabled}
						onchange={(e) => toggleEnabled(node.id, e.currentTarget.checked)}
					/>
					<span class="tree-name">{node.name}</span>
					{#if isLightNode(node)}
						<span class="tree-status" class:active={rowActive(node)}>
							{rowActive(node) ? 'on' : 'off'}
						</span>
					{:else}
						<span class="tree-kind">{kindLabel(node)}</span>
					{/if}
				</label>
			</li>
		{/each}
	</ul>
</aside>

<style>
	.scene-tree-panel {
		flex-shrink: 0;
		max-height: 40vh;
		overflow-y: auto;
		padding: 10px 12px 14px;
		background: rgba(8, 10, 20, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
		box-sizing: border-box;
	}

	h2 {
		margin: 0 0 4px;
		font-size: 14px;
		font-weight: 600;
	}

	.preset-row {
		display: flex;
		gap: 6px;
		margin: 0 0 6px;
	}

	.preset-row button {
		flex: 1;
		font: 11px/1.2 system-ui, sans-serif;
		padding: 3px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.preset-row button:hover {
		background: #252d45;
	}

	.scene-readout {
		margin: 0 0 8px;
		font-size: 11px;
		opacity: 0.7;
	}

	.tree-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tree-row {
		margin: 2px 0;
		padding-left: calc(var(--depth) * 14px);
	}

	.tree-row.inactive {
		opacity: 0.55;
	}

	.tree-label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 12px;
	}

	.tree-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tree-kind {
		opacity: 0.5;
		font-size: 11px;
		white-space: nowrap;
	}

	.tree-status {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 5px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.45);
	}

	.tree-status.active {
		background: rgba(107, 159, 255, 0.25);
		color: #9ec0ff;
	}

	input[type='checkbox'] {
		accent-color: #6b9fff;
		flex-shrink: 0;
	}
</style>
