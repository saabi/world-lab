# Implementation handoffs

This is the stable entry point for task results. Each parallel task has its own file under
[`handoffs/`](./handoffs/README.md), so agents never overwrite a shared report.

| Task | Handoff | State |
|------|---------|-------|
| Node-model decomposition fix | [`handoffs/M-node-model-decomposition-fix.md`](./handoffs/M-node-model-decomposition-fix.md) | Ready to assign |
| Noise-functions harvest | [`handoffs/M-noise-functions-harvest.md`](./handoffs/M-noise-functions-harvest.md) | Queued |
| Colorlab harvest, slice A | [`handoffs/M-colorlab-harvest-a.md`](./handoffs/M-colorlab-harvest-a.md) | Queued |

Implementers update only their assigned handoff. Reviewers record acceptance, requested
changes, and the final commit in the same file.
