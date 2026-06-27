import { getPrimitive, type NodePrimitive } from '@virtual-planet/graph';
import { NOISE_PERLIN3D_SOURCE } from './fixtures/perlin3d.source.js';

const SOURCE_FIXTURES: Record<string, string> = {
	'noise.perlin3d': NOISE_PERLIN3D_SOURCE
};

const sourceOverrides = new Map<string, string>();

function buildStubSource(primitive: NodePrimitive): string {
	const yamlInputs =
		primitive.inputs.length > 0
			? `inputs:\n${primitive.inputs
					.map(
						(port) =>
							`  ${port.name}:\n    space: ${port.space ?? 'none'}`
					)
					.join('\n')}\n`
			: '';

	const yamlOutputs =
		primitive.outputs.length > 0
			? `outputs:\n${primitive.outputs.map((port) => `  ${port.name}:`).join('\n')}\n`
			: '';

	const fnParams = [
		...primitive.inputs.map((port) => `${port.name}: vec3<f32>`),
		'...'
	].join(', ');

	return `/*---
id: ${primitive.id}
entry: ${primitive.wgsl.entry}
category: ${primitive.category}
${yamlInputs}${yamlOutputs}---*/
fn ${primitive.wgsl.entry}(${fnParams}) -> f32 {
	return 0.0;
}
`;
}

export function getDefaultPrimitiveSource(moduleId: string): string {
	const fixture = SOURCE_FIXTURES[moduleId];
	if (fixture) return fixture;

	const primitive = getPrimitive(moduleId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${moduleId}`);
	}

	return buildStubSource(primitive);
}

export function getPrimitiveSource(moduleId: string): string {
	return sourceOverrides.get(moduleId) ?? getDefaultPrimitiveSource(moduleId);
}

export function setPrimitiveSource(moduleId: string, source: string): void {
	sourceOverrides.set(moduleId, source);
}

/** Reset in-memory source overrides — for tests. */
export function resetPrimitiveSources(): void {
	sourceOverrides.clear();
}
