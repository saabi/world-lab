<script module lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { indentUnit } from '@codemirror/language';
	import { EditorState, type Extension } from '@codemirror/state';
	import { drawSelection, EditorView, keymap } from '@codemirror/view';

	import {
		graphEditorSyntaxHighlighting,
		graphEditorTheme,
		planetMarkupLanguage,
		primitiveSourceLanguageSupport,
		wgslLanguageSupport
	} from './codemirror/index.js';

	export type CodeMirrorLanguage = 'planet-markup' | 'primitive-source' | 'wgsl';
</script>

<script lang="ts">
	interface Props {
		value?: string;
		language: CodeMirrorLanguage;
		onchange?: (value: string) => void;
		readOnly?: boolean;
		class?: string;
	}

	let {
		value = $bindable(''),
		language,
		onchange,
		readOnly = false,
		class: className = ''
	}: Props = $props();

	let hostEl = $state<HTMLDivElement | null>(null);
	let view = $state<EditorView | null>(null);
	let syncing = false;

	function languageExtension(lang: CodeMirrorLanguage): Extension {
		if (lang === 'planet-markup') return planetMarkupLanguage();
		if (lang === 'wgsl') return wgslLanguageSupport();
		return primitiveSourceLanguageSupport();
	}

	function createState(doc: string): EditorState {
		return EditorState.create({
			doc,
			extensions: [
				graphEditorTheme,
				graphEditorSyntaxHighlighting(),
				languageExtension(language),
				history(),
				drawSelection(),
				EditorView.lineWrapping,
				EditorState.tabSize.of(2),
				indentUnit.of('  '),
				EditorView.contentAttributes.of({ spellcheck: 'false' }),
				EditorView.editable.of(!readOnly),
				EditorView.updateListener.of((update) => {
					if (syncing || !update.docChanged) return;
					const next = update.state.doc.toString();
					value = next;
					onchange?.(next);
				}),
				keymap.of([...defaultKeymap, ...historyKeymap])
			]
		});
	}

	onMount(() => {
		if (!hostEl) return;
		view = new EditorView({
			state: createState(value),
			parent: hostEl
		});
	});

	onDestroy(() => {
		view?.destroy();
		view = null;
	});

	$effect(() => {
		if (!view) return;
		const next = value ?? '';
		if (view.state.doc.toString() === next) return;
		syncing = true;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: next }
		});
		syncing = false;
	});
</script>

<div bind:this={hostEl} class="cm-host {className}"></div>

<style>
	.cm-host {
		box-sizing: border-box;
		min-height: 0;
		height: auto;
		width: 100%;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		background: #0d1018;
	}

	.cm-host :global(.cm-editor) {
		height: 100%;
	}

	.cm-host :global(.cm-scroller) {
		overflow: auto;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 10px;
		line-height: 1.45;
	}
</style>
