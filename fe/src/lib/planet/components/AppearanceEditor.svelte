<script lang="ts">
	import { PARAM_EDITOR_SECTIONS } from '../params/paramEditorSchema.js';
	import { PLANET_PRESETS, DEFAULT_PRESET, type PlanetPresetName } from '../params/presets.js';
	import { resolveBodyParams } from '../scene/bodyParams.js';
	import type { PlanetParameters } from '../params/planetParams.js';
	import type { BodyAppearance, BodyLod, BodyNode } from '../scene/types.js';

	interface Props {
		body: BodyNode;
		onappearance?: (a: BodyAppearance) => void;
		onlod?: (l: BodyLod) => void;
	}
	let { body, onappearance, onlod }: Props = $props();

	const PRESETS = Object.keys(PLANET_PRESETS) as PlanetPresetName[];
	// Appearance = the planet shape/materials params (not atmosphere/camera/tessellation).
	const sections = PARAM_EDITOR_SECTIONS.filter((s) => s.group === 'shape' || s.group === 'materials');

	const appearance = $derived<BodyAppearance>(body.appearance ?? { preset: DEFAULT_PRESET });
	const resolved = $derived(resolveBodyParams(body));
	const lod = $derived<BodyLod>(body.lod ?? {});

	function setPreset(preset: PlanetPresetName) {
		onappearance?.({ preset, overrides: appearance.overrides });
	}
	function setOverride(key: keyof PlanetParameters, value: number) {
		onappearance?.({ preset: appearance.preset, overrides: { ...appearance.overrides, [key]: value } });
	}
	function resetOverrides() {
		onappearance?.({ preset: appearance.preset });
	}
	const isOverridden = (key: keyof PlanetParameters) => appearance.overrides?.[key] !== undefined;

	function setLod(patch: Partial<BodyLod>) {
		onlod?.({ ...lod, ...patch });
	}

	const round = (n: number) => Math.round(n * 1000) / 1000;
	const overrideCount = $derived(Object.keys(appearance.overrides ?? {}).length);
</script>

<div class="appearance">
	<div class="appr-head">
		<select
			class="preset"
			value={appearance.preset}
			onchange={(e) => setPreset(e.currentTarget.value as PlanetPresetName)}
		>
			{#each PRESETS as p (p)}
				<option value={p}>{p}</option>
			{/each}
		</select>
		<button type="button" class="reset" disabled={overrideCount === 0} onclick={resetOverrides}>
			reset {overrideCount || ''}
		</button>
	</div>

	{#each sections as section (section.title)}
		<span class="appr-sub">{section.title}</span>
		{#each section.sliders as sl (sl.key)}
			<label class="appr-row" class:overridden={isOverridden(sl.key)}>
				<span class="appr-label">{sl.label}</span>
				<input
					type="range"
					min={sl.min}
					max={sl.max}
					step={sl.step}
					value={resolved[sl.key]}
					oninput={(e) => setOverride(sl.key, Number(e.currentTarget.value))}
				/>
				<span class="appr-val">{round(resolved[sl.key])}</span>
			</label>
		{/each}
	{/each}

	<span class="appr-sub">LOD (projected px)</span>
	<label class="appr-row">
		<span class="appr-label">sphere above</span>
		<input
			type="number"
			step="any"
			value={lod.sphereAbovePx ?? 2}
			onchange={(e) => setLod({ sphereAbovePx: Number(e.currentTarget.value) })}
		/>
	</label>
	<label class="appr-row">
		<span class="appr-label">procedural above</span>
		<input
			type="number"
			step="any"
			value={lod.proceduralAbovePx ?? 240}
			onchange={(e) => setLod({ proceduralAbovePx: Number(e.currentTarget.value) })}
		/>
	</label>
</div>

<style>
	.appearance {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.appr-head {
		display: flex;
		gap: 5px;
		margin-bottom: 2px;
	}

	.preset {
		flex: 1;
	}

	.appr-sub {
		font-size: 10px;
		opacity: 0.55;
		margin-top: 5px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.appr-row {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
	}

	.appr-label {
		flex: 0 0 40%;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.8;
	}

	.appr-row.overridden .appr-label {
		opacity: 1;
		color: #c7a6ff;
	}

	.appr-row input[type='range'] {
		flex: 1;
		min-width: 0;
	}

	.appr-val {
		flex: 0 0 2.6em;
		text-align: right;
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}

	.appr-row input[type='number'] {
		flex: 1;
		min-width: 0;
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 4px;
	}

	select.preset,
	.reset {
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 4px;
		font-size: 11px;
		cursor: pointer;
	}

	.reset:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
