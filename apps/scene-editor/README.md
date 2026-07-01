# Scene Editor

Part of [World Lab](../../README.md). SvelteKit 2 + Svelte 5 (runes) + TypeScript + WebGPU.
The current scene / solar-system / planet-renderer app — its renderer subsystem is named
**Virtual Planet**; a public product name for the app itself is still open.

Primary routes: **`/scene`** (editor + renderer), **`/solar-systems`** (SunDog galaxy map).
`/planet` and `/old` redirect to `/scene` (retired).

**Public deployment domain:** not yet finalized (see [ROADMAP](../../ROADMAP.md)).

## Local development

```sh
npm run dev
npm run check
npm test
```

Optional: copy `.env.example` to `.env` for local configuration (see below).

## Environment variables

`vite.config.ts` sets `envPrefix: ['VITE_', 'PUBLIC_']`, so `PUBLIC_*` variables are inlined at **build time**.

| Variable | Purpose |
|----------|---------|
| `PUBLIC_SITE_URL` | Public canonical origin for social preview metadata |
| `PUBLIC_UMAMI_SRC` | Umami tracker script URL |
| `PUBLIC_UMAMI_WEBSITE_ID` | Umami website ID |

Set `PUBLIC_SITE_URL` to the production origin so social preview URLs are absolute and canonical. Set **both** Umami variables to enable cookieless analytics; leave them unset for zero tracking. See [`.env.example`](.env.example).

```sh
PUBLIC_SITE_URL=https://example.com \
PUBLIC_UMAMI_SRC=https://umami.example.com/script.js \
PUBLIC_UMAMI_WEBSITE_ID=<uuid> \
npm run build
```

## Production build and run

```sh
npm run build
npm start
```

The Node server listens on `PORT` (default `3000`) and `HOST` (default `0.0.0.0`). Set `ORIGIN` or `PUBLIC_SITE_URL` to the public URL when deploying behind a reverse proxy.

### PM2

From the repo root:

```sh
cd apps/scene-editor && npm run build
pm2 start ../../ecosystem.config.cjs
```

Set `ORIGIN`, `PUBLIC_SITE_URL`, `PUBLIC_UMAMI_SRC`, and `PUBLIC_UMAMI_WEBSITE_ID` in the PM2 environment (or in `.env` before build) for production analytics and canonical URLs.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Current limitations

- Camera near/far planes don't yet account for all objects visible on screen (see
  `_docs/pending_issues.md`).
- The planet can disappear when close to the surface and looking up (near/far or fog
  interaction; tracked in `_docs/pending_issues.md`).
- The public product name and deployment domain are still open.

## Roadmap

Mid-term, this app's shaping pipeline is intended to migrate onto the procedural-graph
engine (`@virtual-planet/graph` + friends, currently developed in `apps/webgputoy`)
incrementally — gated so the live rendering gates here never regress. See the root
[ROADMAP.md](../../ROADMAP.md) and `AGENTS.md`'s wave-integration rules for the gate
checklist this app's changes are held to.
