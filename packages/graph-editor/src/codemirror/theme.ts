import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export const graphEditorHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: '#7aa2ff' },
	{ tag: tags.string, color: '#9ece6a' },
	{ tag: tags.lineComment, color: '#565f89' },
	{ tag: tags.blockComment, color: '#565f89' },
	{ tag: tags.number, color: '#ff9e64' },
	{ tag: tags.typeName, color: '#2ac3de' },
	{ tag: tags.tagName, color: '#bb9af7' },
	{ tag: tags.attributeName, color: '#7dcfff' },
	{ tag: tags.propertyName, color: '#7dcfff' },
	{ tag: tags.meta, color: '#bb9af7' }
]);

export const graphEditorTheme = EditorView.theme({
	'&': {
		backgroundColor: '#0d1018',
		color: '#dbe4ff'
	},
	'.cm-content': {
		caretColor: '#dbe4ff'
	},
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
		backgroundColor: 'rgba(93, 140, 255, 0.25)'
	},
	'.cm-gutters': {
		display: 'none'
	},
	'.cm-activeLine': {
		backgroundColor: 'transparent'
	}
});

export function graphEditorSyntaxHighlighting() {
	return syntaxHighlighting(graphEditorHighlightStyle);
}
