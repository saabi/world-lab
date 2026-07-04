# Audio graphs (CPU-first)

**Status:** architecture spec (proposed) · **Scope:** graph-authored audio analysis and
synthesis on CPU, with optional GPU visualization later. Part of the
[Procedural Graph System](./README.md).

## Summary

The procedural graph IR is **domain-agnostic** and already declares `audio` as a
resource type with a CPU view (`AudioCpuView`, `fftBandMagnitude` in
`packages/runtime-cpu`). This spec describes how to build **live, block-oriented
audio graphs** — wave/mic/file input, configurable buffer size, multi-resolution
spectrograms, and custom processing in JavaScript or WASM — **without** treating
audio as a special engine subsystem.

CPU execution is the primary path. GPU binding of audio buffers or spectrogram
textures is optional follow-on work (see [pending_issues.md](../../pending_issues.md)
“resource GPU binds”).

## Elemental binding

Block scheduling and playback host inputs: [cpu-elemental-model.md](./cpu-elemental-model.md)
(`ConsumerProfile: audio.block`, `BlockExecutor`, `host.port` context `playback`).
Signal drain at **audio quantum boundary** — not rAF. `sink.audio` = sink family **export**.
Stream bridge: `source.fromBlock` in [stream-graphs.md](./stream-graphs.md).

## Problem

Visual consumers (mesh preview, vegetation, ShaderToy) are built; audio is only
scaffolded:

| Layer | Today |
|-------|--------|
| IR | `audio` is a `ResourceDataType` |
| CPU runtime | `AudioCpuView` + naive per-band DFT helper |
| CPU graph eval | `evalGraph` can bind resource ports |
| Editor | `AudioPreviewPanel` placeholder — playback not wired |
| Primitives | None audio-specific (no STFT, envelope, resample, etc.) |
| Execution | Point-sample / per-frame model — not audio-block scheduling |

Authors cannot yet wire graphs that ingest live audio, run spectrogram pipelines at
different resolutions, or emit processed audio — even though the architecture was
designed for generic resource inputs and optional `evalCPU` per primitive.

## Design fit

Audio maps onto the [elemental graph model](./elemental-webgpu-architecture-review.md)
without bending the visual pipeline:

| Concern | Graph expression |
|---------|------------------|
| Wave / mic / file input | `audio` **resource** bound per session |
| Live buffer size | **`host-input`** in `playback` context, rebound each audio quantum |
| Sample rate, frame index | **`host-input`** (`playback` / `session`) |
| Spectrogram at resolution *R* | Derived **`buffer<f32>`** or **`texture`** resource (one node or group per resolution) |
| Math on spectra | Value primitives with **`evalCPU`** |
| Custom JS / WASM | Primitives with `evalCPU` (WASM behind hot paths); or external processor writing a resource the graph reads |
| Output bus / file | **`sink.audio`** or CPU readback sink |
| Visualize spectrum | Existing **image/scalar preview** over a spectrogram buffer |

Open coordinate spaces and semantic tags ([F1.2](./foundation-1-elemental-contracts-plan.md))
already allow audio-domain frames (e.g. `space: 'time'`, `semantics: ['unit:Hz']`) without
planet-specific coupling.

## Execution model

### Block consumer (`ConsumerProfile: audio.block`)

Visual `evalGraph` evaluates **one sample context** (procedural `uv`, `position`, …).
Audio uses the **`BlockExecutor`** — sibling to meshGen / vegetation consumers, not scalar
heatmap preview. Profile fields from ADR: `blockSize`, `backpressure`, `queueOwner: 'host'`,
`latencyClass: 'realtime'`, signal drain at quantum boundary.

```
[Web Audio host]
    → fills AudioCpuView (or ring buffer) each callback
    → binds host inputs: sampleRate, bufferSize, frameIndex, channelCount
    → runs audio consumer once per block
    → writes output AudioCpuView / spectrogram buffer(s) / scalars
    → [audio sink | preview panel | export]
```

**Host responsibilities** (not graph nodes):

- `AudioContext` / `AudioWorklet` / file decode
- Ring buffer or shared `Float32Array` view into `AudioCpuView`
- Bind `playback.*` host inputs each block
- Invoke the audio consumer with `resolveResource` for bound `audio` ports

**Consumer responsibilities** (`packages/runtime-cpu` or thin `runtime-audio` wrapper):

- Topological eval of reachable subgraph from sink/output roots
- Pass block context (`startFrame`, `frameCount`) into primitives that need it
- No assumption that instance buffer is CPU-written (future compute-populated buffers
  use the same pattern as [instanced mesh draw](./briefs/M-instanced-mesh-draw-extraction.md))

### Host input bindings (playback context)

| Key | Type | When bound |
|-----|------|------------|
| `playback.sampleRate` | `f32` | Session / when rate changes |
| `playback.bufferSize` | `u32` | Each audio quantum |
| `playback.frameIndex` | `u32` | Each audio quantum (monotonic) |
| `playback.channelCount` | `u32` | Session |

These are **not** document parameters — they mirror how `time` and `viewportSize`
work for visuals.

### Resource: `audio`

Reuse M8 shape (`packages/runtime-cpu/src/resources.ts`):

```ts
interface AudioCpuView {
  kind: 'audio';
  sampleRate: number;
  channelCount: number;
  samples: Float32Array; // interleaved LRLR…
}
```

Graph documents declare `resources: [{ id, type: 'audio', … }]` and wire `audio`
ports to bindings. User-uploaded clips round-trip through the document store like
images ([inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md)).

For **live input**, the host updates `samples` (or a subrange view) in place each
block; the graph reads the current window.

### Spectrograms and multi-resolution

Treat each spectrogram as a **derived resource**, not a global uniform:

- `audio.stft` group or primitive: params `fftSize`, `hop`, `window` (Hann, …)
- Output: `buffer<f32>` with shape `[numFrames, numBins]` or a 2D texture for preview
- Multiple resolutions = **multiple resource nodes** or multiple invocations with
  different params — same pattern as per-target resolution in
  [pipeline-as-graph.md](./pipeline-as-graph.md)

**Overlap-add / history:** sliding windows may need **persistent storage** between
blocks. Reuse the frame-graph feedback model (`ChannelRead.previousFrame`,
ping-pong) once generalized beyond textures ([foundation-2](./foundation-2-generic-resources-plan.md),
particles capability #3 in pending_issues).

Replace the current toy `fftBandMagnitude` (DFT per band index) with a real STFT
primitive for production use; keep band query as a thin helper for tests.

### Custom JS and WASM

- **Preferred:** register standard-library primitives with `evalCPU` (and optional WGSL
  for GPU visualization later).
- **WASM:** implement `evalCPU` by calling a WASM module (FFT, pitch, onset) — same
  registration path as built-ins.
- **Ad-hoc JS:** avoid one-off nodes in the core; use primitive registration or an
  external host processor that writes a resource the graph consumes.

No graph-authorable “raw JS node” in v1 — keeps validation, serialization, and MCP
tooling predictable.

## Standard library (proposed v1 slice)

Minimal vertical slice for WebGPUToy proof:

| Primitive / group | Role |
|-------------------|------|
| `audio.resource` | Typed port wiring (may be implicit via resource binding) |
| `audio.window` | Hann/Hamming coefficients for STFT |
| `audio.stft` | Block STFT → magnitude buffer |
| `audio.band` | Single-band magnitude (replaces naive `fftBandMagnitude` for graphs) |
| `audio.mix` / `vector.*` | Combine bands or scalars |
| `sink.audio` | Output bus (processed buffer → Web Audio destination) |

Optional v2: mel scale, onset, envelope follower, resample, pitch.

## Editor and preview

- **`AudioPreviewPanel`:** wire to block consumer output — waveform + optional
  spectrogram heatmap (image preview family over a spectrogram buffer).
- **Preview family `audio`:** already in `previewBuffers.ts`; enumerate outputs typed
  `audio` or sinks tagged `sink.audio`.
- **Buffer size control:** inspector or transport chrome binds `playback.bufferSize`
  (and worklet `processorOptions`) — not stored in `GraphDocument` unless authored
  as a default.

## Packages

| Package | Role |
|---------|------|
| `graph` | `audio` resource type, primitives, sinks — no Web Audio import |
| `runtime-cpu` | `AudioCpuView`, STFT helpers, **audio block consumer** |
| `graph-editor` | `AudioPreviewPanel`, resource bind UI, transport |
| `apps/webgputoy` | Host: `AudioContext`, mic/file, schedules consumer |
| `runtime-webgpu` | Optional later: spectrogram texture, GPU FFT |

## Non-goals (this spec)

- Full DAW / MIDI / multi-track timeline
- Low-latency pro-audio (< ~5 ms) guarantees in v1
- GPU audio shaders as the primary analysis path
- Graph-authorable `draw.instanced` for audio — unrelated
- Replacing Web Audio with an in-graph sample clock

## Phased delivery

### Phase A — Block consumer + mic/file (CPU only)

- `executeAudioGraph` (name TBD) in `runtime-cpu`
- Host adapter in webgputoy (file + mic)
- One primitive: `audio.stft` or band energy
- Scalar or heatmap preview of one band
- Unit tests: synthetic sine → expected bin energy

### Phase B — Multi-resolution + sinks

- Multiple spectrogram buffers in one graph
- `sink.audio` → speaker output
- `AudioPreviewPanel` waveform + spectrogram
- WASM FFT behind `audio.stft` if JS DFT too slow

### Phase C — GPU visualization (optional)

- Resource GPU binds for spectrogram textures
- ShaderToy-style reactive visuals driven by audio scalars/textures

## Test gates

1. Headless: synthetic `AudioCpuView` → `evalGraph` / block consumer → expected magnitudes
2. `check` + `test` green for `graph`, `runtime-cpu`, `graph-editor`
3. Visual: mic or file → spectrogram visible in preview; changing buffer size changes STFT time resolution without document edits

## Related docs

- [cpu-elemental-model.md](./cpu-elemental-model.md) — block consumer profile, host ports
- [stream-graphs.md](./stream-graphs.md) — `source.fromBlock` bridge
- [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) — resource inputs, CPU runtime
- [elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md) — sinks include `audio output`
- [implementation-plan.md](./implementation-plan.md) — M8 resource inputs (CPU views landed)
- [design-vs-implementation-audit.md](./design-vs-implementation-audit.md) — GPU resource binds gap

## Open questions

1. **Worklet vs main thread:** default to `AudioWorklet` for live input; allow offline/file on main thread for tests?
2. **Stereo graphs:** one graph per channel vs interleaved multi-channel ports?
3. **Spectrogram buffer type:** `buffer<f32>` only in v1, or also `image`-family preview for heatmaps without new types?
