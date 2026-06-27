# Brief — Harvest Use.GPU WGSL functions into primitives

**Type:** standard-library expansion · **Package:** `@virtual-planet/procedural-wgsl`,
`@virtual-planet/graph` · **Depends on:** M3 ✅, procedural-wgsl ✅ · **Design
authority:** [wgsl-parsing-and-codegen.md](../wgsl-parsing-and-codegen.md) (Use.GPU is
*reference*, used **behind our abstractions** — not a core dependency),
[schema-and-primitives.md](../schema-and-primitives.md) · **Contract author:** Opus ·
**Recommended executor:** Cursor.

## Objective

Port broadly-useful WGSL functions from **Use.GPU**'s shader library into `procedural-wgsl`
modules + graph primitives — noise, SDFs, colour-space, easing/sampling helpers — to grow
the standard library quickly with proven code. Consistent with the ADR: we **port function
source** into our own modules; we do **not** add a runtime dependency on `@use-gpu/*`, and
we expose **no** Use.GPU types.

## Licensing — verify first (blocking)

Before copying any code: **confirm Use.GPU's license** (check its repo `LICENSE`; widely
MIT, but verify the specific package/files) and that it permits redistribution with
attribution. Then:

- include the upstream **license header / attribution** in each ported module file,
- record provenance in the module frontmatter (`source: use.gpu`, original symbol name),
- if any file is not permissively licensed, **skip it** and author an equivalent instead.

Do not proceed with a file whose license is unclear. (This is the one hard gate on this
task; the WGSL itself is mechanical.)

## Candidate functions (port the license-clean, broadly-useful ones)

| Category | Examples | Primitive ids (suggested) |
|----------|----------|---------------------------|
| Noise | simplex 2D/3D, gradient/curl noise (where ours lacks them) | `noise.simplex2d`, `noise.curl` |
| SDF (2D/3D) | circle, box, segment, round, union/subtract/intersect | `sdf.circle`, `sdf.box`, `sdf.opUnion`, … |
| Colour | sRGB↔linear, HSL/HSV, tone-map helpers | `color.srgbToLinear`, `color.hsv2rgb`, … |
| Math/sampling | easing curves, hash, remap helpers (only if not already present) | `math.easeInOut`, `util.hash2` |

Skip anything Virtual Planet already has (perlin3d, worley, fbm, remap, clamp, smoothstep,
mix, add, multiply, pow, bias, gain — see `packages/graph/src/primitives/`) to avoid
duplicates.

## Approach

1. For each chosen function: create a `procedural-wgsl` module (WGSL body + YAML
   frontmatter: id, entry, typed inputs/outputs, attribution/provenance), register a graph
   primitive via the M3 loader. Provide `evalCPU` where cheap (SDFs, colour, easing are
   trivial to mirror; noise optional).
2. Adapt GLSL→WGSL if the upstream is GLSL; keep semantics identical.
3. Categorize in the palette (`category` frontmatter) — `SDF`, `Colour`, `Noise`, etc.

## Gate

1. Each ported primitive registered + resolvable (module source contains its `fn`, plus an
   attribution header).
2. `evalCPU` numeric tests for the ported SDF/colour/easing primitives (e.g.
   `sdf.circle((0,0), r=1) == -1`; `color.srgbToLinear` known value).
3. No id collisions with existing primitives.
4. `npm run check`/`test -w @virtual-planet/procedural-wgsl` + `-w @virtual-planet/graph` green.

## Out of scope

Any `@use-gpu/*` runtime/package dependency; the linker adapter (separate, ADR); porting
Use.GPU's React-like runtime. **Attribution + license compliance are mandatory, not
optional.**

## Handoff

→ A richer standard library (SDFs especially) makes ShaderToy-style effects and procedural
authoring far more expressive with no engine changes — each is just another schema-driven
primitive.
