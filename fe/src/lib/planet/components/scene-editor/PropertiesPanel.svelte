<script module lang="ts">
	import type { NodeEditor } from '$lib/planet/scene/nodeSchemas.js';
	import type {
		BodyAppearance,
		BodyAtmosphere,
		BodyNode,
		Constraint,
		FieldTerm,
		PlanetScene,
		SceneNode,
		Transform,
		NodeDisplay
	} from '$lib/planet/scene/types.js';

	interface BreadcrumbCrumb {
		id: string;
		name: string;
	}

	interface Props {
		scene: PlanetScene;
		selectedId: string | null;
		selectedNode: SceneNode | null;
		evaluatedNode: SceneNode | null;
		breadcrumb: BreadcrumbCrumb[];
		editor: NodeEditor | null;
		schemaValue: Record<string, unknown>;
		bodyNode: BodyNode | null;
		hasAppearance: boolean;
		driverValue: Record<string, unknown>;
		onFieldChange?: (next: Record<string, unknown>) => void;
		onTransformChange?: (t: Transform) => void;
		onDriverChange?: (next: Record<string, unknown>) => void;
		onBindingsChange?: (next: FieldTerm[]) => void;
		onConstraintsChange?: (next: Constraint[]) => void;
		onAppearanceChange?: (a: BodyAppearance) => void;
		onAtmosphereChange?: (a: BodyAtmosphere) => void;
		onDisplayChange?: (patch: Partial<NodeDisplay>) => void;
		onRenderProcedural?: () => void;
	}
</script>

<script lang="ts">
	import { driverOutputs, driverSchemaFor } from '$lib/planet/scene/nodeSchemas.js';
	import SchemaForm from '$lib/planet/components/SchemaForm.svelte';
	import TransformEditor from '$lib/planet/components/TransformEditor.svelte';
	import BindingsEditor from '$lib/planet/components/BindingsEditor.svelte';
	import ConstraintsEditor from '$lib/planet/components/ConstraintsEditor.svelte';
	import AppearanceEditor from '$lib/planet/components/AppearanceEditor.svelte';
	import AtmosphereEditor from '$lib/planet/components/AtmosphereEditor.svelte';
	import { Subsection, VerticalTabs } from '@virtual-planet/editor-ui';
	import {
		PROPS_SUPER_SECTIONS,
		defaultOpenPropsSection,
		visiblePropsSections,
		type PropsSuperSectionId
	} from './propertiesSections.js';

	let {
		selectedId = $bindable(),
		selectedNode,
		evaluatedNode,
		breadcrumb,
		editor,
		schemaValue,
		bodyNode,
		hasAppearance,
		driverValue,
		onFieldChange,
		onTransformChange,
		onDriverChange,
		onBindingsChange,
		onConstraintsChange,
		onAppearanceChange,
		onAtmosphereChange,
		onDisplayChange,
		onRenderProcedural
	}: Props = $props();

	const visibleSections = $derived(
		selectedNode
			? visiblePropsSections(selectedNode, {
					hasAppearance: Boolean(bodyNode && hasAppearance),
					hasDriver: Boolean(selectedNode.driver),
					editor
				})
			: []
	);

	const sectionMeta = $derived(
		new Map(PROPS_SUPER_SECTIONS.map((s) => [s.id, s] as const))
	);

	const tabList = $derived(
		visibleSections.flatMap((sectionId) => {
			const meta = sectionMeta.get(sectionId);
			return meta ? [{ id: sectionId, title: meta.title, icon: meta.icon }] : [];
		})
	);

	let openSuperSection = $state<PropsSuperSectionId>('transform');

	$effect(() => {
		const visible = visibleSections;
		if (visible.length === 0) return;
		if (!visible.includes(openSuperSection)) {
			openSuperSection = defaultOpenPropsSection(visible);
		}
	});

	function onSuperToggle(id: PropsSuperSectionId) {
		openSuperSection = id;
	}
</script>

<div class="properties-panel">
	{#if selectedNode}
		<nav class="breadcrumb" aria-label="Scene path">
			<button type="button" class="crumb" onclick={() => (selectedId = null)}>/</button>
			{#each breadcrumb as crumb (crumb.id)}
				<span class="crumb-sep">/</span>
				<button type="button" class="crumb" onclick={() => (selectedId = crumb.id)}>
					{crumb.name}
				</button>
			{/each}
		</nav>
		<span class="edit-name">{selectedNode.name}</span>

		<div class="tabbed-sections">
			<VerticalTabs
				tabs={tabList}
				activeId={openSuperSection}
				onSelect={(id) => onSuperToggle(id as PropsSuperSectionId)}
			>
				{#snippet content(sectionId)}
					{#if sectionId === 'transform'}
						<Subsection title="Position" defaultOpen>
							<TransformEditor
								node={selectedNode}
								evaluated={evaluatedNode ?? selectedNode}
								channels="position"
								onchange={onTransformChange}
							/>
						</Subsection>
						<Subsection title="Rotation">
							<TransformEditor
								node={selectedNode}
								evaluated={evaluatedNode ?? selectedNode}
								channels="rotation"
								onchange={onTransformChange}
							/>
						</Subsection>
						<Subsection title="Scale">
							<TransformEditor
								node={selectedNode}
								evaluated={evaluatedNode ?? selectedNode}
								channels="scale"
								onchange={onTransformChange}
							/>
						</Subsection>
					{:else if sectionId === 'node' && editor?.mode === 'schema'}
						<Subsection title="Fields" defaultOpen>
							<SchemaForm
								schema={editor.schema}
								value={schemaValue}
								onchange={onFieldChange}
							/>
						</Subsection>
					{:else if sectionId === 'motion'}
						{#if selectedNode.driver}
							<Subsection title="Driver · {selectedNode.driver.type}" defaultOpen>
								<SchemaForm
									schema={driverSchemaFor(selectedNode.driver)}
									value={driverValue}
									onchange={onDriverChange}
								/>
								<span class="driver-outputs">
									outputs: {driverOutputs(selectedNode.driver).join(', ')}
								</span>
							</Subsection>
						{/if}
						<Subsection title="Bindings" defaultOpen={!selectedNode.driver}>
							<BindingsEditor node={selectedNode} onchange={onBindingsChange} />
						</Subsection>
						<Subsection title="Constraints">
							<ConstraintsEditor node={selectedNode} onchange={onConstraintsChange} />
						</Subsection>
					{:else if sectionId === 'display'}
						{#if selectedNode.driver?.type === 'kepler' || selectedNode.orbit}
							<Subsection title="Overlays" defaultOpen>
								<label class="display-row">
									<input
										type="checkbox"
										checked={selectedNode.display?.orbitPath !== false}
										onchange={(e) =>
											onDisplayChange?.({
												orbitPath: e.currentTarget.checked ? undefined : false
											})}
									/>
									Show orbit path
								</label>
								<p class="display-hint">
									Respects the global orbit-path mode in Render → View → Overlays.
								</p>
							</Subsection>
						{/if}
					{:else if sectionId === 'appearance' && bodyNode && hasAppearance}
						<AppearanceEditor body={bodyNode} onappearance={onAppearanceChange} />
					{:else if sectionId === 'atmosphere' && bodyNode && hasAppearance}
						<Subsection title="Design" defaultOpen>
							<AtmosphereEditor
								body={bodyNode}
								onatmosphere={(a) => onAtmosphereChange?.(a)}
							/>
						</Subsection>
					{:else if sectionId === 'actions' && bodyNode && hasAppearance}
						<Subsection title="Procedural" defaultOpen>
							<button type="button" class="render-btn" onclick={onRenderProcedural}>
								Render procedurally →
							</button>
						</Subsection>
					{/if}
				{/snippet}
			</VerticalTabs>
		</div>
	{:else}
		<p class="empty-state">Select a node in the outliner or viewport to edit its properties.</p>
	{/if}
</div>

<style>
	.properties-panel {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 10px;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		padding: 12px;
	}

	.empty-state {
		margin: 0;
		font-size: 11px;
		opacity: 0.6;
	}

	.breadcrumb {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		font-size: 11px;
		opacity: 0.85;
	}

	.crumb {
		background: none;
		border: none;
		padding: 0 1px;
		color: #9ec0ff;
		cursor: pointer;
		font: inherit;
	}

	.crumb:hover {
		text-decoration: underline;
	}

	.crumb-sep {
		opacity: 0.4;
	}

	.edit-name {
		font-weight: 600;
		font-size: 13px;
	}

	.tabbed-sections {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.driver-outputs {
		display: block;
		margin-top: 4px;
		font-family: ui-monospace, monospace;
		font-size: 10px;
		opacity: 0.6;
	}

	.display-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.display-hint {
		margin: 4px 0 0;
		font-size: 10px;
		opacity: 0.55;
		line-height: 1.35;
	}

	.render-btn {
		align-self: flex-start;
		font: 11px/1.2 system-ui, sans-serif;
		padding: 3px 10px;
		border-radius: 4px;
		border: 1px solid rgba(110, 160, 120, 0.4);
		background: rgba(110, 160, 120, 0.15);
		color: #cfedd6;
		cursor: pointer;
	}
</style>
