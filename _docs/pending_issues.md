# Pending Issues

## /apps/scene-editor

- camera near/far should include all objects visible on screen, with considerations for next item
- when close to the surface and looking up, sometimes the planet dissappears
- ~~should move from apps/scene-editor/ to apps/scene-editor~~ ✅ done — OS1 world-lab identity + app-layout migration (`apps/scene-editor/` → `apps/scene-editor/`, `apps/webgputoy/` → `apps/webgputoy/`)

## /apps/webgputoy (procedural-graph editor; formerly `apps/webgputoy`)

> Resolved (see `_TASK_BOARD.md` archive): preview rerender-on-edit, preview lists outputs
> (buffer list), collapsible palette sections, node-swap UX, S0 pipeline render, unified named
> document save/load + samples + layout (`M-document-system.md`, `7cf7d0a`), help/usage
> tooltips + SDF alias removal (`5a17295`), node color-coding (`61b6359`), primitive help
> coverage (`af69aef`). Do not re-add.

- **node groups UX** not built: "Save as group", zone framing, and collapse-to-node. The group *system* (`groupToFunction`/`buildGroupModule`) exists; the editor authoring/collapse UI does not. See `node-model-design-notes.md` §E.
- **params-as-inputs not wireable in the editor**: promotable params (e.g. remap bounds) should appear as input ports and the form should show connected-vs-literal. Graph-core helpers exist (`paramInputPorts`/`resolveParamBindings`) and port-level defaults landed (`1f1bee4`); the editor + connected-override codegen is still pending. Brief: `M-params-as-inputs.md`.
- Functions representing group nodes must be decomposable into its components and editable upon request. Built-in group functions such as remap must be inspectable as graphs (ideally a la touchdesigner by zooming in or similar gesture) and outomatically cloned and replaced if modified.
- ~~The document load/save and samples UX is not well polished... including undo/redo functionality~~
  ✅ done (2026-07-01) — undo/redo landed (`history.svelte.ts`, a past/future `GraphDocument`
  stack hooked into the existing `applyEditIntent`/`updateGraph` choke point; per-action labels;
  Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y + toolbar buttons; history resets on document load/new, not
  persisted, matching the pattern in `saabi/colorlab`). Polish: delete-confirmation dialog,
  `updatedAt` timestamp shown per saved document, and a discard-changes confirm for the two
  states where edits aren't auto-saved (new/unnamed graph, loaded read-only sample — every
  other document already auto-saves on edit, so "unsaved changes" wasn't a real risk elsewhere).
  Schema/artifact versioning was explicitly out of scope (owner: existing `GraphArtifactVersion`
  migration path is sufficient). Not yet exercised in a real browser — no browser-automation
  tool available in this environment; verified via check/test/build gates + a dev-server
  boot-and-serve check only.

## UI polish — webgputoy / graph-editor / subdivide (not built)

- **Node tint control is far from what it controls.** `GraphEditor.svelte`'s "Node tint" `<select>`
  sits in the top document toolbar, next to Save/Undo/Redo — visually distant from the canvas
  nodes it recolors. Move it closer to (or overlaying) the graph canvas. Consider going further
  and adopting Blender's **`N`-key floating sidebar** convention generally: a toggleable floating
  panel docked to the canvas edge for canvas-scoped display settings (node tint today; a natural
  home for future per-view toggles too), rather than growing the persistent top toolbar per
  setting.
- **Divider hit/visual size** (`packages/subdivide/src/Divider.svelte`): currently a flat
  `thickness = '1px'` (default, set via `--thickness` in `Subdivide.svelte`), same at rest and
  under pointer. Make the resting visual **~2px wider**, and expand further on hover **without
  affecting layout** (i.e. animate the `::before`/`::after` pseudo-element's visual size/opacity,
  not the actual grid `--thickness` value that panes reflow around).
- **Corner-triangle resize affordance doesn't exist yet.** Searched `packages/subdivide/src/*`
  for `triangle`/`corner`/`clip-path`: zero matches. This reads as a new, Blender-inspired
  affordance to design and add at divider intersections (not a tweak to an existing element) —
  sized small at rest, expanding on hover, matching the same "no layout impact" constraint above.
- **No active/dragging visual state on the divider itself.** `Subdivide.svelte` already tracks
  a `dragging` rune (`$state<DividerData | null>`) and uses it to drive a separate full-screen
  cursor-hint overlay, but the `Divider.svelte` element being dragged gets no distinct style of
  its own. Add a border highlight (e.g. a `.divider.active` class, or pass `dragging === divider`
  as a prop) so it's visually obvious which divider is live while resizing.
- **Nodes can't be named.** `packages/graph`'s `Node` type (`types.ts`) has `id`/`primitive`/
  `params`/`inputs`/`outputs`/`position` only — no user-facing display name/label field. Nodes
  are only ever shown by their `id` or `primitive` type (e.g. `noise.perlin3d`) on the canvas and
  in the inspector. Add an optional `name`/`label` field, surfaced as an editable text field in
  `InspectorPanel.svelte` near where params are already edited, and reflected in the canvas node
  title (`GraphNodeView.svelte`).
- ~~WebGPUToy has no visible header/branding at all~~ ✅ done (2026-07-02) — real logo landed:
  `WebGpuToyLogo.svelte` (isotype + wordmark, theme-aware, `packages`-style SVG path data in
  `webGpuToyLogo.ts`), rendered into `GraphEditor.svelte`'s new `toolbarStart` snippet slot from
  `apps/webgputoy/src/routes/+page.svelte`; a real favicon (`src/lib/assets/favicon.svg`) wired
  through a new `+layout.svelte`, matching `apps/scene-editor`'s existing favicon pattern; source
  artwork kept at `_docs/assets/webGPUtoy.svg` for reference. Unlike `scene-editor`'s persistent
  `AppHeader.svelte`, the mark lives inside the editor's own toolbar rather than a separate
  app-level header bar — reasonable for a full-screen single-purpose editor that shouldn't spend
  vertical space on a redundant nav bar.


## Engine — compiler / runtime (not built)

- **params-as-inputs follow-on**: codegen + `evalCPU` must use the wired upstream value when a promotable param is connected (graph-core `resolveParamBindings` exists; compiler/runtime-cpu/editor integration pending). `M-params-as-inputs.md`.
- **frame-graph GPU executor**: pure core (`buildPassOrder`/`validatePassGraph`/`resolveTargetSizes`) ✅, and the **independent-output** GPU executor (`GraphFrameExecutor` — one shared loop, all live targets, shared uniforms) ✅ landed via `M-single-loop-preview.md` (`4a7f43d`+`c8dcceb`). **Remaining:** same-frame cross-target reads (render-target-as-texture GPU binding) + previous-frame **feedback** (ping-pong) for cyclic edges — needed for multibuffer + render-to-texture. See `M-unified-preview-execution.md` Part 3.
- **render targets beyond single-pass**: `iResolution` per write-target and `iChannelResolution` per read-target; the current runner is single-target. `inputs-cpu-and-resources.md`, `pipeline-as-graph.md`.
- **graph-driven mesh-gen consumer**: `runtime-webgpu/surfaceMesh.ts::buildSurfaceMesh` is still hardcoded to `surface.plane`/`cubeSphere` (CPU loop), not a `geometry.tessellate` compute consumer. `M-mesh-gen-consumer.md` (note: planet uses Mode-A vertex displacement, not Mode-B compute mesh).
- **resource GPU binds**: image/mesh/audio as actual GPU shader inputs (M8 delivered CPU views only) — required for ShaderToy `iChannel` textures (S1). `design-vs-implementation-audit.md`.
- **list container nodes** (`flow.forEach`/`reduce`/`map`): `list<T>` lowering landed (Slice 4); the container nodes for arbitrary per-element subgraphs (e.g. N dynamic lights) are a follow-on. `node-model-design-notes.md` §A.

## Standard library — node gaps

- ~~**`geometry.plane` needs orientation + dimensions**~~ ✅ `a55b8c2` — `width`/`height` + Euler XYZ rotation params on `geometry.plane`; WGSL + evalCPU parity; defaults preserve fullscreen quad. Composable `transform.*` nodes remain a follow-on (`node-model-design-notes.md` §B).
- **geometry transforms**: `transform.spherify`/`displace`/`translate`/`rotate`/`scale`/`twist`/`bend`/affine, and decompose `geometry.cubeSphere` → `geometry.cube` + `transform.spherify` (more elemental, reusable on any vertex list). These also cover the plane orientation/dimensions case above via composition. `node-model-design-notes.md` §B.
- **colorlab harvest remainder**: OKLab/OKLCH, CVD simulation, chromatic adaptation, gamut mapping (slice A = D65 space conversions only). `M-colorlab-harvest.md`.
- **vegetation as nodes**: `veg.densityField`/`peakDetect`/`prominence`/`coverageMask` — the algorithm lives in `runtime-cpu/vegetation.ts` but isn't exposed as graph nodes. `primitive-library.md`.
- **terrain analysis primitives**: `slope`/`altitude`/`curvature`/`beachMask`/`ridgeMask`/`erosionApprox` (discussed turn 50; not built). `primitive-library.md`.
- low-hanging-fruit math/sdf/colour/noise still listed in `primitive-library.md` (e.g. `math.normalize` — needed by `spherify`).

## ShaderToy / PoC (not built)

- **S0.5 Game of Life** multibuffer effect (depends on the frame-graph GPU executor + ping-pong feedback). `M-shadertoy-poc.md`.
- **ShaderToy host inputs**: `iMouse` (normalized pointer), `iFrame`, `iChannel` textures — partial.
- **Planet PoC P0–P5**: instance-input model → tessellator composition → shaping-kernel codegen at parity → route-parity with `/scene`. `planet-pipeline-poc-feasibility.md`.

## Roadmap — not started (see `architecture/procedural-graph/implementation-plan.md`)

- **M13** planet shaping migration — **GATED** behind `renderer-unification-plan.md` (do not start; the planet PoC proves the path without touching the live renderer).
- **M14** document/session model · **M15** MCP build-out (scaffold only) · **M16** embedded editor + shared surfaces · **M17** WebGPUToy.

## Process / verification

- **Visual & GPU gates need a human eyeball** — headless green ≠ it renders. Device-compile coverage now runs in Node when the `webgpu` binding is available (`94d0629`); canvas integration tests still skip without a browser WebGPU canvas. See `packages/runtime-webgpu/README.md`.
- **`npm run check` can silently drift stale once `packages/*/dist` exists on disk.** OS4's
  `"customConditions": ["development"]` fix (each package's base `tsconfig.json`, added so
  `check`/`svelte-check` resolve `@world-lab/*` siblings via live `src/` instead of requiring a
  prebuild) only works reliably when `dist/` **doesn't exist yet**. Discovered 2026-07-01: after
  running the OS4 consumer-smoke-test / a full `npm run build`, `dist/` is left on disk (it's
  gitignored, so this never shows up in git, only locally), and a subsequent `npm run check`
  for `apps/webgputoy` silently resolved through `dist/*.d.ts` instead of source — same file-
  count drop (983 → 615) as the original bug, but now happening *because* `dist/` physically
  exists, not because it's missing. `customConditions` evidently doesn't fully override the
  special-cased `"types"` condition lookup once a matching `dist/*.d.ts` is actually present.
  Practical mitigation for now: clear `packages/*/dist` before trusting a `check` run if you've
  built locally in between (`rm -rf packages/*/dist`). Needs a real fix — options include
  reordering/renaming exports conditions, a `.gitignore`+pretest hook that clears `dist/` before
  `check`, or finding the actual TS resolution rule that's overriding `customConditions` here.

## Accessibility (not built — reference: `saabi/colorlab`'s `_docs/accessibility-controls-handoff.md`)

Colorlab's a11y work split into two kinds — a **required, structural keyboard/focus baseline**
(not opt-in, needed by any keyboard/AT user) and an **opt-in text-readability preferences**
layer (font scale, contrast, line-height; default appearance unchanged). Verified against
World Lab's actual current state (2026-07-01), not assumed — the gaps below are confirmed, not
guessed:

- **Zero landmark roles or skip-link, almost everywhere.** Only one `<nav aria-label="Main">`
  exists in the whole codebase (`apps/scene-editor`'s `AppHeader.svelte`); no `<aside>`/`<main>`/
  `<footer>` landmarks anywhere, and `apps/webgputoy`/`packages/graph-editor` have none at all.
  No skip-to-content link in either app.
- **No focus trap anywhere** (`grep` for `focusTrap`/`trapFocus` across the whole repo: zero
  hits). Every modal-ish dialog — `DocumentList.svelte`'s Save-As/Rename/Delete dialogs (this
  session), `NodeSwapMenu.svelte`, `PortConnectMenu.svelte` — lets Tab leak out, and none
  returns focus to the trigger element on close. Colorlab's `focusTrap` Svelte action
  (`fe/src/lib/actions/focusTrap.ts`, ~40 lines: capture focusables, cycle Tab/Shift+Tab, save
  + restore `activeElement`) is a direct, portable pattern.
- **Existing a11y-linter warnings, already flagged by `vite-plugin-svelte` but not fixed:**
  `NodeSwapMenu.svelte:58` and `PortConnectMenu.svelte:58` — "Elements with the 'dialog'
  interactive role must have a tabindex value" (surfaced during this session's test runs,
  pre-existing, not caused by it). Should be fixed properly alongside the focus-trap work
  above (add `tabindex` *and* trap focus), not with a bare attribute patch.
- **Undocumented keyboard shortcuts.** `packages/graph-editor` now has a real shortcut set
  (Ctrl+Z/Shift+Z/Y undo-redo, Ctrl+D duplicate, Ctrl+C/V copy-paste, Delete/Backspace) with
  zero in-app discoverability — no shortcut reference, no hint in any `aria-label`. Colorlab's
  pattern: a "Keyboard" tab in its gesture-reference popover, `<dl>` two-column shortcut table.
- **Pointer-only custom controls.** The graph canvas (`GraphCanvas.svelte`, `@xyflow/svelte`)
  has no keyboard-only path to move a node or make a connection — a keyboard/AT user can select
  a node (arrow-key selection may already exist via xyflow's own defaults, unverified) but
  cannot reposition or connect it without a pointer. Colorlab's equivalent gap (G5: color
  plane/bar canvases) was fixed with `tabindex="0"` + arrow-key adjustment + an `aria-live`
  announce region — the same shape of fix likely applies here, scoped to whatever xyflow
  already exposes vs. what needs custom wiring.
- **Text readability: 100% hardcoded `px` font sizes, zero `rem`.** Confirmed by grep: 17
  `font-size: Npx` rules in just `GraphEditor.svelte` + `DocumentList.svelte` alone (6 + 11),
  zero `rem` usage anywhere in `packages/graph-editor`. Same root cause colorlab hit — a root
  `font-size` scale preference has no effect until sizes cascade from `rem`/`em`. This is the
  same class of dense-small-text-for-power-users tradeoff colorlab explicitly chose to keep as
  *default* while adding an **opt-in**, localStorage-persisted font-scale/contrast/line-height
  preference (not saved in documents) — worth the same opt-in framing here rather than changing
  default density.

**Suggested phasing** (mirroring colorlab's, likely similar effort shape — hours not days per
phase): **A** structural/no-behavior (landmarks, skip link, tabindex fixes) → **B** focus trap
action + apply to existing dialogs → **C** keyboard operability for the graph canvas → **D**
in-app keyboard-shortcut reference → **E** opt-in text-readability preferences (rem conversion
is the prerequisite step; same mechanical unit-refactor colorlab did across `app.css` and
component `<style>` blocks).

## Umami — behavior tracking (cookieless analytics)

Self-hosted Umami is already deployed for usage stats. World Lab has **partial** integration today;
expand to consistent, privacy-conscious behavior tracking across apps (reference implementation:
[colorlab](https://github.com/saabi/colorlab) — custom `track()` events + disclosure in AppInfo).

**Current state**

- **`apps/scene-editor`:** env-gated script inject in `+layout.svelte` (`PUBLIC_UMAMI_SRC` +
  `PUBLIC_UMAMI_WEBSITE_ID`, build-time); `lib/analytics/umami.ts` exposes `injectUmami` /
  `track`, but almost no custom events are wired yet — page views only when env is set.
- **`apps/webgputoy`:** no Umami integration.
- **Root / PM2:** `ecosystem.config.cjs` documents Umami vars for scene-editor production; each
  app needs its own Umami **website ID** if tracked separately.

**To do**

- **Shared helper (optional):** extract or duplicate the colorlab `umami.ts` pattern into a small
  shared module (e.g. `packages/editor-ui` or a tiny `@world-lab/analytics` package) so both apps
  use the same inject + `track` API and typing (`app.d.ts` `window.umami`).
- **`apps/webgputoy`:** add env vars, layout inject, `.env.example` + README; separate website ID
  in Umami dashboard.
- **Custom events:** instrument high-signal interactions (document save/load, graph compile,
  preview mode, scene navigation, flight mode, etc.) — not every click; follow colorlab's named-
  event style (`track('event_name', { key: value })`).
- **Privacy / consent:** disclose Umami in an in-app info or settings surface (colorlab
  `AppInfo.svelte` pattern); analytics remain **opt-in via env at deploy time** and should stay
  cookieless; do not conflate with future error-reporting consent (see separate error-monitoring
  backlog if added).
- **Deploy checklist:** document per-app `PUBLIC_UMAMI_*` + `PUBLIC_SITE_URL` in PM2 / build CI;
  leave unset in dev for zero tracking.

## `packages/subdivide` — extract to standalone repo

- **Move `@world-lab/subdivide` out of the monorepo** into the standalone repo at
  [`/home/ushif/repos/svelte-subdivide`](../../svelte-subdivide) (upstream history:
  `sveltejs/svelte-subdivide`, Svelte 2). World Lab's current port lives in
  `packages/subdivide/` (Svelte 5 runes, layout-tree engine, tests) and should become the
  canonical source there — then consume it from world-lab as an external dependency (like
  colorlab does for reusable libs).
- ~~**Branch audit before merge**~~ ✅ done (2026-07-01) — compared `master`, `child-props`,
  and `v3` on `saabi/svelte-subdivide`. **Nothing left to port.** `v3` branches off partway
  through `child-props` and its two commits are byte-for-byte identical to commits already
  later in `child-props` — a dead end, safe to ignore. `child-props`' two real bugfixes
  (layout-on-instantiation, SSR-safe Mac/PC platform detection) are already present in
  `packages/subdivide`'s Svelte 5 port; the rest of that branch is either Svelte-3-lifecycle
  idioms (`beforeUpdate`/`tick()`) superseded by the runes rewrite, or its final commit — the
  author's own "temporary arbitrary child property change handling" experiment — which
  world-lab deliberately replaced with the `zone: string` + host-registry design (see this
  package's README). Whenever extraction happens, no reconciliation step is needed; the
  Svelte 5 port can move as-is.
- **npm publish name:** do **not** assume `subdivide` or `@sveltejs/svelte-subdivide` is
  available. Check registry ownership before publishing; if the name is taken or conflicts
  with the historical package, publish under a distinct scope/name (e.g. keep
  `@world-lab/subdivide` or another unused name). Document the chosen name in the extracted
  repo's `package.json` and update world-lab workspace deps accordingly.
