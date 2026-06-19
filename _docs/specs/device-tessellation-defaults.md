# Device-class tessellation defaults — don't brick mobile on first frame

**Status:** Layers 1–2 landed · **Scope:** `patches/tessellationSettings.ts` (presets),
`patches/deviceProfile.ts` (detection), `patches/deviceTessellation.ts` (persistence
+ boot sentinel), `components/PlanetViewport.svelte` (apply on mount + arm/commit) ·
**Driver:** the tessellation default is desktop-grade (8M
vertex budget, auto resolution up to 96, depth 6). On a weak mobile GPU the
**first frame can exceed the frame-time watchdog → TDR → device-lost / tab
crash** — before the user can reach the sliders to lower it. The setting is a
**device** property, not a planet property, so the fix is a safe per-device
starting point, beginning with a desktop/mobile split.

## Framing: device preference, not planet parameter

Tessellation describes *how well this device can draw*, not *what the planet is*.
Two phones loading the same shared planet doc should each pick their own quality.
So it must **not** go in the planet snapshot (`documents/`); when we persist it,
it belongs in a device-scoped `localStorage` key (e.g. `vp.deviceTessellation`),
separate from the document. This spec covers only the **initial** preset; see
[Persistence & the brick loop](#persistence--the-brick-loop) for why persistence
needs more than a storage helper.

## What actually crashes (so we pick the right lever)

The patch-descriptor ring buffer is tiny (`MAX_CUBE_PATCHES × 32` = 128 KB); the
cost is **render throughput** — an instanced draw emitting `res² × 6` vertices
per patch across thousands of patches. So:

- **`adapter.limits` won't predict this.** Limits catch OOM (buffer sizes), but
  this is a throughput failure. A phone and a laptop can report identical limits
  and sustain 10× different triangle rates. Limits give a hard *ceiling*, not the
  perf sweet spot.
- **The dominant levers are the ones the sliders already expose:** vertex budget,
  `maxPatchResolution`, `maxDepth`, detail. A safe mobile preset simply starts low
  on all four.

## Detecting "mobile" (reliably enough)

We can't measure GPU perf before launching the renderer, but we *can* classify
the device. No single signal is authoritative, so combine a few and **bias toward
"mobile" when ambiguous** — a capable tablet that starts conservative just looks
coarse for a moment (and a future watchdog ramps it up), whereas a weak device
that starts high bricks.

| Signal | Verdict |
|---|---|
| `navigator.userAgentData?.mobile` (UA Client Hints) | ✅ **Primary.** Purpose-built boolean. Chromium/Android. `undefined` in Safari/Firefox → fall through. |
| `navigator.userAgent` regex (`/Android\|iPhone\|iPad\|iPod\|Windows Phone\|webOS\|BlackBerry\|Opera Mini\|IEMobile\|Mobile/i`) | ✅ **Fallback.** Covers Safari/Firefox where UA-CH is absent. Known gap: **iPadOS Safari reports a desktop Mac UA** (no `iPad` token since iPadOS 13) → missed by the regex alone. |
| `navigator.maxTouchPoints > 1` on a `Macintosh` UA | ✅ **iPad catch.** Closes the iPadOS-masquerade gap: a "Mac" with multi-touch is an iPad. **Cannot false-positive touch desktops/laptops** — Windows/ChromeOS touch devices don't report `Macintosh`, and real Macs have no touchscreen (`maxTouchPoints === 0`; the Touch Bar doesn't count). `> 1` (not `> 0`) requires genuine multi-touch as an extra guard. |
| `window.devicePixelRatio ≠ 1` (CSS-px vs device-px) | ❌ **Rejected.** Every Retina/HiDPI/scaled-4K desktop reports DPR 1.25–2. Huge false-positive rate. Do **not** use as a mobile signal. |
| `matchMedia('(pointer: coarse)') && (hover: none)` | ⚪ Not used (kept as a note). Cross-browser touch-primary signal, but touchscreen laptops also report coarse; UA-string is the chosen fallback instead. |
| `navigator.deviceMemory`, `hardwareConcurrency`, screen size | ⚪ Quantized/capped for privacy; not mobile-specific. Useful later for *grading within* a class, not for the class itself. |

**Proposed rule** (`isMobileDevice()`):

```
1. if typeof navigator.userAgentData?.mobile === 'boolean' → return it.  (authoritative)
2. ua = navigator.userAgent
   mobile if /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile|Mobile/i.test(ua)
3. iPad catch: || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
default desktop.
```

All of this is **client-only** — guard with `browser` (`$app/environment`);
return `false` (desktop) under SSR/tests where `navigator` is absent.

## Presets

```ts
// tessellationSettings.ts
export const DEFAULT_TESSELLATION: TessellationSettings = {   // desktop — unchanged
  detail: 1, vertexBudgetMillions: 8, maxPatchResolution: 0, maxDepth: 0,
};

export const MOBILE_TESSELLATION: TessellationSettings = {    // safe floor (tunable)
  detail: 0.5, vertexBudgetMillions: 0.15, maxPatchResolution: 16, maxDepth: 4,
};
```

Mobile numbers follow the manual starting point validated in the
mobile-tessellation-controls work (~100–150k verts, res ≤ 16, depth 4). They are
a **proposed floor pending on-device validation** — the exact values are a tuning
knob, not load-bearing for the architecture.

## Wiring

`PlanetViewport.svelte` initializes `tessellation` at line 81:

```ts
let tessellation = $state<TessellationSettings>({ ...DEFAULT_TESSELLATION });
```

Apply the device preset in `onMount` (browser-only, before the backend/render
loop starts) rather than in the `$state` initializer, to avoid any SSR/hydration
mismatch and keep `matchMedia` off the server path:

```ts
onMount(() => {
  if (!browser || !canvas) return;
  tessellation = initialTessellationSettings();   // desktop default or mobile floor
  // …existing backend init…
});
```

`initialTessellationSettings()` lives in `deviceProfile.ts`:
`isMobileDevice() ? { ...MOBILE_TESSELLATION } : { ...DEFAULT_TESSELLATION }`.
(Later it will first consult the persisted device pref; see below.)

## File-by-file

| File | Change |
|---|---|
| `patches/tessellationSettings.ts` | Add `MOBILE_TESSELLATION`. Desktop `DEFAULT_TESSELLATION` unchanged. |
| `patches/deviceProfile.ts` *(new)* | `isMobileDevice()` (UA-CH → UA-string, `browser`-guarded) + `initialTessellationSettings()`. Testable: `navigator` reads behind the guard. |
| `components/PlanetViewport.svelte` | In `onMount`, set `tessellation = initialTessellationSettings()` before backend init. |
| `patches/deviceProfile.test.ts` *(new)* | Mock `navigator`: UA-CH `mobile:true`→mobile, `mobile:false`→desktop (wins over UA); no UA-CH + Android/iPhone UA→mobile; desktop Chrome UA→desktop; iPadOS (Mac UA + `maxTouchPoints>1`)→mobile *(if the iPad catch is included)*; SSR (`!browser`)→desktop. |

## Persistence & the brick loop

Device-class detection picks a *better starting point* — it does **not** make the
setting safe to persist. Detection is heuristic (weak integrated-GPU laptops exist
on the desktop side; strong tablets on the mobile side), and once we save a
user-chosen value, a too-high one would reload straight back into the crash. So
persistence requires the safety net from the earlier discussion, layered on top:

1. ✅ **Device-class default.** Mobile starts at the floor; desktop keeps today's
   behavior. *Necessary, not sufficient.* (`deviceProfile.ts`)
2. ✅ **Boot sentinel + device-scoped persistence** (`deviceTessellation.ts`).
   `armDeviceTessellation` writes `{settings, status:'attempting'}` to
   `vp.deviceTessellation` before the first heavy render; after the app survives a
   grace window (`TESSELLATION_COMMIT_GRACE_MS` of rendered life with no crash),
   `commitDeviceTessellation` flips it to `committed`. On load, `decideTessellation`:
   committed → trust; uncommitted attempt → last session crashed → floor + notice
   ("Reduced quality after a render problem"); none/corrupt → device-class default.
   Robust to a *hard* tab crash (no commit ever runs). Re-armed on every settings
   change; commit timer cleared on teardown.
3. ⏳ **`device.lost` handler.** On a clean loss, drop to the floor and re-init.
   *(Not yet — needs `WebGPUBackend` to surface `device.lost`. Until then the
   sentinel still catches the crash on the next load.)*
4. ⏳ **Watchdog auto-tune.** Start at the floor, sample frame time, step quality up
   only while frames stay under budget; back off + lock on a spike or loss. The real
   answer to "render as best they can," converging empirically where capability
   detection can't.
5. ⏳ **Escape hatch.** `?tess=safe` query param / modifier-key on load that ignores
   persistence.

## Risks / open checks

- **Touchscreen laptops / Surface-style 2-in-1s** classify as mobile and start
  conservative. Acceptable (safe direction); the watchdog later corrects upward.
- **Weak desktops** (old integrated GPUs) still get the 8M default and could crash.
  Not solved here — that's what the sentinel + watchdog cover. Flagged, not fixed.
- **Hydration.** Applying in `onMount` (not the `$state` initializer) keeps SSR
  rendering the desktop default and avoids a mismatch; confirm no flash of
  high-detail before the mount-time reassignment (the renderer starts in the same
  `onMount`, so the first frame already uses the device preset).

## Payoff

A weak mobile device boots into a renderable mesh and can reach the controls,
instead of crashing on the first frame with no way back. Desktops are unchanged.
This is Layer 1 of the safety stack; it makes the feature usable on phones today
and is the prerequisite for safely persisting the device preference later.
