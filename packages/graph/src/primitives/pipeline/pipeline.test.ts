import { describe, expect, it } from 'vitest';
import { Value } from '@world-lab/schema';

import { getPrimitive } from '../../registry.js';
import { fullscreenPlaneParams, planeParams } from './plane.js';
import './index.js';
import { planeGridPosition } from './planeGrid.js';

describe('pipeline geometry primitives', () => {
	it('registers the additive fragment kernel stage without changing legacy stages', () => {
		const vertex = getPrimitive('stage.vertex')!;
		const vertexKernel = getPrimitive('stage.vertexKernel')!;
		const fragment = getPrimitive('stage.fragment')!;
		const fragmentKernel = getPrimitive('stage.fragmentKernel')!;

		expect(vertex.implementation).toEqual({
			kind: 'wgsl-function',
			moduleId: 'stage.vertex',
			entry: 'vertexStage'
		});
		expect(vertex.metadata?.role).toBe('pipelineStage');
		expect(vertex.metadata?.pipelineStageKind).toBe('vertex');
		expect(vertexKernel.implementation).toEqual({
			kind: 'kernel',
			stage: 'vertex',
			bindings: []
		});
		expect(vertexKernel.metadata?.role).toBe('pipelineStage');
		expect(vertexKernel.metadata?.pipelineStageKind).toBe('vertex');
		expect(vertexKernel.inputs.map((port) => port.name)).toEqual(['mesh', 'position', 'uv']);
		expect(vertexKernel.outputs.map((port) => port.name)).toEqual(['varyings']);
		expect(fragment.implementation).toEqual({
			kind: 'legacy-structural',
			marker: 'stage.fragment'
		});
		expect(fragment.metadata?.role).toBe('pipelineStage');
		expect(fragment.metadata?.pipelineStageKind).toBe('fragment');
		expect(fragmentKernel.implementation).toEqual({
			kind: 'kernel',
			stage: 'fragment',
			bindings: []
		});
		expect(fragmentKernel.metadata?.role).toBe('pipelineStage');
		expect(fragmentKernel.metadata?.pipelineStageKind).toBe('fragment');
		expect(fragmentKernel.inputs.map((port) => port.name)).toEqual(['varyings', 'color']);
		expect(fragmentKernel.outputs.map((port) => port.name)).toEqual(['texture']);
	});

	it('geometry.plane params default and coerce resU/resV', () => {
		const plane = getPrimitive('geometry.plane')!;
		expect(plane.wgsl).toEqual({ moduleId: 'geometry.plane', entry: 'planeGrid' });

		const empty = Value.Create(planeParams);
		expect(empty).toEqual({
			resU: 16,
			resV: 16,
			width: 2,
			height: 2,
			rotationX: 0,
			rotationY: 0,
			rotationZ: 0
		});

		const coerced = Value.Convert(planeParams, {
			resU: '32',
			resV: 8,
			width: '4',
			height: 1,
			rotationX: '0.5'
		});
		expect(coerced).toMatchObject({
			resU: 32,
			resV: 8,
			width: 4,
			height: 1,
			rotationX: 0.5
		});
	});

	it('geometry.fullscreenPlane is a 2x2 compatibility alias for geometry.plane', () => {
		const fullscreen = getPrimitive('geometry.fullscreenPlane')!;
		const plane = getPrimitive('geometry.plane')!;
		expect(fullscreen.id).not.toBe(plane.id);
		expect(fullscreen.outputs).toEqual(plane.outputs);
		expect(fullscreen.implementation).toEqual({
			kind: 'legacy-structural',
			marker: 'geometry.fullscreenPlane'
		});
		expect(fullscreen.wgsl).toBeUndefined();
		expect(Value.Create(fullscreenPlaneParams)).toEqual({
			resU: 2,
			resV: 2,
			width: 2,
			height: 2,
			rotationX: 0,
			rotationY: 0,
			rotationZ: 0
		});
		expect(Value.Create(fullscreen.params)).toEqual({
			resU: 2,
			resV: 2,
			width: 2,
			height: 2,
			rotationX: 0,
			rotationY: 0,
			rotationZ: 0
		});
		expect(fullscreen.metadata?.help).toContain('geometry.plane');
	});

	it('geometry.plane evalCPU returns 2×2 grid corners', () => {
		const plane = getPrimitive('geometry.plane')!;
		const result = plane.evalCPU!({ inputs: {}, params: { resU: 2, resV: 2 } });
		const mesh = result.mesh;
		expect(Array.isArray(mesh)).toBe(true);
		const positions = mesh as number[];
		expect(positions).toHaveLength(18);
		expect(positions.slice(0, 3)).toEqual(planeGridPosition(0, 2, 2));
		expect(positions.slice(12, 15)).toEqual(planeGridPosition(4, 2, 2));
	});
});
