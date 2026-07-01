# Brief — Image preview presents opaque RGB (ignore fragment alpha)

**Type:** fix (preview presentation) · **Packages:** `@virtual-planet/graph-editor`
(`EffectPreviewPanel.svelte`; optionally `@virtual-planet/runtime-webgpu` readback) ·
**Depends on:** fullscreen-fragment params fix ✅ · **Design authority:**
[pipeline-as-graph.md](../pipeline-as-graph.md) (ShaderToy parity) · **Contract author:** Opus
· **Recommended executor:** Cursor.

> **✅ Previously fixed (2026-06-27)** — Do not route. User confirmed image preview renders
> correctly. Root cause was addressed by unconnected vec4f **`w` defaulting to 1** (opaque
> convention) in `1f1bee4`; a separate `putImageData` alpha-forcing change was not needed.
> Keep this brief for history only.

## Problem

A valid, exception-free pipeline renders **blank** in the Effect preview. Cause is the
**alpha channel**, not the shader:

- The graph feeds `constant.f32 → vector.vec4f.w`, and `constant.f32`'s default value is **0**
  (`graph/src/primitives/vector/index.ts:33`). So the fragment colour's **alpha = 0**.
- `consumers/fullscreenFragment.ts` renders `rgba8unorm` pixels (alpha written) and reads them
  back.
- `EffectPreviewPanel.svelte` paints them with
  `context.createImageData(...); image.data.set(result.pixels); context.putImageData(...)`.
  **`putImageData` honours per-pixel alpha** — with a=0 everywhere the 2D canvas is fully
  transparent and shows the black element background. The RGB (noise) is computed but erased
  at present.

ShaderToy (the parity target) **ignores `fragColor.a` for display** — the image is shown
opaquely. Our preview composites alpha instead, so any graph whose alpha < 1 renders invisible.

## Fix

Present the image **opaquely**: force alpha to 255 before painting. Do it once, in the place
that turns a rendered image buffer into displayed pixels:

- **Preferred (consistent for all image viewers):** in the fullscreen-fragment readback /
  the image-buffer present path, set every 4th byte of the RGBA pixel buffer to 255 before it
  reaches the panel — so the buffer-list image route and the Effect panel are both opaque.
- **Or (smallest):** in `EffectPreviewPanel.svelte`, after `image.data.set(result.pixels)`,
  loop `for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;` before
  `putImageData`.

Pick one site (don't double-apply). Keep it a deliberate "image previews display opaque RGB
(ShaderToy semantics)"; a future "show alpha" toggle is out of scope.

## Gate

1. **Visual ⚠:** the reported graph (`value2d → vec4f(rgb)`, `constant.f32 → a`) shows the
   noise pattern in the Effect preview (no longer blank). Screenshot.
2. **Headless (where testable):** a unit test over the present helper asserts every output
   pixel's alpha byte is 255 regardless of the source alpha. Test in the owning package.
3. `check` **and** `test` green for the touched package(s); keep all prior tests green.

## Out of scope

A "show alpha / show channel" toggle; premultiplied-alpha compositing over a checkerboard;
changing `constant.f32`'s default (that's a legitimate user value — the preview, not the
graph, is what should present opaquely). The RGB content itself (if the pattern looks wrong
*after* alpha is fixed, that's a separate fragment-field issue).

## Handoff

→ Image previews show colour the way ShaderToy does (alpha ignored for display), so a graph
with a low/zero alpha channel is still visible. Confirms the full node-driven pipeline
renders end to end.
