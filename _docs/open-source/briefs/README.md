# Open-source preparation briefs

These briefs capture the open-source preparation plan for the monorepo. They are
separate from the procedural-graph milestone briefs because they touch repository
identity, app layout, release process, governance, and deployment documentation.

## Decisions captured

- Public repo identity is confirmed as **World Lab** / `world-lab`.
- The current `fe/` app should move to `apps/scene-editor/`.
- The standalone graph editor should move to `apps/webgputoy/` and become the
  deployable **WebGPUToy** app.
- The repository and workspace packages use the MIT license.
- The archived `fe.old/` app was removed in the final cleanup pass.
- **npm scope confirmed as `@world-lab/*`** (verified available) — all 10 `packages/*`
  libraries and both apps' package names use it. npm publishing itself is still prepared
  but deferred until explicitly enabled.
- The public apps should have their own curated changelogs.
- Package changelogs should be generated later from Changesets when packages are
  ready to publish.

## Index

| Brief | Status | Purpose |
| --- | --- | --- |
| [OS1-world-lab-identity-and-app-layout.md](./OS1-world-lab-identity-and-app-layout.md) | ✅ Landed (`274f7f2`) | Rename/reorganize the app layout and update references. |
| [OS2-release-changelog-and-versioning.md](./OS2-release-changelog-and-versioning.md) | ✅ Landed | Add changelogs, Changesets, and root workspace scripts. |
| [OS3-public-readiness-governance-and-final-cleanup.md](./OS3-public-readiness-governance-and-final-cleanup.md) | ✅ Landed (incl. final cleanup: `c66617b`) | Add roadmap/governance docs, CI, license, and final cleanup. |
| [OS4-package-publishing-readiness.md](./OS4-package-publishing-readiness.md) | ✅ Landed except the actual publish step (`private: true` intentionally still set on every package) | Choose a broad npm scope and make standalone packages consumable outside the monorepo. |

## Sequencing

Run these in order. `OS1` should be a dedicated migration commit because it moves
the active app and updates many references. `OS2` should follow once paths are
stable. `OS3` is split into general governance work and a final just-before-public
cleanup pass.
