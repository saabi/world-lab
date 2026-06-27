<script lang="ts">
	import { PARAM_EDITOR_SECTIONS } from '../params/paramEditorSchema.js';
	import { PLANET_PRESETS, DEFAULT_PRESET, type PlanetPresetName } from '../params/presets.js';
	import { resolveBodyParams } from '../scene/bodyParams.js';
	import type { PlanetParameters } from '../params/planetParams.js';
	import type { BodyAppearance, BodyNode } from '../scene/types.js';
	import { SliderRow, Subsection } from '@virtual-planet/editor-ui';
	import '@virtual-planet/editor-ui/controls/sliderList.css';

	interface Props {
		body: BodyNode;
		onappearance?: (a: BodyAppearance) => void;
	}
	let { body, onappearance }: Props = $props();

	const PRESETS = Object.keys(PLANET_PRESETS) as PlanetPresetName[];
	const shapeSections = PARAM_EDITOR_SECTIONS.filter((s) => s.group === 'shape');
	const materialSections = PARAM_EDITOR_SECTIONS.filter((s) => s.group === 'materials');

	const appearance = $derived<BodyAppearance>(body.appearance ?? { preset: DEFAULT_PRESET });
	const resolved = $derived(resolveBodyParams(body));

	function setPreset(preset: PlanetPresetName) {
		onappearance?.({ preset, overrides: appearance.overrides });
	}
	function setOverride(key: keyof PlanetParameters, value: number) {
		onappearance?.({ preset: appearance.preset, overrides: { ...appearance.overrides, [key]: value } });
	}
	function resetOverrides() {
		onappearance?.({ preset: appearance.preset });
	}

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

	{#each shapeSections as section (section.title)}
		<Subsection title={section.title} defaultOpen={section.defaultOpen ?? false}>
			<ul class="slider-list">
				{#each section.sliders as sl (sl.key)}
					<SliderRow
						id={String(sl.key)}
						slider={sl}
						value={resolved[sl.key]}
						onvalue={(v) => setOverride(sl.key, v)}
						variant="scene"
					/>
				{/each}
			</ul>
			{#each section.toggles ?? [] as toggle (toggle.key)}
				<label class="flag-row">
					<span class="flag-label">{toggle.label}</span>
					<input
						type="checkbox"
						checked={resolved[toggle.key] > 0.5}
						onchange={(e) => setOverride(toggle.key, e.currentTarget.checked ? 1 : 0)}
					/>
				</label>
			{/each}
		</Subsection>
	{/each}

	{#each materialSections as section (section.title)}
		<Subsection title={section.title} defaultOpen={section.defaultOpen ?? false}>
			<ul class="slider-list">
				{#each section.sliders as sl (sl.key)}
					<SliderRow
						id={String(sl.key)}
						slider={sl}
						value={resolved[sl.key]}
						onvalue={(v) => setOverride(sl.key, v)}
						variant="scene"
					/>
				{/each}
			</ul>
		</Subsection>
	{/each}

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
		margin-bottom: 4px;
	}

	.preset {
		flex: 1;
	}

	.flag-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin: 4px 0;
		font-size: 11px;
	}

	.flag-label {
		flex: 1;
		text-align: right;
		opacity: 0.8;
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
