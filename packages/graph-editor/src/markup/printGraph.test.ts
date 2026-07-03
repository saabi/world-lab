import { describe, expect, it } from 'vitest';
import { deserializeGraph, serializeGraph } from '@world-lab/graph';
import { defaultPreviewGraph } from '../defaultGraph.js';
import { printGraphMarkup } from './printGraph.js';

const DEFAULT_PREVIEW_MARKUP = `<PlanetGraph version="2">
  <Node id="n_perlin" primitive="noise.perlin3d" x="220" y="60" />
  <Node id="n_preview_fieldSink_1" primitive="preview.fieldSink" x="720" y="80">
    <Param name="outputName" value="field" />
  </Node>
  <Node id="n_remap" primitive="math.remap" x="460" y="80">
    <Param name="inMax" value="1" />
    <Param name="inMin" value="-1" />
    <Param name="outMax" value="1" />
    <Param name="outMin" value="0" />
  </Node>
  <Node id="n_uv" primitive="procedural.uv" x="0" y="80" />
  <Edge id="e_perlin_remap" from="n_perlin.value" to="n_remap.x" />
  <Edge id="e_uv_perlin" from="n_uv.uv" to="n_perlin.position" />
  <Output name="field" from="n_remap.value" />
</PlanetGraph>`;

describe('@world-lab/graph-editor printGraphMarkup', () => {
	it('prints the default preview graph fixture', () => {
		expect(printGraphMarkup(defaultPreviewGraph())).toBe(DEFAULT_PREVIEW_MARKUP);
	});

	it('is stable across serializeGraph/deserializeGraph round-trip', () => {
		const doc = defaultPreviewGraph();
		const first = printGraphMarkup(doc);
		const roundTripped = deserializeGraph(serializeGraph(doc));
		expect(printGraphMarkup(roundTripped)).toBe(first);
	});
});
