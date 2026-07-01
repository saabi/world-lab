# Brief — Single-loop preview (frame-graph executor + panes as views)

**Type:** core runtime + editor integration (Phase 1 of `M-unified-preview-execution`) ·
**Packages:** `@virtual-planet/runtime-webgpu` (GPU frame executor), `@virtual-planet/graph-editor`
(single loop + panes as views) · **Depends on:** frame-graph pure core ✅ (`3fc520a`),
multi-output compile ✅, stage-entrypoints ✅ · **Supersedes:** `M-shared-preview-clock.md`
(one loop subsumes the shared clock) · **Design authority:**
[M-unified-preview-execution.md](./M-unified-preview-execution.md),
[M-pass-graph-executor.md](./M-pass-graph-executor.md) · **Contract author:** Opus.

**Status:** DONE `<hash>`

## Objective

Replace per-pane independent shaders/loops with **one execution per frame**: a single loop runs
all live outputs each frame with **shared uniforms**, and preview panes become **views** that
display a chosen output's texture. This is the real fix for multi-pane sync (the shared clock
falls out of one loop) and the foundation for same-frame output→output reuse and feedback.

Scope here is the **independent-output** case (today's graphs: multiple `target.display` sinks
that don't read each other). Cross-target reads + feedback are the explicit follow-on (Part 3).

## Part 1 — GPU frame executor (`runtime-webgpu`, = `M-pass-graph-executor` GPU half)

Build the GPU runtime atop the landed pure core (`frameGraph/order.ts`):
- **Graph → `PassGraph`:** one pass per live output/target (its fragment field → a render
  target). Derive read/write edges (none between independent outputs for now).
- **Executor:** per frame, for each pass in **topological order** (`buildPassOrder`), render its
  fragment (reuse `assembleFullscreenFragmentModuleAsync` / the target-aware plan from `628da75`)
  into an allocated/pooled **target texture**, with **shared `iTime`/`iFrame`/host uniforms** for
  the whole frame. Expose each target's texture by output id.
- One `GPUDevice`, one command submission per frame for all passes.

## Part 2 — Single loop + panes as views (`graph-editor`)

- **One executor instance + one rAF loop** per graph (in `GraphEditor`), advancing shared
  `iTime`/`iFrame` once per frame and running the executor.
- **`PreviewZone` becomes a view:** it displays the target texture for its selected buffer (blit
  the executor's texture to the pane's canvas, or a WebGPU canvas showing it) — **no per-pane
  shader, executor, clock, or rAF.** Retire the per-pane execution in `EffectPreviewPanel` (keep
  it only as the texture-display surface, or replace with a lightweight `TextureView` panel).
- `iMouse` stays per-pane (local pointer), fed to the shared frame as the active pane's pointer
  (or per-target if needed later).

## Part 3 — Cross-target reads + feedback (DEFERRED — separate brief)

Same-frame output→input (a target's texture bound as another pass's input) needs
**render-target-as-texture GPU binding** (resource GPU binds; M8 gave CPU views only).
**Cyclic** edges need **previous-frame ping-pong**. Not required for independent outputs; brief
these when a graph actually wires one output into another.

## Gate

1. **runtime-webgpu:** a two-independent-output graph runs both passes in one frame with shared
   uniforms; the executor exposes both target textures; headless pass-order test + device-gated
   render (skips without adapter). `check` + `test`.
2. **graph-editor:** two panes display two different target textures from **one** loop; both
   animate **in sync** (same `iTime`); no per-pane shader/clock remains. Testable: the loop
   drives one executor; panes read textures by buffer id.
3. `check` **and** `test` green for both packages; keep prior tests green.
4. **Visual ⚠:** the two-target Worley graph — two panes, different outputs, perfectly synced
   motion, driven by one loop. Screenshot.

## Out of scope

Cross-target reads + feedback (Part 3, deferred); per-pane unsync opt-out (later); non-Effect
preview families driving the loop (Cpu/Gpu keep their eval paths for now).

## Handoff

→ One graph execution per frame, shared uniforms, panes as views — the Phase-1 realization of
`M-unified-preview-execution`. Unblocks same-frame reuse + feedback (Part 3) on a correct
single-loop foundation, and retires the per-pane-execution model (and the shared-clock stopgap).
