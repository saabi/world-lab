# Brief — Render-target / pass-graph executor

**Type:** core runtime · **Package:** `@virtual-planet/runtime-webgpu` (+ small
`@virtual-planet/graph` additions for target/consumer fields) · **Depends on:**
M-multi-output-compile (consumer-stage model + write-target/reads hints),
M-stage-entrypoints · **Design authority:**
[inputs-cpu-and-resources.md → render targets & frame graph](../inputs-cpu-and-resources.md#render-targets-per-target-resolution--the-pass-graph)
and §"Frame-graph executor (design)" · **Contract author:** Opus · **Recommended
executor:** Cursor (⚠ GPU gate; pure core is headless).

## Objective

Run a set of consumers that write **render targets** and read each other's targets, each
frame: derive pass order from the dependency edges, allocate targets, bind **per-target
resolution**, support **previous-frame feedback** (ping-pong), and present a **selected**
target. This is the runtime layer the ShaderToy multibuffer effect needs and that the
planet's terrain→atmosphere chain already embodies.

Split: a **pure, headless-testable core** (target model + ordering + lifetimes +
validation) and a **GPU executor** (skips without a device).

## Part 1 — Target & pass-graph model

```ts
// runtime-webgpu/src/frameGraph/types.ts
export type TargetSize =
	| { kind: 'screen-relative'; scale: number }   // resolved against viewport
	| { kind: 'fixed'; width: number; height: number };

export interface RenderTarget {
	id: string;
	format: GPUTextureFormat;
	size: TargetSize;
	persistent?: boolean; // forced persistent (feedback/history); display adds this dynamically
}

export interface ChannelRead {
	channel: number;            // iChannel index
	target: string;             // source target id (or a resource id)
	previousFrame?: boolean;    // feedback: reads last frame → excluded from the order DAG
	sampler?: { filter: 'nearest' | 'linear'; wrap: 'clamp' | 'repeat' };
}

export interface Pass {
	consumerId: string;
	writeTarget: string;        // RenderTarget id this pass writes
	reads: ChannelRead[];
	iterations?: number;        // >1 expands inline (mip/blur/solver)
	pure?: boolean;             // skippable when inputs unchanged
}

export interface PassGraph {
	targets: RenderTarget[];
	passes: Pass[];
	display: string;            // target id shown by the preview (a reader → kept alive)
}
```

## Part 2 — Pure core (the primary gate)

```ts
// runtime-webgpu/src/frameGraph/order.ts
export interface PassOrderResult {
	order: string[];                 // consumerIds in execution order
	feedbackTargets: string[];       // need ping-pong (two physical buffers)
	lifetimes: Record<string, { firstWrite: number; lastRead: number }>; // transient lifetimes
}

export type FrameGraphIssue =
	| { kind: 'intra-frame-cycle'; cycle: string[] }
	| { kind: 'dangling-target'; pass: string; target: string }
	| { kind: 'read-write-same-pass'; pass: string; target: string };

export function validatePassGraph(g: PassGraph): FrameGraphIssue[];
export function buildPassOrder(g: PassGraph): PassOrderResult; // throws if validate finds a blocking issue
```

Algorithm: edges = same-frame reads only (`previousFrame` excluded). Topo-sort →
`intra-frame-cycle` issue if not a DAG. `feedbackTargets` = targets read with
`previousFrame` or written and read across the order by themselves. `lifetimes` from
first-write/last-read indices over the order, with `display` counting as a reader of its
target. `read-write-same-pass` if a pass reads its own `writeTarget` without `previousFrame`.

## Part 3 — Resolution resolution

```ts
export function resolveTargetSizes(g: PassGraph, viewport: { width: number; height: number })
	: Record<string, { width: number; height: number }>;
```

Screen-relative → `round(viewport * scale)`; fixed → as given. A pass's `iResolution`
host input binds from its `writeTarget`'s resolved size; a channel read's
`iChannelResolution` from the source target's. (Recompute on resize.)

## Part 4 — GPU executor (device-gated)

```ts
export function executeFrameGraph(device: GPUDevice, g: PassGraph, ctx: FrameContext): void;
```

Allocate targets (transient pool keyed by resolved size+format+usage; PoC may do
one-per-target, **no aliasing required for the gate**, but feedback ping-pong **is**
required); for each pass in order: bind uniforms (per-target iResolution, time, normalized
pointer, channel textures + iChannelResolution), draw/dispatch; swap ping-pong buffers for
feedback targets at frame end; the `display` target is the present source.

## Gate

1. **Pure core (headless):**
   - a 3-target chain (A→B→display) orders `[A, B]`, `display` keeps B alive, lifetimes correct;
   - a `previousFrame` self-read marks the target feedback and does **not** error;
   - an intra-frame self-read (no `previousFrame`) → `read-write-same-pass`; a same-frame
     cycle → `intra-frame-cycle`; a dangling target ref → `dangling-target`;
   - `resolveTargetSizes` gives full-res and half-res for screen-relative scales 1 and 0.5.
2. **GPU (skips without device):** a two-pass A→Image renders; a `previousFrame` feedback
   pass ping-pongs (Game-of-Life step advances).
3. `npm run check`/`test -w @virtual-planet/runtime-webgpu` green.

## Out of scope

Memory aliasing/pooling optimization (model only; one-per-target is fine for the gate);
audio/non-2D targets; the editor display-selector UI (consumes `display`, separate). **No
new public exports beyond the above.**

## Handoff

→ The render-target/frame-graph runtime exists. **ShaderToy multibuffer (S0.5)** is
unblocked ([M-shadertoy-poc.md](./M-shadertoy-poc.md)); and the planet PoC's
terrain→atmosphere→composite becomes a frame graph rather than hand-wired passes.
