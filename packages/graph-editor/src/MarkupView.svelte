<script module lang="ts">
	import type { GraphDocument } from '@world-lab/graph';
	import { MarkupParseError } from './markup/parseGraphMarkup.js';
	import CodeMirrorEditor from './CodeMirrorEditor.svelte';

	export interface MarkupViewActions {
		resyncFromGraph: () => void;
		copyMarkup: () => void;
	}
</script>

<script lang="ts">
	import { parseGraphMarkup } from './markup/parseGraphMarkup.js';
	import { printGraphMarkup } from './markup/printGraph.js';

	interface Props {
		graph: GraphDocument;
		onchange?: (next: GraphDocument) => void;
		onerror?: (error: MarkupParseError) => void;
		registerActions?: (actions: MarkupViewActions) => void;
	}

	let { graph, onchange, onerror, registerActions }: Props = $props();

	let draft = $state('');
	let editing = $state(false);
	let parseTimer: ReturnType<typeof setTimeout> | undefined;
	let lastGraphJson = $state('');

	$effect(() => {
		const json = JSON.stringify(graph);
		if (!editing && json !== lastGraphJson) {
			draft = printGraphMarkup(graph);
			lastGraphJson = json;
		}
	});

	function scheduleParse() {
		clearTimeout(parseTimer);
		parseTimer = setTimeout(() => {
			try {
				const next = parseGraphMarkup(draft);
				editing = false;
				lastGraphJson = JSON.stringify(next);
				onchange?.(next);
			} catch (error) {
				if (error instanceof MarkupParseError) {
					onerror?.(error);
				} else {
					onerror?.(new MarkupParseError(error instanceof Error ? error.message : 'Parse failed'));
				}
			}
		}, 300);
	}

	function onDraftChange(next: string) {
		draft = next;
		editing = true;
		scheduleParse();
	}

	function resyncFromGraph() {
		editing = false;
		draft = printGraphMarkup(graph);
		lastGraphJson = JSON.stringify(graph);
	}

	async function copyMarkup() {
		try {
			await navigator.clipboard.writeText(draft);
		} catch {
			/* clipboard unavailable */
		}
	}

	$effect(() => {
		registerActions?.({ resyncFromGraph, copyMarkup });
	});
</script>

<div class="markup">
	<CodeMirrorEditor
		class="code"
		language="planet-markup"
		bind:value={draft}
		onchange={onDraftChange}
	/>
</div>

<style>
	.markup {
		box-sizing: border-box;
		display: grid;
		grid-template-rows: 1fr;
		min-height: 0;
		padding: 8px;
		gap: 6px;
	}

	.code {
		/* grid row host for CodeMirrorEditor */
	}
</style>
