# Stream graphs (CPU-first)

**Status:** architecture spec (proposed) · **Scope:** typed event/stream processing,
async composition via promise-shaped futures, and multi-emitter pipeline primitives on CPU.
Part of the [Procedural Graph System](./README.md).

> **Naming:** “stream graph” here means **typed dataflow over sequences** (tokens, entities,
> log events). It is **not** [pipeline-as-graph.md](./pipeline-as-graph.md) (WebGPU render
> stages: geometry, vertex, fragment, targets).

## Summary

The procedural graph IR is domain-agnostic and already supports multiple output ports per
primitive, structural `TypeRef` (structs, arrays), and a **command** implementation kind
alongside value math. This spec describes how to add:

1. **`stream<T>`** — first-class port types for unbounded (or windowed) sequences
2. **`future<T>`** — typed async handles for worker/WASM/API work (not live JS `Promise` in JSON)
3. **`signal<T>`** — lightweight graph→host notifications (UI, scene, selection) — see [Host egress](#host-egress-and-ui-signals)
4. **Pipeline primitives** — sources, multi-emitter processors, filters, mux/demux, batch/window
5. **Promise nodes** — `spawn`, `await`, `awaitAll`, `tryAwait` as command primitives

CPU execution is primary. Streams compose with [audio graphs](./audio-graphs.md) (block
resources), [picking and collision](./picking-and-collision.md) (discrete hit events),
and optional GPU visualization later.

## Problem

Today the graph is optimized for **scalar/field evaluation** and **render-pipeline resources**:

| Layer | Today |
|-------|--------|
| IR | `TypeRef` has scalar, vector, buffer, texture, struct — no `stream` or `future` |
| Primitives | Multi-output ports exist; no stream operator catalog |
| CPU runtime | `evalGraph` is point-sample / per-context; no stream scheduler |
| Async | No worker pool contract; no graph-level join/barrier nodes |
| Editor | No dashed “async edge” UX; no stream preview sinks |

Authors cannot wire graphs that ingest live text/events, fan out typed entity streams (e.g.
companies / people / addresses from NER), multiplex branches, or `awaitAll` on parallel WASM
work — even though the elemental model was designed for command vs value separation.

## Design fit

Stream graphs map onto the [elemental graph model](./elemental-webgpu-architecture-review.md)
without bending the render pipeline:

| Concern | Graph expression |
|---------|------------------|
| Live / file input | `source.*` **command** primitives; host pushes or pull-iterates |
| Typed records | `struct` **TypeRef** + `semantics` tags (`entity:company`, …) |
| Multi-emitter processor | One primitive, **multiple named `out` ports** (`stream<Company>`, …) |
| Route by variant | `stream.demux` / `stream.mux` **command** nodes |
| Filter / map | Value (cheap predicate) or **command** (heavy) |
| Parallel async work | `async.spawn` → `future<T>` → `async.await` / `async.awaitAll` |
| Batch for STFT / embed | `stream.window` → block buffer (bridges to [audio-graphs.md](./audio-graphs.md)) |
| Preview / export | `sink.*` command consumers (table, JSONL, scalar counts) |
| UI / scene updates | `signal<T>` + `sink.host` — graph→host egress (not bulk data) |

Open semantic tags ([F1.2](./foundation-1-elemental-contracts-plan.md)) carry domain meaning
without planet- or NLP-specific coupling in the IR core.

## Three abstractions (do not collapse)

| Abstraction | Granularity | Example |
|-------------|-------------|---------|
| **Block resource** | Fixed `N` items per tick | Audio quantum, STFT frame, heightfield tile, GPU upload chunk |
| **Stream** | Sequence of `T` (unbounded or capped) | Tokens, entities, contact events, pick history |
| **Future** | Single async result | WASM NER call, GPU pick readback, file read |
| **Signal** | Graph→host notification (often small `T`) | “table dirty”, `PickResult`, progress tick |

Composition:

```
stream<Doc> → stream.window(8) → stream<future<NerResult>> → async.awaitAll → stream<NerResult>
    → demux → stream<Company> | stream<Person> | stream<Address>
```

Audio block scheduling stays in the audio consumer; stream graphs use a **stream consumer**
sibling. Futures bridge streams to workers without exposing raw semaphores to authors.

## Type system extensions

### `stream<T>`

```ts
// proposed TypeRef variant
{ kind: 'stream'; element: TypeRef; ordered?: boolean; replayable?: boolean }
```

- **Document** holds topology only — which ports connect, not live iterators.
- **Runtime** maintains per-edge queues or pull cursors keyed by `(edgeId, blockId)`.
- **Validation:** `element` must be fully structural; no `stream<any>`.

### `future<T>`

```ts
{ kind: 'future'; value: TypeRef }
```

- Serialized graph references **future edges**, not `Promise` instances.
- Runtime table: `futureId → { status: pending | resolved | rejected; result?; error? }`.
- Cleared or rolled per block/tick per consumer policy.

### Entity structs (example)

```ts
{ kind: 'struct'; id: 'entity.Company'; fields: [
  { name: 'name', type: { kind: 'scalar', scalar: 'f32' } /* string via extension TBD */ },
  { name: 'confidence', type: { kind: 'scalar', scalar: 'f32' } },
]}
```

Use `semantics: ['entity:company']` on ports for editor filtering and swap-by-contract.

### `signal<T>`

```ts
{ kind: 'signal'; payload: TypeRef }  // void-ish tick, enum, struct summary, PickResult, …
```

- **Ingress** (`host-input`) = host → graph each tick (`time`, `playback.*`, pointer ray).
- **Egress** (`signal`) = graph → host when something worth reacting to happens.
- Serialized graph wires **signal ports** to `sink.host` primitives; runtime delivers to
  registered handlers — **no JS callbacks in `GraphDocument`**.

Keep **bulk data** on `stream<T>` or buffer resources; use **signals** to tell the shell
*what changed* (repaint this panel, update selection, rebake nav).

## Host egress and UI signals

### Symmetry with `host-input`

`HostBinding` today covers `invocation`, `playback`, `interaction`, `session`, … Proposed
egress binding on `sink.host` primitives:

```ts
interface HostEgressBinding {
  context: 'ui' | 'scene' | 'session';
  key: string;   // 'validation' | 'preview.<probeId>' | 'pick' | 'progress' | …
}
```

The **graph stays app-agnostic**; `apps/webgputoy` and `apps/scene-editor` map `key` →
components. See [preview-monitors.md](./preview-monitors.md) for probe-driven preview updates
without polling the whole graph.

### Primitives

| Primitive | Role |
|-----------|------|
| `signal.emit` | Command: fire one notification (optional wired payload) |
| `stream.tap` / `stream.onItem` | Per stream item → `signal.emit` (or batched) |
| `sink.host` | Declares host-facing signal output; stream-consumer execution root |
| `signal.coalesce` | Batch/throttle/debounce before egress (policy param) |

Example (NER + inspector):

```
ner.extract → out.companies : stream<Company>        // data path
            → out.updated   : signal<BatchMeta>      // { count, revision }
                    └────────► host → table pane refresh
```

### Host subscription layer (not in `GraphDocument`)

```ts
interface HostSignalSubscription {
  source: PortRef;
  mode: 'each' | 'batch' | 'latest';
  handler: (payload: unknown) => void;
}
```

Stream consumer drains host-bound sinks after each item/batch; posts to main thread;
default **one UI flush per `requestAnimationFrame`** per subscription.

| Mode | Use |
|------|-----|
| `each` | Low-rate auditable events |
| `batch` | Table preview, validation lists |
| `latest` | Meters, hover pick, status text |
| `debounce(ms)` | Live typing sources |

Integrates with [preview-monitors](./preview-monitors.md): a stream monitor subscribes to the
same bus instead of polling `refreshEpoch`.

### Picking and collision (egress only)

Hit-test **math** is consumer work ([picking-and-collision.md](./picking-and-collision.md));
egress uses the same channel:

```
host.pointer (ray) → pick.mesh consumer → signal<PickResult>  → selection / inspector
heightfield bake   → signal<HeightfieldUpdated>             → nav / UI invalidation
contact solver     → stream<ContactEvent>                   → gameplay (optional)
```

Continuous walk collision samples a **block heightfield buffer** synchronously; signals
notify when the field rebakes — do not stream per-foot samples.

## Primitive kinds

| Kind | Stream role |
|------|-------------|
| **value** | Pure map/project on a single item (sync) |
| **command** | Source, sink, mux/demux, buffer, spawn, await, I/O |
| **evalCPU** | Heavy per-item transform (may internally use workers; still one graph node) |

**Rule:** routing, buffering, backpressure, and join/barrier are always **command**, never
value math.

## Multi-emitter pipeline primitives

Processors with **one input stream** and **several typed output streams** use existing
multi-port nodes — no dynamic channel list in the document.

Example: `ner.extract`

| Port | Type |
|------|------|
| `in.text` | `stream<TextChunk>` |
| `out.companies` | `stream<Company>` |
| `out.people` | `stream<Person>` |
| `out.addresses` | `stream<Address>` |
| `out.unknown` (optional) | `stream<UnknownEntity>` or scalar `u32` count |

Implementation may be `evalCPU`, WASM in a worker (`async.spawn` internally), or external API
— authors see stable port contracts regardless.

## Standard operator catalog (proposed v1)

### Sources (command)

| Primitive | Output |
|-----------|--------|
| `source.text.file` | `stream<Text>` |
| `source.text.live` | `stream<TextChunk>` |
| `source.timer` | `stream<Tick>` |
| `source.fromBlock` | `stream<T>` from block resource (audio bridge) |

### Transform

| Primitive | Role | Kind |
|-----------|------|------|
| `stream.map` | `stream<T>` → `stream<U>` | value or command |
| `stream.filter` | predicate on `T` | value (cheap) or command |
| `stream.project` | pick struct fields | value |

### Routing (command)

| Primitive | Role |
|-----------|------|
| `stream.demux` | `stream<Union>` → many `stream<Variant>` (tag dispatch) |
| `stream.mux.tagged` | many `stream<Ti>` → `stream<TaggedUnion>` |
| `stream.merge` | interleave (policy: fair, priority) |
| `stream.concat` | sequential append |

Demux styles (support both):

1. **By port** — domain primitive declares outputs per variant (`ner.extract`).
2. **By tag** — generic `stream.demux` on a `union` struct.

### Windowing / batch (command)

| Primitive | Role |
|-----------|------|
| `stream.window` | `stream<T>` → `stream<array<T>>` or fixed-cap array |
| `stream.batch` | collect until `N` or timeout |
| `stream.throttle` / `stream.debounce` | rate control (live sources) |

`collect` → unbounded array is **offline-only** or requires declared `maxItems`.

### Async (command)

| Primitive | Role |
|-----------|------|
| `async.spawn` | subgraph or primitive body → `future<T>` |
| `async.await` | `future<T>` → `T` |
| `async.awaitAll` | `tuple<future<T>>` or `list<future<T>>` → `tuple<T>` / `list<T>` |
| `async.awaitAny` | first resolved (rare; fallback paths) |
| `async.tryAwait` | `future<T>` + timeout → `optional<T>` or `(T, ready: bool)` |
| `async.join` | structural fan-in of futures (planning only) |

Realtime paths: prefer `tryAwait` + host policy; blocking `await` on audio/worklet threads
is forbidden (`realtimeSafe` flag on primitive metadata).

### Sinks (command)

| Primitive | Role |
|-----------|------|
| `sink.preview.table` | UI table over `stream<T>` |
| `sink.export.jsonl` | file / download |
| `sink.count` | scalar rate / total |
| `sink.discard` | explicit black hole for unused branches |
| `sink.host` | typed `signal<T>` → registered host handler |

## Promise nodes vs semaphores

Promise-shaped futures **subsume** most author-facing sync:

| Pattern | Graph equivalent |
|---------|------------------|
| producer signals consumer | `spawn` → `future` → `await` |
| wait for N tasks | `awaitAll` on N futures |
| non-blocking check | `tryAwait` / future status read |
| backpressure (depth 1) | stream policy `latest-only` + bounded buffer |

Reserve low-level `sync.channel` / shared-memory rings for **host↔worklet** or WASM SAB cases
only; do not expose raw `Atomics` semaphore nodes in v1.

## Workers and WASM

- **One worker pool per session** (not one worker per primitive).
- `async.spawn` enqueues work; pool returns results into the future table.
- **WASM v1:** dedicated worker + message passing; graph sees one `future` per `wasmCall`.
- **WASM later:** SharedArrayBuffer + internal threads; still one graph-level `future` per call
  unless `wasmMap` is added.

Planner responsibilities:

1. Topological order over **command** nodes per item or micro-batch
2. Batch independent `spawn`s
3. **Deadlock detection** at plan time — no cycles through `await`
4. **Disjoint write** hazards on shared buffers (reuse F2 lifetime / hazard model on CPU)

## Execution model

### Stream consumer (new)

Sibling to audio block consumer and `meshGen` — not `evalGraph` per sample.

```
[Host: file | websocket | timer]
    → enqueue items or pull iterator
    → bind host inputs (clock, session id, …)
    → run stream consumer (topological waves per item or batch)
    → update future table (spawn/await)
    → drain sink.host / signal ports → host subscriptions
    → write other sink outputs / preview buffers
```

**Backpressure** (per `stream` edge, declared on primitive or consumer):

| Policy | Behavior |
|--------|----------|
| `block` | upstream waits (offline / batch) |
| `drop` | discard when queue full (live) |
| `latest-only` | keep most recent (metrics, UI) |

### Static graph vs dynamic runtime

- **Static graph** = promise/stream **topology** (who connects to whom)
- **Runtime** = queues + future table per tick; no live JS objects in `GraphDocument`
- **Validation:** `awaitAll` on dynamic `list<future<T>>` requires declared max length

## Example: named entity extraction

```
source.text.file
    → stream<Text>
    → text.chunk(window=512, overlap=64)
    → ner.extract                    [command; may spawn WASM per chunk]
        ├─ out.companies  : stream<Company>
        ├─ out.people     : stream<Person>
        └─ out.addresses  : stream<Address>
    → stream.filter(minConfidence=0.85)   [per branch]
    → sink.preview.table                  [per branch]
```

Optional parallel API path:

```
… → stream.map(async.spawn(api.ner)) → stream<future<NerResult>>
  → async.awaitAll(window=8) → stream<NerResult> → demux …
```

## Editor

- **Solid edges** — synchronous values (today)
- **Dashed edges** — `stream<T>` or `future<T>` ports
- **`await` / `awaitAll` nodes** — visible barriers (merge points)
- Inspector: fan-in list on `awaitAll`, blocking vs try mode, stream backpressure policy

## Packages

| Package | Role |
|---------|------|
| `graph` | `stream` / `future` `TypeRef`, primitives, validation |
| `runtime-cpu` | stream consumer, future table, worker pool adapter |
| `graph-editor` | stream preview sinks, async edge styling |
| `apps/webgputoy` | host adapters (file, mock live source) |
| `mcp-server` | struct/stream type introspection for agents |

## Non-goals (this spec)

- Full stream-processing cluster (Kafka, Flink-scale distributed execution)
- Graph-authorable raw JS / `eval` nodes
- Exposing `Atomics` / OS semaphores as value ports
- Replacing RxJS inside the runtime as the *authoring* model (Rx may implement edges internally)
- Unbounded `collect` without `maxItems` on live paths

## Phased delivery

### Phase A — Types + minimal vertical slice

- Add `stream<T>` and `future<T>` to `TypeRef` + coercion/validation
- `executeStreamGraph` (name TBD) in `runtime-cpu`
- `source.text.file` → `stream.map` → `stream.filter` → `sink.count`
- Headless tests with synthetic iterator

### Phase B — Async + multi-emitter

- `async.spawn` / `async.await` / `async.awaitAll`
- Worker pool hook (main thread mock for tests)
- One multi-emitter primitive (e.g. `ner.extract` stub or `classify.tagged` demo)
- `stream.demux` / `stream.mux.tagged`

### Phase C — Live sources + editor preview

- `source.text.live` with backpressure policies
- `sink.preview.table` in graph-editor
- `sink.host` + `HostSignalSubscription` in graph-editor (validation, probes)
- `stream.window` bridge to audio block buffers
- WASM behind `async.spawn` for hot paths

### Phase D — Optional GPU viz

- Scalar/stream aggregates bound as shader uniforms (after resource GPU binds)
- Not required for stream graph correctness

## Test gates

1. Headless: synthetic `stream<T>` → filter/map → expected sink counts
2. `awaitAll` on N mocked spawns → deterministic join order
3. Plan-time rejection of `await` cycle
4. `check` + `test` green for `graph`, `runtime-cpu`
5. Visual: file source → table preview updates incrementally

## Related docs

- [picking-and-collision.md](./picking-and-collision.md) — pick/collision consumers; `signal<PickResult>` egress
- [preview-monitors.md](./preview-monitors.md) — probe UI driven by host signals
- [audio-graphs.md](./audio-graphs.md) — block-oriented sibling; `source.fromBlock` bridge
- [elemental-webgpu-architecture-review.md](./elemental-webgpu-architecture-review.md) — command vs value, frame hazards
- [foundation-2-generic-resources-plan.md](./foundation-2-generic-resources-plan.md) — lifetime/history for CPU buffers
- [inputs-cpu-and-resources.md](./inputs-cpu-and-resources.md) — CPU runtime services
- [node-model-design-notes.md](./node-model-design-notes.md) — list containers (`flow.forEach`) complement streams

## Open questions

1. **Strings in `TypeRef`:** v1 use `buffer<u8>` + length, dedicated `string` scalar, or struct wrapper?
2. **Pull vs push:** default file offline to pull iterator; live to push queue?
3. **Union types:** explicit `union` `TypeRef` variant for `demux`, or struct + tag field only?
4. **Stream preview sampling:** show last N items vs aggregate counts for unbounded live streams?
5. **Relation to `flow.forEach`:** container nodes over static lists vs `stream.map` over dynamic sequences — document mutual exclusion or lowering path?
6. **Host key registry:** central map in graph-editor vs per-app handler tables only?
