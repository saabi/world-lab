# Brief — Colorlab harvest, Slice B (chromatic adaptation)

**Type:** standard-library expansion · **Packages:** `@world-lab/procedural-wgsl`,
`@world-lab/graph` · **Depends on:** Slice A ✅ landed (`9fbc58a`) · **Design authority:**
[M-colorlab-harvest.md](./M-colorlab-harvest.md) (this brief picks up its deferred "Slice B,"
rewritten for the current `@world-lab/*` scope; follow its Slice A section as the exact
pattern for module + primitive shape) · **Contract author:** Opus · **Recommended executor:**
Cursor · **Status:** ready to route

## Objective

Slice A landed 14 fixed-D65 colour-space conversion primitives
(`color.srgbToXyz`/`color.xyzToLab`/etc.) from `/home/ushif/repos/colorlab/fe/src/lib/color/`.
Its own brief deferred two items as "Slice B" — this brief picks up **one** of them:
`color.chromaticAdapt`. The other, `color.simulateCvd`, stays deferred — it needs a mode
representation (protanopia/deuteranopia/tritanopia, and severity) pinned as a design decision
before it's briefable; don't invent one here.

## Source

`colorlab/fe/src/lib/color/adapt.ts` — von Kries chromatic adaptation via the Bradford
transform. Reference values/round-trips: check for a corresponding section in
`spaces.test.ts` (Slice A's handoff, `handoffs/M-colorlab-harvest-a.md`, notes which files
were used as reference — follow the same sourcing discipline: freeze evaluated matrix
constants, don't reimplement Bradford's matrix inversion in WGSL).

## Contract

- `color.chromaticAdapt`: `(xyz: vec3f, srcWhite: vec3f, dstWhite: vec3f) -> vec3f` — XYZ
  under `srcWhite`'s illuminant, adapted to appear correct under `dstWhite`'s illuminant.
  This is **not** a `colorSpace` swap-family member like Slice A's conversions — its signature
  takes two extra vec3f params (source/destination white points), so it doesn't fit the
  `vec3 → vec3` swap-family contract Slice A primitives share. Register it as an ordinary
  primitive (`category: Colour`, `keywords: ['Effects', 'Colour']`), not part of that family.
- Common illuminant white points (D65, D50 at minimum — check colorlab's `adapt.ts` for which
  it hardcodes/exports) should be exposed as sensible default `vec3f` param values so the
  common D65→D50 (or reverse) case doesn't require the user to type raw tristimulus values by
  hand.
- Same discipline as Slice A: `procedural-wgsl` module + manually registered graph
  `NodePrimitive` with `evalCPU`, `source: colorlab` provenance comment (ordinary comment, not
  an unsupported YAML frontmatter key), frozen evaluated Bradford matrix constants in both
  WGSL and TS (no runtime matrix inversion in WGSL).

## Gate

1. Primitive registered + resolvable; module source contains the expected `fn` + a
   `colorlab` provenance note.
2. `evalCPU` numeric parity vs. the colorlab TS for at least one known adaptation (e.g. D65
   white → adapted to D50 white should reproduce colorlab's own reference output within
   tolerance); identity case (`srcWhite === dstWhite`) returns the input unchanged.
3. No id collision with existing `color.*` primitives (14 from Slice A + the two pre-existing
   `srgbToLinear`/`linearToSrgb`).
4. `check` **and** `test` green for `procedural-wgsl` and `graph`, and the full workspace.
5. `loadWgslPrimitive` parses the new module and its inferred mechanical contract matches the
   manually registered primitive; the standard-library resolver resolves it with no
   unregistered dependencies.

## Out of scope

`color.simulateCvd` (deferred — needs a pinned mode representation first, not part of this
assignment); gamut mapping/boundary generation; a colour-picker UI node; any change to Slice
A's existing 14 primitives or their contracts.

## Handoff

→ Chromatic adaptation completes the practically-useful half of colorlab's per-pixel colour
toolkit (conversion + adaptation); CVD simulation remains the one deliberately-deferred piece,
pending its own design brief for the mode representation.
