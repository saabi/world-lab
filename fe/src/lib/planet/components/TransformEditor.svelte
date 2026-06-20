<script lang="ts">
	import { eulerToQuat, quatToEuler } from '../scene/transform.js';
	import type { Transform } from '../scene/types.js';

	interface Props {
		transform: Transform;
		onchange?: (next: Transform) => void;
	}

	let { transform, onchange }: Props = $props();

	const RAD2DEG = 180 / Math.PI;
	const DEG2RAD = Math.PI / 180;
	const AXES = ['X', 'Y', 'Z'] as const;

	// Position shown in km; rotation as Euler degrees.
	const posKm = $derived(transform.position.map((v) => v / 1000));
	const rotDeg = $derived(quatToEuler(transform.rotation).map((r) => r * RAD2DEG));

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

	const round = (n: number) => Math.round(n * 1000) / 1000;
</script>

<div class="transform-editor">
	<span class="te-label">Position (km)</span>
	<div class="te-row">
		{#each AXES as ax, i (ax)}
			<label class="te-field">
				<span class="te-ax">{ax}</span>
				<input
					type="number"
					step="any"
					value={round(posKm[i])}
					onchange={(e) => setPos(i, Number(e.currentTarget.value))}
				/>
			</label>
		{/each}
	</div>
	<span class="te-label">Rotation (°)</span>
	<div class="te-row">
		{#each AXES as ax, i (ax)}
			<label class="te-field">
				<span class="te-ax">{ax}</span>
				<input
					type="number"
					step="any"
					value={round(rotDeg[i])}
					onchange={(e) => setRot(i, Number(e.currentTarget.value))}
				/>
			</label>
		{/each}
	</div>
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
</style>
