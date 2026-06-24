# Scene orbital spaceflight

Orbital spaceflight in `/scene` uses a shared physics module (`fe/src/lib/planet/flight/`) and a Subdivide **Flight** panel — no HUD overlays on the 3D viewport.

## Layout

The scene editor default layout (v2) adds a **flight deck** pane along the bottom (~22% height). Persisted layouts at v1 fall back to the v2 default.

## Session state

Ship pose, RCS mode, thrust settings, and target body are **viewport session state** — not stored in `PlanetScene` JSON. See [body-vs-viewport-state.md](body-vs-viewport-state.md).

## RCS modes

Gamepads expose four analog axes; full 6-DOF uses a switchable **translate / rotate** mode (`R` or L3).

### Translate mode

| Axis | Keyboard | Gamepad |
|------|----------|---------|
| Forward / back | W / S | Left stick Y |
| Strafe | A / D | Left stick X |
| Up / down | Space / Ctrl | Right stick Y |

### Rotate mode

| Axis | Keyboard | Gamepad |
|------|----------|---------|
| Pitch | W / S | Left stick Y |
| Yaw | A / D | Left stick X |
| Roll | Q / E | Right stick X |

Shared: **Shift** or **RT** boost · **Esc** exit · pointer lock for fine trim in rotate mode.

## Simulation

- Single dominant-body gravity (`μ = g·R²`, default `g = 9.8`).
- Target body select or auto (nearest).
- Scene `clock` advances with simulation dt while spaceflight is active.
- Orbit predictor worker drives the flight-panel monitor canvas.

## Atmospheric entry (Wave E)

Inside a body's atmosphere shell, density from the same exponential model as rendering (`atmosphereDensity.ts`) applies drag, angular damping, and reduced RCS authority. Regimes: **vacuum → transition → atmosphere** with hysteresis at the shell boundary.

## Files

| Module | Role |
|--------|------|
| `flight/controls.ts` | Keyboard + mode switch |
| `flight/gamepad.ts` | Gamepad polling |
| `flight/propagate.ts` | 6-DOF integrator |
| `flight/atmosphereFlight.ts` | Entry physics |
| `scene-editor/FlightPanel.svelte` | Flight deck UI |
