<script module lang="ts">
	import { listPrimitives, type GraphDocument } from '@world-lab/graph';
	import { applyPrimitiveSource, type PrimitiveSaveResult } from './primitiveEditor.js';
	import {
		cloneBuiltinPrimitive,
		getPrimitiveSource,
		isBuiltinPrimitive,
		isEditablePrimitive,
		setPrimitiveSource
	} from './primitiveSources.js';
	import CodeMirrorEditor from './CodeMirrorEditor.svelte';

	export interface CodeViewActions {
		save: () => void;
		revert: () => void;
		isDirty: () => boolean;
	}
</script>

<script lang="ts">
	interface Props {
		graph: GraphDocument;
		moduleId?: string | null;
		compileSignature?: string;
		onchange?: (next: GraphDocument) => void;
		onsave?: (result: PrimitiveSaveResult) => void;
		onerror?: (message: string) => void;
		registerActions?: (actions: CodeViewActions) => void;
	}

	let {
		graph,
		moduleId = $bindable<string | null>('noise.perlin3d'),
		compileSignature = '',
		onchange,
		onsave,
		onerror,
		registerActions
	}: Props = $props();

	const editablePrimitives = $derived(
		listPrimitives().filter((primitive) => primitive.wgsl?.moduleId)
	);

	const readOnly = $derived(moduleId ? isBuiltinPrimitive(moduleId) : false);

	let draft = $state('');
	let dirty = $state(false);
	let status = $state<string | null>(null);
	let loadedSourceKey = $state('');

	$effect(() => {
		if (!moduleId) return;
		const key = `${moduleId}\x00${compileSignature}`;
		if (dirty && key === loadedSourceKey) return;
		loadedSourceKey = key;
		draft = getPrimitiveSource(moduleId);
		dirty = false;
		status = null;
	});

	function onDraftChange(next: string) {
		if (readOnly) return;
		draft = next;
		dirty = true;
		status = null;
	}

	function save() {
		if (!moduleId || readOnly) return;

		try {
			const result = applyPrimitiveSource(graph, moduleId, draft);
			setPrimitiveSource(moduleId, draft);
			dirty = false;
			status = 'Saved';
			onchange?.(result.graph);
			onsave?.(result);
		} catch (error) {
			status = null;
			onerror?.(error instanceof Error ? error.message : 'Save failed');
		}
	}

	function revert() {
		if (!moduleId) return;
		draft = getPrimitiveSource(moduleId);
		dirty = false;
		status = null;
		loadedSourceKey = `${moduleId}\x00${compileSignature}`;
	}

	function cloneSelected() {
		if (!moduleId || !isBuiltinPrimitive(moduleId)) return;
		try {
			const userId = cloneBuiltinPrimitive(moduleId);
			moduleId = userId;
			status = `Cloned to ${userId}`;
		} catch (error) {
			status = null;
			onerror?.(error instanceof Error ? error.message : 'Clone failed');
		}
	}

	$effect(() => {
		registerActions?.({
			save,
			revert,
			isDirty: () => dirty
		});
	});
</script>

<div class="code-view">
	<div class="header">
		<label class="picker-label" for="code-view-primitive-picker">Primitive</label>
		<select
			id="code-view-primitive-picker"
			class="picker"
			value={moduleId ?? ''}
			onchange={(event) => {
				moduleId = (event.currentTarget as HTMLSelectElement).value || null;
			}}
			oninput={(event) => {
				moduleId = (event.currentTarget as HTMLSelectElement).value || null;
			}}
		>
			{#each editablePrimitives as primitive (primitive.id)}
				<option value={primitive.id}>{primitive.id}</option>
			{/each}
		</select>
		{#if readOnly}
			<span class="badge">built-in · read-only</span>
			<button class="clone" type="button" onclick={cloneSelected}>Clone</button>
		{:else if moduleId && isEditablePrimitive(moduleId)}
			<span class="badge user">user · editable</span>
			<button class="save" type="button" disabled={!dirty} onclick={save}>Save</button>
		{/if}
		{#if status}
			<span class="status">{status}</span>
		{/if}
	</div>
	{#key `${moduleId ?? 'none'}-${readOnly}-${loadedSourceKey}`}
		<CodeMirrorEditor
			class="editor"
			language="primitive-source"
			bind:value={draft}
			readOnly={readOnly}
			onchange={onDraftChange}
		/>
	{/key}
</div>

<style>
	.code-view {
		box-sizing: border-box;
		display: grid;
		grid-template-rows: auto 1fr;
		min-height: 0;
		padding: 8px;
		gap: 6px;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.picker-label {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
	}

	.picker {
		flex: 1;
		min-width: 0;
		font-size: 11px;
		padding: 3px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #1a1f30;
		color: inherit;
	}

	.badge {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		opacity: 0.85;
		white-space: nowrap;
	}

	.badge.user {
		border-color: rgba(93, 140, 255, 0.45);
		color: #9ec1ff;
	}

	.save,
	.clone {
		font-size: 11px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.save:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.status {
		font-size: 11px;
		opacity: 0.7;
	}

	.editor {
		/* grid row host for CodeMirrorEditor */
	}
</style>
