# Brief — Harvest colour transforms from colorlab

**Type:** standard-library expansion · **Packages:** `@virtual-planet/procedural-wgsl`,
`@virtual-planet/graph` · **Depends on:** M3 ✅, procedural-wgsl ✅ · **Design
authority:** [primitive-library.md](../primitive-library.md),
[schema-and-primitives.md](../schema-and-primitives.md) · **Contract author:** Opus ·
**Recommended executor:** Cursor.

## Objective

Port the **per-pixel colour-space transforms** from the user's own
`/home/ushif/repos/colorlab/fe/src/lib/color/` into `procedural-wgsl` `color.*` modules +
graph primitives, growing the Colour palette (group `Effects`). colorlab is the user's repo
— **no external license** concern; still add an ordinary `source: colorlab` provenance
comment in each module. Use `category: Colour` and graph metadata
`keywords: ['Effects', 'Colour']`; do not add an unsupported `group` frontmatter key.

## Source (in `colorlab/fe/src/lib/color/`)

The conversion implementations are in `pipeline.ts`, `transfer.ts`, `adapt.ts`, `cvd.ts`,
`interp.ts`, and `math.ts`; `spaces.test.ts` provides reference values. Spectral datasets
and `fundamentals.ts` are out of scope.

### Slice A — assigned first

| Primitive id | Contract |
|--------------|----------|
| `color.srgbToXyz` / `color.xyzToSrgb` | encoded sRGB `vec3` ↔ fixed-D65 XYZ `vec3`; exact piecewise transfer |
| `color.xyzToLab` / `color.labToXyz` | fixed-D65 XYZ `vec3` ↔ CIELAB `vec3` |
| `color.xyzToLuv` / `color.luvToXyz` | fixed-D65 XYZ `vec3` ↔ CIELUV `vec3` |
| `color.lsrgbToOklab` / `color.oklabToLsrgb` | linear sRGB `vec3` ↔ OKLab `vec3` |
| `color.oklabToOklch` / `color.oklchToOklab` | OKLab `vec3` ↔ OKLCH `vec3`; hue is degrees |
| `color.srgbTransfer` / `color.srgbTransferInv` | linear→encoded and encoded→linear exact sRGB piecewise transfer |

All Slice A primitives are fixed-D65 `vec3 → vec3` conversions with
`metadata.role: colorSpace`. They manually register matching graph `NodePrimitive`s; do
not add a graph→compiler dependency or claim graph registration occurs through the M3
loader.

The transfer pair intentionally coexists with existing approximate gamma-2.2
`color.srgbToLinear` / `color.linearToSrgb`; do not change those existing contracts.
Preserve colorlab's signed cube root in OKLab for negative/out-of-gamut channels.

Freeze evaluated numeric matrices in WGSL/TS and parity-test them; do not implement
runtime matrix inversion in WGSL.

### Slice B — deferred, not part of this assignment

- `color.chromaticAdapt`: `(xyz, srcWhite, dstWhite) -> adapted`, applying Bradford
  internally; not a `colorSpace` swap family because the signature differs.
- `color.simulateCvd`: requires a separately pinned mode representation before work.

## Approach

1. For each Slice A function, add a `procedural-wgsl` module plus a manually registered
   graph primitive with `evalCPU`. Use loader-supported frontmatter only. Put
   `source: colorlab` in an ordinary provenance comment, not an unsupported YAML key.
2. Keep the math identical to colorlab (parity); freeze its evaluated matrix constants.
3. Note: many form **swap families** (the space-conversion contract `vec3 → vec3`) — see
   [node-model-design-notes.md](../node-model-design-notes.md) §C; categorize so the editor
   can group them.

## Gate

1. Each primitive registered + resolvable (module source contains the expected `fn` + a
   `colorlab` provenance note).
2. `evalCPU` numeric parity tests vs the colorlab TS for a few known colours (e.g. sRGB
   white → XYZ D65; a mid-grey round-trips srgb→oklab→srgb within tolerance).
3. No id collisions with existing `color.*` (srgbToLinear/linearToSrgb/hsv2rgb).
4. `npm run check`/`test -w @virtual-planet/procedural-wgsl` + `-w @virtual-planet/graph` green.
5. `loadWgslPrimitive` parses every source and its inferred mechanical contract matches
   the manually registered primitive. The standard-library resolver resolves every
   module; imports/dependencies are empty or explicitly registered.

## Out of scope

Gamut *mapping* / boundary generation (complex, not per-pixel — later if needed); the
colorlab UI; a colour-picker node. **Per-pixel conversions only.**

## Handoff

→ A rich, perceptually-correct colour toolkit (OKLab/OKLCH especially) for effects and
material authoring — each a schema-driven `color.*` primitive, swap-family-grouped.

Do not commit. Write Slice A results to
[`../handoffs/M-colorlab-harvest-a.md`](../handoffs/M-colorlab-harvest-a.md) before
yielding.
