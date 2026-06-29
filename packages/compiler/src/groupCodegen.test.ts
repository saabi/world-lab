import { describe, expect, it } from 'vitest';
import {
	registerPrimitive,
	getPrimitive,
	listPrimitives,
	type GroupDefinition,
	type GraphDocument
} from '@virtual-planet/graph';
import { quantity, Type } from '@virtual-planet/schema';
import { loadWgslPrimitive } from './primitiveLoader.js';
import { groupToFunction } from './groupCodegen.js';
import { compileGraph } from './compileGraph.js';
import { textLinker } from './linker.js';
import '@virtual-planet/graph'; // side-effect: registers standard primitives

describe('@virtual-planet/compiler groupCodegen', () => {
	it('generates a WGSL function and frontmatter for g.normalDisplace', async () => {
		// Ensure standard math primitives are registered
		expect(getPrimitive('math.add')).toBeDefined();
		expect(getPrimitive('math.multiply')).toBeDefined();

		const subgraph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'mult',
					primitive: 'math.multiply',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'add',
					primitive: 'math.add',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{
					id: 'e1',
					from: { node: 'mult', port: 'value' },
					to: { node: 'add', port: 'b' }
				}
			],
			outputs: [
				{
					name: 'value',
					from: { node: 'add', port: 'value' }
				}
			],
			consumers: []
		};

		const def: GroupDefinition = {
			id: 'g.normalDisplace',
			category: 'transform',
			subgraph,
			interface: {
				inputs: [
					{
						name: 'normal',
						dataType: 'f32',
						target: { node: 'mult', port: 'a' }
					},
					{
						name: 'height',
						dataType: 'f32',
						target: { node: 'mult', port: 'b' }
					},
					{
						name: 'position',
						dataType: 'f32',
						target: { node: 'add', port: 'a' }
					}
				],
				outputs: [
					{
						name: 'value',
						dataType: 'f32',
						target: { node: 'add', port: 'value' }
					}
				]
			},
			role: 'positionTransform',
			help: 'Displaces a position along a normal by a height factor.',
			usage: 'Wire a normal vector, a scalar height field, and the base position.'
		};

		// 1. Run codegen
		const { wgsl, frontmatter } = groupToFunction(def);

		// Assert generated code structures
		expect(wgsl).toContain('fn normalDisplace(normal: f32, height: f32, position: f32) -> f32');
		expect(wgsl).toContain('multiply(normal, height)');
		expect(wgsl).toContain('add(position, ');
		expect(wgsl).toContain('// @use math.multiply');
		expect(wgsl).toContain('// @use math.add');

		expect(frontmatter).toContain('id: g.normalDisplace');
		expect(frontmatter).toContain('category: transform');
		expect(frontmatter).toContain('role: positionTransform');
		expect(frontmatter).toContain('help: "Displaces a position along a normal by a height factor."');

		// 2. Load the generated module as a primitive
		const source = `${frontmatter}\n${wgsl}`;
		const loaded = loadWgslPrimitive({ moduleId: 'g.normalDisplace', source });
		
		expect(loaded.primitive.id).toBe('g.normalDisplace');
		expect(loaded.primitive.category).toBe('transform');
		expect(loaded.primitive.inputs).toHaveLength(3);
		expect(loaded.primitive.outputs).toHaveLength(1);
		expect(loaded.imports).toContain('math.multiply');
		expect(loaded.imports).toContain('math.add');

		// Register the new primitive in the registry
		registerPrimitive(loaded.primitive);

		// 3. Compile a graph that uses the new group primitive
		const testDoc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'displace_node',
					primitive: 'g.normalDisplace',
					inputs: [
						{ id: 'normal', name: 'normal', direction: 'in', dataType: 'f32' },
						{ id: 'height', name: 'height', direction: 'in', dataType: 'f32' },
						{ id: 'position', name: 'position', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [{ name: 'val', from: { node: 'displace_node', port: 'value' } }],
			consumers: [{ id: 'c1', type: 'image', outputs: ['val'], stage: 'fragment' }]
		};

		// Mock resolver containing the sources of math.multiply, math.add and g.normalDisplace
		const mockResolver = {
			async resolve(moduleId: string) {
				if (moduleId === 'math.multiply') {
					return { id: 'math.multiply', source: 'fn multiply(a: f32, b: f32) -> f32 { return a * b; }' };
				}
				if (moduleId === 'math.add') {
					return { id: 'math.add', source: 'fn add(a: f32, b: f32) -> f32 { return a + b; }' };
				}
				if (moduleId === 'g.normalDisplace') {
					return {
						id: 'g.normalDisplace',
						source: wgsl,
						dependencies: ['math.multiply', 'math.add']
					};
				}
				throw new Error(`Unknown mock module: ${moduleId}`);
			}
		};

		const compileResult = await compileGraph(testDoc, mockResolver);
		const shader = compileResult.shaders[0]!;
		
		expect(shader.moduleIds).toContain('math.multiply');
		expect(shader.moduleIds).toContain('math.add');
		expect(shader.moduleIds).toContain('g.normalDisplace');

		// 4. Link the compiled modules to ensure correctness
		const linked = textLinker.link({
			entry: 'g.normalDisplace',
			modules: {
				'math.multiply': 'fn multiply(a: f32, b: f32) -> f32 { return a * b; }',
				'math.add': 'fn add(a: f32, b: f32) -> f32 { return a + b; }',
				'g.normalDisplace': wgsl
			}
		});

		expect(linked).toContain('fn multiply(');
		expect(linked).toContain('fn add(');
		expect(linked).toContain('fn normalDisplace(');
	});

	it('emits interface params after inputs with separate frontmatter params section', () => {
		const subgraph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'sub',
					primitive: 'math.subtract',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [{ name: 'value', from: { node: 'sub', port: 'value' } }],
			consumers: []
		};

		const def: GroupDefinition = {
			id: 'g.scaleOffset',
			category: 'math',
			params: Type.Object({
				scale: quantity('none', { default: 1 })
			}),
			subgraph,
			interface: {
				inputs: [{ name: 'x', dataType: 'f32', target: { node: 'sub', port: 'a' } }],
				params: [{ name: 'scale', target: { node: 'sub', port: 'b' } }],
				outputs: [{ name: 'value', dataType: 'f32', target: { node: 'sub', port: 'value' } }]
			}
		};

		const { wgsl, frontmatter } = groupToFunction(def);
		expect(wgsl).toContain('fn scaleOffset(x: f32, scale: f32)');
		expect(frontmatter).toContain('inputs:');
		expect(frontmatter).toContain('params:');
		expect(frontmatter).toContain('scale:');
		expect(frontmatter).toContain('default: 1.0');

		const loaded = loadWgslPrimitive({ moduleId: 'g.scaleOffset', source: `${frontmatter}\n${wgsl}` });
		expect(loaded.primitive.inputs.map((port) => port.name)).toEqual(['x']);
		expect(loaded.primitive.wgsl.arguments?.map((arg) => `${arg.name}:${arg.source}`)).toEqual([
			'x:input',
			'scale:param'
		]);
	});

	it('round-trips a boolean group param through WGSL signature and loaded schema', () => {
		const subgraph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'gate',
					primitive: 'math.multiply',
					params: { b: 1 },
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'enabled', name: 'enabled', direction: 'in', dataType: 'bool' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [{ name: 'value', from: { node: 'gate', port: 'value' } }],
			consumers: []
		};

		const def: GroupDefinition = {
			id: 'g.boolGate',
			category: 'math',
			params: Type.Object({
				enabled: Type.Boolean({ default: true })
			}),
			subgraph,
			interface: {
				inputs: [{ name: 'x', dataType: 'f32', target: { node: 'gate', port: 'a' } }],
				params: [{ name: 'enabled', target: { node: 'gate', port: 'enabled' } }],
				outputs: [{ name: 'value', dataType: 'f32', target: { node: 'gate', port: 'value' } }]
			}
		};

		const { wgsl, frontmatter } = groupToFunction(def);
		expect(wgsl).toContain('fn boolGate(x: f32, enabled: bool)');
		expect(frontmatter).toContain('enabled:');
		expect(frontmatter).toContain('default: true');

		const loaded = loadWgslPrimitive({ moduleId: 'g.boolGate', source: `${frontmatter}\n${wgsl}` });
		expect(loaded.primitive.params.properties?.enabled).toBeDefined();
		expect(loaded.primitive.wgsl.arguments?.find((arg) => arg.name === 'enabled')?.source).toBe(
			'param'
		);
	});

	it('rejects unmapped GroupDefinition.params schema properties', () => {
		const subgraph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'sub',
					primitive: 'math.subtract',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [{ name: 'value', from: { node: 'sub', port: 'value' } }],
			consumers: []
		};

		const def: GroupDefinition = {
			id: 'g.unmapped',
			category: 'math',
			params: Type.Object({
				scale: quantity('none', { default: 1 }),
				offset: quantity('none', { default: 0 })
			}),
			subgraph,
			interface: {
				inputs: [{ name: 'x', dataType: 'f32', target: { node: 'sub', port: 'a' } }],
				params: [{ name: 'scale', target: { node: 'sub', port: 'b' } }],
				outputs: [{ name: 'value', dataType: 'f32', target: { node: 'sub', port: 'value' } }]
			}
		};

		expect(() => groupToFunction(def)).toThrow(/offset/);
	});

	it('rejects incompatible param schema and target port data types', () => {
		const subgraph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'sub',
					primitive: 'math.subtract',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [{ name: 'value', from: { node: 'sub', port: 'value' } }],
			consumers: []
		};

		const def: GroupDefinition = {
			id: 'g.badBool',
			category: 'math',
			params: Type.Object({
				flag: Type.Boolean({ default: true })
			}),
			subgraph,
			interface: {
				inputs: [{ name: 'x', dataType: 'f32', target: { node: 'sub', port: 'a' } }],
				params: [{ name: 'flag', target: { node: 'sub', port: 'b' } }],
				outputs: [{ name: 'value', dataType: 'f32', target: { node: 'sub', port: 'value' } }]
			}
		};

		expect(() => groupToFunction(def)).toThrow(/Incompatible group param type bool/);
	});

	it('rejects integer group param schemas explicitly', () => {
		const subgraph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'sub',
					primitive: 'math.subtract',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'f32' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [{ name: 'value', from: { node: 'sub', port: 'value' } }],
			consumers: []
		};

		const def: GroupDefinition = {
			id: 'g.integerParam',
			category: 'math',
			params: Type.Object({
				count: Type.Integer({ default: 1 })
			}),
			subgraph,
			interface: {
				inputs: [{ name: 'x', dataType: 'f32', target: { node: 'sub', port: 'a' } }],
				params: [{ name: 'count', target: { node: 'sub', port: 'b' } }],
				outputs: [{ name: 'value', dataType: 'f32', target: { node: 'sub', port: 'value' } }]
			}
		};

		expect(() => groupToFunction(def)).toThrow(/integer schemas/);
	});
});
