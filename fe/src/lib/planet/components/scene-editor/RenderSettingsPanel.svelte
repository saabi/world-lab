<script module lang="ts">
	import { SCENE_DEBUG_LABELS, type SceneDebugMode } from '$lib/planet/scene/sceneDebug.js';
	import type { OrbitLookMode } from '$lib/planet/camera/orbitCamera.js';
	import type {
		SceneAtmosphereBlendMode,
		SceneViewportPrefs
	} from '$lib/planet/scene/viewportPrefs.js';

	interface Props {
		materialDebug: SceneDebugMode;
		lookMode: OrbitLookMode;
		viewportPrefs: SceneViewportPrefs;
	}
</script>

<script lang="ts">
	import Range from '../controls/Range.svelte';
	import '../controls/sliderList.css';
	import EditorAccordionSection from './EditorAccordionSection.svelte';
	import EditorSubsection from './EditorSubsection.svelte';

	let {
		materialDebug = $bindable(),
		lookMode = $bindable(),
		viewportPrefs = $bindable()
	}: Props = $props();

	type RenderSuperSectionId = 'view' | 'quality' | 'debug' | 'shading';

	const RENDER_SECTIONS: { id: RenderSuperSectionId; title: string; defaultOpen?: boolean }[] = [
		{ id: 'view', title: 'View', defaultOpen: true },
		{ id: 'quality', title: 'Quality' },
		{ id: 'debug', title: 'Debug' },
		{ id: 'shading', title: 'Shading' }
	];

	let openSuperSection = $state<RenderSuperSectionId>('view');

	function onSuperToggle(id: RenderSuperSectionId) {
		openSuperSection = id;
	}
</script>

<div class="render-settings-panel">
	<div class="super-sections">
		{#each RENDER_SECTIONS as section (section.id)}
			<EditorAccordionSection
				title={section.title}
				open={openSuperSection === section.id}
				onToggle={() => onSuperToggle(section.id)}
			>
				{#if section.id === 'view'}
					<EditorSubsection title="Look" defaultOpen>
						<label class="atmo-head">
							<input
								type="checkbox"
								checked={lookMode === 'horizon'}
								onchange={(e) =>
									(lookMode = e.currentTarget.checked ? 'horizon' : 'planet-center')}
							/>
							Horizon look
						</label>
					</EditorSubsection>
					<EditorSubsection title="Material view" defaultOpen>
						<label class="atmo-row">
							<span>debug view</span>
							<select bind:value={materialDebug}>
								{#each SCENE_DEBUG_LABELS as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</label>
						<label class="atmo-row">
							<span>atmosphere blend</span>
							<select
								value={viewportPrefs.atmosphere.blendMode}
								onchange={(e) =>
									(viewportPrefs.atmosphere.blendMode = e.currentTarget
										.value as SceneAtmosphereBlendMode)}
							>
								<option value="explicit-composite">Explicit composite</option>
								<option value="hardware-alpha">Hardware alpha</option>
							</select>
						</label>
					</EditorSubsection>
				{:else if section.id === 'quality'}
					<EditorSubsection title="Level of detail" defaultOpen>
						<ul class="slider-list">
							<Range
								id="lod-sphere"
								label="Sphere above (radius px)"
								min={0}
								max={20}
								step={0.5}
								variant="scene"
								bind:value={viewportPrefs.lod.sphereAboveRadiusPx}
							/>
							<Range
								id="lod-procedural"
								label="Procedural above (radius px)"
								min={10}
								max={600}
								step={5}
								variant="scene"
								bind:value={viewportPrefs.lod.proceduralAboveRadiusPx}
							/>
						</ul>
					</EditorSubsection>
					<EditorSubsection title="Tessellation" defaultOpen>
						<ul class="slider-list">
							<Range
								id="tess-detail"
								label="Detail"
								min={0.05}
								max={4}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.tessellation.detail}
							/>
							<Range
								id="tess-budget"
								label="Vertex Budget (M)"
								min={0.05}
								max={32}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.tessellation.vertexBudgetMillions}
							/>
						</ul>
						<label class="atmo-row">
							<span>max resolution</span>
							<select
								value={viewportPrefs.tessellation.maxPatchResolution}
								onchange={(e) =>
									(viewportPrefs.tessellation.maxPatchResolution = Number(
										e.currentTarget.value
									) as SceneViewportPrefs['tessellation']['maxPatchResolution'])}
							>
								<option value={0}>Auto</option>
								<option value={8}>8</option>
								<option value={16}>16</option>
								<option value={32}>32</option>
								<option value={64}>64</option>
								<option value={96}>96</option>
							</select>
						</label>
						<label class="atmo-row">
							<span>max depth</span>
							<select
								value={viewportPrefs.tessellation.maxDepth}
								onchange={(e) =>
									(viewportPrefs.tessellation.maxDepth = Number(
										e.currentTarget.value
									) as SceneViewportPrefs['tessellation']['maxDepth'])}
							>
								<option value={0}>Auto</option>
								<option value={3}>3</option>
								<option value={4}>4</option>
								<option value={5}>5</option>
								<option value={6}>6</option>
							</select>
						</label>
					</EditorSubsection>
					<EditorSubsection title="Atmosphere" defaultOpen>
						<ul class="slider-list">
							<Range
								id="atmo-integrate-steps"
								label="Quality"
								min={4}
								max={64}
								step={1}
								variant="scene"
								bind:value={viewportPrefs.atmosphereIntegrateSteps}
							/>
						</ul>
					</EditorSubsection>
				{:else if section.id === 'debug'}
					<EditorSubsection title="Overlays" defaultOpen>
						<label class="atmo-head">
							<input type="checkbox" bind:checked={viewportPrefs.debug.wireframe} />
							Wireframe
						</label>
						<label class="atmo-head">
							<input type="checkbox" bind:checked={viewportPrefs.debug.faceColors} />
							Face colors
						</label>
						<label class="atmo-head">
							<input type="checkbox" bind:checked={viewportPrefs.debug.showPatchBorders} />
							Patch borders
						</label>
						<label class="atmo-head">
							<input type="checkbox" bind:checked={viewportPrefs.debug.showRingColors} />
							Ring colors
						</label>
					</EditorSubsection>
				{:else if section.id === 'shading'}
					<EditorSubsection title="Scene shading" defaultOpen>
						<label class="atmo-head">
							<input type="checkbox" bind:checked={viewportPrefs.materialOverrides.shadows} />
							Shadows
						</label>
						<ul class="slider-list">
							<Range
								id="shadow-fill"
								label="Shadow Fill"
								min={0}
								max={1}
								step={0.01}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.shadowFill}
							/>
							<Range
								id="exposure"
								label="Exposure"
								min={0.5}
								max={3}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.exposure}
							/>
							<Range
								id="roughness-mult"
								label="Roughness"
								min={0.5}
								max={2}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.roughnessMult}
							/>
							<Range
								id="water-gloss"
								label="Water Gloss"
								min={0.5}
								max={3}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterGloss}
							/>
							<Range
								id="aerial-fog"
								label="Aerial Fog"
								min={0}
								max={2}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.fogDensity}
							/>
						</ul>
					</EditorSubsection>
				{/if}
			</EditorAccordionSection>
		{/each}
	</div>
</div>

<style>
	.render-settings-panel {
		box-sizing: border-box;
		height: 100%;
		overflow-y: auto;
		padding: 12px;
	}

	.super-sections {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.atmo-head {
		display: flex;
		align-items: center;
		gap: 5px;
		font-weight: 600;
		font-size: 11px;
		color: #c7a6ff;
		margin: 2px 0;
	}

	.atmo-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		margin: 2px 0;
	}

	.atmo-row span {
		flex: 0 0 38%;
		font-variant-numeric: tabular-nums;
		opacity: 0.8;
	}

	.atmo-row select {
		flex: 1;
		min-width: 0;
	}
</style>
