# Procedural graph task board — retired, unified into the root board

**Retired 2026-07-03.** This file was a short-lived coordination board (created 2026-06-29,
"Owner: Codex while Claude credits are unavailable") describing a heavier protocol —
`STATUS.md` as the durable ledger, per-task files under [`handoffs/`](./handoffs/README.md),
delegated agents never committing, an integrator reviewing and committing on their behalf.

The project has since converged on a single, simpler board at the repo root:
**[`../../../_TASK_BOARD.md`](../../../_TASK_BOARD.md)**. That file is what
[`AGENTS.md`](../../../AGENTS.md) now describes as the live routing/claim mechanism —
implementing agents *do* commit their own work, claiming a row by editing `Claimed by:` and
marking `Status: DONE <hash>` in the same stage commit as their code. There is only one task
board now; this file is kept for git history/link continuity, not as a second one.

Every task this file was tracking landed before retirement — folded into the root board's
Archive section with commit hashes: node-model decomposition fix (`a29b4cc`), noise-functions
harvest (`b0f9fd9`), colorlab harvest slice A (`9fbc58a`), pipeline-nodes-s0 (`5af0b80`). Nothing
was left active or unclaimed here.

Briefs, `STATUS.md`, `execution-and-delegation.md`, and this directory's `README.md` are
updated to point at the root board instead of here.
