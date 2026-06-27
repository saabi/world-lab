import type { StringStream } from '@codemirror/language';

/** Shared WGSL stream tokenizer for primitive-source body regions. */
const KEYWORDS = new Set([
	'fn',
	'var',
	'let',
	'const',
	'struct',
	'return',
	'if',
	'else',
	'for',
	'while',
	'loop',
	'switch',
	'case',
	'break',
	'continue',
	'true',
	'false'
]);

const TYPES = new Set([
	'f32',
	'i32',
	'u32',
	'bool',
	'vec2',
	'vec3',
	'vec4',
	'mat2x2',
	'mat3x3',
	'mat4x4',
	'texture_2d',
	'sampler'
]);

export interface WgslBodyState {
	inBlockComment: boolean;
}

export function tokenizeWgslBody(stream: StringStream, state: WgslBodyState): string | null {
	if (state.inBlockComment) {
		if (stream.match('*/')) {
			state.inBlockComment = false;
			return 'comment';
		}
		stream.next();
		return 'comment';
	}

	stream.eatWhile((ch) => ch === ' ' || ch === '\t');
	if (stream.eol()) return null;

	if (stream.match('//')) {
		stream.skipToEnd();
		return 'comment';
	}
	if (stream.match('/*')) {
		state.inBlockComment = true;
		return 'comment';
	}

	if (stream.sol() && stream.match(/^@\w+/)) return 'attribute';

	if (stream.match(/^"([^"\\]|\\.)*"/)) return 'string';
	if (stream.match(/^\d+(\.\d+)?([eE][+-]?\d+)?[fu]?/)) return 'number';

	if (stream.match(/^[A-Za-z_]\w*/)) {
		const ident = stream.current();
		if (KEYWORDS.has(ident)) return 'keyword';
		if (TYPES.has(ident)) return 'typeName';
		return null;
	}

	stream.next();
	return null;
}
