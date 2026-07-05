import { describe, expect, it } from 'vitest';

import {
	deriveBufferFeedbackTarget,
	getPrimitive,
	type GraphDocument,
	type Node
} from './index.js';

function sink(id: string, params: Record<string, unknown>): Node {
	const primitive = getPrimitive('target.bufferFeedback');
	if (!primitive) throw new Error('target.bufferFeedback is not registered');
	return {
		id,
		primitive: primitive.id,
		params,
		inputs: [],
		outputs: []
	};
}

function graph(nodes: Node[]): GraphDocument {
	return { version: '2', nodes, edges: [], outputs: [] };
}

describe('target.bufferFeedback', () => {
	it('is registered and derives positive integer dimensions', () => {
		expect(getPrimitive('target.bufferFeedback')).toBeDefined();
		expect(
			deriveBufferFeedbackTarget(
				graph([sink('feedback', { gridWidth: 32, gridHeight: 16 })])
			)
		).toEqual({ sinkNodeId: 'feedback', gridWidth: 32, gridHeight: 16 });
	});

	it('rejects ambiguous or invalid target declarations', () => {
		expect(() =>
			deriveBufferFeedbackTarget(
				graph([
					sink('a', { gridWidth: 8, gridHeight: 8 }),
					sink('b', { gridWidth: 8, gridHeight: 8 })
				])
			)
		).toThrow(/at most one/);
		expect(() =>
			deriveBufferFeedbackTarget(
				graph([sink('bad', { gridWidth: 0, gridHeight: 8 })])
			)
		).toThrow(/positive integer/);
	});
});
