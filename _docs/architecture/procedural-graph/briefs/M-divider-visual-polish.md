# Brief — subdivide divider visual polish (width/hover, active-drag)

**Type:** UI polish (user-flagged) · **Packages:** `@world-lab/subdivide`
(`Divider.svelte`, `Subdivide.svelte`) · **Depends on:** none · **Design authority:** none
(new, self-contained visual polish) · **Contract author:** Opus · **Recommended executor:**
Cursor · **Status:** ready to route

## Problem

Two related, currently-`pending_issues.md`-tracked gaps in `Divider.svelte`'s presentation,
both touching the same two files (bundled into one brief rather than two, to avoid
overlapping file ownership on a parallel task board):

1. **Flat resting size, no hover feedback.** `thickness = '1px'` (default, set via
   `--thickness` custom property in `Subdivide.svelte`) is the same at rest and under the
   pointer. Should read as ~2px wider at rest, expanding further on hover — **without**
   affecting the actual layout `--thickness` panes reflow around (animate the divider's own
   `::before`/`::after` pseudo-element visual size/opacity only).
2. **No active/dragging visual state.** `Subdivide.svelte` already tracks `dragging =
   $state<DividerData | null>` and uses it to drive a *separate* full-screen cursor-hint
   overlay (`.overlay` in `Subdivide.svelte`), but the specific `Divider.svelte` instance being
   dragged gets no distinct style of its own — no way to tell which divider is live mid-drag
   from the divider itself.

A third item — a new corner-triangle resize affordance at divider intersections — was
considered and **retired** (owner decision, 2026-07-03); do not build it. `PaneHeader.svelte`'s
*unrelated* pre-existing corner-triangle (the "change pane type" menu trigger) was separately
already replaced with a real square button + icon in the header row (see the "Pane header,
restructured once already" note in `pending_issues.md`) — that work is done and is not this
brief's concern either.

## Fix

- **Divider.svelte:** add a `active?: boolean` prop. `Subdivide.svelte` passes
  `active={dragging === divider}` at the `<Divider>` call site (`{#each dividers as divider
  (divider.id)}` block). Style `.divider.active` (or equivalent) with a distinct border/color —
  this is purely additive to the existing `--color`/`--thickness`/`--draggable` custom-property
  scheme already set on `.layout` in `Subdivide.svelte`; don't change that scheme.
- **Divider.svelte CSS:** widen the resting `::before` visual (currently
  `width: calc(100% + var(--thickness))`) by ~2px beyond the current thickness baseline, and
  add a `:hover`/`:focus-visible` rule that further increases the visual size/opacity via
  `transform`/size on the pseudo-element — not by changing `--thickness` itself, which drives
  real pane geometry (`.layout`'s own `width`/`height`/`margin` calc in `Subdivide.svelte`).

## Gate

1. `packages/subdivide`: existing 35 tests stay green; add tests for the new `active` prop
   (a dragging divider gets the distinct class/style; a non-dragging one doesn't) — follow the
   `render`/`fireEvent` harness pattern already established in `floatingPanel.test.ts` (uses
   `@testing-library/svelte`; auto-cleanup is already configured via
   `setupFiles: ['@testing-library/svelte/vitest']` in `vitest.config.ts` — no new setup needed).
2. `check` **and** `test` green (`packages/subdivide`, and the full workspace since
   `apps/scene-editor` and `apps/webgputoy` both consume `Subdivide` transitively via the
   `development` export condition — see `pending_issues.md`'s "Process / verification" note
   about `packages/*/dist` needing to be cleared before trusting a `check` run).
3. **Visual ⚠:** screenshot showing (a) a divider at rest vs. hovered (widened, not shifting
   pane content), (b) a divider mid-drag with its distinct active style.

## Out of scope

Changing `--thickness`'s real (layout-affecting) value; any corner-intersection affordance
(retired, see Problem).

## Handoff

→ Dividers read as intentional, Blender-authentic UI chrome (resting/hover/active states)
instead of a bare 1px hit line — directly resolves two `pending_issues.md` UI-polish bullets
in one pass.
