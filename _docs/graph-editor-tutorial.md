# Graph editor in-app tutorial — content plan

**Status:** planning only — no `data-tutorial` hooks, tracks, or popover UI exist yet. This is
the content/architecture blueprint to build against, not product copy.

Blueprint for a **lane-based, step-by-step in-app tutorial** in WebGPUToy, modeled on Color
Lab's system (`fe/src/lib/inspector/tutorial-steps.ts`, `TutorialPopover.svelte`,
`LanePicker.svelte`, `tutorial.svelte.ts`).

**App:** `apps/webgputoy` · **Package:** `packages/graph-editor` (tutorial UI likely lives in
app or a shared `editor-ui` package later).

---

## Color Lab format to mirror

Each **track** is a ordered list of **steps**. Every step has the same five teaching fields
(rendered as labeled rows in `TutorialPopover`):

| Field | Role |
|-------|------|
| `title` | Short step name in the popover header |
| `concept` | Why this exists / mental model (neutral tone) |
| `tryIt` | Concrete UI action the user performs |
| `successCheck` | Observable outcome — user can verify they did it right |
| `commonMistake` | One frequent confusion to pre-empt |

Plus wiring metadata:

| Field | Role |
|-------|------|
| `zone` | Popover placement relative to target (see zones below) |
| `target` | CSS selector on a `data-tutorial="…"` hook, or `null` for canvas-wide steps |
| `suggestedExample?` | Sample graph id for a **Load example** button (never auto-load) |
| `skip?` | Optional predicate — skip leading steps already satisfied |

**Tracks** are chosen in a **lane picker** (purpose × depth). A **prelude** prepends to every
track. Progress persists in `sessionStorage`; desktop-first (mobile notice like Color Lab).

---

## Proposed lane picker (2 × 2)

Mirror Color Lab's Explore / Design × Quick / Pipeline grid.

| | **Quick** (~15–20 min) | **Pipeline** (~30–35 min) |
|--|------------------------|---------------------------|
| **Explore** | Orient in the editor; read a graph; one preview output; inspector help | Every major pane; multi-output preview; validation + compiled WGSL; node tint |
| **Author** | Add nodes, wire, right-click ports, save a document | Full pipeline authoring; swap by contract; markup/code views; samples; undo |

**Track ids (proposal):** `explore-quick` · `explore-pipeline` · `author-quick` · `author-pipeline`

---

## Tutorial zones (graph editor)

Adapt Color Lab's four zones to subdivide panes:

| Zone | Use when pointing at… |
|------|------------------------|
| `palette-adjacent` | Left palette pane |
| `canvas-float` | Graph canvas (xyflow) — popover floats over/near viewport |
| `inspector-adjacent` | Inspector / validation pane |
| `preview-adjacent` | Preview pane chrome (buffer selector, play controls) |
| `toolbar-adjacent` | Document bar, undo, `»` sidebar toggle, logo |
| `code-adjacent` | Code / markup / compiled WGSL panes |

---

## Prelude (prepend to all tracks)

| # | Title | Concept (summary) | Try it | Success | Mistake | Target id |
|---|-------|-------------------|--------|---------|---------|-----------|
| P1 | The subdivide workspace | Panes resize independently; layout can be saved with documents. | Drag a divider between Palette and Graph. | Pane width changes; graph reflows. | Expecting a fixed layout — users can open duplicate Preview/Code panes from zone menus. | `workspace-divider` |
| P2 | Start from a sample | Default graph is *Animated Worley*; samples are read-only until saved as. | Open document switcher → load **ShaderToy — Animated Worley** if not already active. | GPU preview animates. | Editing a sample without Save as — changes are session-only on read-only samples. | `document-switcher` |
| P3 | Find the preview | Preview may be in a side column; open another from the zone menu if missing. | Right-click a pane header → zone menu → ensure **Preview** is visible. | At least one preview pane shows the effect. | Looking for preview in the graph canvas — output is always a separate pane. | `zone-menu-preview` |
| P4 | Floating canvas sidebar (`N`) | Blender-style overlay on the graph pane; does not resize the grid. `N` only responds while the mouse is over that specific pane, so other panes could host their own panels independently. | Hover the graph pane and press `N` (or use the toolbar `»`). | Node tint controls appear over the canvas edge; the pane's border brightens while hovered. | Expecting the sidebar in the top toolbar — tint moved to `N` panel. If it looks gone, look for the small chevron tab at the canvas edge — click it to reopen. | `canvas-sidebar-toggle` |

Optional `skip` on P2 if Worley sample already loaded; P4 if sidebar already open.

---

## Track: explore-quick

**Goal:** Navigate the editor and understand what an existing graph does.

| # | Title | Target id | suggestedExample |
|---|-------|-----------|------------------|
| E1 | What you are looking at | `graph-canvas` | — |
| E2 | Palette search & grouping | `palette-header` | — |
| E3 | Node tint by contract | `canvas-sidebar` | — |
| E4 | Select a node — inspector | `inspector-panel` | — |
| E5 | Help & usage on every primitive | `inspector-help` | — |
| E6 | Follow a wire | `graph-canvas` | — |
| E7 | Preview one output | `preview-buffer-select` | — |
| E8 | Validation is live | `validation-panel` | — |

### Step detail (draft copy)

**E1 — What you are looking at**
- **Concept:** Nodes are typed functions; edges carry data between ports. The graph compiles to
  WGSL and runs on GPU for effect previews. The pane your mouse is over gets a brighter border —
  that's also the pane `N` will affect later, so it's worth noticing now.
- **Try it:** Pan/zoom the canvas. Click a node to select it. Move the mouse between panes and
  watch the border highlight follow it.
- **Success:** Selection highlights; inspector updates; border brightens on the hovered pane.
- **Mistake:** Treating the canvas as the preview — rendering happens in Preview panes.

**E2 — Palette search & grouping**
- **Concept:** Primitives group by **section** (noise, math, …) or **contract** (scalar, vec3f,
  image, …); search filters and auto-expands matches.
- **Try it:** Toggle Section ↔ Contract. Search `worley`.
- **Success:** List filters; Worley nodes visible.
- **Mistake:** Thinking grouping changes node behavior — display only.

**E3 — Node tint by contract**
- **Concept:** Tinting by **contract** colors ports consistently so type mismatches stand out
  before wiring.
- **Try it:** In `N` sidebar, set Node tint → **Contract**.
- **Success:** Nodes recolor by dominant port types.
- **Mistake:** Confusing tint with validation — invalid wires still fail in Validation panel.

**E4 — Select a node — inspector**
- **Concept:** Inspector edits **parameters** for the selected node; port wiring overrides literals
  when connected (full param-as-input UX still pending).
- **Try it:** Select a `noise.*` node; change a numeric param.
- **Success:** Preview updates after compile.
- **Mistake:** Editing params on an unselected node.

**E5 — Help & usage on every primitive**
- **Concept:** Each primitive ships `help` + optional `usage` in metadata — surfaced in inspector.
- **Try it:** Select `sdf.opSubtract` (or any node); read help block.
- **Success:** Non-empty summary + usage line.
- **Mistake:** Assuming tooltips are generated from port names only — authored text exists.

**E6 — Follow a wire**
- **Concept:** Edges are directed: output → input. Fan-in replaces prior connection on scalar
  inputs.
- **Try it:** Trace one edge from a noise node to a math node visually.
- **Success:** Can name source and destination primitives.
- **Mistake:** Connecting two outputs to one input — only one fan-in allowed on scalar ports.

**E7 — Preview one output**
- **Concept:** Graphs can expose multiple **display sinks**; each preview pane picks which buffer
  to show.
- **Try it:** In preview pane chrome, open the buffer dropdown; confirm one target selected.
- **Success:** Animated image visible; buffer name matches a pipeline output.
- **Mistake:** Expecting separate clocks per pane — one shared loop drives all GPU previews.

**E8 — Validation is live**
- **Concept:** Incomplete or type-invalid graphs list issues with node context — compile may
  still partial-preview when possible.
- **Try it:** Open Validation pane; confirm green/empty for Worley sample.
- **Success:** No errors on sample (or understood messages if broken).
- **Mistake:** Ignoring validation — broken graphs may show blank/stale preview.

---

## Track: explore-pipeline

**Goal:** Deep tour of every pane and multi-output execution.

| # | Title | Target id | suggestedExample |
|---|-------|-----------|------------------|
| EP1 | Default layout map | `workspace-root` | — |
| EP2 | Open a second preview pane | `zone-menu-preview` | — |
| EP3 | Two outputs, one clock | `preview-buffer-select` | `pipeline-worley-time` |
| EP4 | CPU vs GPU preview families | `preview-family-override` | — |
| EP5 | Inspector + validation together | `inspector-panel` | — |
| EP6 | Compiled WGSL — truth layer | `compiled-wgsl-panel` | — |
| EP7 | Code view — primitive source | `code-view` | — |
| EP8 | Markup view — graph as text | `markup-view` | — |
| EP9 | Node swap by contract | `graph-canvas` | — |
| EP10 | Port quick-connect | `graph-canvas` | — |
| EP11 | Documents & layout memory | `document-switcher` | — |
| EP12 | Undo / redo | `document-undo` | — |

### Step detail (highlights only)

**EP3 — Two outputs, one clock**
- **Concept:** `GraphFrameExecutor` runs one frame loop; uniforms (e.g. time) stay synced across
  panes viewing different outputs.
- **Try it:** Open two Preview panes; set each to a different buffer (if graph has multiple sinks;
  otherwise note single-output sample). Watch animation phase match.
- **Success:** Both panes animate in lockstep.
- **Mistake:** Assuming independent timelines per pane.

**EP6 — Compiled WGSL**
- **Concept:** Read-only emit from compiler — what actually ships to GPU; trust/debug view.
- **Try it:** Open Compiled WGSL pane; scroll after an edit.
- **Success:** WGSL updates when graph changes.
- **Mistake:** Editing this panel — use Code view for primitive source instead.

**EP9 — Node swap by contract**
- **Concept:** Click node **title** → searchable list of primitives with identical port contract.
- **Try it:** Swap a noise node for another noise primitive.
- **Success:** Ports reattach; graph recompiles.
- **Mistake:** Deleting and re-wiring manually when swap preserves edges.

**EP10 — Port quick-connect**
- **Concept:** Right-click port → compatible primitives only → adds node + wire.
- **Try it:** Right-click an unconnected input; pick `math.remap` (or compatible match).
- **Success:** New node appears, connected.
- **Mistake:** Using left-click drag when you meant the quick-connect menu.

---

## Track: author-quick

**Goal:** Build a small graph from scratch and save it.

| # | Title | Target id | suggestedExample |
|---|-------|-----------|------------------|
| A1 | Add a node from the palette | `palette-list` | — |
| A2 | Connect with drag | `graph-canvas` | — |
| A3 | Right-click port quick-connect | `graph-canvas` | — |
| A4 | Tune params in inspector | `inspector-panel` | — |
| A5 | See it in preview | `preview-buffer-select` | — |
| A6 | Fix a deliberate mistake | `validation-panel` | — |
| A7 | Save your graph | `document-save` | — |
| A8 | Undo a change | `document-undo` | — |

### Step detail (highlights)

**A1 — Add a node**
- **Concept:** Click palette entry → node spawns at default offset (drag-from-palette **not yet**
  shipped — `pending_issues.md`).
- **Try it:** Add `noise.perlin3d` (or similar).
- **Success:** Node on canvas.
- **Mistake:** Expecting drag-and-drop placement — click only today.

**A6 — Fix a deliberate mistake**
- **Concept:** Validation names the node and issue; fix wire or type before relying on preview.
- **Try it:** Disconnect a required input; read Validation; reconnect.
- **Success:** Error clears; preview returns.
- **Mistake:** Chasing preview only — read Validation first.

**A7 — Save**
- **Concept:** Named documents in localStorage; samples need **Save as** to become writable.
- **Try it:** Save as `my-first-graph`.
- **Success:** Appears in document switcher after reload.
- **Mistake:** Confusing session restore with named save.

---

## Track: author-pipeline

**Goal:** Stage-by-stage pipeline authoring (ShaderToy-style effect).

| # | Title | Target id | suggestedExample |
|---|-------|-----------|------------------|
| AP1 | Pipeline mental model | `graph-canvas` | `pipeline-worley-time` |
| AP2 | Sources — host uniforms | `inspector-panel` | — |
| AP3 | Noise → math chain | `graph-canvas` | — |
| AP4 | `target.display` sink | `graph-canvas` | — |
| AP5 | Multi-buffer preview | `preview-buffer-select` | — |
| AP6 | Swap primitive in place | `graph-canvas` | — |
| AP7 | Edit primitive WGSL | `code-view` | — |
| AP8 | Read compiled output | `compiled-wgsl-panel` | — |
| AP9 | Load cosine palette sample | `document-switcher` | `shadertoy-cosine-palette` |
| AP10 | Export graph JSON | `document-more-menu` | — |
| AP11 | Keyboard workflow | `graph-canvas` | — |
| AP12 | What's not built yet | `null` | — |

### Step detail (highlights)

**AP1 — Pipeline mental model**
- **Concept:** Effect graphs chain nodes into implicit pipeline consumers/outputs; compiler
  derives sinks when metadata empty.
- **Try it:** Load Worley sample; identify noise → color/math → display path.
- **Success:** Can narrate data flow left-to-right (or feed-forward).

**AP4 — Display sink**
- **Concept:** `target.display` (or derived pipeline image output) is what preview panes render.
- **Try it:** Select display-related node; confirm preview buffer name.

**AP11 — Keyboard workflow**
- **Concept:** Ctrl+Z/Y undo; Ctrl+C/V copy-paste; Ctrl+D duplicate; Delete selection.
- **Try it:** Duplicate a node; undo.
- **Success:** Toolbar undo label matches action.
- **Mistake:** Expecting in-app shortcut reference — not built (`pending_issues.md` a11y).

**AP12 — What's not built yet** (honest capstone)
- **Concept:** Palette drag-drop, user node names, wireable promotable params, node groups UI,
  cross-target GPU feedback — on backlog.
- **Try it:** Read `pending_issues.md` / roadmap (or skip in-product).
- **Success:** User knows limits vs demo video promises.
- **Mistake:** Assuming every graph-editor idea in docs is shipped.

---

## `data-tutorial` hooks to add (implementation inventory)

None exist in `packages/graph-editor` today. Plausible ids:

| `data-tutorial` | Component / region |
|-----------------|-------------------|
| `workspace-root` | `GraphEditor.svelte` outer shell |
| `workspace-divider` | `Subdivide` divider (any) |
| `document-switcher` | `DocumentList.svelte` select |
| `document-save` | Save / Save as buttons |
| `document-undo` | Undo / redo cluster |
| `document-more-menu` | More ▾ menu |
| `canvas-sidebar-toggle` | Toolbar `»` button |
| `canvas-sidebar` | Floating panel content (`N` sidebar) |
| `palette-header` | `NodePalette.svelte` mode toggles + search |
| `palette-list` | Primitive list body |
| `graph-canvas` | `GraphCanvas.svelte` root |
| `inspector-panel` | `InspectorPanel.svelte` |
| `inspector-help` | Help/usage block in inspector |
| `validation-panel` | `ValidationPanel.svelte` |
| `preview-buffer-select` | `PreviewZone.svelte` buffer dropdown |
| `preview-family-override` | Preview family/renderer override (if exposed) |
| `zone-menu-preview` | Subdivide pane context menu (zone open) |
| `code-view` | `CodeView.svelte` |
| `markup-view` | `MarkupView.svelte` |
| `compiled-wgsl-panel` | `CompiledWgslPanel.svelte` |
| `toolbar-logo` | `toolbarStart` slot / `WebGpuToyLogo` |

Per-node targets (optional): `data-tutorial="node-{primitiveId}"` on palette buttons — only if
needed for spotlight steps.

---

## `suggestedExample` sample ids (existing)

From `packages/graph-editor/src/samples.ts`:

| Id | Label | Good for steps |
|----|-------|----------------|
| `pipeline-worley-time` | ShaderToy — Animated Worley | Prelude P2, EP3, AP1 |
| `shadertoy-cosine-palette` | ShaderToy — Cosine palette | AP9, color/effect contrast |

Add tutorial-specific minimal graphs later (e.g. `tutorial:two-outputs`, `tutorial:broken-wire`)
if samples are too heavy to mutate during lessons.

---

## UI components to build (Color Lab parity)

| Piece | Color Lab reference | Graph editor notes |
|-------|---------------------|-------------------|
| `tutorial-steps.ts` | `fe/src/lib/inspector/tutorial-steps.ts` | Step arrays per track + prelude |
| `tutorial.svelte.ts` | `fe/src/lib/engine/tutorial.svelte.ts` | `sessionStorage` progress |
| `TutorialPopover.svelte` | concept / try / success / mistake rows | Reuse zone arrow CSS from `app.css` |
| `LanePicker.svelte` | Explore/Design × Quick/Pipeline | Explore/Author × Quick/Pipeline |
| Entry point | `DocumentBar` Tutorial button | `DocumentList` or toolbar |
| Target highlight | `.tutorial-target` pulse | Copy keyframes to webgputoy `app.css` |
| `loadExample` | `AppShell.loadTutorialExample` | Wire to `loadSampleDocument` / artifact loader |
| Welcome once | `colorlab:tutorial-welcomed` | `webgputoy:tutorial-welcomed` optional |

---

## Features to cover vs defer

### Include in tutorial tracks

- Subdivide layout + zone menus + floating `N` sidebar
- Palette search / section / contract / both grouping
- Node tint (category / contract / off)
- Click-to-add nodes; drag wires; right-click port quick-connect
- Node swap by contract (title click)
- Inspector params + help/usage
- Validation panel
- Preview buffer selector; multi-pane preview; synced clock
- Document save/load/samples; undo/redo; layout-in-artifact toggle
- Code / markup / compiled WGSL panes (pipeline track)
- Copy/paste/duplicate shortcuts (pipeline author capstone)
- WebGPUToy branding (toolbar logo) — optional one-liner in prelude

### Mention as not built (honest `commonMistake` or capstone)

- Drag-and-drop from palette to canvas
- User-defined node display names
- Promotable params as wireable input ports (editor)
- Node groups / collapse-to-group UI
- Cross-target render-to-texture / ping-pong feedback
- In-app keyboard shortcut reference panel
- Mobile layout tutorial (desktop-first notice like Color Lab)

---

## Suggested implementation order

1. **`data-tutorial` attributes** on stable anchors (table above).
2. **Prelude + explore-quick** — smallest step count; validates popover zones on real layout.
3. **`suggestedExample` buttons** wired to `listSampleArtifacts()`.
4. **author-quick** — exercises create/save/validation loop.
5. **explore-pipeline** + **author-pipeline** — longer tracks; add minimal tutorial graphs if
   needed.
6. **Lane picker** + session resume + mobile notice.
7. **Copy audit** — same discipline as Color Lab `tutorial-consistency-audit-handoff.md`: every
   try-it must be achievable in the current UI.

---

## Cross-reference

- Demo video shot list (not committed): `graph-editor-demo-video.md`
- Backlog / gaps: `pending_issues.md`
- Shipped features archive: `_TASK_BOARD.md`
- Color Lab step authoring: `colorlab/fe/src/lib/inspector/tutorial-steps.ts`
