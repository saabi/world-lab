<script lang="ts">
	import { bodyAtmosphereSliders } from '../params/paramEditorSchema.js';
	import { resolveBodyAtmosphere } from '../scene/bodyAtmosphere.js';
	import type { BodyAtmosphere, BodyNode } from '../scene/types.js';
	import { SliderRow } from '@virtual-planet/editor-ui';
	import '@virtual-planet/editor-ui/controls/sliderList.css';

	// Per-body atmosphere *design* editor (planet/moon). Atmosphere is body data
	// (body-vs-viewport-state.md); the ray-march step count is render quality, edited
	// elsewhere, not here. Strengths are radius-invariant (normalized by R_ref/radius at
	// upload), so an authored value reads the same at any body size.

	interface Props {
		body: BodyNode;
		onatmosphere: (a: BodyAtmosphere) => void;
	}
	let { body, onatmosphere }: Props = $props();

	const current = $derived(resolveBodyAtmosphere(body));
	const sliders = $derived(bodyAtmosphereSliders(body.radiusMeters));

	function set(patch: Partial<BodyAtmosphere>) {
		onatmosphere({ ...current, ...patch });
	}
</script>

<div class="atmo-editor">
	<label class="atmo-head">
		<input
			type="checkbox"
			checked={current.enabled}
			onchange={(e) => set({ enabled: e.currentTarget.checked })}
		/>
		Enabled
	</label>
	<ul class="slider-list">
		{#each sliders as slider (slider.key)}
			<SliderRow
				id="atmo-{slider.key}"
				{slider}
				value={current[slider.key]}
				onvalue={(v) => set({ [slider.key]: v })}
				variant="scene"
				disabled={!current.enabled}
			/>
		{/each}
	</ul>
</div>

<style>
	.atmo-editor {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.atmo-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font: 11px/1.2 system-ui, sans-serif;
		color: #cfe0ff;
	}
</style>
