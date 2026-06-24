# Ocean Water Slice Plan

Incremental improvements from [_docs/ocean-rendering-research.md](../ocean-rendering-research.md).
Each slice is independently shippable; order reflects effort vs. visual payoff.

## Baseline (landed before this plan)

- Offscreen scene color + depth; water pass copies then composites (`sceneEngine`, `waterPass`)
- Column length from `inverse(viewProjection)` depth reconstruction (`water_column_meters`)
- Procedural wave normals, shore foam, material debug views (thickness, shore, normals, foam)
- Single-scalar absorption shaping a heuristic tint (not true RGB extinction)

## Slice A — RGB extinction + in-scatter

**Goal:** Treat water as a participating medium: Beer–Lambert RGB transmission on the lit
scene color plus a simple volume scatter term.

**Shader (`water.wgsl`):**

- `transmittance = exp(-ABSORPTION_RGB * columnMeters * absorptionStrength)`
- `transmitted = sceneColor * transmittance`
- `inscatter = SCATTER_RGB * (1 - transmittance) * scatterStrength * phase(fresnel)`
- Shore/foam still driven by optical thickness derived from transmittance

**CPU:** `waterScatterStrength` in `MaterialOverrides`, wired through `waterPass` and
`SceneViewport3D`. Existing **Water Absorption** slider remains a global multiplier.

**Gate:** Enliah basins — terrain visible through water with red dying in depth; shallow
water milky turquoise. `Water thickness` debug correlates with tint.

**Status:** done

## Slice B — Refraction UV offset

Offset scene-color sample by wave normal: `refr_uv = uv + n.xz * strength * f(shallow)`.
Depth/column length still uses screen UV; only the color sample is refracted.

**Status:** done

## Slice C — Grazing sky / atmosphere reflection

Fresnel mix toward analytic sky color (sun + ambient) at grazing angles. Optional atmosphere
tint uniform from viewport.

**Status:** done

## Slice D — Shore turbidity

In shore band, tint transmitted color toward sediment/murk (`waterTurbidityStrength`).

**Status:** done

## Deferred

- FFT / Tessendorf spectrum
- Terrain-authored shoreline metric (replace heuristic shore factor)
- Full Unreal Single Layer Water coefficient editor
- Removing terrain ocean clamp (separate parity track)

## Debug checklist (every slice)

On Enliah with Render → Material view:

1. **Water thickness** — column correlates with depth tint
2. **Water shore factor** — foam/turbidity align with coast
3. **Water on black** — shell still draws
4. Normal orbit — water readable over below-wl basins
