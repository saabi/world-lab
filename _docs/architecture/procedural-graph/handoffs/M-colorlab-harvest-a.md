# Handoff — M-colorlab-harvest slice A

**Brief:** [`../briefs/M-colorlab-harvest.md`](../briefs/M-colorlab-harvest.md)
**Assigned executor:** Cursor agent C1
**State:** complete

## Result

Slice A landed: **14 graph primitives** + **15 WGSL modules** (12 entry modules + resolver-only `color.colorlabCommon`). All fixed-D65 `vec3 → vec3` conversions with `metadata.role: colorSpace`, exact sRGB piecewise transfer pair coexisting with approximate gamma-2.2 `color.srgbToLinear` / `color.linearToSrgb`.

| Primitive | Notes |
|-----------|-------|
| `color.srgbTransfer` / `color.srgbTransferInv` | Exact piecewise sRGB OETF/EOTF per channel |
| `color.srgbToXyz` / `color.xyzToSrgb` | Encoded sRGB ↔ D65 XYZ via frozen `SRGB2XYZ` / `XYZ2SRGB` |
| `color.xyzToLab` / `color.labToXyz` | CIELAB (D65) |
| `color.xyzToLuv` / `color.luvToXyz` | CIELUV (D65) |
| `color.lsrgbToOklab` / `color.oklabToLsrgb` | OKLab with signed cube root for negative channels |
| `color.oklabToOklch` / `color.oklchToOklab` | OKLCH; hue in degrees |

## Files changed

**`@virtual-planet/graph`**
- `packages/graph/src/primitives/color/constants.ts` — frozen D65, sRGB/OKLab matrices
- `packages/graph/src/primitives/color/evalColorlab.ts` — CPU evaluators mirroring colorlab
- `packages/graph/src/primitives/color/colorlabHarvest.ts` — 14 primitive registrations
- `packages/graph/src/primitives/color/parityFixtures.ts` — 23 independent exact parity vectors
- `packages/graph/src/primitives/color/colorlab.test.ts` — registration, role, parity, round-trip tests
- `packages/graph/src/primitives/color/index.ts` — imports harvest
- `packages/graph/src/index.ts` — exports `COLORLAB_CPU_PARITY`

**`@virtual-planet/procedural-wgsl`**
- `packages/procedural-wgsl/src/modules/color/colorlabHarvest.ts` — common deps + 12 self-describing modules
- `packages/procedural-wgsl/src/modules/color/colorlab-harvest.test.ts` — loader/linker contract tests
- `packages/procedural-wgsl/src/modules/color/index.ts` — exports
- `packages/procedural-wgsl/src/modules/index.ts` — standard library registration
- `packages/procedural-wgsl/src/index.test.ts` — `STANDARD_LIBRARY_ENTRIES` + `color.colorlabCommon` resolver-only

## Gates run

```sh
npm run check -w @virtual-planet/graph      # ✅
npm test -w @virtual-planet/graph         # ✅ 89/89
npm run check -w @virtual-planet/procedural-wgsl  # ✅
npm test -w @virtual-planet/procedural-wgsl       # ✅ 91/91
```

## Contract compliance

1. ✅ All 14 primitives registered; no id collisions with `color.srgbToLinear`, `color.linearToSrgb`, `color.hsv2rgb`
2. ✅ `evalCPU` exact parity vs hard-coded fixtures (frozen-matrix semantics)
3. ✅ `loadWgslPrimitive` mechanical contract matches graph registration for every harvest module
4. ✅ `color.colorlabCommon` resolver-only; `@use` / `dependencies` aligned on dependent modules
5. ✅ `source: colorlab` provenance comment in every module; no unsupported `group` frontmatter key
6. ✅ Matrices frozen in TS/WGSL — no runtime inversion in WGSL
7. ✅ Slice B (chromaticAdapt, simulateCvd) not started

## Unresolved issues

None.

## Working-tree notes

Pre-existing unrelated dirty files (camera HTML, tsbuildinfo) excluded from this commit.

## Reviewer decision

Pending.

## Commit record

This commit.
