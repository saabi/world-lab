# Execution & delegation plan

**Status:** working agreement for how milestones get built and by whom · **Scope:**
companion to [implementation-plan.md](./implementation-plan.md). Part of the
[Procedural Graph System](./README.md).

## How automatable is the plan?

The plan is **design-complete, not implementation-spec-complete.** Each milestone
([implementation-plan.md](./implementation-plan.md)) has a concrete goal and a
**test gate**, which is what makes verification-driven delegation viable — but the
docs intentionally do not pin public **types, signatures, and file layout** (except
where a design ADR like
[wgsl-parsing-and-codegen.md](./wgsl-parsing-and-codegen.md),
[editor-and-scene-integration.md](./editor-and-scene-integration.md), or
[parameter-and-form-schema.md](./parameter-and-form-schema.md) already locks
policy; resource/host-input inspector boundaries are in
[parameter-and-form-schema-addendum.md](./parameter-and-form-schema-addendum.md)).
A delegate handed a milestone cold would re-invent those and drift.

So milestones are not "hand off and walk away" yet — they are **one thin contract
pass away**. The cheaper the agent, the more the contract must be pinned first.

## Workflow per milestone (contract-first, test-gated)

1. **Contract pass — Opus.** Write the milestone's *public surface* and its gate:
   - file list + public TS signatures (types, interfaces, exported functions),
   - the **failing tests** that encode the gate (the acceptance criteria as code),
   - dependencies on prior milestones.
   This is cheap (minutes) and keeps the expensive judgment with the strongest model.
2. **Implementation — delegate (Sonnet/Haiku).** Make the tests green *within* the
   contract. No new public API without escalating.
3. **Review & integrate — Opus or Sonnet.** Check against the gate + the
   [Definition of done](./implementation-plan.md#definition-of-done-per-milestone),
   confirm no API drift, no engine-level special-casing of a consumer.

The gate is the contract. If a milestone's gate is weak (visual/GPU — see below),
delegation needs human/Opus oversight regardless of implementer.

## Dependency waves, ownership, and handoffs

The critical dependency chain remains serialized: do not start a milestone whose
prerequisite is open. Independent tasks may run in parallel when
[`TASK_BOARD.md`](./TASK_BOARD.md) assigns disjoint files, or when each task uses an
isolated worktree/branch and the integrator merges them one at a time. Shared barrel,
registry, lockfile, and ledger edits are integration-owned unless explicitly assigned.

**Every task ends with a task-specific handoff.** The last thing an agent does — whether it wrote
a brief, implemented a milestone, or reviewed one — is state explicitly:

> **Handoff** → next task id · recommended executor · one-line why.

Routable per-milestone **briefs** live in [`briefs/`](./briefs/README.md); execution
reports live in [`handoffs/`](./handoffs/README.md). The task board is the scheduler.

## Continuity & resumption (agent-independent)

All build state lives in the repo, not in any agent's context: **briefs are specs,
test gates are acceptance, git commits are the per-stage ledger, handoffs name the
next step**, and [STATUS.md](./STATUS.md) is the single resume entry point (kept
current at each task boundary).

This makes the build **resumable by any capable agent at any point** — including
mid-task and including a change of architect. If the current architect (Opus/Claude)
stops — e.g. runs out of credits mid-contract — a top-tier agent (Codex 5.5, etc.)
reads `STATUS.md`, picks up the in-flight brief or implementation from the working
tree, and continues. Requirement: Sonnet-class-or-better; no conversation history is
needed, because there is no hidden state in any single agent's session. To stay
resumable, **commit per stage** (Cursor already does) and **keep `STATUS.md`
current**.

## Roles & agent pool

Two roles. The **contract-first, test-gated workflow is what makes the implementer
role vendor-agnostic** — a pinned contract + failing tests is a spec any competent
agent can fulfill, and the gate verifies the result regardless of who produced it.

**Architect / orchestrator — strongest reasoning model (Opus 4.8 / me).** Owns the
contract passes, the correctness-critical cores (Graph IR types, slicing, linker,
parity), reviews, and integration. Judgment and blast-radius, not throughput — this
does not move to cheaper or external agents.

> I (Claude Code) can spawn Claude subagents directly, but **Cursor, Codex, and
> Gemini Antigravity are separate tools you drive.** My part in triaging to them is
> producing the self-contained brief (contract + gate + doc links) they consume and
> reviewing what comes back against the gate — I can't invoke them myself.

**Implementer pool — interchangeable; route by availability, cost, and fit.**

| Agent | Good fit | Notes |
|-------|----------|-------|
| **Cursor (auto)** | In-IDE implementation against a pinned contract; refactors; SvelteKit UI | ~Sonnet-class; **unlimited monthly credits → default home for bulk implementer work**; human-in-the-loop in the editor |
| **Codex** | Headless autonomous multi-file implementation; algorithmic/codegen milestones that run to green | Strong at "iterate until tests pass" |
| **Gemini Antigravity** | Milestones needing **browser/visual verification** (the ⚠ rows) and multi-surface work | Agent-first IDE with browser control |
| **Sonnet 4.6** | Bulk implementation against a pinned contract + green gate | Claude subagent I can spawn directly |
| **Haiku 4.5** | Boilerplate, repetitive primitives, fixtures, scaffolds, doc/link upkeep | Cheapest; pattern-following, low judgment |

(Fable 5 can stand in where Sonnet would.) The capability tier matters more than the
vendor: any "Sonnet-class or better" agent can take a pinned-contract milestone;
the cheapest available takes boilerplate.

## Per-milestone allocation

Read "lead tier" as the *capability* required, not a specific vendor: **Opus** rows
stay with the architect; every other row goes to **any implementer in the pool**,
routed by fit — headless algorithmic/codegen → Codex or Sonnet; in-IDE/UI work →
Cursor; ⚠ visual/GPU rows → Gemini Antigravity or Cursor (browser-capable);
boilerplate → Haiku or the cheapest available.

| # | Milestone | Lead tier | Why / what Opus must pin first |
|---|-----------|-----------|--------------------------------|
| M0 ✅ | Scaffold packages | Haiku | done — pure boilerplate |
| **M1** ✅ | Graph IR types | **Opus** | The schema is the SSOT (`Port` data+space, `Node`, `Edge`, `GraphDocument`); shape errors propagate everywhere |
| M2 ✅ | Primitives + evalCPU | Cursor | Opus pins `NodePrimitive`/`registerPrimitive`; each noise/math op is then repetitive |
| **M3** ✅ | Self-describing WGSL loader | **Opus** (contract) → Sonnet | TypeBox params + signature/YAML loader landed; `eb09625` |
| **M4** ✅ | Dependency slicing | Opus (contract) → Cursor | Algorithmic core of the compiler; correctness-critical |
| M5 ✅ | WGSL gen + module resolver | Cursor | Mechanical once the slice/resolver interfaces are pinned |
| **M6** ✅ | ShaderLinker + tree-shake | Cursor | Text-based reachability/DCE per ADR; `8b19ece` |
| M7 ✅ | CPU runtime services | Sonnet | Standard math (frustum planes, pointer ray); `a579686` |
| M8 ✅ | Resource inputs | Sonnet | Typed graph dependencies + CPU views/resolver; `790a898` |
| M9 | Standalone editor | Sonnet | ⚠ visual gate; Opus pins the IR↔view binding |
| **M9b** | Multi-level editing | **Opus** (+ Sonnet for views) | Round-trip losslessness + bounded declarative grammar are subtle |
| M10 | runtime-webgpu | Opus/Sonnet | ⚠ GPU gate; pipeline/bind-group contract; needs run verification |
| M11 | Tessellation primitives | Sonnet | ⚠ visual gate; Opus owns scheduler + coordinate-space correctness |
| M12 | Vegetation consumer | Sonnet (+ Haiku primitives) | Well-specified in [vegetation.md](./vegetation.md); deterministic tests |
| **M13** | Planet shaping graph | **Opus** | ⚠ renderer **parity**; highest blast radius; gated by renderer-unification |
| M14 | Document & session model | Sonnet | Standard CRUD + patch + 409 |
| M15 | MCP server | Sonnet | Tool wiring once the IR is stable |
| M16 | Embedded editor + shared surfaces | Sonnet | ⚠ visual gate; Opus owns the surface-sharing seam |
| M17 | WebGPUToy | mixed (later) | Out of near-term scope |

⚠ = **weak/partial test gate** (visual or GPU acceptance vitest can't fully cover):
a good fit for Gemini Antigravity or a browser-capable Cursor session; always pair
with run/screenshot verification and an Opus/human review pass regardless of who
implements it.

## "Ready to delegate" checklist (per milestone)

A milestone is ready to hand to a cheaper agent when:

- [ ] Public TS signatures + file list are written (the contract).
- [ ] The gate exists as **failing tests** in the target package.
- [ ] Upstream milestone(s) it depends on are green.
- [ ] The brief names what is **out of scope** (no new public API, no consumer
      special-casing).
- [ ] If delegating to an **external agent** (Cursor / Codex / Gemini Antigravity),
      the brief is **self-contained** — links the relevant stream doc + the contract
      + the gate + "match surrounding conventions, run `npm run check`/`vitest`" —
      since it does not share this design conversation's context.
- [ ] If the gate is visual/GPU (⚠), a verification step (run/screenshot) and a
      reviewer are assigned.

## Suggested cadence

Work the [critical path](./implementation-plan.md#critical-path--parallel-tracks):
Opus does the M1 contract → delegate the bulk → Opus does the M4/M6 cores → the
first vertical slice (`M0→M2→M4→M5→minimal M9`) is mostly Sonnet/Haiku under Opus
contracts. Parallel tracks (M3, M7–M8, the procedural-wgsl library) are
Sonnet/Haiku-friendly once M2 lands.
