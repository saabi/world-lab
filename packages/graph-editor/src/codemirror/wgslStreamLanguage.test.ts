import type { StringStream } from '@codemirror/language';
import { describe, expect, it } from 'vitest';

import { tokenizeWgslBody } from './wgslTokens.js';
import { wgslLanguageSupport } from './wgslStreamLanguage.js';

function tokenizeLine(line: string): string[] {
	const state = { inBlockComment: false };
	const tokens: string[] = [];
	const stream = {
		pos: 0,
		start: 0,
		sol(): boolean {
			return this.pos === 0;
		},
		peek(): string | undefined {
			return line[this.pos];
		},
		next(): string | undefined {
			if (this.pos >= line.length) return undefined;
			return line[this.pos++];
		},
		eatWhile(f: (ch: string) => boolean): void {
			while (this.pos < line.length && f(line[this.pos]!)) this.pos++;
		},
		eatSpace(): boolean {
			const start = this.pos;
			this.eatWhile((ch) => ch === ' ' || ch === '\t');
			return this.pos > start;
		},
		match(re: RegExp | string, consume?: boolean, caseInsensitive?: boolean): boolean {
			if (typeof re === 'string') {
				const found = line.startsWith(re, this.pos);
				if (found && consume !== false) this.pos += re.length;
				return found;
			}
			const flags = caseInsensitive ? 'i' : '';
			const m = line.slice(this.pos).match(new RegExp(re.source, flags));
			if (!m) return false;
			if (consume !== false) this.pos += m[0]!.length;
			return true;
		},
		current(): string {
			return line.slice(this.start, this.pos);
		},
		skipToEnd(): void {
			this.pos = line.length;
		},
		eol(): boolean {
			return this.pos >= line.length;
		}
	} as StringStream;

	while (!stream.eol()) {
		stream.start = stream.pos;
		const token = tokenizeWgslBody(stream, state);
		if (token) tokens.push(token);
		if (stream.pos >= line.length) break;
	}
	return tokens;
}

describe('wgslStreamLanguage', () => {
	it('exposes a language support bundle', () => {
		expect(wgslLanguageSupport().language.name).toBe('wgsl');
	});

	it('assigns keyword and typeName tags to fn and vec3', () => {
		const tokens = tokenizeLine('fn foo() -> vec3<f32> {');
		expect(tokens).toContain('keyword');
		expect(tokens).toContain('typeName');
	});
});
