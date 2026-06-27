import { LanguageSupport, StreamLanguage } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';

import { tokenizeWgslBody, type WgslBodyState } from './wgslTokens.js';

export const wgslStreamLanguage = StreamLanguage.define<WgslBodyState>({
	name: 'wgsl',
	startState: () => ({ inBlockComment: false }),
	token(stream, state) {
		return tokenizeWgslBody(stream, state);
	},
	tokenTable: styleTags({
		keyword: t.keyword,
		typeName: t.typeName,
		comment: t.blockComment,
		number: t.number,
		attribute: t.meta,
		string: t.string
	}) as unknown as { [key: string]: typeof t.keyword }
});

export function wgslLanguageSupport(): LanguageSupport {
	return new LanguageSupport(wgslStreamLanguage);
}
