import type { WgslModuleResolver } from '@world-lab/compiler';
import {
	getPrimitive,
	registerPrimitive,
	type GraphDocument,
	type Node,
	type Port,
	type PortSpec
} from '@world-lab/graph';
import { createStandardLibraryResolver, STANDARD_LIBRARY_MODULES } from '@world-lab/procedural-wgsl';
import { Type } from '@world-lab/schema';

import type {
	Density3,
	VegetationCandidateConfig,
	VegetationPatch
} from '../vegetationTypes.js';

const DENSITY_WGSL = `
fn vegetationParityDensity(position: vec3<f32>) -> vec3<f32> {
	_ = position;
	return vec3<f32>(0.8, 0.2, 0.1);
}
`;

const PLACEMENT_WGSL = `
fn vegetationParityPlacement(position: vec3<f32>) -> f32 {
	if (position.x == 0.5 && position.y == 0.5) {
		return 1.0;
	}
	if (position.x == 2.5 && position.y == 1.5) {
		return 0.9;
	}
	return 0.0;
}
`;

const PLATEAU_PLACEMENT_WGSL = `
fn vegetationParityPlateauPlacement(position: vec3<f32>) -> f32 {
	_ = position;
	return 1.0;
}
`;

let parityPrimitivesRegistered = false;

function registerParityPrimitives(): void {
	if (parityPrimitivesRegistered) return;
	parityPrimitivesRegistered = true;

	registerPrimitive({
		id: 'test.vegetationParityDensity',
		category: 'test',
		inputs: [{ name: 'position', dataType: 'vec3f' }],
		outputs: [{ name: 'density', dataType: 'vec3f' }],
		params: Type.Object({}),
		wgsl: { moduleId: 'test.vegetationParityDensity', entry: 'vegetationParityDensity' },
		evalCPU() {
			return { density: [0.8, 0.2, 0.1] };
		}
	});

	registerPrimitive({
		id: 'test.vegetationParityPlacement',
		category: 'test',
		inputs: [{ name: 'position', dataType: 'vec3f' }],
		outputs: [{ name: 'value', dataType: 'f32' }],
		params: Type.Object({}),
		wgsl: { moduleId: 'test.vegetationParityPlacement', entry: 'vegetationParityPlacement' },
		evalCPU(ctx) {
			const position = ctx.inputs.position as number[];
			const [x, y] = position;
			if (x === 0.5 && y === 0.5) return { value: 1 };
			if (x === 2.5 && y === 1.5) return { value: 0.9 };
			return { value: 0 };
		}
	});

	registerPrimitive({
		id: 'test.vegetationParityPlateauPlacement',
		category: 'test',
		inputs: [{ name: 'position', dataType: 'vec3f' }],
		outputs: [{ name: 'value', dataType: 'f32' }],
		params: Type.Object({}),
		wgsl: {
			moduleId: 'test.vegetationParityPlateauPlacement',
			entry: 'vegetationParityPlateauPlacement'
		},
		evalCPU() {
			return { value: 1 };
		}
	});
}

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(id: string, primitiveId: string): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out')
	};
}

function metricPositionGraph(
	densityNodeId: string,
	densityPrimitiveId: string,
	outputPort: string,
	outputName: string
): GraphDocument {
	registerParityPrimitives();
	return {
		version: '2',
		nodes: [
			snapshotNode('n_pos', 'procedural.metricPosition'),
			snapshotNode(densityNodeId, densityPrimitiveId)
		],
		edges: [
			{
				id: 'e_pos_density',
				from: { node: 'n_pos', port: 'position' },
				to: { node: densityNodeId, port: 'position' }
			}
		],
		outputs: [{ name: outputName, from: { node: densityNodeId, port: outputPort } }],
	};
}

export const PARITY_PATCH: VegetationPatch = {
	id: 'test-patch',
	origin: [0, 0, 0],
	tangentX: [1, 0, 0],
	tangentY: [0, 1, 0],
	widthMeters: 3,
	heightMeters: 3
};

export const PARITY_CONFIG: VegetationCandidateConfig = {
	spacingMeters: 1,
	channel: 0,
	placementThreshold: 0.5,
	densityThreshold: 0.1,
	minProminence: 0.05
};

export const PARITY_DENSITY_GRAPH = metricPositionGraph(
	'n_density',
	'test.vegetationParityDensity',
	'density',
	'density'
);

export const PARITY_PLACEMENT_GRAPH = metricPositionGraph(
	'n_placement',
	'test.vegetationParityPlacement',
	'value',
	'placement'
);

export const PARITY_PLATEAU_PLACEMENT_GRAPH = metricPositionGraph(
	'n_plateau',
	'test.vegetationParityPlateauPlacement',
	'value',
	'placement'
);

export function parityResolver(): WgslModuleResolver {
	registerParityPrimitives();
	return createStandardLibraryResolver({
		...STANDARD_LIBRARY_MODULES,
		'test.vegetationParityDensity': {
			id: 'test.vegetationParityDensity',
			source: DENSITY_WGSL
		},
		'test.vegetationParityPlacement': {
			id: 'test.vegetationParityPlacement',
			source: PLACEMENT_WGSL
		},
		'test.vegetationParityPlateauPlacement': {
			id: 'test.vegetationParityPlateauPlacement',
			source: PLATEAU_PLACEMENT_WGSL
		}
	});
}

export function cpuSamplersFromParityModules(): {
	density: (position: readonly [number, number, number]) => Density3;
	placement: (position: readonly [number, number, number]) => number;
} {
	return {
		density: () => [0.8, 0.2, 0.1] as Density3,
		placement: ([x, y]) => {
			if (x === 0.5 && y === 0.5) return 1;
			if (x === 2.5 && y === 1.5) return 0.9;
			return 0;
		}
	};
}
