# Brief — Harvest planet-shader functions into primitives

**Type:** standard-library expansion (feeds planet PoC P2) · **Packages:**
`@virtual-planet/procedural-wgsl` (WGSL modules), `@virtual-planet/graph` (primitives) ·
**Depends on:** M3 ✅ (self-describing loader), procedural-wgsl library ✅ ·
**Design authority:**
[planet-shaping-pipeline-graph.md](../../planet-shaping-pipeline-graph.md),
[wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md),
[planet-pipeline-poc-feasibility.md](../planet-pipeline-poc-feasibility.md) · **Contract
author:** Opus · **Recommended executor:** Cursor.

## Objective

Port the **existing, working** planet WGSL functions into `procedural-wgsl` modules +
graph primitives — so the planet shaping graph (P2 of the planet PoC) is assembled from
real, parity-correct nodes rather than re-derived math. The functions already exist and are
correct; harvesting **references the same source** so the math is identical *by
construction* (the top PoC risk — numerical parity — is mitigated by not re-deriving).

## Source functions (in `fe/src/lib/planet/gpu/wgsl/planet/` + `terrain/`)

Per the shaping-pipeline node list:

| Function (source) | Primitive id | Notes |
|-------------------|--------------|-------|
| distortion FBM (kernel) | `terrain.domainWarp` | macro coord warp |
| Voronoi macro cells (kernel) | `terrain.voronoi` | macro relief |
| detail FBM (kernel) | `terrain.detailFbm` | fine relief |
| height remap + water + erosion (kernel) | `terrain.heightRemap` | → `world_radius_meters` |
| fine texture noise (material) | `terrain.fineTextureNoise` | fragment relief layer |
| polar term (material/kernel) | `terrain.polarTerm` | pseudo-latitude |
| `surface_material` (material) | `terrain.biomeMaterial` | albedo/roughness/water |
| `planet_surface_normal` (normal) | `terrain.normalEstimator` | finite-difference |
| world/body normal rotate | `terrain.worldNormal` | uses planetRotation |
| `terrain_sun_shadow` (shadow) | `terrain.selfShadow` | self-shadow factor |
| `evaluate_pbr` (lighting) | `material.pbrLighting` | lit color |
| `cube_face_uv_to_unit_dir` (terrain) | `surface.cubeFaceDir` | (may already exist via M11.1) |

(Group `sample_planet` itself as a composition of `domainWarp → voronoi → detailFbm →
heightRemap`, matching `kernel.wgsl`.)

## Approach (parity by reference, not re-derivation)

1. **Move/copy** each WGSL function into a `procedural-wgsl` module file with YAML
   frontmatter (id, entry, inputs with **coordinate-space** semantics — body_dir, world_pos,
   etc., per M1 spaces — and params with units/scale-tags per the param ADR). Keep the body
   verbatim from the planet source; do not rewrite the math.
2. Register each as a graph primitive (schema from frontmatter via the M3 loader). `evalCPU`
   is **optional** here — many of these are GPU-stage functions; provide CPU evaluators only
   where cheap/useful for preview (e.g. height sample). Where the WGSL must stay the source
   of truth, the primitive is WGSL-only (no evalCPU) — that is allowed.
3. Preserve the **scale-behavior tags** (`freq`/`ratioR`/`pure`/`R_ref`/`flag`/`length`)
   from `planet-shaping-pipeline-graph.md` on the params (param ADR).

## Constraint: do not regress the live renderer

`fe/`'s existing shaders keep working unchanged. If a function is *moved* into
procedural-wgsl, the planet shader must still resolve it (via include or the resolver);
**prefer copy** (procedural-wgsl gets its own copy) over move for this PoC to avoid touching
the live render path. A later consolidation can dedupe once the graph renders at parity
(that is the M13 migration, gated separately).

## Gate

1. Each listed primitive is registered; `getPrimitive('terrain.heightRemap')` etc. defined
   with correct ports + coordinate-space tags.
2. `createStandardLibraryResolver` resolves each module id to source containing the expected
   `fn`.
3. For functions with an `evalCPU`, a numeric parity test vs the documented formula (e.g.
   heightRemap on known inputs). WGSL-only primitives: assert the module compiles where a
   device exists (`wgslCompile.test.ts` pattern), else source-presence.
4. `npm run check`/`test -w @virtual-planet/procedural-wgsl` + `-w @virtual-planet/graph` green.

## Out of scope

Wiring these into a rendered planet (planet PoC P3–P5); deduping the live `fe/` shaders
(M13). **No rewrite of the math — port verbatim.**

## Handoff

→ The planet shaping node set exists as primitives. Planet PoC **P2** (numerical parity of
the shaping graph) and **P1** (tessellator composition) can now be assembled from real
nodes.
