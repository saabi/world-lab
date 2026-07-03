import { describe, expect, it } from 'vitest';
import { getPrimitive, listPrimitives, registerPrimitive } from './registry.js';
import { contractOf, swapFamily, listSwapFamily } from './contract.js';
import { Type } from '@world-lab/schema';
import type { NodePrimitive } from './primitive.js';
import './primitives/index.js'; // side-effect: registers all primitives

describe('@world-lab/graph contract & swap families', () => {
	it('contractOf returns a normalized port signature', () => {
		const add = getPrimitive('math.add')!;
		expect(contractOf(add)).toBe('f32,f32->f32');
	});

	it('binary f32 ops share a mechanical contract', () => {
		const ids = ['math.add', 'math.multiply', 'math.min', 'math.max', 'math.subtract', 'math.divide'];
		const contracts = ids.map((id) => contractOf(getPrimitive(id)!));
		// All should be identical
		expect(new Set(contracts).size).toBe(1);
		expect(contracts[0]).toBe('f32,f32->f32');
	});

	it('primitives with different signatures have different contracts', () => {
		const add = getPrimitive('math.add')!;
		const perlin = getPrimitive('noise.perlin3d')!;
		expect(contractOf(add)).not.toBe(contractOf(perlin));
	});

	it('contractOf includes coordinate space when present', () => {
		// metricPosition has space-tagged outputs; verify contract encodes space
		const mp = getPrimitive('procedural.metricPosition');
		if (mp && mp.outputs.some((o) => o.space && o.space !== 'none')) {
			const contract = contractOf(mp);
			expect(contract).toContain('@');
		}
	});

	it('preserves the legacy mechanical contract for every registered primitive', () => {
		const legacyContract = (primitive: NodePrimitive) => {
			const formatPorts = (ports: NodePrimitive['inputs']) =>
				ports
					.map((port) => {
						const space =
							port.space && port.space !== 'none' ? `@${port.space}` : '';
						return `${port.dataType}${space}`;
					})
					.join(',');
			return `${formatPorts(primitive.inputs)}->${formatPorts(primitive.outputs)}`;
		};

		for (const primitive of listPrimitives()) {
			expect(contractOf(primitive)).toBe(legacyContract(primitive));
		}
	});

	it('does not include semantic tags in the mechanical contract', () => {
		const add = getPrimitive('math.add')!;
		const tagged: NodePrimitive = {
			...add,
			inputs: [
				{ ...add.inputs[0]!, semantics: ['unit:m', 'color:linear-srgb'] },
				...add.inputs.slice(1)
			]
		};
		expect(contractOf(tagged)).toBe(contractOf(add));
	});

	it('swapFamily returns role when set, else contract', () => {
		const add = getPrimitive('math.add')!;
		// add has no role → falls back to contract
		expect(swapFamily(add)).toBe(contractOf(add));

		const min = getPrimitive('math.min')!;
		// min has help metadata but no role → contract
		expect(swapFamily(min)).toBe(contractOf(min));
	});

	it('swapFamily returns role when metadata.role is set', () => {
		// Create a mock primitive with a role to test the branch
		const mockPrimitive = {
			...getPrimitive('math.add')!,
			metadata: { role: 'positionTransform' }
		};
		expect(swapFamily(mockPrimitive)).toBe('positionTransform');
	});

	it('listSwapFamily groups binary f32 ops together', () => {
		const family = listSwapFamily('math.add');
		const ids = family.map((p) => p.id);
		expect(ids).toContain('math.add');
		expect(ids).toContain('math.multiply');
		expect(ids).toContain('math.min');
		expect(ids).toContain('math.max');
		expect(ids).toContain('math.subtract');
		expect(ids).toContain('math.divide');
		// But not perlin (different contract)
		expect(ids).not.toContain('noise.perlin3d');
	});

	it('listSwapFamily returns empty array for unknown id', () => {
		expect(listSwapFamily('nonexistent.primitive')).toEqual([]);
	});

	it('role-based swap family groups across differing signatures', () => {
		// Verify that two primitives with different signatures but the same role
		// end up in the same swap family
		const twist: NodePrimitive = {
			id: 'test.twist',
			category: 'test',
			inputs: [{ name: 'pos', dataType: 'vec3f' }],
			outputs: [{ name: 'out', dataType: 'vec3f' }],
			params: Type.Object({}),
			wgsl: { moduleId: 'test.twist', entry: 'twist' },
			metadata: { role: 'positionTransform' }
		};
		const displace: NodePrimitive = {
			id: 'test.displace',
			category: 'test',
			inputs: [
				{ name: 'pos', dataType: 'vec3f' },
				{ name: 'height', dataType: 'f32' }
			],
			outputs: [{ name: 'out', dataType: 'vec3f' }],
			params: Type.Object({}),
			wgsl: { moduleId: 'test.displace', entry: 'displace' },
			metadata: { role: 'positionTransform' }
		};

		registerPrimitive(twist);
		registerPrimitive(displace);

		// Different contracts (different input counts)
		expect(contractOf(twist)).not.toBe(contractOf(displace));
		// But same swap family (role)
		expect(swapFamily(twist)).toBe(swapFamily(displace));
		expect(swapFamily(twist)).toBe('positionTransform');

		// listSwapFamily should return both
		const family = listSwapFamily('test.twist');
		const ids = family.map((p) => p.id);
		expect(ids).toContain('test.twist');
		expect(ids).toContain('test.displace');
	});

	it('help metadata is accessible on min/max', () => {
		const min = getPrimitive('math.min')!;
		const max = getPrimitive('math.max')!;
		expect(min.metadata?.help).toContain('SDF union');
		expect(max.metadata?.help).toContain('SDF intersection');
	});
});
