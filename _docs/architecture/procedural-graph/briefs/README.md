# Milestone briefs

Self-contained, routable specs for executing
[implementation-plan.md](../implementation-plan.md) milestones. Each brief is a
**contract a single agent can fulfill**: objective, files, public signatures, the
failing tests that are the acceptance gate, what's out of scope, dependencies, and a
handoff. See [execution-and-delegation.md](../execution-and-delegation.md) for who
runs what.

## Conventions

- **Serialized for now.** One brief in flight at a time. Parallel execution waits
  until synchronization-workflow docs exist.
- **Self-contained.** A brief links the relevant stream doc(s) so a fresh or
  external agent (Cursor / Codex / Gemini Antigravity) needs no other context.
- **Gate = done.** The task is complete when the brief's tests are green and
  `npm run check` / `npm test` pass for the touched package, with **no new public
  API** beyond the brief.
- **Handoff required.** Every brief (and every executed task) ends with a
  `## Handoff` naming the next task id · recommended executor · one-line why.

## Index

| Brief | Milestone | Status | Recommended executor |
|-------|-----------|--------|----------------------|
| [M1-graph-ir.md](./M1-graph-ir.md) | M1 — Graph IR | ✅ landed (5/5 green) | Sonnet (done) |
| [M2-primitives.md](./M2-primitives.md) | M2 — Primitive registration | ✅ contract ready | Sonnet (registry) + Haiku (primitives) |

Further briefs are written as each milestone's predecessor lands (serialized).
