# Proposal — M9d: Editor shell polish (architect review)

**Status:** proposal for Opus/Claude review · **Not yet a routable brief** ·
**Package:** `@virtual-planet/graph-editor`, `@virtual-planet/subdivide` (minor) ·
**Runs:** parallel to **M11** (tessellation) — does not block GPU/runtime work ·
**Design authority:** [editor.md](../editor.md),
[editor-and-scene-integration.md](../editor-and-scene-integration.md)

---

## Architect decision (Opus · 2026-06-27) — APPROVED with conditions

Approved as **M9d** — an optional, parallel polish milestone (like M9c). Convert to
routable sub-briefs **M9d.1 → M9d.3**. Scope, package boundaries, and the scene-free
constraint are sound. Answers to the open questions:

1. **New graph → keep user layout.** Clearing the document must not reset workspace chrome.
2. **Context menus → Option A** (extend `@virtual-planet/subdivide` with generic
   `zoneContextMenus` / `onpanecontextmenu`). **Conditions:** additive/optional props only
   (no breaking change); zones stay opaque strings (no graph semantics in `subdivide`);
   add a `subdivide` unit test; **verify the `fe/` scene editor still builds** (shared
   package). I'll pin the exact subdivide API in the M9d.2 brief before it routes.
3. **CodeMirror → approved, in `graph-editor` only** (no shared package yet — YAGNI). Keep
   `CodeMirrorEditor.svelte` extraction-ready (no graph-editor-specific imports inside the
   wrapper) so a later `@virtual-planet/code-editor` hoist is trivial. Import language
   packages narrowly (bundle size). It weighs only the editor bundle, not runtime/compiler.
4. **WGSL highlighting → minimal `StreamLanguage` now; do not wait.** Syntax *coloring* is
   presentational and approximate — it is **not** an owned semantic AST, so it does not
   conflict with [wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md). Keep it
   purely visual (never a compiler input or source of truth).
5. **Preview mode → store in the chrome blob** (`StoredEditorChrome.previewMode`), one
   editor-chrome key, separate from `GraphDocument`. Approved.
6. **Milestone id → M9d.**

**Sequencing caveat (important):** M9d and **M11.3** (cube-sphere mesh preview) both touch
`graph-editor` `GraphEditor.svelte` / the preview zone. To avoid a collision, **land M9d.1
before M11.3 starts** (or have one agent own both). M9d.1/.3 must **not** touch M11's
packages (`graph`, `runtime-cpu`, `runtime-webgpu`); parallel with M11.1/.2 is safe.

**Routing:** M9d.1 (layout persistence) is ready now — Composer, no new deps, zero IR risk.
M9d.2 waits for me to pin the subdivide context-menu API. M9d.3 follows M9d.1 (CodeMirror
introduced once). Backlog table stays backlog (not v1).

---

## Why this document exists

M10 delivered a functional standalone graph editor (canvas, CPU/GPU preview, markup,
CodeView, persistence). Day-to-day authoring still feels rough in three areas that are
**orthogonal to M11** but high leverage for anyone using `/graph-editor` while
tessellation contracts are pinned:

1. **Pane chrome** — `@virtual-planet/subdivide` exposes a generic “change pane type”
   corner menu; authors want **zone-aware** actions (not just retargeting the snippet).
2. **Layout amnesia** — splitter positions reset every reload; the scene editor already
   persists layout — the graph editor does not.
3. **Plain-text code panes** — `CodeView` (WGSL+YAML) and `MarkupView` (PlanetGraph XML)
   are unstyled `<textarea>` elements with no syntax highlighting.

This proposal is for the architect to **approve scope, phasing, and package boundaries**
before Cursor/Composer implements. After review, split into routable sub-briefs
(M9d.1 → M9d.3) mirroring M9c / M10.

---

## Constraints (non-negotiable)

| Rule | Source |
|------|--------|
| `packages/graph-editor` stays **scene-free** | [editor-and-scene-integration.md](../editor-and-scene-integration.md) |
| Allowed deps: `@virtual-planet/{graph,schema,compiler,runtime-cpu,runtime-webgpu,subdivide}` + Svelte/xyflow | `sceneFree.test.ts` |
| Graph document persistence stays separate from shell prefs | `documentStorage.ts` — `virtual-planet:graph-editor:v1` |
| No new Graph IR fields for layout or editor chrome | IR is for field graphs only |
| Prefer patterns already proven in `fe/` scene editor | `layoutStorage.ts`, `SceneEditorShell.svelte` |

---

## Current state (audit)

### Subdivide integration (`GraphEditor.svelte`)

- Default `LayoutDocument` is **hard-coded** in component state; pane ids are created
  with `createPaneId()` on every mount → ids are not stable across sessions (OK for
  runtime; persistence must store the serialized tree as-is).
- `Subdivide` is wired with `bind:layout` but **`onlayoutchange` is not handled** —
  drag/split/close mutations never leave the component.
- Zones: `palette`, `canvas`, `preview`, `code`, `inspector`, `validation`, `markup`.
- Preview sub-mode (`cpu` | `gpu`) is **not** persisted.

### Subdivide package (`PaneHeader.svelte`)

- Each pane has a **CSS checkbox dropdown** listing all `availableZones` with human
  labels — same menu regardless of current zone.
- Split: **Ctrl/Cmd + drag from pane edge** (documented in pane chrome, not discoverable).
- Close: drag divider to zero (Blender-style).
- **No right-click context menu** today; no zone-specific commands.

### Code panes

| Pane | File | Content | Editor |
|------|------|---------|--------|
| Primitive WGSL | `CodeView.svelte` | `/*---` YAML frontmatter + WGSL body | `<textarea>` |
| PlanetGraph markup | `MarkupView.svelte` | `<PlanetGraph>` XML-ish DSL | `<textarea>` |

- No highlighting library in the monorepo today (grep: no CodeMirror/Prism/Monaco).
- `CodeView` has module picker + Save; `MarkupView` debounced live parse (300 ms).

### Reference: scene editor layout persistence

`fe/src/lib/planet/components/scene-editor/layoutStorage.ts`:

- Key: `virtual-planet:scene-layout:v1`
- Wrapper: `{ version: LAYOUT_DOCUMENT_VERSION, layout: LayoutDocument }`
- `parseLayoutDocument(stored.layout, defaultZone)` on load
- Debounced save (300 ms) on `onlayoutchange`

This is the **template** for graph-editor layout persistence — but storage must live
in `packages/graph-editor` (not `fe/`) to keep the package self-contained and
scene-free.

---

## Proposed workstreams

### M9d.1 — Persist subdivide layout (+ preview mode)

**Objective:** Reloading `/graph-editor` restores splitter geometry and CPU/GPU tab.

**Files (expected):**

| File | Action |
|------|--------|
| `packages/graph-editor/src/layoutStorage.ts` | **new** — load/save/clear, debounce helper |
| `packages/graph-editor/src/defaultLayout.ts` | **new** — extract default `LayoutDocument` from `GraphEditor.svelte` |
| `packages/graph-editor/src/GraphEditor.svelte` | wire `onlayoutchange`, load on mount, reset on New |
| `packages/graph-editor/src/layoutStorage.test.ts` | round-trip + corrupt fallback |

**Storage shape (proposal):**

```ts
export const GRAPH_EDITOR_LAYOUT_KEY = 'virtual-planet:graph-editor-layout:v1';

interface StoredEditorChrome {
  version: 1;
  layout: LayoutDocument;
  previewMode?: 'cpu' | 'gpu';
}
```

- **Separate key** from graph document (`GRAPH_EDITOR_STORAGE_KEY`) — layout is editor
  chrome, not part of `GraphDocument` export/download.
- **New graph** toolbar action: clear graph storage only; **option A** keep layout,
  **option B** reset layout to default — recommend **A** (authors rarely want both).
- Use `parseLayoutDocument` from `@virtual-planet/subdivide` with default zone
  `'canvas'` (largest pane).
- Validate unknown zones after load: if persisted layout references a zone not in the
  current `zones` map, coerce via `parseLayoutDocument` fallback or reset to default.

**Gate:**

1. Resize panes → reload → geometry restored.
2. Switch GPU tab → reload → GPU still selected.
3. `sceneFree.test.ts` green; `npm test -w @virtual-planet/graph-editor`.

**Out of scope:** per-document layout (would need embedding in downloaded JSON — defer).

---

### M9d.2 — Zone-specific pane context menus

**Objective:** Right-click (or improved header menu) on a pane offers **actions
relevant to that zone**, not only “change pane type”.

**Design question for architect:** extend `subdivide` generically vs. host-only menus
in `graph-editor`.

#### Option A — Host callbacks (recommended)

Extend `Subdivide` / `Pane` with optional:

```ts
type PaneContextAction = {
  id: string;
  label: string;
  disabled?: boolean;
  run: (ctx: { paneId: string; zone: string }) => void;
};

// Subdivide props
zoneContextMenus?: Record<string, PaneContextAction[]>;
onpanecontextmenu?: (event: { pane: PaneData; zone: string; clientX: number; clientY: number }) => void;
```

- `graph-editor` supplies menus per zone; `subdivide` renders a shared menu shell.
- Scene editor can adopt later without graph-specific knowledge in `subdivide`.

#### Option B — Graph-editor overlay only

- Listen for `contextmenu` on `.zone-content` wrappers inside each snippet.
- **Pro:** no `subdivide` API change.
- **Con:** duplicate menu positioning; fights pane header hit targets; harder to offer
  layout actions (“Split right”, “Close pane”) that belong to subdivide.

#### Proposed zone menus (graph-editor)

| Zone | Menu items (v1) |
|------|-----------------|
| **canvas** | Fit view (delegate to xyflow), Delete selection (if any), Duplicate node |
| **preview** | CPU / GPU toggle, Refresh preview |
| **palette** | *(none or “Focus search” when palette search exists)* |
| **inspector** | Clear selection |
| **code** | Save primitive (if dirty), Revert draft |
| **markup** | Re-sync from graph (discard draft), Copy markup |
| **validation** | *(read-only — no menu or “Copy report”)* |
| **All panes** | Split → N/S/E/W (mirror Ctrl+edge), Change pane type (existing), Close pane |

**Gate:**

1. Right-click canvas with node selected → Delete works.
2. Right-click preview → switch CPU/GPU without using tab bar.
3. Menu does not open when right-clicking inside `CodeView` textarea (or textarea gets
   browser default unless Shift+right-click — pick one policy).

**Out of scope:** custom keybindings editor; macOS “Services” menu.

---

### M9d.3 — Syntax highlighting for code panes

**Objective:** `CodeView` and `MarkupView` show language-appropriate highlighting while
remaining editable.

**Design question for architect:** dependency choice.

| Option | Pros | Cons |
|--------|------|------|
| **CodeMirror 6** (`@codemirror/lang-xml`, custom WGSL via StreamLanguage or Lezer later) | Battle-tested editing, theming, line numbers | Bundle size; learning curve |
| **Shiki** (highlight only, keep textarea) | Small integration if read-only | Poor fit — both panes are **editable** |
| **Prism + overlay** | Lightweight | Fragile sync with textarea scroll/caret |
| **Split view** | YAML block highlighted, WGSL plain until M3 lexer exists | Matches `/*---` structure; two editors |

**Recommended path:**

1. **M9d.3a — MarkupView:** CodeMirror 6 + `@codemirror/lang-xml` (PlanetGraph is
   XML-shaped; good enough for tags/attributes).
2. **M9d.3b — CodeView:** CodeMirror 6 with:
   - `yaml` frontmatter region (from first `/*---` to `---*/`)
   - `wgsl` body (use `StreamLanguage` with minimal keywords: `fn`, `vec3`, `f32`,
     `return`, `// @use` — full Lezer WGSL grammar is **out of scope**)

**Shared module:** `packages/graph-editor/src/codemirror/theme.ts` — dark theme aligned
with editor shell (`#12151f` background).

**Files (expected):**

| File | Action |
|------|--------|
| `packages/graph-editor/src/CodeMirrorEditor.svelte` | thin wrapper: `value` bindable, `language`, `onchange` |
| `packages/graph-editor/src/CodeView.svelte` | replace `<textarea>` |
| `packages/graph-editor/src/MarkupView.svelte` | replace `<textarea>` |
| `packages/graph-editor/package.json` | add `@codemirror/*` deps |

**Gate:**

1. MarkupView: tags/attributes colored; live parse still works.
2. CodeView: frontmatter keys and WGSL `fn` visibly distinct; Save unchanged.
3. `npm run check -w fe` green (Vite bundles new deps).
4. `sceneFree.test.ts` — CodeMirror is OK (not a forbidden import).

**Out of scope:**

- LSP / autocomplete / diagnostics squiggles (future M9e).
- Read-only diff view for markup vs graph.
- Replacing `fe/` planet shader editors.

---

## Phasing recommendation

```
M9d.1 layout persistence   ──► quick win, no new deps, mirrors scene editor
        │
        ▼
M9d.2 context menus        ──► subdivide API decision required first
        │
        ▼
M9d.3a markup highlighting ──► CodeMirror introduced once
        │
        ▼
M9d.3b CodeView highlighting
```

**Parallelism:** M9d.1 can start immediately alongside M11. M9d.2 should wait for
architect sign-off on Option A vs B. M9d.3 can run parallel to M11 **after** M9d.1
if a different agent owns it.

**Executor suggestion:**

| Phase | Executor | Notes |
|-------|----------|-------|
| M9d.1 | Composer | Mechanical; copy `layoutStorage` pattern |
| M9d.2 | Composer + Opus review | subdivide contract if Option A |
| M9d.3 | Composer | CodeMirror integration; watch bundle size |

---

## Open questions for architect

1. **Layout on New graph:** keep user layout (recommended) or reset to default?
2. **Context menu host:** Option A (subdivide callback) vs Option B (snippet overlay)?
3. **CodeMirror:** acceptable new dependency in `graph-editor` only, or hoist a shared
   `@virtual-planet/code-editor` package for future scene/body editors?
4. **WGSL highlighting depth:** minimal StreamLanguage vs wait for compiler-owned lexer
   ([wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md) says no owned AST —
   syntax coloring can still be approximate).
5. **Preview persistence:** store `previewMode` in layout chrome blob (proposed) or
   separate key?
6. **Milestone id:** fold into M9c follow-up, or ship as **M9d** / **M14 polish**?

---

## Additional polish (backlog — not in M9d v1)

Tracked for a future architect pass; mention only so Claude can prioritize or reject:

| Idea | Notes |
|------|-------|
| Palette search / filter | Grows with primitive count |
| xyflow context menu (node/edge) | Partially covered by M9c keyboard; canvas menu in M9d.2 |
| Undo/redo | Deferred since M9c; needs command stack |
| Persist selected primitive in CodeView | Small chrome addition |
| Graph-editor default layout in `@virtual-planet/subdivide` | `defaultGraphEditorLayout()` next to `defaultSceneEditorLayout()` |
| Theme sync with `fe/` global CSS variables | Nice; not required for v1 |

---

## Review checklist for Opus/Claude

- [ ] Phasing M9d.1 → M9d.2 → M9d.3 approved?
- [ ] subdivide API extension (Option A) approved or rejected?
- [ ] CodeMirror dependency approved; package placement decided?
- [ ] Zone menu inventory complete / trimmed?
- [ ] Storage keys and separation from `GraphDocument` confirmed?
- [ ] Convert to routable brief(s) with gates, or merge into M11+ polish milestone?

---

## Handoff (after review)

→ If approved: pin **M9d.1** brief (layout persistence) for Cursor while M11 contract
work continues · executor: Composer · why: proven pattern, zero IR risk, immediate UX
win.

→ If rejected or deferred: note decision in [STATUS.md](../STATUS.md) backlog table.
