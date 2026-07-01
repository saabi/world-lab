# Contributing to World Lab

Thanks for your interest — World Lab is pre-1.0 and moving fast, so please open an issue
before starting substantial work, to avoid duplicated or conflicting effort.

## Getting started

```sh
npm install         # from the repo root — one lockfile links every workspace
npm run check        # svelte-check / tsc across every workspace
npm test              # vitest across every workspace
```

See the root [README.md](README.md) for the monorepo layout and per-app setup, and
[AGENTS.md](AGENTS.md) for architecture, commands, and the full workflow this repo is
developed under (including how AI coding agents are used here — several packages and briefs
under `_docs/architecture/procedural-graph/` document that in detail, if you're curious).

## Before you open a PR

- **Gate:** `npm run check` **and** `npm test` must pass for every package/app you touched —
  a green test run alone is not enough; the type-check gate has caught real regressions a
  passing test suite missed.
- Keep changes scoped — a bug fix shouldn't carry drive-by refactors; a new feature shouldn't
  redesign unrelated code.
- If you change a `packages/*` library in a way that should eventually ship a version bump,
  add a changeset: `npx changeset add` (this repo uses
  [Changesets](https://github.com/changesets/changesets); see `.changeset/README.md`).
- WGSL-emitting changes should be validated for real (a device compile where available, not
  just that the string assembles) — see `packages/runtime-webgpu/README.md`.
- For UI/editor changes, actually run the app and exercise the change in a browser — passing
  tests verify correctness, not that a feature *looks* or *feels* right.

## Reporting bugs / requesting features

Use the issue templates — they'll prompt for what's needed to reproduce or evaluate a
request. See [SECURITY.md](SECURITY.md) instead for anything security-sensitive; please
don't open a public issue for those.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
