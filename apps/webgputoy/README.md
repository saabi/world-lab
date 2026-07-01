# WebGPUToy

Part of [World Lab](../../README.md). SvelteKit 2 + Svelte 5 (runes) + TypeScript + WebGPU.
A standalone procedural-graph editor and WebGPU playground: wire typed nodes into a graph,
watch the compiled WGSL update live, and preview one or more render targets from a single
shared-frame executor.

This app is a thin SvelteKit shell over the reusable `@virtual-planet/graph-editor` package —
almost all editor logic (and its test suite) lives there, not here.

**Public deployment domain:** `webgputoy.ferreyrapons.com`.

## Local development

```sh
npm run dev
npm run check
```

There's **one shared dev server** for this app at `http://localhost:5173` — `vite.config.ts`
pins `strictPort: true`, so a second `npm run dev` fails loudly ("port in use") instead of
silently spawning a duplicate. See `AGENTS.md` §Dev server.

This app has no dedicated test script — its tests live in
[`packages/graph-editor`](../../packages/graph-editor) (`npm test -w @virtual-planet/graph-editor`
from the repo root, or `npm test` from that package directory).

## Production build and run

```sh
npm run build
npm start
```

Adapter-node build; the server listens on the platform-default port/host for `@sveltejs/adapter-node` unless overridden by `PORT`/`HOST` env vars.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Current limitations

- Cross-target reads (one render target reading another's current-frame or previous-frame
  result — same-cycle reuse and cyclic feedback/multibuffer) are not yet implemented; today's
  executor handles independent render targets only. See
  `_docs/architecture/procedural-graph/briefs/M-unified-preview-execution.md` Part 3.
- Params-as-inputs (promoting a node parameter to a wireable port end-to-end) is partially
  built — graph-core support exists, editor + codegen wiring is pending.
- Node-groups authoring UX ("save as group", collapse/expand) is not built; the underlying
  group-compilation system is.

## Roadmap

See the root [ROADMAP.md](../../ROADMAP.md) — near/mid-term items relevant to this app are the
frame-graph executor's remaining cross-target/feedback work, params-as-inputs, and
node-groups authoring.
