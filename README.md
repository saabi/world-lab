# virtual_planet

Procedural planet renderer — **SvelteKit 2 + Svelte 5** monorepo.

| Directory | Role |
|-----------|------|
| **`fe/`** | Active app (SvelteKit 2, Svelte 5 runes, TypeScript, WebGPU) |
| **`packages/*`** | Shared libraries (e.g. `@virtual-planet/schema`) |
| **`fe.old/`** | Archived Sapper / Svelte 3 reference (not a workspace) |

## Commands

Requires **Node.js ≥ 22** (see `fe/.nvmrc`). Install from repo root; run app commands from **`fe/`**:

```sh
cd fe
npm install
npm run dev
npm run build
npm run check
npm test
```

## Routes

- **`/scene`** — scene / solar-system editor (primary)
- **`/solar-systems`** — SunDog galaxy map
- **`/planet`**, **`/old`** — retired (redirect to `/scene`)

See **`AGENTS.md`** for architecture and agent workflow.

## History

Git history on `main` is the original Color Lab `test/planet-editor` branch. See `EXTRACTION.md`.
