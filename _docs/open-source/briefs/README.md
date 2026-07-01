# Open-source preparation briefs

These briefs capture the open-source preparation plan for the monorepo. They are
separate from the procedural-graph milestone briefs because they touch repository
identity, app layout, release process, governance, and deployment documentation.

## Decisions captured

- Public repo identity is confirmed as **World Lab** / `world-lab`.
- The current `fe/` app should move to `apps/scene-editor/`.
- The standalone graph editor should move to `apps/webgputoy/` and become the
  deployable **WebGPUToy** app.
- MIT is the intended license, but the root `LICENSE` should be added in the final
  pre-public pass.
- `fe.old/` should be removed in the final pre-public pass.
- npm publishing should be prepared but deferred until explicitly enabled.
- The public apps should have their own curated changelogs.
- Package changelogs should be generated later from Changesets when packages are
  ready to publish.

## Index

| Brief | Status | Purpose |
| --- | --- | --- |
| [OS1-world-lab-identity-and-app-layout.md](./OS1-world-lab-identity-and-app-layout.md) | ✅ Landed (`274f7f2`) | Rename/reorganize the app layout and update references. |
| [OS2-release-changelog-and-versioning.md](./OS2-release-changelog-and-versioning.md) | ✅ Landed | Add changelogs, Changesets, and root workspace scripts. |
| [OS3-public-readiness-governance-and-final-cleanup.md](./OS3-public-readiness-governance-and-final-cleanup.md) | ✅ Landed (final cleanup section deferred — needs owner go-ahead) | Add roadmap/governance docs, CI, license, and final cleanup. |

## Sequencing

Run these in order. `OS1` should be a dedicated migration commit because it moves
the active app and updates many references. `OS2` should follow once paths are
stable. `OS3` is split into general governance work and a final just-before-public
cleanup pass.
