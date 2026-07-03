# Brief — editor accessibility, Phase A (structural, no behavior change)

**Type:** accessibility gap (audited, confirmed not assumed — see `pending_issues.md`
"Accessibility" section) · **Packages:** `@world-lab/webgputoy-app` (`+layout.svelte`),
`@world-lab/graph-editor` (`NodeSwapMenu.svelte`, `PortConnectMenu.svelte`) · **Depends on:**
none · **Design authority:** `saabi/colorlab`'s `_docs/accessibility-controls-handoff.md`
(reference implementation for the phasing and the specific fixes below; not present in this
repo, describe/port the pattern rather than assuming file access) · **Contract author:** Opus
· **Recommended executor:** Cursor · **Status:** ready to route

## Problem

Confirmed by direct inspection (2026-07-02, not assumed): zero landmark roles or skip-link
almost everywhere in this codebase. Only one `<nav aria-label="Main">` exists at all
(`apps/scene-editor`'s `AppHeader.svelte`); `apps/webgputoy` and `packages/graph-editor` have
none. Additionally, two pre-existing `vite-plugin-svelte` a11y-linter warnings are already
flagged but unfixed: `NodeSwapMenu.svelte:58` and `PortConnectMenu.svelte:58` — "Elements with
the 'dialog' interactive role must have a tabindex value."

This is Phase A only (structural, no behavior change) of a five-phase plan already laid out in
`pending_issues.md`'s Accessibility section — Phases B (focus trap), C (keyboard operability
for the graph canvas), D (in-app keyboard-shortcut reference), and E (opt-in text-readability
preferences) are explicitly **not** in scope here; each is its own follow-on brief once this
lands.

## Fix

- **`apps/webgputoy/src/routes/+layout.svelte`:** add a landmark structure around
  `{@render children()}` — at minimum a `<main>` wrapping the rendered app, matching the
  pattern colorlab uses (`<aside aria-label="...">` for any side-chrome, `<main>` for the
  primary content). Given webgputoy's `GraphEditor` is effectively the whole app (no persistent
  app-level header — see the branding note in `pending_issues.md`), the landmark story here is
  simpler than colorlab's: one `<main>` around the editor is likely sufficient. Add a
  visually-hidden, focus-visible skip link as the first child (`<a href="#main-content"
  class="skip-link">Skip to editor</a>` or similar), targeting an `id` on that `<main>`.
- **`NodeSwapMenu.svelte:58` and `PortConnectMenu.svelte:58`:** add `tabindex="0"` (or `-1` if
  the element shouldn't be independently tab-reachable but still needs the attribute to satisfy
  the `role="dialog"` requirement — check which is correct per each menu's actual focus
  behavior) to silence the linter warning correctly, not just suppress it. Since
  `pending_issues.md` explicitly flags that a bare attribute patch isn't the right fix long-term
  (a real focus trap is Phase B), do the minimal correct thing here: whichever of `tabindex="0"`
  /`"-1"` makes the *existing* keyboard interaction (if any) continue to work, verified by
  actually tabbing through the menu, not just clearing the lint warning.

## Gate

1. `check` green with the two a11y-linter warnings actually gone (not suppressed via a lint
   ignore comment) — re-run `npm run check` and confirm the specific warning text no longer
   appears, not just that the overall error count is unchanged.
2. `test` green, full workspace (no test currently asserts on these warnings, so no test
   changes expected here — this is a manual/visual verification gate more than an automated
   one for this specific phase).
3. **Visual/manual ⚠:** confirm via keyboard navigation (Tab from page load) that (a) a skip
   link appears on first Tab press and, when activated, moves focus into the editor, (b) a
   screen reader's landmark navigation (or a browser dev-tools accessibility tree inspection is
   an acceptable substitute if a real screen reader isn't available in this environment) can
   jump to the new `<main>` region, (c) both menus remain keyboard-operable exactly as before
   (no regression in existing Tab/Escape/Enter behavior).

## Out of scope

Focus trap (Phase B); keyboard operability for `GraphCanvas.svelte`'s pointer-only node
move/connect (Phase C); an in-app keyboard-shortcut reference (Phase D); font-scale/contrast/
line-height preferences or the `rem` unit-conversion prerequisite for them (Phase E) —
`pending_issues.md` confirms 100% hardcoded `px` font sizes today, a much larger mechanical
change that deserves its own brief.

## Handoff

→ The two currently-flagged lint warnings are actually fixed (not just documented), and the
editor gains its first landmark/skip-link — the smallest possible real step Colorlab's own
five-phase plan proves out, unblocking Phase B (focus trap) as the natural next brief.
