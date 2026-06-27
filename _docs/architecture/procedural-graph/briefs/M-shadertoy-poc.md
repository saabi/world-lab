# Brief — ShaderToy PoC effects (simple + multibuffer)

**Type:** PoC (generality proof) · **Packages:** `@virtual-planet/runtime-webgpu`
(fullscreen-fragment consumer, render-target/pass-graph executor),
`@virtual-planet/graph-editor` (effect graphs, preview viewer), `procedural-wgsl`
(effect primitives) · **Depends on:** M-multi-output-compile, M-stage-entrypoints,
render-target model · **Design authority:**
[planet-pipeline-poc-feasibility.md](../planet-pipeline-poc-feasibility.md) §5b,
[inputs-cpu-and-resources.md](../inputs-cpu-and-resources.md) · **Contract author:**
Opus · **Recommended executor:** Cursor (⚠ visual gates).

## Objective

Two ShaderToy-equivalent effects, **before** the planet, to prove the engine over its
simplest range: a **single-pass** effect and a **multibuffer + feedback** effect. They
exercise the fullscreen-fragment consumer, ShaderToy host inputs (`iResolution` per-target,
`iTime`, `iMouse` normalized from the panel), render targets, the pass graph, and the
schema-driven uniform form.

## Licensing note

Both shaders below are **authored fresh from public-domain techniques** (the ShaderToy
default template; Conway's Game of Life) — *not* copied from any specific ShaderToy
submission (those default to CC BY-NC-SA). They match ShaderToy structure (`mainImage`,
`iTime`, `iResolution`, `iMouse`, Buffer-A feedback) so they are faithful ports of the
*pattern*, with no third-party license attached. Port GLSL→WGSL.

## Effect 1 — Simple single-pass (the ShaderToy default), maps to **S0**

The canonical ShaderToy "New shader" — an animated cosine palette over UV. One fragment
consumer, no buffers. WGSL primitive (`effect.cosinePalette`):

```wgsl
/*---
id: effect.cosinePalette
entry: cosine_palette
category: ShaderToy
inputs:
  fragCoord: { semantic: pixel }
  iResolution: { semantic: target-resolution }
  iTime: { semantic: time }
outputs:
  color: { semantic: rgba }
---*/
fn cosine_palette(fragCoord: vec2f, iResolution: vec2f, iTime: f32) -> vec4f {
  let uv = fragCoord / iResolution;
  let col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3f(0.0, 2.0, 4.0));
  return vec4f(col, 1.0);
}
```

Graph: `fragCoord`/`iResolution`/`iTime` (host inputs, resolution from the write target) →
`effect.cosinePalette` → fullscreen-fragment consumer → display target. **Gate:** a moving
color-gradient renders in the preview; editing the form (e.g. a tunable speed param,
promoted per [M-params-as-inputs](./M-params-as-inputs.md)) changes it live.

## Effect 2 — Multibuffer + feedback (Game of Life), maps to **S0.5 / S1**

Conway's Game of Life: **Buffer A** is a ping-pong cellular automaton (reads its own
previous frame, applies the rule, `iMouse` paints live cells); **Image** reads Buffer A and
colorizes. Exercises feedback (previous-frame read → ping-pong), multibuffer at possibly
different resolutions, `iChannelResolution`, and normalized `iMouse`.

```wgsl
/*--- id: effect.life.step  entry: life_step  category: ShaderToy
inputs: { fragCoord: {semantic: pixel}, iResolution:{semantic: target-resolution},
          prev:{semantic: channel}, iMouse:{semantic: pointer-norm}, iFrame:{semantic: frame} }
outputs: { state: {semantic: r} } ---*/
fn life_step(fragCoord: vec2f, iResolution: vec2f, prev: ChannelTex, iMouse: vec4f, iFrame: i32) -> vec4f {
  let px = vec2i(fragCoord);
  var n = 0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) { continue; }
      n += i32(sample_wrap(prev, px + vec2i(dx, dy), vec2i(iResolution)).r > 0.5);
    }
  }
  let alive = sample_wrap(prev, px, vec2i(iResolution)).r > 0.5;
  var next = select(0.0, 1.0, (alive && (n == 2 || n == 3)) || (!alive && n == 3));
  // seed on first frames; paint under the cursor (iMouse normalized → this target's pixels)
  if (iFrame < 1) { next = step(0.5, hash(fragCoord)); }
  if (iMouse.z > 0.5 && distance(fragCoord, iMouse.xy * iResolution) < 3.0) { next = 1.0; }
  return vec4f(next, 0.0, 0.0, 1.0);
}
```

```wgsl
/*--- id: effect.life.colorize  entry: life_colorize  category: ShaderToy
inputs: { fragCoord:{semantic:pixel}, iResolution:{semantic:target-resolution}, state:{semantic:channel} }
outputs: { color: {semantic: rgba} } ---*/
fn life_colorize(fragCoord: vec2f, iResolution: vec2f, state: ChannelTex) -> vec4f {
  let s = sample_linear(state, fragCoord / iResolution).r;
  return vec4f(vec3f(s) * vec3f(0.3, 1.0, 0.6), 1.0);
}
```

Pass graph: **Buffer A** = `life.step` reads `prev` = Buffer A *previous frame*
(`previousFrame` feedback → ping-pong) + `iMouse` (normalized → ×`iResolution`). **Image** =
`life.colorize` reads Buffer A (channel; `iChannelResolution` may differ). Display shows
Image; preview can also select Buffer A to view the raw state. (`ChannelTex`/`sample_*` are
the runtime's resource-channel sampling helpers — part of the render-target/resource work.)

**Gate:** a living, evolving Game-of-Life pattern renders; clicking in the preview paints
cells (normalized mouse works regardless of buffer resolution or which buffer is displayed);
selecting Buffer A vs Image in the preview shows raw-state vs colorized.

## Steps (refines feasibility S0–S1)

| Step | Deliverable | Gate |
|------|-------------|------|
| **S0** | Effect 1: fullscreen-fragment consumer + host inputs + form | cosine palette animates; form tunes it |
| **S0.5** | Render-target/pass-graph + Effect 2 Buffer-A↔Image with feedback + normalized iMouse | Game of Life evolves; click paints; pick display buffer |
| **S1** | (folded) one image `iChannel` GPU-bound resource — optional extra effect sampling an uploaded texture | a texture-sampling effect renders |

## Out of scope

Audio/video channels; cubemap; sound-output shaders; porting arbitrary third-party
ShaderToy submissions. **Author effects fresh per the licensing note.**

## Handoff

→ With single-pass and multibuffer+feedback proven on trivial targets, the same consumer /
host-input / render-target / form machinery carries to the planet PoC (P0–P5) — only
tessellation, vertex displacement, and multi-stage shared-sample are added.
