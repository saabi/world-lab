<script module lang="ts">
	import { SCENE_DEBUG_LABELS, type SceneDebugMode } from '$lib/planet/scene/sceneDebug.js';
	import type { OrbitLookMode } from '$lib/planet/camera/orbitCamera.js';
	import type {
		SceneAtmosphereBlendMode,
		SceneViewportPrefs,
		OrbitPathOverlayMode
	} from '$lib/planet/scene/viewportPrefs.js';
	import type { LodTransitionMode } from '$lib/planet/scene/bodyParams.js';
	import { overlayBulkFields } from '$lib/planet/scene/nodeSchemas.js';
	import { RENDER_FEATURES } from '$lib/planet/scene/renderFeatures.js';

	interface Props {
		materialDebug: SceneDebugMode;
		lookMode: OrbitLookMode;
		viewportPrefs: SceneViewportPrefs;
	}
</script>

<script lang="ts">
	import { Range, Subsection, VerticalTabs, type TabIconId } from '@virtual-planet/editor-ui';
	import '@virtual-planet/editor-ui/controls/sliderList.css';

	let {
		materialDebug = $bindable(),
		lookMode = $bindable(),
		viewportPrefs = $bindable()
	}: Props = $props();

	const overlayBulk = overlayBulkFields();
	const orbitFeature = RENDER_FEATURES.find((f) => f.id === 'orbitPath');

	type RenderSuperSectionId = 'view' | 'quality' | 'debug' | 'shading';

	const RENDER_SECTIONS: {
		id: RenderSuperSectionId;
		title: string;
		icon: TabIconId;
		defaultOpen?: boolean;
	}[] = [
		{ id: 'view', title: 'View', icon: 'eye', defaultOpen: true },
		{ id: 'quality', title: 'Quality', icon: 'gauge' },
		{ id: 'debug', title: 'Debug', icon: 'bug' },
		{ id: 'shading', title: 'Shading', icon: 'sun' }
	];

	let openSuperSection = $state<RenderSuperSectionId>('view');

	function onSuperToggle(id: RenderSuperSectionId) {
		openSuperSection = id;
	}
</script>

<div class="render-settings-panel">
	<VerticalTabs
		tabs={RENDER_SECTIONS}
		activeId={openSuperSection}
		onSelect={(id) => onSuperToggle(id as RenderSuperSectionId)}
	>
		{#snippet content(sectionId)}
			{#if sectionId === 'view'}
					<Subsection title="Look" defaultOpen>
						<label class="atmo-head">
							<input
								type="checkbox"
								checked={lookMode === 'horizon'}
								onchange={(e) =>
									(lookMode = e.currentTarget.checked ? 'horizon' : 'planet-center')}
							/>
							Horizon look
						</label>
					</Subsection>
					<Subsection title="Overlays" defaultOpen>
						{#each overlayBulk as field (field.globalKey)}
							{#if field.globalKey === 'showAtmospheres'}
								<label class="atmo-head">
									<input
										type="checkbox"
										bind:checked={viewportPrefs.overlays.showAtmospheres}
									/>
									{field.label}
								</label>
							{/if}
						{/each}
						{#if orbitFeature}
							<label class="atmo-row">
								<span>{orbitFeature.label}</span>
								<select
									value={viewportPrefs.overlays.orbitPaths}
									onchange={(e) =>
										(viewportPrefs.overlays.orbitPaths = e.currentTarget
											.value as OrbitPathOverlayMode)}
								>
									<option value="off">Off</option>
									<option value="all">All</option>
									<option value="selected">Selected only</option>
								</select>
							</label>
						{/if}
						<label class="atmo-head">
							<input type="checkbox" bind:checked={viewportPrefs.overlays.showEditorAids} />
							Editor aids
						</label>
					</Subsection>
					<Subsection title="Material view" defaultOpen>
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
					</Subsection>
			{:else if sectionId === 'quality'}
					<Subsection title="Level of detail" defaultOpen>
						<ul class="slider-list">
							<Range
								id="lod-sphere"
								label="Mesh starts (radius px)"
								min={0}
								max={20}
								step={0.5}
								variant="scene"
								bind:value={viewportPrefs.lod.sphereAboveRadiusPx}
							/>
							<Range
								id="lod-procedural"
								label="Terrain starts (radius px)"
								min={10}
								max={600}
								step={5}
								variant="scene"
								bind:value={viewportPrefs.lod.proceduralAboveRadiusPx}
							/>
							<Range
								id="lod-procedural-full"
								label="Terrain full (radius px)"
								min={10}
								max={900}
								step={5}
								variant="scene"
								bind:value={viewportPrefs.lod.proceduralFullRadiusPx}
							/>
							<Range
								id="lod-fade-gamma"
								label="Cross-fade gamma (→ terrain)"
								min={1}
								max={5}
								step={0.1}
								variant="scene"
								bind:value={viewportPrefs.lod.fadeGamma}
							/>
							<label class="atmo-row">
								<span>Transition</span>
								<select
									value={viewportPrefs.lod.transitionMode}
									onchange={(e) =>
										(viewportPrefs.lod.transitionMode = e.currentTarget
											.value as LodTransitionMode)}
								>
									<option value="none">None</option>
									<option value="heights">Heights</option>
									<option value="atmosphere">Atmosphere</option>
									<option value="both">Both</option>
								</select>
							</label>
						</ul>
					</Subsection>
					<Subsection title="Tessellation" defaultOpen>
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
					</Subsection>
					<Subsection title="Atmosphere" defaultOpen>
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
					</Subsection>
			{:else if sectionId === 'debug'}
					<Subsection title="Overlays" defaultOpen>
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
					</Subsection>
			{:else if sectionId === 'shading'}
					<Subsection title="Scene shading" defaultOpen>
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
								id="shadow-softness"
								label="Shadow Softness"
								min={0}
								max={1}
								step={0.01}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.shadowSoftness}
							/>
							<Range
								id="shadow-steps"
								label="Shadow Steps"
								min={4}
								max={64}
								step={1}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.shadowSteps}
							/>
							<Range
								id="eclipse-contrast"
								label="Eclipse Contrast (→ darker)"
								min={0.25}
								max={4}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.eclipseContrast}
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
								id="water-wave-strength"
								label="Water Waves"
								min={0}
								max={2}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterWaveStrength}
							/>
							<Range
								id="water-glint-strength"
								label="Water Glint"
								min={0}
								max={3}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterGlintStrength}
							/>
							<Range
								id="water-absorption-strength"
								label="Water Absorption"
								min={0}
								max={3}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterAbsorptionStrength}
							/>
							<Range
								id="water-scatter-strength"
								label="Water Scatter"
								min={0}
								max={3}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterScatterStrength}
							/>
							<Range
								id="water-refraction-strength"
								label="Water Refraction"
								min={0}
								max={1.5}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterRefractionStrength}
							/>
							<Range
								id="water-sky-reflection-strength"
								label="Water Sky Reflect"
								min={0}
								max={2}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterSkyReflectionStrength}
							/>
							<Range
								id="water-turbidity-strength"
								label="Water Turbidity"
								min={0}
								max={2}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterTurbidityStrength}
							/>
							<Range
								id="water-foam-strength"
								label="Water Foam"
								min={0}
								max={2}
								step={0.05}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterFoamStrength}
							/>
							<Range
								id="water-shore-width"
								label="Shore Width"
								min={0.05}
								max={0.9}
								step={0.01}
								variant="scene"
								bind:value={viewportPrefs.materialOverrides.waterShoreWidth}
							/>
							<li class="checkbox-row">
								<label>
									<input
										type="checkbox"
										bind:checked={viewportPrefs.materialOverrides.waterTerrainShadows}
									/>
									Water terrain shadows
								</label>
							</li>
							<li class="checkbox-row">
								<label>
									<input
										type="checkbox"
										bind:checked={viewportPrefs.materialOverrides.waterEclipseShadows}
									/>
									Water eclipse shadows
								</label>
							</li>
							<li class="checkbox-row">
								<label>
									<input
										type="checkbox"
										bind:checked={viewportPrefs.materialOverrides.waterFoamShadows}
									/>
									Water foam shadows
								</label>
							</li>
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
					</Subsection>
			{/if}
		{/snippet}
	</VerticalTabs>
</div>

<style>
	.render-settings-panel {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		padding: 12px;
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

	.checkbox-row {
		display: flex;
		align-items: center;
		min-height: 24px;
		font-size: 11px;
		color: #d6deef;
	}

	.checkbox-row label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
