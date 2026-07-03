<script lang="ts">
	import type { GraphDocument } from '@world-lab/graph';

	import CodeMirrorEditor from './CodeMirrorEditor.svelte';
	import { compiledGraphWgsl, type CompiledConsumerWgsl } from './compiledWgsl.js';

	interface Props {
		graph: GraphDocument;
		compileSignature?: string;
	}

	let { graph, compileSignature = '' }: Props = $props();

	let results = $state<CompiledConsumerWgsl[]>([]);
	let selectedIndex = $state(0);
	let loading = $state(false);
	let compileError = $state<string | null>(null);

	const selected = $derived(results[selectedIndex] ?? null);
	const displayCode = $derived(
		selected?.diagnostic ? `-- ${selected.diagnostic}\n` : (selected?.code ?? '')
	);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	async function recompile(doc: GraphDocument) {
		loading = true;
		compileError = null;
		try {
			const next = await compiledGraphWgsl(doc);
			results = next;
			if (selectedIndex >= next.length) {
				selectedIndex = 0;
			}
		} catch (error) {
			results = [];
			compileError = error instanceof Error ? error.message : String(error);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const doc = graph;
		void compileSignature;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			void recompile(doc);
		}, 200);
		return () => clearTimeout(debounceTimer);
	});
</script>

<div class="compiled-wgsl">
	<header class="header">
		{#if loading}
			<span class="status">Compiling…</span>
		{:else if compileError}
			<span class="status error">{compileError}</span>
		{:else if selected?.diagnostic}
			<span class="status warn">Incomplete</span>
		{:else}
			<span class="status ok">Ready</span>
		{/if}
	</header>

	{#if results.length > 1}
		<label class="selector">
			<span>Consumer</span>
			<select bind:value={selectedIndex}>
				{#each results as result, index (result.consumerId + index)}
					<option value={index}>
						{result.consumerId} ({result.stage})
					</option>
				{/each}
			</select>
		</label>
	{/if}

	<div class="editor">
		<CodeMirrorEditor value={displayCode} language="wgsl" readOnly={true} />
	</div>
</div>

<style>
	.compiled-wgsl {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		padding: 8px;
		box-sizing: border-box;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-bottom: 6px;
	}

	.status {
		font-size: 10px;
		color: #9aa8c7;
	}

	.status.ok {
		color: #7dcea0;
	}

	.status.warn,
	.status.error {
		color: #e07a7a;
	}

	.selector {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
		font-size: 10px;
		color: #9aa8c7;
	}

	.selector select {
		flex: 1;
		min-width: 0;
		font-size: 10px;
		background: #121826;
		color: #e8ecf8;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		padding: 2px 4px;
	}

	.editor {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.editor :global(.cm-host) {
		flex: 1;
		min-height: 0;
	}
</style>
