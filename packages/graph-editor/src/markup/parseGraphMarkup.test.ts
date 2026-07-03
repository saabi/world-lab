import { describe, expect, it } from 'vitest';
import { getPrimitive, registerPrimitive } from '@world-lab/graph';
import { Type } from '@world-lab/schema';
import { defaultPreviewGraph } from '../defaultGraph.js';
import { parseGraphMarkup } from './parseGraphMarkup.js';
import { printGraphMarkup } from './printGraph.js';

describe('@world-lab/graph-editor parseGraphMarkup', () => {
	it('round-trips the default preview graph markup', () => {
		const doc = defaultPreviewGraph();
		const parsed = parseGraphMarkup(printGraphMarkup(doc));
		expect(parsed).toEqual({
			...doc,
			nodes: [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id)),
			edges: [...doc.edges].sort((a, b) => a.id.localeCompare(b.id))
		});
	});

	it('parses hand-edited markup', () => {
		const parsed = parseGraphMarkup(`<PlanetGraph version="1">
  <Node id="n_uv" primitive="procedural.uv" x="10" y="20" />
  <Output name="field" from="n_uv.uv" />
  <Consumer type="preview" outputs="field" />
</PlanetGraph>`);

		expect(parsed.nodes).toHaveLength(1);
		expect(parsed.nodes[0]?.id).toBe('n_uv');
		expect(parsed.nodes[0]?.position).toEqual({ x: 10, y: 20 });
	});

	it('instantiates canonical semantic tags from registered primitive specs', () => {
		const primitiveId = 'test.markup-semantics';
		if (!getPrimitive(primitiveId)) {
			registerPrimitive({
				id: primitiveId,
				category: 'test',
				inputs: [],
				outputs: [
					{
						name: 'value',
						dataType: 'f32',
						space: 'stereo_field',
						semantics: ['unit:m', 'color:linear-srgb', 'unit:m']
					}
				],
				params: Type.Object({}),
				wgsl: { moduleId: primitiveId, entry: 'markupSemantics' }
			});
		}

		const parsed = parseGraphMarkup(
			`<PlanetGraph version="1"><Node id="n" primitive="${primitiveId}" /></PlanetGraph>`
		);
		expect(parsed.nodes[0]?.outputs[0]).toMatchObject({
			space: 'stereo_field',
			semantics: ['color:linear-srgb', 'unit:m']
		});
	});

	it('throws on unknown root element', () => {
		expect(() => parseGraphMarkup('<Graph version="1" />')).toThrow(/expected root/i);
	});

	it('throws on unclosed tag', () => {
		expect(() =>
			parseGraphMarkup(`<PlanetGraph version="1">
  <Node id="n_uv" primitive="procedural.uv">
</PlanetGraph>`)
		).toThrow(/unclosed|unexpected closing/i);
	});

	it('throws on unknown child element', () => {
		expect(() =>
			parseGraphMarkup(`<PlanetGraph version="1">
  <Widget id="x" />
</PlanetGraph>`)
		).toThrow(/unknown element/i);
	});
});
