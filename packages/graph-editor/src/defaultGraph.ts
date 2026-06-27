import type { GraphDocument, PortRef } from '@virtual-planet/graph';

export function defaultPreviewGraph(): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_uv',
				primitive: 'procedural.uv',
				position: { x: 0, y: 80 },
				inputs: [],
				outputs: [{ id: 'uv', name: 'uv', direction: 'out', dataType: 'vec2f', space: 'none' }]
			},
			{
				id: 'n_perlin',
				primitive: 'noise.perlin3d',
				position: { x: 220, y: 60 },
				inputs: [
					{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f', space: 'none' }
				],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'none' }]
			},
			{
				id: 'n_remap',
				primitive: 'math.remap',
				position: { x: 460, y: 80 },
				params: { inMin: -1, inMax: 1, outMin: 0, outMax: 1 },
				inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32', space: 'none' }],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'none' }]
			}
		],
		edges: [
			{
				id: 'e_uv_perlin',
				from: { node: 'n_uv', port: 'uv' },
				to: { node: 'n_perlin', port: 'position' }
			},
			{
				id: 'e_perlin_remap',
				from: { node: 'n_perlin', port: 'value' },
				to: { node: 'n_remap', port: 'x' }
			}
		],
		outputs: [{ name: 'field', from: { node: 'n_remap', port: 'value' } }],
		consumers: [{ type: 'preview', outputs: ['field'] }]
	};
}

export function primaryPreviewOutput(doc: GraphDocument): PortRef | null {
	return doc.outputs[0]?.from ?? null;
}
