import { LanguageSupport, StreamLanguage } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';

import { tokenizeWgslBody } from './wgslTokens.js';

const FRONTMATTER_OPEN = '/*---';
const FRONTMATTER_CLOSE = '---*/';

type SourceMode = 'seekOpen' | 'frontmatter' | 'body';

interface PrimitiveSourceState {
	mode: SourceMode;
	inBlockComment: boolean;
}

export function splitPrimitiveSource(text: string): { frontmatter: string; body: string } {
	const openIndex = text.indexOf(FRONTMATTER_OPEN);
	if (openIndex === -1) {
		return { frontmatter: '', body: text };
	}
	const closeIndex = text.indexOf(FRONTMATTER_CLOSE, openIndex + FRONTMATTER_OPEN.length);
	if (closeIndex === -1) {
		return { frontmatter: text.slice(openIndex), body: '' };
	}
	const closeEnd = closeIndex + FRONTMATTER_CLOSE.length;
	return {
		frontmatter: text.slice(openIndex, closeEnd),
		body: text.slice(closeEnd)
	};
}

export const primitiveSourceLanguage = StreamLanguage.define<PrimitiveSourceState>({
	name: 'primitive-source',
	startState: () => ({ mode: 'seekOpen', inBlockComment: false }),
	token(stream, state) {
		if (state.mode === 'seekOpen') {
			if (stream.match(FRONTMATTER_OPEN)) {
				state.mode = 'frontmatter';
				return 'meta';
			}
			state.mode = 'body';
		}

		if (state.mode === 'frontmatter') {
			if (stream.match(FRONTMATTER_CLOSE)) {
				state.mode = 'body';
				return 'meta';
			}
			if (stream.sol() && stream.match(/^[\w.-]+:/)) return 'propertyName';
			if (stream.match(/^#.*/)) return 'comment';
			if (stream.match(/^"([^"\\]|\\.)*"/)) return 'string';
			if (stream.match(/^\d+(\.\d+)?/)) return 'number';
			stream.next();
			return null;
		}

		return tokenizeWgslBody(stream, state);
	},
	tokenTable: styleTags({
		meta: t.meta,
		propertyName: t.propertyName,
		comment: t.lineComment,
		string: t.string,
		number: t.number,
		keyword: t.keyword,
		typeName: t.typeName,
		attribute: t.meta
	}) as unknown as { [key: string]: typeof t.keyword }
});

export function primitiveSourceLanguageSupport(): LanguageSupport {
	return new LanguageSupport(primitiveSourceLanguage);
}
