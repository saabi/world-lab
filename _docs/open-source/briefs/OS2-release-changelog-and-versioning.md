# Brief OS2 - Release, changelog, and versioning setup

**Type:** release-engineering setup. **Scope:** changelogs, package metadata,
workspace scripts, Changesets. **Depends on:** OS1 app layout migration.
**Status:** ✅ Landed.

> **Note on `repository` metadata:** at initial landing, the GitHub repo had not yet been
> renamed, so `repository.url` pointed at the then-current `saabi/virtual_planet`. The external
> rename to `saabi/world-lab` has since happened; the follow-up is done — every
> `repository.url` (root, all `packages/*`, both `apps/*`), the local git remote, and the one
> live `**Repository:**` pointer in `_docs/specs/virtual_planet_architecture_plan.md` now read
> `saabi/world-lab`. (Two apps — `apps/scene-editor`, `apps/webgputoy` — were also missing
> `repository`/`description` entirely from the original OS2 pass; a script bug silently
> skipped them since they had no `description` key to anchor the insertion on. Fixed in the
> same pass.)

## Objective

Prepare the monorepo for maintainable open-source releases without publishing npm
packages yet. Add changelog discipline, version-management tooling, root scripts,
and package metadata that can support future npm publishing when explicitly
enabled.

## Release model

Use Changesets for package version management.

- Independent package versions, not fixed monorepo versioning.
- Root and app changelogs are curated manually.
- Package changelogs are generated later from Changesets.
- npm publishing is configured for readiness but deferred.
- Apps stay private and are deployed independently.

## Changelog policy

Add:

- `CHANGELOG.md` for repository-level milestones.
- `apps/scene-editor/CHANGELOG.md` for the public scene editor app.
- `apps/webgputoy/CHANGELOG.md` for WebGPUToy releases.

Do not generate long historical changelogs from git log messages. Use concise
curated baseline entries instead:

```md
## Unreleased

## 0.1.0 - Initial public baseline

Initial public source baseline.
```

When package publishing is enabled later, Changesets can generate package-level
changelogs under `packages/*/CHANGELOG.md`.

## Tooling

Add Changesets:

```sh
npm install -D @changesets/cli
npx changeset init
```

Suggested `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@virtual-planet/scene-editor-app",
    "@virtual-planet/webgputoy-app"
  ]
}
```

Adjust ignored app names only if the package scope changes before OS1 executes.

## Root scripts

Add scripts similar to:

```json
{
  "scripts": {
    "dev:scene-editor": "npm --workspace @virtual-planet/scene-editor-app run dev",
    "dev:webgputoy": "npm --workspace @virtual-planet/webgputoy-app run dev",
    "build": "npm run build --workspaces --if-present",
    "build:apps": "npm run build:scene-editor && npm run build:webgputoy",
    "build:scene-editor": "npm --workspace @virtual-planet/scene-editor-app run build",
    "build:webgputoy": "npm --workspace @virtual-planet/webgputoy-app run build",
    "check": "npm run check --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "ci": "npm run check && npm test && npm run build",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "changeset publish"
  }
}
```

Tune app workspace names only if the package scope changes before OS1 executes.

## Package metadata

For packages intended to stand alone eventually, add or prepare:

- `description`
- `license` after the final MIT-license pass
- `repository.directory`
- `files`
- `sideEffects` where accurate
- clear `exports`

Keep packages private until npm publishing is explicitly enabled. Before removing
`private: true`, decide whether source TypeScript exports are acceptable or whether
each package needs a `dist/` build with JS and declarations.

## Gate

- `npm install` updates the lockfile cleanly.
- `npm run check --workspaces --if-present` passes.
- `npm run test --workspaces --if-present` passes.
- `npm run build --workspaces --if-present` passes or any intentionally skipped
  builds are documented.
- `npm run changeset` works.
- `npm run version` is not run unless intentionally creating a version commit.

## Out of scope

- Do not publish packages.
- Do not add the MIT license file yet unless this is the final pre-public pass.
- Do not remove `fe.old/`.
- Do not rename the GitHub repo from inside this brief; document the expected
  external GitHub rename instead.
