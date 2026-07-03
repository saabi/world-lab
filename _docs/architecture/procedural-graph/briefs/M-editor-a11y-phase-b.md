# Brief — editor accessibility, Phase B (focus trap)

**Type:** accessibility (audited, confirmed not assumed) · **Package:**
`@world-lab/graph-editor` (new `focusTrap.ts` action, `DocumentList.svelte`,
`NodeSwapMenu.svelte`, `PortConnectMenu.svelte`) · **Depends on:** Phase A ✅ landed
(`5b64448`) · **Design authority:** `saabi/colorlab`'s `focusTrap` Svelte action (~40 lines:
capture focusables, cycle Tab/Shift+Tab, save + restore `activeElement`) — not present in
this repo, describe/port the pattern rather than assuming file access · **Contract author:**
Opus · **Recommended executor:** Cursor · **Status:** ready to route

## Problem

Confirmed by reading the actual markup, not assumed: zero focus trap anywhere in this
codebase (`grep` for `focusTrap`/`trapFocus`: zero hits). Every modal-ish dialog lets Tab leak
out to the rest of the page and doesn't return focus to whatever triggered it on close:

- **`DocumentList.svelte`**: two dialogs, `<div class="dialog" role="dialog"
  aria-label={namePromptTitle}>` (shared for Save-As/Rename, gated on `namePromptOpen`) and a
  second one gated on `deleteTarget` (the delete-confirm dialog, "Delete '{name}'? This can't
  be undone."). Neither has any focus-trap behavior; both close via clicking a
  `.dialog-backdrop` (`onclick={() => (namePromptOpen = false)}` / `(deleteTarget = null)`),
  but Tab from inside either dialog currently escapes to the rest of the page.
- **`NodeSwapMenu.svelte`** and **`PortConnectMenu.svelte`**: `role="dialog"` roots that Phase
  A already gave `tabindex="-1"` (to satisfy the a11y-lint rule without changing behavior) —
  this brief is the real fix that lint fix was explicitly deferring: a proper focus trap, not
  a bare attribute.

## Fix

- **New `packages/graph-editor/src/focusTrap.ts`** — a Svelte action (`use:focusTrap`),
  porting colorlab's own pattern (small, ~40 lines): on mount, capture all focusable elements
  within the node (standard selector: `a[href], button:not([disabled]), input:not([disabled]),
  select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`), save
  `document.activeElement` before moving focus into the trap, cycle Tab/Shift+Tab between the
  first/last focusable (wrap around, don't let Tab escape the node), and on destroy restore
  focus to the saved element. Also focus the first focusable (or the node itself if none)
  immediately on mount, so keyboard users land somewhere sensible without hunting.
- **Apply `use:focusTrap`** to all four dialog roots: `DocumentList.svelte`'s two dialogs,
  `NodeSwapMenu.svelte`, `PortConnectMenu.svelte`. For the two that already have `tabindex="-1"`
  from Phase A, keep that attribute — the action traps Tab cycling, the attribute keeps the
  *root* itself out of the normal tab order (its children remain reachable), no conflict
  between the two.
- **Escape still closes** (verify existing Escape handling isn't broken by the trap — if any
  of these four don't yet close on Escape, that's a pre-existing gap worth noting, but this
  brief's job is the trap, not inventing new close behavior beyond what already exists).

## Gate

1. `packages/graph-editor`: new `focusTrap.test.ts` — a harness component with 3 focusable
   children: Tab from the last cycles to the first (and vice versa via Shift+Tab); mounting
   moves focus inside; unmounting restores focus to whatever had it before mount. Existing 177
   tests stay green.
2. `check` **and** `test` green for `graph-editor` and the full workspace.
3. **Visual/manual ⚠:** open each of the four dialogs via keyboard only (no mouse), confirm
   Tab cycles within the dialog and never reaches page content behind it, and confirm closing
   returns focus to the element that opened it (the Save-As/Rename/Delete trigger button, or
   the node whose swap/connect menu was open).

## Out of scope

Keyboard operability for the graph canvas itself (Phase C — a much larger, different kind of
gap: xyflow node move/connect, not a dialog); an in-app keyboard-shortcut reference (Phase D);
opt-in text-readability preferences (Phase E). Adding Escape-to-close where it doesn't already
exist (note it if found, don't silently add new behavior beyond the trap itself without
flagging it here first).

## Handoff

→ Every existing modal-ish surface is now keyboard-safe (trapped, and returns focus on
close) — the real fix Phase A's `tabindex="-1"` patch was explicitly deferring. Phase C
(keyboard operability for the graph canvas) is the next, larger accessibility phase.
