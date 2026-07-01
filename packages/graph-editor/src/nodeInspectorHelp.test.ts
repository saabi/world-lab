import '@virtual-planet/graph';
import { Type } from '@virtual-planet/schema';
import { describe, expect, it } from 'vitest';
import { getPrimitive } from '@virtual-planet/graph';

import { resolveNodeInspectorHelp } from './nodeInspectorHelp.js';

describe('resolveNodeInspectorHelp', () => {
	it('prefers help over description for the summary', () => {
		const primitive = getPrimitive('math.min')!;
		expect(resolveNodeInspectorHelp(primitive).summary).toContain('SDF union');
	});

	it('includes usage when present', () => {
		const help = resolveNodeInspectorHelp(getPrimitive('sdf.opSubtract')!);
		expect(help.usage).toBeTruthy();
	});

	it('falls back to description when help is absent', () => {
		const help = resolveNodeInspectorHelp({
			id: 'test.node',
			category: 'test',
			inputs: [],
			outputs: [],
			params: Type.Object({}),
			wgsl: { moduleId: 'test.node', entry: 'test' },
			metadata: { description: 'A test primitive.' }
		});
		expect(help.summary).toBe('A test primitive.');
	});
});
