<script lang="ts">
	import type { PlanetParameters } from '../params/planetParams.js';
	import type { AtmosphereParameters } from '../params/atmosphereParams.js';
	import { PLANET_PRESETS, type PlanetPresetName } from '../params/presets.js';
	import {
		EDITOR_SUPER_SECTIONS,
		atmosphereSliders,
		paramSectionsForGroup,
		type EditorSuperSectionId
	} from '../params/paramEditorSchema.js';
	import type { StoredPlanetDocument } from '../documents/types.js';
	import { parseSelection } from '../documents/selection.js';
	import {
		MATERIAL_DEBUG_LABELS,
		type MaterialOverrides
	} from '../material/biomes.js';
	import type { TessellationSettings } from '../patches/tessellationSettings.js';
	import Range from './controls/Range.svelte';
	import LogRange from './controls/LogRange.svelte';
	import CheckBox from './controls/CheckBox.svelte';
	import EditorSuperSection from './EditorSuperSection.svelte';
	import EditorParamSection from './EditorParamSection.svelte';
	import { altitudeBounds } from '../camera/seaLevel.js';

	interface Props {
		params: PlanetParameters;
		atmosphere: AtmosphereParameters;
		azimuth: number;
		elevation: number;
		altitudeMeters: number;
		orbitSpeedRadPerSec: number;
		lookAtHorizon: boolean;
		spinAngle: number;
		spinSpeedRadPerSec: number;
		axialTilt: number;
		selection: string;
		savedDocuments: StoredPlanetDocument[];
		wireframe: boolean;
		faceColors: boolean;
		showPatchBorders: boolean;
		showRingColors: boolean;
		materialOverrides: MaterialOverrides;
		tessellation: TessellationSettings;
		onSelectionChange: (selection: string) => void;
		onSave: () => void;
		onSaveAs: () => void;
		onDelete: () => void;
	}

	let {
		params = $bindable(),
		atmosphere = $bindable(),
		azimuth = $bindable(),
		elevation = $bindable(),
		altitudeMeters = $bindable(),
		orbitSpeedRadPerSec = $bindable(),
		lookAtHorizon = $bindable(),
		spinAngle = $bindable(),
		spinSpeedRadPerSec = $bindable(),
		axialTilt = $bindable(),
		selection,
		savedDocuments,
		wireframe = $bindable(),
		faceColors = $bindable(),
		showPatchBorders = $bindable(),
		showRingColors = $bindable(),
		materialOverrides = $bindable(),
		tessellation = $bindable(),
		onSelectionChange,
		onSave,
		onSaveAs,
		onDelete
	}: Props = $props();

	const presetNames = Object.keys(PLANET_PRESETS) as PlanetPresetName[];

	const defaultSuperSection =
		EDITOR_SUPER_SECTIONS.find((s) => s.defaultOpen)?.id ?? EDITOR_SUPER_SECTIONS[0].id;

	let openSuperSection = $state<EditorSuperSectionId>(defaultSuperSection);

	let parsedSelection = $derived(parseSelection(selection));
	let canSaveDocument = $derived(parsedSelection?.kind === 'document');
	let canDeleteDocument = $derived(parsedSelection?.kind === 'document');

	let atmoSliders = $derived(atmosphereSliders(params.radius));
	let altBounds = $derived(altitudeBounds(params, atmosphere));

	function handleSelectChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		onSelectionChange(value);
	}

	function onSuperToggle(id: EditorSuperSectionId) {
		openSuperSection = id;
	}
</script>

<aside class="editor-panel" aria-label="Planet parameter editor">
	<header class="panel-title">Planet</header>

	<div class="presets">
		<div class="preset-row">
			<label class="preset-label" for="planet-preset">Presets</label>
			<select id="planet-preset" class="preset-select" value={selection} onchange={handleSelectChange}>
				<optgroup label="Built-in">
					{#each presetNames as name (name)}
						<option value="builtin:{name}">{name}</option>
					{/each}
				</optgroup>
				{#if savedDocuments.length > 0}
					<optgroup label="Saved">
						{#each savedDocuments as doc (doc.id)}
							<option value="doc:{doc.id}">{doc.name}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
		</div>
		<div class="doc-actions">
			<button type="button" disabled={!canSaveDocument} onclick={onSave}>Save</button>
			<button type="button" onclick={onSaveAs}>Save as…</button>
			<button type="button" disabled={!canDeleteDocument} onclick={onDelete}>Delete</button>
		</div>
	</div>

	<div class="super-sections">
		{#each EDITOR_SUPER_SECTIONS as superSection (superSection.id)}
			<EditorSuperSection
				title={superSection.title}
				open={openSuperSection === superSection.id}
				onToggle={() => onSuperToggle(superSection.id)}
			>
				{#if superSection.id === 'camera'}
					<details class="subsection" open>
						<summary>Orbit</summary>
						<ul class="subsection-body">
							<LogRange
								id="orbit-altitude"
								label="Altitude"
								bind:value={altitudeMeters}
								min={altBounds.min}
								max={altBounds.max}
							/>
							<Range
								id="orbit-azimuth"
								label="Azimuth"
								min={-3.14159}
								max={3.14159}
								step={0.01}
								bind:value={azimuth}
							/>
							<Range
								id="orbit-elevation"
								label="Elevation"
								min={-1.55}
								max={1.55}
								step={0.01}
								bind:value={elevation}
							/>
							<Range
								id="orbit-speed"
								label="Speed"
								min={0}
								max={0.3}
								step={0.005}
								bind:value={orbitSpeedRadPerSec}
							/>
							<CheckBox id="look-at-horizon" label="Look at horizon" bind:checked={lookAtHorizon} />
						</ul>
					</details>

					<details class="subsection">
						<summary>Rotation</summary>
						<ul class="subsection-body">
							<Range
								id="axial-tilt"
								label="Axial Tilt"
								min={-90}
								max={90}
								step={1}
								bind:value={axialTilt}
							/>
							<Range
								id="spin-angle"
								label="Angle"
								min={-3.14159}
								max={3.14159}
								step={0.01}
								bind:value={spinAngle}
							/>
							<Range
								id="spin-speed"
								label="Speed"
								min={-0.3}
								max={0.3}
								step={0.005}
								bind:value={spinSpeedRadPerSec}
							/>
						</ul>
					</details>
				{:else if superSection.id === 'shape' || superSection.id === 'materials'}
					{#each paramSectionsForGroup(superSection.id) as section (section.title)}
						<EditorParamSection {section} bind:params />
					{/each}
					{#if superSection.id === 'materials'}
						<details class="subsection">
							<summary>Shading</summary>
							<ul class="subsection-body">
								<li class="flag-row">
									<label class="flag-label" for="illumination">Scene Lighting</label>
									<input
										id="illumination"
										class="flag-input"
										type="checkbox"
										checked={params.illumination > 0.5}
										onchange={(e) => (params.illumination = e.currentTarget.checked ? 1 : 0)}
									/>
								</li>
								<CheckBox id="shadows" label="Shadows" bind:checked={materialOverrides.shadows} />
								<Range
									id="shadow-fill"
									label="Shadow Fill"
									min={0}
									max={1}
									step={0.01}
									bind:value={materialOverrides.shadowFill}
								/>
								<Range
									id="exposure"
									label="Exposure"
									min={0.5}
									max={3}
									step={0.05}
									bind:value={materialOverrides.exposure}
								/>
								<Range
									id="roughness-mult"
									label="Roughness"
									min={0.5}
									max={2}
									step={0.05}
									bind:value={materialOverrides.roughnessMult}
								/>
								<Range
									id="water-gloss"
									label="Water Gloss"
									min={0.5}
									max={3}
									step={0.05}
									bind:value={materialOverrides.waterGloss}
								/>
								<Range
									id="aerial-fog"
									label="Aerial Fog"
									min={0}
									max={2}
									step={0.05}
									bind:value={materialOverrides.fogDensity}
								/>
							</ul>
						</details>
					{/if}
				{:else if superSection.id === 'atmosphere'}
					<ul class="flat-body">
						<CheckBox id="atmosphere-enabled" label="Enabled" bind:checked={atmosphere.enabled} />
						{#each atmoSliders as slider (slider.key)}
							<Range
								id="atmo-{slider.key}"
								label={slider.label}
								min={slider.min}
								max={slider.max}
								step={slider.step}
								bind:value={atmosphere[slider.key]}
								disabled={!atmosphere.enabled}
							/>
						{/each}
					</ul>
				{:else if superSection.id === 'tessellation'}
					<ul class="flat-body">
						<Range
							id="tess-detail"
							label="Detail"
							min={0.0005}
							max={4}
							step={0.05}
							bind:value={tessellation.detail}
						/>
						<Range
							id="tess-budget"
							label="Vertex Budget (M)"
							min={1}
							max={32}
							step={1}
							bind:value={tessellation.vertexBudgetMillions}
						/>
					</ul>
				{:else if superSection.id === 'debug'}
					<ul class="flat-body">
						<CheckBox id="wireframe" label="Wireframe" bind:checked={wireframe} />
						<CheckBox id="face-colors" label="Face Colors" bind:checked={faceColors} />
						<CheckBox id="patch-borders" label="Patch Borders" bind:checked={showPatchBorders} />
						<CheckBox id="ring-colors" label="Ring Colors" bind:checked={showRingColors} />
						<li class="select-row">
							<label class="select-label" for="material-view">Material View</label>
							<select
								id="material-view"
								class="select-input"
								value={materialOverrides.materialDebug}
								onchange={(e) =>
									(materialOverrides = {
										...materialOverrides,
										materialDebug: e.currentTarget.value as MaterialOverrides['materialDebug']
									})}
							>
								{#each MATERIAL_DEBUG_LABELS as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</li>
					</ul>
				{/if}
			</EditorSuperSection>
		{/each}
	</div>
</aside>

<style>
	.editor-panel {
		position: absolute;
		top: 0;
		right: 0;
		max-height: 100%;
		overflow-x: visible;
		overflow-y: auto;
		padding: 10px 12px 16px;
		background: rgba(8, 10, 20, 0.88);
		border-left: 1px solid rgba(255, 255, 255, 0.12);
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
		min-width: 280px;
		max-width: 320px;
		box-sizing: border-box;
	}

	.panel-title {
		display: block;
		margin: 0 0 8px;
		padding: 3px 10px;
		background: rgba(92, 60, 0, 0.55);
		color: #f0e6d8;
		font-size: 13px;
		font-weight: 700;
		border-radius: 3px;
	}

	.presets {
		margin-bottom: 8px;
	}

	.super-sections {
		margin-top: 4px;
	}

	.subsection {
		margin: 3px 0;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		overflow: hidden;
	}

	.subsection > summary {
		list-style: none;
		cursor: pointer;
		user-select: none;
		padding: 3px 8px;
		background: rgba(92, 60, 0, 0.28);
		color: #e8dcc8;
		font-size: 11px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.subsection > summary::-webkit-details-marker {
		display: none;
	}

	.subsection > summary::before {
		content: '▸';
		font-size: 9px;
		color: #c9a87a;
		transition: transform 0.12s ease;
	}

	.subsection[open] > summary::before {
		transform: rotate(90deg);
	}

	.subsection > summary:hover {
		background: rgba(120, 80, 0, 0.38);
	}

	.subsection-body,
	.flat-body {
		margin: 0;
		padding: 4px 4px 6px;
		list-style: none;
	}

	.preset-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.preset-label {
		flex: 0 0 5em;
		text-align: right;
		font-size: 12px;
	}

	.preset-select {
		flex: 1;
		min-width: 0;
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 4px;
	}

	.doc-actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		padding-right: 2px;
	}

	.doc-actions button {
		font: 11px/1.2 system-ui, sans-serif;
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.doc-actions button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.doc-actions button:not(:disabled):hover {
		background: #252d45;
	}

	.flag-row,
	.select-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin: 4px 0;
		padding-right: 4px;
		list-style: none;
	}

	.flag-label,
	.select-label {
		flex: 1;
		text-align: right;
		font-size: 12px;
	}

	.flag-input {
		accent-color: #6b9fff;
	}

	.select-input {
		flex: 0 0 auto;
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 4px;
	}
</style>
