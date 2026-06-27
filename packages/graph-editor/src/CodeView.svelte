<script lang="ts">
	import { listPrimitives, type GraphDocument } from '@virtual-planet/graph';
	import { applyPrimitiveSource, type PrimitiveSaveResult } from './primitiveEditor.js';
	import { getPrimitiveSource, setPrimitiveSource } from './primitiveSources.js';

	interface Props {
		graph: GraphDocument;
		moduleId?: string | null;
		onchange?: (next: GraphDocument) => void;
		onsave?: (result: PrimitiveSaveResult) => void;
		onerror?: (message: string) => void;
	}

	let {
		graph,
		moduleId = $bindable<string | null>('noise.perlin3d'),
		onchange,
		onsave,
		onerror
	}: Props = $props();

	const editablePrimitives = $derived(
		listPrimitives().filter((primitive) => primitive.wgsl?.moduleId)
	);

	let draft = $state('');
	let dirty = $state(false);
	let status = $state<string | null>(null);

	$effect(() => {
		if (!moduleId) return;
		draft = getPrimitiveSource(moduleId);
		dirty = false;
		status = null;
	});

	function onInput(event: Event) {
		draft = (event.currentTarget as HTMLTextAreaElement).value;
		dirty = true;
		status = null;
	}

	function save() {
		if (!moduleId) return;

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
</script>

<div class="code-view">
	<div class="header">
		<h2 class="title">Primitive</h2>
		<select
			class="picker"
			value={moduleId ?? ''}
			onchange={(event) => {
				moduleId = (event.currentTarget as HTMLSelectElement).value || null;
			}}
		>
			{#each editablePrimitives as primitive (primitive.id)}
				<option value={primitive.id}>{primitive.id}</option>
			{/each}
		</select>
		<button class="save" type="button" disabled={!moduleId || !dirty} onclick={save}>Save</button>
		{#if status}
			<span class="status">{status}</span>
		{/if}
	</div>
	<textarea class="editor" value={draft} spellcheck="false" oninput={onInput}></textarea>
</div>

<style>
	.code-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		padding: 8px;
		gap: 6px;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
	}

	.title {
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

	.save {
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
		flex: 1;
		min-height: 0;
		width: 100%;
		margin: 0;
		padding: 8px;
		resize: none;
		overflow: auto;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		background: #0d1018;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		line-height: 1.45;
		color: #dbe4ff;
	}
</style>
