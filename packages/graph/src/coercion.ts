import type { TypeRef } from './types.js';

export type CoercionPlan =
	| { kind: 'identity' }
	| { kind: 'vector-pad-zero'; fromWidth: 2; toWidth: 3 };

function sameType(a: TypeRef, b: TypeRef): boolean {
	if (a.kind !== b.kind) return false;
	switch (a.kind) {
		case 'scalar':
			return b.kind === 'scalar' && a.scalar === b.scalar;
		case 'vector':
			return b.kind === 'vector' && a.element === b.element && a.width === b.width;
		case 'matrix':
			return (
				b.kind === 'matrix' &&
				a.element === b.element &&
				a.columns === b.columns &&
				a.rows === b.rows
			);
		case 'array':
			return b.kind === 'array' && a.length === b.length && sameType(a.element, b.element);
		case 'struct':
			return (
				b.kind === 'struct' &&
				a.id === b.id &&
				a.fields.length === b.fields.length &&
				a.fields.every(
					(field, index) =>
						field.name === b.fields[index]?.name &&
						sameType(field.type, b.fields[index]!.type)
				)
			);
		case 'buffer':
			return (
				b.kind === 'buffer' &&
				a.access === b.access &&
				a.usages.length === b.usages.length &&
				a.usages.every((usage, index) => usage === b.usages[index]) &&
				sameType(a.element, b.element)
			);
		case 'texture':
			return (
				b.kind === 'texture' &&
				a.dimension === b.dimension &&
				a.sample === b.sample &&
				a.format === b.format &&
				a.access === b.access
			);
		case 'sampler':
			return (
				b.kind === 'sampler' &&
				a.filtering === b.filtering &&
				a.comparison === b.comparison
			);
		case 'mesh':
			return b.kind === 'mesh' && a.index === b.index && sameType(a.vertex, b.vertex);
		case 'command':
			return b.kind === 'command' && a.command === b.command;
		case 'legacy':
			return b.kind === 'legacy' && a.alias === b.alias;
	}
}

export function resolveCoercion(from: TypeRef, to: TypeRef): CoercionPlan | null {
	if (sameType(from, to)) return { kind: 'identity' };
	if (
		from.kind === 'vector' &&
		to.kind === 'vector' &&
		from.element === 'f32' &&
		to.element === 'f32' &&
		from.width === 2 &&
		to.width === 3
	) {
		return { kind: 'vector-pad-zero', fromWidth: 2, toWidth: 3 };
	}
	return null;
}
