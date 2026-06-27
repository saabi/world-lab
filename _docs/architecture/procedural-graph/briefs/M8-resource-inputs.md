# Brief — M8: Resource inputs and CPU views

**Milestone:** M8 ([implementation-plan.md](../implementation-plan.md)) ·
**Packages:** `@virtual-planet/graph`, `@virtual-planet/runtime-cpu` ·
**Depends on:** M2 ✅, M7 ✅ ·
**Stream doc:** [inputs-cpu-and-resources.md](../inputs-cpu-and-resources.md) ·
**Contract author:** Codex · **Recommended executor:** Codex.

## Objective

Make image, mesh, and audio resources first-class typed graph inputs and provide
the framework-independent CPU views needed by previews and headless consumers.
Graph documents contain only stable, serializable resource dependencies; decoded
bytes are bound per runtime session through a resolver.

## Files

- `packages/graph/src/types.ts` — resource data types and dependencies *(update)*
- `packages/graph/src/graph.test.ts` — resource compatibility/round-trip gate *(update)*
- `packages/runtime-cpu/package.json` — graph workspace dependency *(update)*
- `package-lock.json` — workspace dependency lock update *(update)*
- `packages/runtime-cpu/src/resources.ts` — views, samplers, resolver *(new)*
- `packages/runtime-cpu/src/resources.test.ts` — CPU resource gate *(new)*
- `packages/runtime-cpu/src/index.ts` — re-export resources *(update)*

No WebGPU files and no `@virtual-planet/schema` files.

## Graph public surface

In `packages/graph/src/types.ts`:

```ts
export type ValueDataType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'bool';
export type ResourceDataType = 'image' | 'mesh' | 'audio';
export type DataType = ValueDataType | ResourceDataType;

export interface ResourceDependency {
	id: string;
	type: ResourceDataType;
}

export interface GraphDocument {
	// existing fields unchanged
	resources?: ResourceDependency[];
}
```

`resources` is optional for compatibility with existing documents. Resource ports
use `dataType: 'image' | 'mesh' | 'audio'` and omit `space` (equivalent to
`space: 'none'`). Existing exact data-type equality in `validateGraph` validates
resource edges; no resource-specific validator branch is required.

## Runtime CPU public surface

In `packages/runtime-cpu/src/resources.ts`:

```ts
import type { ResourceDataType, ResourceDependency } from '@virtual-planet/graph';

export type ImageChannelCount = 1 | 2 | 3 | 4;
export type ImagePixelData = Uint8Array | Float32Array;
export type Pixel = readonly [number, number, number, number];

export interface ImageCpuView {
	kind: 'image';
	width: number;
	height: number;
	channels: ImageChannelCount;
	data: ImagePixelData;
}

export function sampleImagePixel(image: ImageCpuView, x: number, y: number): Pixel;

export type MeshAttributeSize = 1 | 2 | 3 | 4;

export interface MeshAttributeCpuView {
	size: MeshAttributeSize;
	data: Float32Array;
}

export interface MeshCpuView {
	kind: 'mesh';
	vertexCount: number;
	attributes: Readonly<Record<string, MeshAttributeCpuView>>;
	indices?: Uint16Array | Uint32Array;
}

export function readMeshAttribute(
	mesh: MeshCpuView,
	name: string,
	vertexIndex: number
): number[];

export interface AudioCpuView {
	kind: 'audio';
	sampleRate: number;
	channelCount: number;
	samples: Float32Array;
}

export interface FftBandOptions {
	fftSize: number;
	channel?: number;
	startFrame?: number;
}

export function fftBandMagnitude(
	audio: AudioCpuView,
	bandIndex: number,
	options: FftBandOptions
): number;

export type CpuResourceView = ImageCpuView | MeshCpuView | AudioCpuView;

export interface CpuResourceResolver {
	resolve(dependency: ResourceDependency): CpuResourceView | undefined;
}

export interface CpuResourceBinding {
	id: string;
	view: CpuResourceView;
}

export function createCpuResourceResolver(
	bindings: readonly CpuResourceBinding[]
): CpuResourceResolver;
```

`ResourceDataType` is imported so graph owns the resource-kind vocabulary. The
runtime package depends on graph; graph never depends on a runtime.

## Required semantics

### Image

- Row-major pixels with top-left origin and tightly packed channels.
- `x`, `y`, dimensions, and channel count must be valid integers.
- `Uint8Array` channels normalize to `[0, 1]`; `Float32Array` values pass through.
- Return RGBA. Missing RGB channels are `0`; missing alpha is `1`.
- Invalid coordinates or data length throw `RangeError`.

### Mesh

- Attributes are tightly packed, vertex-major float arrays.
- A valid attribute has `data.length === vertexCount * size`.
- Unknown attribute names throw `Error`; invalid vertex/count/layout throws
  `RangeError`.
- Return a new array containing the selected vertex's components.

### Audio

- Samples are interleaved frames:
  `samples[frame * channelCount + channel]`.
- `fftBandMagnitude` computes one rectangular-window DFT bin from `fftSize` frames
  starting at `startFrame ?? 0`, channel `channel ?? 0`.
- Valid bins are `0..floor(fftSize / 2)`.
- Magnitude normalization is `1/N` for DC and Nyquist, `2/N` otherwise, so a
  unit-amplitude bin-centered sine has magnitude approximately `1`.
- Invalid rate/channel/count/frame/bin/layout throws `RangeError`.

### Resolver

- Bindings are session-local and synchronous because all views are already decoded.
- Duplicate binding IDs throw `Error`.
- Missing IDs return `undefined`.
- A bound view whose `kind` differs from the dependency's `type` throws `TypeError`.
- The resolver stores no bytes in `GraphDocument`.

## Gates

Graph tests must prove:

1. `image → image` validates.
2. `image → mesh` reports `type-mismatch`.
3. A document with image/mesh/audio dependencies round-trips through
   `serializeGraph` / `deserializeGraph`.

Runtime tests must prove:

1. Sampling a known RGBA8 pixel returns normalized RGBA.
2. Missing image channels receive the documented defaults.
3. Reading vertex 1 of a known `vec3` mesh attribute returns its three values.
4. An 8-sample, bin-1 unit sine reports magnitude approximately `1`.
5. Resolver lookup succeeds, missing lookup returns `undefined`, and kind mismatch
   throws.
6. Representative invalid image/mesh/audio layouts and bounds throw.

Run:

```sh
npm run check -w @virtual-planet/graph
npm test -w @virtual-planet/graph
npm run check -w @virtual-planet/runtime-cpu
npm test -w @virtual-planet/runtime-cpu
```

## Out of scope

No decoding/loading, URI/storage format, uploads, GPU textures or buffers,
filtering/wrapping/mipmaps, mesh topology interpretation, FFT caching/windows,
streaming audio, resource primitives, `CpuEvalContext` integration, document-store
persistence, collaboration, or editor UI. GPU views land in M10; persisted resource
documents and sessions land in M14.

## Done when

Both touched packages pass their check/test gates, the public surface matches this
brief with no extra exports, existing graph documents remain valid, and the full
workspace test suite is green.

## Handoff

→ **M3 — self-describing WGSL loader** before M9 · architect pins the merged
signature/frontmatter grammar, then implementation. Why: M7/M8 complete the generic
CPU/runtime prerequisites for the editor; M3 is the remaining independently
unblocked compiler-side prerequisite before the M9 integration milestone.
