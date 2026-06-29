# Procedural graph task board

**Purpose:** short-lived coordination board for active handoffs, blockers, dependency
order, and agent routing. `STATUS.md` remains the durable resume ledger. Durable agent
specs live in [`briefs/`](./briefs/README.md); this board links to them instead of
duplicating full prompts.

Implementer results are indexed by [`HANDOFF.md`](./HANDOFF.md) and live in one
task-specific file under [`handoffs/`](./handoffs/README.md).

**Created:** 2026-06-29 · **Owner:** Codex while Claude credits are unavailable.

## Current priority

Finish the `M-node-model-foundation` decomposition follow-up before starting
`M-pipeline-nodes-s0`.

The latest committed docs say `math.remap` / `sdf.opSubtract` decomposition landed, but
the working tree currently contains a correctness fallback that makes them atomic again.
That fallback is safer than invalid WGSL, but it does not satisfy the intended node-group
architecture.

**Active brief:** [`briefs/M-node-model-decomposition-fix.md`](./briefs/M-node-model-decomposition-fix.md)

**Next brief after cleanup:** [`briefs/M-pipeline-nodes-s0.md`](./briefs/M-pipeline-nodes-s0.md)

## Workflow

1. **Board triage:** record current front, blockers, dependency order, and whether work can
   run in parallel.
2. **Brief first:** every delegated implementation gets a compact, durable brief in
   [`briefs/`](./briefs/README.md). The board links to the brief; it does not become the
   spec.
3. **Dependency waves:** do not start downstream work while a prerequisite is dirty or
   semantically disputed. Independent tasks may run in parallel only with disjoint owned
   files or isolated worktrees.
4. **Agent execution:** hand the active brief to Cursor / Composer / Codex. Agents should
   update only files in the brief's scope, run the brief's gate, and write their result to
   the task-specific handoff linked by the assignment.
5. **Review:** reviewer reads that handoff, checks the diff against the brief, test gate,
   and design ADRs, then records the decision there. If the implementation
   changes public architecture, update the relevant ADR/brief before accepting it.
6. **Approval and commit:** delegated implementers do not commit unless explicitly
   authorized. After review, the reviewer/integrator requests human approval unless that
   task class was pre-authorized, then creates the task commit.
7. **Boundary update:** record the commit in the task handoff, update `STATUS.md`, and compact
   completed rows from this board.

## Commit policy

- Delegated agents do not commit by default.
- The agent must leave a complete result in its assigned task handoff.
- The reviewer/integrator owns the final commit after:
  1. checking the diff against the active brief,
  2. independently verifying appropriate gates,
  3. excluding generated artifacts and unrelated changes,
  4. updating progress docs,
  5. receiving human approval unless pre-authorized.
- Commit messages use the brief/task id, for example:
  `M-node-model-decomposition-fix: restore remap and opSubtract groups`.

## Working tree snapshot at triage

Modified:

- `packages/compiler/src/groupCodegen.test.ts`
- `packages/procedural-wgsl/src/modules/math/remap.ts`
- `packages/procedural-wgsl/src/modules/sdf/ops.ts`

Untracked:

- `packages/procedural-wgsl/src/modules/use-deps.test.ts`
- `packages/graph/tsconfig.tsbuildinfo`
- `packages/runtime-webgpu/tsconfig.tsbuildinfo`

The `tsconfig.tsbuildinfo` files are build artifacts; do not include them in a commit.

## Task matrix

| ID | Task | Status | Parallelizable? | Notes |
|----|------|--------|-----------------|-------|
| T0 | Preserve regression guard for inert raw `// @use` comments | Ready | Yes, with T1/T2 | Covered by active brief. |
| T1 | Audit elemental math ops | Ready | Yes | Covered by active brief; add `math.negate` and rename scalar min/max WGSL entries. |
| T2 | Restore `math.remap` as a real node group | Ready after T1 | No | Covered by active brief; preserve param contract. |
| T3 | Restore `sdf.opSubtract` as a real node group | Ready after T1 | No | Covered by active brief; preserve `distance` output. |
| T4 | Validate linked WGSL dependencies | Ready after T2/T3 | No | Covered by active brief; prove deps go through loader/linker. |
| T5 | Update docs/ledger only if needed | After implementation | No | If decomposition truly lands, `STATUS.md` wording can stay. If fallback remains, correct the ledger. |

## Execution waves and assignments

Assignments are labels for external Cursor/Composer sessions. Agents start only when the
state says **Ready to start**.

| Wave | Agent | Task | State | Ownership / collision rule |
|------|-------|------|-------|----------------------------|
| W0 | Integrator | Commit coordination docs/source reference separately from implementation | Awaiting human approval | Docs only; exclude dirty code and build artifacts. |
| W1 | **D1** | [`M-node-model-decomposition-fix`](./briefs/M-node-model-decomposition-fix.md) | **Ready to start** | Exclusive ownership of graph group types, compiler group codegen, math/SDF graph primitives, related procedural modules/index/tests, and its [handoff](./handoffs/M-node-model-decomposition-fix.md). |
| W2 | **N1** | [`M-noise-functions-harvest`](./briefs/M-noise-functions-harvest.md) | Queued after W1 commit | Noise leaf files + shared graph/procedural barrels/tests + its [handoff](./handoffs/M-noise-functions-harvest.md). |
| W2 | **C1** | [`M-colorlab-harvest` slice A](./briefs/M-colorlab-harvest.md) | Queued after W1 commit | Color leaf files + shared graph/procedural barrels/tests + its [handoff](./handoffs/M-colorlab-harvest-a.md). |
| W2 | Integrator | Rebase/pin [`M-pipeline-nodes-s0`](./briefs/M-pipeline-nodes-s0.md) against landed node-model foundation | Queued after W1 | Contract/docs only; Part 1 of the old brief is partly landed and must not be reimplemented. |
| W3 | **P1** | Rebased `M-pipeline-nodes-s0` implementation | Blocked on W2 contract pass | Exclusive pipeline graph/runtime/editor sample files; visual gate required. |

N1 and C1 both edit central barrels. In a shared working tree, run them sequentially. They
may run concurrently only in isolated worktrees/branches, with the integrator merging one
at a time and rerunning both package gates.

Do not fill all available agent slots merely because they exist. The current useful
parallelism is one implementation plus non-editing contract/review work.

## Backlog / parallel candidates

These are not on the active dependency chain and should not block
`M-node-model-decomposition-fix`. They are safe to hand to separate agents only if they do
not edit the same compiler/group-codegen files as the active cleanup.

| Brief | Status | Parallelizable? | Notes |
|-------|--------|-----------------|-------|
| [`briefs/M-colorlab-harvest.md`](./briefs/M-colorlab-harvest.md) | Contract pinned; queued W2 | Only in isolated worktree | Source access verified. Slice A is fixed-D65 conversions/transfers; adaptation/CVD deferred. |
| [`briefs/M-noise-functions-harvest.md`](./briefs/M-noise-functions-harvest.md) | Contract pinned; queued W2 | Only in isolated worktree | First slice and dependency strategy are pinned. Source doc should land with coordination docs. |

## Blocker analysis

No architectural blocker. There are two implementation details that must be handled:

1. **Param preservation for `math.remap`.** The active brief now pins a TypeBox-backed
   group-param mapping. Do not invent another param metadata shape.

2. **Negation for `sdf.opSubtract`.** The docs call for `max + negate`, but no
   `math.negate` primitive/module exists yet. Add `math.negate` as the pinned atomic op.
   Do not introduce a broad literal/constant system just for this cleanup.

Additional verification risk:

- `math.min` / `math.max` WGSL modules currently recurse/shadow WGSL builtins. Rename only
  their internal WGSL entries to `mathMin` / `mathMax`, preserving graph primitive ids.

## Agent prompt

### Agent D1 — start now

> Implement [`briefs/M-node-model-decomposition-fix.md`](./briefs/M-node-model-decomposition-fix.md).
> Do not touch [`briefs/M-pipeline-nodes-s0.md`](./briefs/M-pipeline-nodes-s0.md) until the
> decomposition fix is reviewed and committed. Treat the brief's pinned group-param and
> canonical-group-module contracts as authoritative. Preserve all pre-existing dirty
> changes unless the brief explicitly replaces them. Do not commit or edit ledgers. Write
> the completed result to
> [`handoffs/M-node-model-decomposition-fix.md`](./handoffs/M-node-model-decomposition-fix.md)
> before yielding.

N1, C1, and P1 prompts are their briefs plus the assignment row above. Do not start them
until their state advances to **Ready to start**.
