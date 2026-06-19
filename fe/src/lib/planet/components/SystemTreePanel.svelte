<script lang="ts">
	import {
		isNodeEnabled,
		listSceneTreeRows,
		nodeKindLabel,
		setNodeEnabled
	} from '../scene/sceneTree.js';
	import type { PlanetScene, SceneNode } from '../scene/types.js';

	interface Props {
		scene: PlanetScene;
		/** Shared selection with the system map. */
		selectedId?: string | null;
	}

	let { scene = $bindable(), selectedId = $bindable(null) }: Props = $props();

	const rows = $derived(listSceneTreeRows(scene));

	function rowActive(node: SceneNode): boolean {
		return isNodeEnabled(scene, node.id) && node.enabled;
	}

	function toggleEnabled(nodeId: string, enabled: boolean) {
		scene = setNodeEnabled(scene, nodeId, enabled);
	}

	/** Richer label for bodies (type · radius · stand-in), plain kind otherwise. */
	function kindLabel(node: SceneNode): string {
		if (node.kind === 'body') {
			const km = Math.round(node.radiusMeters / 1000).toLocaleString();
			return `${node.bodyType.replace('_', ' ')} · ${km} km${node.standIn ? ' · stand-in' : ''}`;
		}
		return nodeKindLabel(node.kind);
	}
</script>

<aside class="system-tree" aria-label="System tree">
	<h2>System</h2>
	<ul class="tree-list">
		{#each rows as { node, depth } (node.id)}
			<li
				class="tree-row"
				class:inactive={!rowActive(node)}
				class:selected={node.id === selectedId}
				style:--depth={depth}
			>
				<div class="tree-label">
					<input
						type="checkbox"
						aria-label="enabled"
						checked={node.enabled}
						onchange={(e) => toggleEnabled(node.id, e.currentTarget.checked)}
					/>
					<button type="button" class="tree-name" onclick={() => (selectedId = node.id)}>
						{node.name}
					</button>
					<span class="tree-kind">{kindLabel(node)}</span>
				</div>
			</li>
		{/each}
	</ul>
</aside>

<style>
	.system-tree {
		flex-shrink: 0;
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
		margin: 0 0 6px;
		font-size: 14px;
		font-weight: 600;
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

	.tree-row.selected {
		background: rgba(107, 159, 255, 0.18);
		border-radius: 3px;
	}

	.tree-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.tree-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.tree-name:hover {
		color: #9ec0ff;
	}

	.tree-kind {
		opacity: 0.5;
		font-size: 11px;
		white-space: nowrap;
	}

	input[type='checkbox'] {
		accent-color: #6b9fff;
		flex-shrink: 0;
	}
</style>
