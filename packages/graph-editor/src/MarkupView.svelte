<script lang="ts">
	import type { GraphDocument } from '@virtual-planet/graph';
	import { MarkupParseError, parseGraphMarkup } from './markup/parseGraphMarkup.js';
	import { printGraphMarkup } from './markup/printGraph.js';

	interface Props {
		graph: GraphDocument;
		onchange?: (next: GraphDocument) => void;
		onerror?: (error: MarkupParseError) => void;
	}

	let { graph, onchange, onerror }: Props = $props();

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

	function onInput(event: Event) {
		const target = event.currentTarget as HTMLTextAreaElement;
		draft = target.value;
		editing = true;
		scheduleParse();
	}
</script>

<div class="markup">
	<h2 class="title">Markup</h2>
	<textarea class="code" value={draft} spellcheck="false" oninput={onInput}></textarea>
</div>

<style>
	.markup {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		padding: 8px;
	}

	.title {
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 600;
		flex: 0 0 auto;
	}

	.code {
		flex: 1;
		min-height: 0;
		width: 100%;
		margin: 0;
		padding: 8px;
		overflow: auto;
		resize: none;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		background: #0d1018;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		line-height: 1.45;
		color: #dbe4ff;
	}
</style>
