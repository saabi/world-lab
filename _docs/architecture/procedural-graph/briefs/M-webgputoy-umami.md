# Brief — Umami analytics for webgputoy

**Type:** infra/instrumentation · **Packages:** `apps/webgputoy` (new files + layout) ·
**Depends on:** none · **Design authority:** `apps/scene-editor`'s existing integration is the
exact pattern to replicate, not redesign · **Contract author:** Opus · **Recommended
executor:** Cursor · **Status:** ready to route

## Objective

`apps/scene-editor` already has a working, minimal Umami integration; `apps/webgputoy` has
none. Bring webgputoy to parity — inject the same way, expose the same `track()` API — as a
prerequisite for the separate, larger "custom events" backlog item (instrumenting document
save/load, compile, preview-mode changes, etc.), which is explicitly **not** part of this
brief.

## Reference implementation (verified, exact files)

- `apps/scene-editor/src/lib/analytics/umami.ts` — ~24 lines: `injectUmami()` (reads
  `PUBLIC_UMAMI_SRC`/`PUBLIC_UMAMI_WEBSITE_ID` from `import.meta.env`, no-ops if either is
  unset or `document` doesn't exist, injects one `<script>` tag, guards against double-inject
  with a module-level `injected` flag) and `track(eventName, data?)` (no-ops outside the
  browser, calls `window.umami?.track`).
- `apps/scene-editor/src/routes/+layout.svelte` — calls `injectUmami()` inside a `browser`
  guard (from `$app/environment`) in an `onMount`/effect at layout load.
- `apps/scene-editor/.env.example` — documents the two env vars as commented-out placeholders.

## Fix

- **Port `umami.ts` verbatim into `apps/webgputoy`** (e.g.
  `apps/webgputoy/src/lib/analytics/umami.ts` — same relative path convention as scene-editor).
  Don't rewrite the logic; copy it and adjust only the import path if webgputoy's `$lib`
  alias differs.
- **Wire `injectUmami()` into webgputoy's own `+layout.svelte`** (the same file `M-editor-a11y-
  phase-a.md` already added the skip-link/`<main>` landmark to — coordinate the edit so both
  land cleanly, this brief's change is additive to that file, not a rewrite of it).
- **Add `.env.example` entries** for `PUBLIC_UMAMI_SRC`/`PUBLIC_UMAMI_WEBSITE_ID` in
  `apps/webgputoy`, matching scene-editor's commented-out placeholder format, plus a one-line
  README note (webgputoy's own `README.md` if it has an env/config section, otherwise skip
  rather than inventing a new doc section).
- **Do not add a shared `@world-lab/analytics` package or extract into `editor-ui`** for this
  brief — `pending_issues.md` marks that as optional/future; a straight port keeps this task
  small and matches what's actually needed now (two apps, two website IDs, per its own
  "Current state" notes).
- **Website ID:** webgputoy needs its **own** Umami website ID (do not reuse scene-editor's) —
  document this in the `.env.example` comment, but the actual dashboard-side ID creation is a
  deploy-time/human step, not something to fabricate a placeholder value for beyond the
  existing `00000000-...` example format scene-editor already uses.

## Gate

1. `check` **and** `test` green for `apps/webgputoy` and the full workspace (a straight port
   of already-tested logic; no new test is strictly required, but add one if `umami.ts` lands
   with any adaptation beyond a literal copy).
2. **Manual/visual ⚠:** with `PUBLIC_UMAMI_SRC`/`PUBLIC_UMAMI_WEBSITE_ID` unset (the default
   dev state), confirm no script tag is injected and no console error appears — the whole
   point of the env-gated design is zero tracking in dev by default.

## Out of scope

Custom event instrumentation (a separate, larger backlog item — this brief is infrastructure
only, page-view-equivalent parity, not event coverage); a shared analytics package; an in-app
privacy/consent disclosure surface (also separately tracked); PM2/deploy-config wiring for a
real production website ID.

## Handoff

→ webgputoy has the same zero-tracking-by-default, opt-in-via-env Umami plumbing scene-editor
already has — the prerequisite the "custom events" backlog item needs before it can be briefed.
