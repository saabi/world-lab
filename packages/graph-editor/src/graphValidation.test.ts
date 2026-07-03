import '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import {
	buildValidationHighlightIndex,
	countValidationSeverity,
	formatValidationIssue,
	fullValidation,
	incompleteGraphMessage,
	issueFocusTarget
} from './graphValidation.js';

const portIn = (id: string) => ({ id, name: id, direction: 'in' as const, dataType: 'f32' as const });
const portOut = (id: string) => ({ id, name: id, direction: 'out' as const, dataType: 'f32' as const });

describe('graphValidation', () => {
	it('surfaces completeness errors via validateGraphFull', () => {
		const result = fullValidation({
			version: '2',
			nodes: [
				{
					id: 'sum',
					primitive: 'math.doesNotExist',
					inputs: [portIn('a'), portIn('b')],
					outputs: [portOut('value')]
				}
			],
			edges: [],
			outputs: [{ name: 'out', from: { node: 'sum', port: 'value' } }],
		});
		expect(result.ok).toBe(false);
		expect(incompleteGraphMessage(result)).toMatch(/Graph incomplete: 1 error/);
	});

	it('builds highlight index for ports and edges', () => {
		const issues = [
			{ kind: 'unconnected-input' as const, node: 'sum', port: 'b' },
			{ kind: 'type-mismatch' as const, edge: 'e1', from: 'f32' as const, to: 'vec3f' as const }
		];
		const index = buildValidationHighlightIndex(issues);
		expect(index.ports.get('sum:b')).toBe('warning');
		expect(index.nodeWarnings.has('sum')).toBe(true);
		expect(index.edges.has('e1')).toBe(true);
	});

	it('formats issues and exposes focus targets', () => {
		const issue = { kind: 'unresolved-primitive' as const, node: 'n1', primitive: 'math.nope' };
		expect(formatValidationIssue(issue)).toContain('math.nope');
		expect(issueFocusTarget(issue)).toEqual({ nodeId: 'n1' });
		expect(countValidationSeverity([issue])).toEqual({ errors: 1, warnings: 0 });
	});

	it('formats multiple-inputs issues and highlights the port', () => {
		const issue = { kind: 'multiple-inputs' as const, node: 'n_display', port: 'color', count: 2 };
		expect(formatValidationIssue(issue)).toContain('n_display.color');
		expect(issueFocusTarget(issue)).toEqual({ nodeId: 'n_display' });
		const index = buildValidationHighlightIndex([issue]);
		expect(index.ports.get('n_display:color')).toBe('error');
	});
});
