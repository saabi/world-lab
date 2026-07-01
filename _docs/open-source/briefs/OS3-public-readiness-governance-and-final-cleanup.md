# Brief OS3 - Public readiness, governance, and final cleanup

**Type:** open-source readiness. **Scope:** README, roadmap, governance docs, CI,
final cleanup. **Depends on:** OS1 and OS2. **Status:** ✅ Landed — **except** the "Final
pre-public cleanup" section below, which is explicitly deferred (per its own text: "perform
these only when the owner says the repo is ready to open" — that signal hasn't been given).
Everything else landed: README/ROADMAP, both app READMEs, governance docs (CONTRIBUTING,
SECURITY, CODE_OF_CONDUCT, PR template, issue templates), and `.github/workflows/ci.yml`.

## Objective

Make the repo understandable and maintainable for public contributors, while
clearly framing World Lab as an early-stage WebGPU-first world-authoring platform
that may grow toward game-development workflows.

## README and roadmap

Update root `README.md` around the World Lab identity:

- What World Lab is today.
- Current apps:
  - Scene Editor: current scene/solar-system/planet renderer app.
  - WebGPUToy: graph editor and WebGPU playground.
- Package map.
- Local setup.
- Current status and pre-1.0 expectations.
- Link to architecture docs and diagram set.
- Link to changelogs and roadmap.

Add a root `ROADMAP.md` with sections:

- Current capabilities.
- Near-term open-source and deployment readiness.
- Mid-term world-authoring direction.
- Long-term game-dev platform potential.
- Non-goals for now.

Frame the future carefully: World Lab is not yet a full game engine, but the
architecture should leave room for mesh import, placement, instancing, procedural
graphs, material workflows, exportable world documents, and runtime/game-dev
integrations.

## App READMEs

Add or update:

- `apps/scene-editor/README.md`
- `apps/webgputoy/README.md`

Each app README should include:

- App purpose.
- Public deployment domain if known.
- Local dev commands.
- Build/start commands.
- App-specific changelog link.
- Current limitations.
- App-specific roadmap.

## Governance docs

Add:

- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`

Consider `CODE_OF_CONDUCT.md` using Contributor Covenant if public contributor
governance is desired.

## CI

Add `.github/workflows/ci.yml`:

- Checkout.
- Setup Node 22.
- `npm ci`.
- `npm run check --workspaces --if-present`.
- `npm run test --workspaces --if-present`.
- `npm run build --workspaces --if-present`.

Do not add npm publish automation until publishing is explicitly enabled.

## Final pre-public cleanup

Perform these only when the owner says the repo is ready to open:

- Add root `LICENSE` with MIT.
- Remove `fe.old/`.
- Rename the GitHub repository to `world-lab`.
- Verify clone URLs, badges, and repository metadata.
- Confirm all app deployment paths and domains.
- Confirm which packages remain private and which are ready for future npm
  publication.

## Gate

- Fresh clone setup instructions work.
- Root CI workflow passes.
- README and ROADMAP accurately distinguish current capabilities from future
  direction.
- App READMEs match actual scripts and paths.
- No stale `fe/` active-app references remain after OS1.
- No secrets, local-only screenshots, build artifacts, or private notes are
  included unintentionally.

## Out of scope

- Do not implement new editor/game-dev features.
- Do not publish packages.
- Do not claim World Lab is a complete game engine.
- Do not remove `fe.old/` or add MIT until the explicit final-open-source pass.
