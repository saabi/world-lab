# @virtual-planet/schema

Schema / type-system extension for the scene model.

A thin **functional, curried, plain-data** factory layer over
[TypeBox](https://github.com/sinclairzx81/typebox) (`Type.*` returns
introspectable JSON-Schema objects with static inference), enriched with **domain
annotations** standard validation libraries lack:

- **units** (`intWithUnit`: km / kg / s …),
- **extents** (min/max with UI intent),
- **path refs** (`/methods/orbit`, `../`) for drivers + per-channel transform inheritance.

One schema then serves four jobs at once: **introspectable** (UI / form generation),
**validatable** (runtime), **inferrable** (static types), and **serializable**
(mountable / swappable at runtime).

See `_docs/specs/scene-routing.md` and `_docs/specs/solar-system-model.md` for the
design context.

> **Status:** scaffold. The TypeBox layer + domain factories land next.
