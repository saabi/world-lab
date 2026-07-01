# Brief — `geometry.plane` orientation + dimensions params

**Type:** std-library gap (user-flagged) · **Packages:** `@virtual-planet/graph`
(`geometry.plane` primitive), `@virtual-planet/procedural-wgsl` (plane WGSL) · **Depends on:**
port defaults ✅ · **Design authority:** `node-model-design-notes.md` §B · **Contract author:**
Opus · **Recommended executor:** Cursor.

## Problem

`geometry.plane` exposes only `resU`/`resV` (subdivision counts) — no **size** or **facing**.
It emits a fixed `[-1,1]` clip-space quad (fullscreen), so it can't stand in for the
deprecated `geometry.fullscreenPlane` in arbitrary placements. Add initial **dimensions** and
**orientation** as node params (the immediate, composable-later win).

## Fix

Add params to `geometry.plane` (with sensible defaults so existing graphs are unchanged):

- **dimensions:** `width`, `height` (default `2`, `2` → the current `[-1,1]` extent).
- **orientation:** a rotation — `rotation` (euler xyz radians, default `0,0,0`) **or** a
  `normal` (default `+Z`); pick one and document it. Default must reproduce today's facing.
- `plane_grid_position` (WGSL) applies width/height scale + orientation to the grid point;
  `evalCPU` (`planeGridMeshPositions`) mirrors it exactly (parity). Keep the fullscreen case
  (`width=height=2`, identity orientation) bit-identical so the ShaderToy sample is unaffected.

> **Design note:** this bakes placement as **params** for convenience now; the elemental
> `transform.*` nodes (separate brief) will later offer the same via composition. Params =
> initial defaults; transforms = composition. Don't build transforms here.

## Gate

1. **graph/procedural-wgsl:** `geometry.plane` at default params emits the **unchanged**
   `[-1,1]` quad (fullscreen sample identical); non-default `width`/`height`/orientation scale
   and rotate the grid; `evalCPU` matches the WGSL at `resU/resV=2` for a rotated, non-unit
   plane. Tests + WGSL validity.
2. `check` **and** `test` green for both packages; keep prior tests green.
3. **Visual ⚠:** a plane with non-default size/orientation renders transformed; the fullscreen
   ShaderToy sample is visually unchanged. Screenshot.

## Out of scope

The `transform.*` node family and `cubeSphere → cube + spherify` decomposition (separate
brief); non-planar/curved placement; per-instance placement (instancing scheduler).

## Handoff

→ `geometry.plane` can be sized and oriented, so it covers arbitrary quad placements and fully
supersedes `geometry.fullscreenPlane`; the transforms family later generalizes it.
