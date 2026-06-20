<script lang="ts">
	import { eulerToQuat, quatToEuler } from '../scene/transform.js';
	import { fieldViews, termsLabel } from '../scene/fieldViews.js';
	import type { SceneNode, Transform, TransformField } from '../scene/types.js';

	interface Props {
		node: SceneNode;
		/** The node after evaluateScene — supplies live values for driven channels. */
		evaluated: SceneNode;
		onchange?: (next: Transform) => void;
	}

	let { node, evaluated, onchange }: Props = $props();

	const RAD2DEG = 180 / Math.PI;
	const DEG2RAD = Math.PI / 180;
	const AXES = ['X', 'Y', 'Z'] as const;

	const transform = $derived(node.transform);
	const views = $derived(new Map(fieldViews(node, evaluated).map((v) => [v.channel, v])));

	function setPos(i: number, km: number) {
		const p = [...transform.position] as [number, number, number];
		p[i] = km * 1000;
		onchange?.({ ...transform, position: p });
	}

	function setRot(i: number, deg: number) {
		const e = quatToEuler(transform.rotation);
		e[i] = deg * DEG2RAD;
		onchange?.({ ...transform, rotation: eulerToQuat(e[0], e[1], e[2]) });
	}

	function setScale(i: number, v: number) {
		const s = [...(transform.scale ?? [1, 1, 1])] as [number, number, number];
		s[i] = v;
		onchange?.({ ...transform, scale: s });
	}

	const round = (n: number) => Math.round(n * 1000) / 1000;
</script>

{#snippet axisRow(
	prefix: 'position' | 'rotation' | 'scale',
	toDisplay: (v: number) => number,
	onSet: (i: number, display: number) => void
)}
	<div class="te-row">
		{#each AXES as ax, i (ax)}
			{@const view = views.get((prefix + ax) as TransformField)}
			<div class="te-field">
				<span class="te-ax">{ax}</span>
				{#if view && view.terms.length > 0}
					<!-- Driven: show the folded expression + live value (read-only). -->
					<span
						class="te-driven"
						title={`${termsLabel(view.terms)} = ${round(toDisplay(view.value))}`}
					>
						ƒ {termsLabel(view.terms)} <span class="te-val">= {round(toDisplay(view.value))}</span>
					</span>
				{:else}
					<input
						type="number"
						step="any"
						value={round(toDisplay(view ? view.literal : 0))}
						onchange={(e) => onSet(i, Number(e.currentTarget.value))}
					/>
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

<div class="transform-editor">
	<span class="te-label">Position (km)</span>
	{@render axisRow('position', (v) => v / 1000, (i, km) => setPos(i, km))}
	<span class="te-label">Rotation (°)</span>
	{@render axisRow('rotation', (v) => v * RAD2DEG, (i, deg) => setRot(i, deg))}
	<span class="te-label">Scale</span>
	{@render axisRow('scale', (v) => v, (i, v) => setScale(i, v))}
</div>

<style>
	.transform-editor {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.te-label {
		font-size: 11px;
		opacity: 0.7;
	}

	.te-row {
		display: flex;
		gap: 5px;
	}

	.te-field {
		display: flex;
		align-items: center;
		gap: 3px;
		flex: 1;
		min-width: 0;
		font-size: 11px;
	}

	.te-ax {
		opacity: 0.6;
		width: 0.8em;
	}

	.te-field input {
		flex: 1;
		min-width: 0;
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 4px;
	}

	/* Driven channel: read-only expression + live value (Blender-ish accent). */
	.te-driven {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 3px;
		align-items: baseline;
		font-family: ui-monospace, monospace;
		font-size: 10px;
		color: #c7a6ff;
		background: rgba(124, 92, 255, 0.12);
		border: 1px solid rgba(124, 92, 255, 0.3);
		border-radius: 4px;
		padding: 2px 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.te-driven .te-val {
		opacity: 0.7;
		color: #e8ecf8;
	}
</style>
