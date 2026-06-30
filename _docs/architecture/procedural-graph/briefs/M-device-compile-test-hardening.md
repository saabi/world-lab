# Brief — Device-compile test hardening (make `npm test` actually compile WGSL)

**Type:** test infrastructure / hardening (not feature work) · **Packages:**
`@virtual-planet/runtime-webgpu` (setup + consumer-coverage test), root devDeps · **Depends
on:** nothing · **Design authority:** [AGENTS.md](../../../../AGENTS.md) §gate,
[wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md) · **Contract author:** Opus ·
**Recommended executor:** Cursor (infra-comfortable).

## Problem

Three recent bugs (`no-output-path`, missing consumer, unbound `params` uniform) all passed
`check` **and** `test` green yet failed on a real GPU — because the assembled WGSL was
string-valid but the device rejected it. The repo **has** device-compile tests
(`fe/.../wgslCompile.test.ts`, `runtime-webgpu` consumer tests) but every one is guarded:

```ts
const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
it.skipIf(!hasWebGPU)('compiles …', async () => { … requestAdapter() … });
```

`npm test` runs vitest in Node (no `navigator.gpu`) and there is **no CI**, so these tests
**always skip** — the suite never hands a shader to a GPU. The device-compile net exists but
is dormant. Make it run by default, and extend it to cover every consumer's assembled output.

## Part 1 — Provide a WebGPU adapter to the test environment

Add a Dawn/SwiftShader-backed **Node WebGPU binding** as a dev dependency (candidate:
`@kmamal/gpu`, Dawn-backed; **verify license + active maintenance + Linux/WSL2 support before
committing**). Wire a vitest `setupFiles` (e.g. `packages/runtime-webgpu/test/webgpu-setup.ts`)
that, when `globalThis.navigator?.gpu` is absent, installs the binding's gpu onto
`globalThis.navigator` — so the existing `hasWebGPU`/`skipIf` checks light up with no test
changes. Add the `setupFiles` via a `vitest.config.ts` in `runtime-webgpu` (it has none today;
defaults are used). The setup must **no-op gracefully** when the binding or an adapter is
unavailable (keeps `skipIf` honest for contributors who don't install it).

> **WSL2/Linux note (this repo's env):** a native binding only returns an adapter if a Vulkan
> ICD is present. Headless Linux/WSL2 needs a **software Vulkan driver** — Mesa **lavapipe**
> (`VK_ICD_FILENAMES` / `VK_DRIVER_FILES` pointing at `lvp_icd.*.json`). Document the exact env
> vars + install in the brief's handoff / a `CONTRIBUTING`-style note; without it the tests
> skip even with the binding installed.

## Part 2 — Consumer-coverage device test (the structural net)

Add a test that iterates **every registered consumer / a set of representative sample graphs**
(must include: the worley→`vec4f`→fragment pipeline, a graph with a `constant.f32` numeric
param in the fragment field, a scalar graph, a mesh graph), assembles each consumer's WGSL,
calls `device.createShaderModule`, awaits `getCompilationInfo()`, and asserts **zero
`error`-severity messages**. `skipIf(!hasWebGPU)`. This single test catches the whole
"string-valid but GPU-rejected" class — any consumer that references an identifier it doesn't
declare/bind fails here. Include the `constant.f32` case as a **standing regression** for the
`fullscreen-fragment params` bug.

## Part 3 — Don't let skips hide failures

Add a `REQUIRE_WEBGPU=1` env switch: when set, the absence of an adapter is a **hard failure**
(the `skipIf` becomes an assert), so a CI lane (or a local pre-merge run) can guarantee the
device tests actually executed rather than silently skipped. Default (unset) keeps graceful
skipping for everyday local runs. If/when CI is added, the GPU lane sets `REQUIRE_WEBGPU=1`
after provisioning lavapipe.

## Gate

1. With the binding + software Vulkan present, `npm test -w @virtual-planet/runtime-webgpu`
   **runs** (not skips) the device tests, and the consumer-coverage test compiles every
   consumer with no error-severity `compilationInfo`.
2. The pre-fix `fullscreen-fragment` graph (constant.f32 in fragment) **fails** the
   consumer-coverage test (confirm the net would have caught it); the fixed version passes.
3. With **no** binding/adapter and `REQUIRE_WEBGPU` unset, the suite skips gracefully — `check`
   and `test` still green (contributors aren't blocked). With `REQUIRE_WEBGPU=1` and no
   adapter, it fails.
4. `check` green for `runtime-webgpu`; setup adds no runtime (non-test) dependency.

## Out of scope

Pixel/visual correctness (golden-image diffing) — this catches **compile/validation**, not
"looks right"; a human screenshot is still the visual gate. Real-GPU-only driver quirks.
Standing up the CI system itself (separate). The browser-lane alternative (Playwright +
Chromium WebGPU) — note it in the handoff as Option B if the Node binding proves unviable on
WSL2.

## Handoff

→ `npm test` exercises a real WebGPU device by default, and one consumer-coverage test
mechanically guards the "compiles to a string but the GPU rejects it" failure class that bit
us three times. The visual gate shrinks to genuine appearance questions. Document the
lavapipe env setup so contributors and any future CI get an adapter headlessly.
