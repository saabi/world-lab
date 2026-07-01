# Brief OS4 - Package scope and npm publishing readiness

**Type:** release engineering. **Scope:** npm identity, package builds, export maps,
tarball contents, package documentation. **Depends on:** owner confirmation of npm scope.
**Status:** ✅ Everything below except the actual publish-enablement step is landed.
`private: true` stays set on every package until the owner explicitly asks to remove it.

## Objective

Prepare the reusable `packages/*` libraries for external npm consumers without publishing
them yet. The current Changesets setup manages versions, but packages still export source
TypeScript and lack a deliberate tarball/build contract.

## Scope decision — ✅ decided: `@world-lab/*`

The original `@virtual-planet/*` scope was narrower than World Lab's intended use (a
multi-app platform, not a single "virtual planet" tool). Owner confirmed `@world-lab` is
available on npm and chose it over the `@saabi/*` personal-scope fallback this brief
originally proposed.

**Rename executed atomically**: all 10 `packages/*` libraries moved from `@virtual-planet/*`
to `@world-lab/*`. Beyond this brief's literal ask, for naming consistency across the
monorepo, both apps' package names were renamed too (`@world-lab/scene-editor-app`,
`@world-lab/webgputoy-app`) — they stay private and never publish, so the scope choice
doesn't affect them functionally; this was purely to avoid a half-renamed-looking monorepo.
Every internal reference updated together: package.json dependencies, source imports, both
apps' Vite SSR `noExternal` regexes, the `graph-editor` ADR import-guard whitelist regex,
`.changeset/config.json`'s `ignore` list, the queued `.changeset/*.md` changeset,
`packages/subdivide`'s own `LICENSE` header, and live docs (root README, CLAUDE.md, app
READMEs). Completed procedural-graph milestone briefs
(`_docs/architecture/procedural-graph/briefs/**`, `STATUS.md`, `handoffs/**`) intentionally
still show `@virtual-planet/*` — they're historical records of what was true when that work
landed, not live references (the same treatment OS1 gave old `fe/` path mentions there).

## Required work

- ~~Choose and reserve the npm scope.~~ ✅ done (`@world-lab`).
- ~~Rename publishable packages and all internal references atomically.~~ ✅ done.
- ~~Define which packages are independently useful and public.~~ ✅ done — see "Package
  usefulness" below. All 10 are wired into the same build/pack/smoke-test pipeline; one
  (`mcp-server`) is flagged in its own README as not yet functional.
- ~~Add a build pipeline that emits JavaScript and declarations into `dist/`.~~ ✅ done — `tsc`
  (7 pure-TS packages) or `@sveltejs/package` (3 Svelte packages: `graph-editor`, `editor-ui`,
  `subdivide`), each via `npm run build -w <pkg>`, orchestrated in dependency order by the root
  `build:packages` script (see "Build order" below).
- ~~Point `exports` at built artifacts with explicit `types` and `import` conditions.~~ ✅ done
  — see "Dev vs. published resolution" below; this needed more than the literal ask.
- ~~Add `files` allowlists and accurate `sideEffects` metadata.~~ ✅ done — `"files": ["dist"]`
  everywhere; `"sideEffects": true` only for `@world-lab/graph` (its `primitives/*` register
  themselves via a bare side-effecting import — `"sideEffects": false` would let a
  tree-shaking bundler drop that registration silently), `false` for the other 9.
- ~~Add a README to every publishable package.~~ ✅ done (10/10). Also fixed two stale ones
  found along the way: `schema`'s said "scaffold, TypeBox layer lands next" and `subdivide`'s
  said "Svelte components land in a follow-up phase" — both are long since built and load-
  bearing; the READMEs just hadn't been updated.
- ~~Replace broad internal dependency ranges such as `"*"` with an intentional release
  policy.~~ ✅ done — `"*"` → `"^0.0.0"` (the current, unreleased baseline) for every internal
  `@world-lab/*` dependency. Once `changeset version` actually runs, `updateInternalDependencies:
  "patch"` (already configured) keeps these ranges honest going forward.
- ~~Keep apps private and ignored by Changesets.~~ ✅ already true, unchanged.
- ~~Add `npm pack --dry-run` checks for every publishable package.~~ ✅ done — verified by hand
  for all 10 (clean: only `dist/`, `README.md`, `LICENSE`, `package.json`; no `src/`, no test
  files) and now covered by `npm run test:pack` (see below), which packs for real.
- ~~Add a clean consumer smoke test that installs packed tarballs outside the monorepo.~~ ✅
  done — `npm run test:pack` (`scripts/consumer-smoke-test.mjs`): builds all 10, `npm pack`s
  each into a real `.tgz`, installs all of them together into a scratch npm project under
  `os.tmpdir()` (genuinely outside the repo — no workspace symlinks), then imports and calls a
  real function from each. Caught one real gap during development (see "What this smoke test
  actually caught" below).
- `Remove private: true` — **intentionally not done.** Owner asked to hold this step; every
  package still has `"private": true`.

## Dev vs. published resolution (why this needed more than the literal ask)

Pointing `exports` at `dist/` for real npm consumers, while every app/package in this monorepo
had always consumed `@world-lab/*` siblings directly via live `src/` (no prebuild step, ever),
created a real conflict: the same `exports` map has to describe both audiences correctly.

The fix is a conditional export per package:

```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "development": "./src/index.ts", "import": "./dist/index.js" }
}
```

(Svelte packages get the same pattern per component subpath, with `"svelte"` instead of
`"import"` — `@sveltejs/package`'s own convention.)

Two resolvers read this map, and neither behaves the way the other's docs might suggest:

- **Vite** (both apps' dev server *and* `vite build`) resolves `@world-lab/*` via the literal
  `'development'` condition — forced explicitly in `resolve.conditions` (client) *and*
  `ssr.resolve.conditions` (SSR does **not** inherit the root config in practice, despite what
  a generic Vite plugin-option doc comment suggests — verified empirically, not assumed).
  Without this, `vite build` fails outright trying to resolve a `dist/` that doesn't exist yet
  (verified: removed `resolve.conditions`, reran `apps/webgputoy`'s build, watched it fail on
  `Cannot resolve import "@world-lab/graph"`).
- **`tsc`/`svelte-check`** (both apps' and every package's own `check` script) does **not**
  auto-detect a `'development'` condition the way Vite's dev/test mode does. Left alone, it
  silently resolves through `"types"` → `dist/*.d.ts` instead — which doesn't exist on a fresh
  checkout, and CI runs `check` *before* `build`. Fixed via TypeScript's own
  `"customConditions": ["development"]` compiler option (needs `moduleResolution: "bundler"`,
  already in use everywhere) on every package's and both apps' base `tsconfig.json` (not
  `tsconfig.build.json` — that one *should* resolve real `dist/*.d.ts` deps, since it's building
  the real publish artifact). Verified by clearing every `dist/` and confirming `npm run check
  --workspaces` reproduces the exact pre-OS4 file counts (1337 / 982) with 0 errors.

## Build order

`packages/*` don't build independently of each other: `tsc -p tsconfig.build.json` for, say,
`@world-lab/compiler` needs `@world-lab/graph`'s and `@world-lab/schema`'s *real* `dist/*.d.ts`
to exist first (their `tsconfig.build.json` intentionally does **not** carry
`customConditions`, unlike the check config above — the actual publish build should resolve
against other packages' real published surface, not their live source). A plain
`--workspaces` sweep doesn't guarantee that order. `package.json`'s `build:packages` script
runs each package's build individually in explicit topological order (leaves first:
`schema`, `editor-ui`, `subdivide` → `graph` → `compiler`, `runtime-cpu`, `mcp-server` →
`procedural-wgsl` → `runtime-webgpu` → `graph-editor` last, since it depends on almost
everything). `npm run build` (root) is `build:packages && build:apps`; `ci.yml`'s build step
now calls `npm run build` instead of a raw `--workspaces` sweep, so CI actually gets this
ordering.

## Package usefulness

All 10 are wired into the same pipeline, but they aren't equally "ready" in the sense of
having a real external audience today:

- **Genuinely standalone**, no `@world-lab/*` dependency at all: `@world-lab/subdivide` (a
  general Blender-style pane-layout engine — was a separate open-source project before this
  monorepo) and `@world-lab/editor-ui` (generic Svelte editor chrome/controls).
- **The graph engine core**, meant to be consumed together: `schema`, `graph`, `compiler`,
  `procedural-wgsl`, `runtime-cpu`, `runtime-webgpu`. Publishable individually, but a consumer
  wanting "the procedural graph engine" needs several of them together.
- **`graph-editor`**: the Svelte UI for the graph engine core; both apps in this monorepo are
  thin shells over it.
- **`mcp-server`: not actually functional yet.** Its own README says so plainly — it's a
  handful of plain query functions with no MCP SDK dependency and no server/transport wiring,
  despite the package name. It's included in the build/pack/smoke-test pipeline because doing
  so is free and harmless, not because it's ready for a real consumer. Worth reconsidering
  whether it should ship in the first real publish at all, or wait until it's a working server.

## What this smoke test actually caught

Testing the Svelte component subpath exports (`@world-lab/editor-ui/Section.svelte` etc.) via
plain Node's `require.resolve` failed at first — Node's default accepted export conditions
don't include `"svelte"`, so it correctly reported the subpath as undefined. That's not a bug
in the packages; it's the smoke test using the wrong tool. A real consumer reaches these
through Vite + `vite-plugin-svelte`, which *does* set the `"svelte"` condition. Re-ran with
`node --conditions=svelte` (matching what a real Svelte-aware bundler does) and all 12 checks
passed. `scripts/consumer-smoke-test.mjs` runs this way permanently.

## Gate

- ✅ Every package builds from a clean checkout (`npm run build:packages`, verified with every
  `dist/` removed first).
- ✅ `npm pack --dry-run` contains only intended runtime files, README, package metadata, and
  license (verified for all 10; `LICENSE` needed adding to 9 of them — see above).
- ✅ A temporary external project can install and import each tarball without TypeScript source
  compilation assumptions (`npm run test:pack`, 12/12 checks passed against real installed
  tarballs outside the repo).
- ✅ Changesets versions internal dependencies consistently (`changeset status` still resolves
  the queued patch changeset against all 10 renamed packages; `updateInternalDependencies:
  "patch"` will keep `^0.0.0`-style ranges in sync on future version bumps).
- ✅ No npm publish command has run; `private: true` remains set on every package.

