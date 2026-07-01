# Brief — Unified graph document system (named save/load + samples + layout)

**Type:** editor infrastructure (supersedes `M-per-graph-layout.md`) · **Packages:**
`@virtual-planet/graph-editor` (`documentStorage.ts`, `samples.ts`, `GraphEditor.svelte`,
new document-list UI) · **Depends on:** layout persistence ✅, samples ✅ · **Design
authority:** `editor.md`, roadmap **M14** (document/session model) · **Contract author:**
Opus · **Recommended executor:** Cursor (phase it) · **Status:** DONE `7cf7d0a`

## Problem (audit)

Storage and samples are **separate ad-hoc paths**:
- `documentStorage.ts` — a **single** localStorage slot (`GRAPH_EDITOR_STORAGE_KEY`); Save
  overwrites it, Load reads it; `formatGraphForDownload`/`parseGraphFile` handle the file as a
  **bare `GraphDocument`**. No named documents.
- `samples.ts` — bundled examples as `build(): GraphDocument` functions, loaded via a separate
  dropdown.
- Pane **layout** persists editor-wide as "chrome", decoupled from any graph.

Unify these into one artifact format + one save/load UX covering **named documents, uploads,
and bundled samples**, with the pane layout riding the artifact.

## Artifact format (one wrapper, everywhere)

```ts
export interface GraphArtifact {
	version: string;
	name: string;                 // user/sample name
	graph: GraphDocument;         // pure IR (nodes/edges) — unchanged schema
	layout?: LayoutDocument;      // pane layout (optional)
	meta?: { createdAt?: string; updatedAt?: string; sample?: boolean };
}
```
Used for **storage, download, upload, and samples**. `parseGraphFile` accepts the wrapper
**and** a bare `GraphDocument` (back-compat → `{ graph }`).

## Phases

- **P1 — Wrapper + named store.** `documentStorage`: keyed named documents (`saveDocument(artifact)`,
  `listDocuments()`, `loadDocument(name)`, `deleteDocument(name)`, `renameDocument`), plus
  download/upload of a `GraphArtifact`. Migrate the existing single-slot value into one named
  doc on first run. Tests.
- **P2 — Samples as artifacts.** Samples become read-only `GraphArtifact`s (keep the `build()`
  producers, wrap their output with a `name` + `sample: true`) surfaced in the **same** document
  list as "examples" (loadable, not overwritable). One list, one load UX.
- **P3 — Document-list UI** (`GraphEditor.svelte` + a `DocumentList` component): New / Save /
  Save As (named) / Load (from list) / Rename / Delete / Download / Upload; samples shown as a
  read-only section. Replaces the ad-hoc Save/Load/sample-dropdown buttons.
- **P4 — Layout in the artifact + load toggle.** The current pane layout is saved into the
  artifact; on load, a toggle (default ON, persisted in chrome) applies the doc's layout, else
  the default layout. (This is the entire scope of the deferred `M-per-graph-layout` — folded
  in here.)

## Gate

1. **Storage (unit):** round-trip `GraphArtifact` (graph + layout + name) through
   save/load/list/delete/rename; `parseGraphFile` accepts wrapper **and** bare graph; the old
   single-slot value migrates to a named doc. Tests.
2. **Samples:** every sample loads via the unified list as a read-only artifact and validates
   (`validateGraphFull.ok`).
3. `check` **and** `test` green for `graph-editor`; keep all prior tests green.
4. **Visual ⚠:** name + save a doc; it appears in the list; load it (layout restored per the
   toggle); a sample loads read-only; download/upload round-trips the artifact. Screenshot.

## Out of scope

Cloud/remote persistence, multi-user, versioning/history (roadmap M14+); embedding layout in
the pure `GraphDocument` schema (stays in the wrapper); collaborative sessions.

## Handoff

→ One artifact format and one save/load surface for named documents, uploads, and samples,
with pane layout bound to each document. Supersedes `M-per-graph-layout.md`; sets up the M14
document/session model.
