import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

// A functional, plain-data schema layer over TypeBox. TypeBox's `Type.*` already
// returns introspectable JSON-Schema objects with static inference; here we add the
// domain annotations standard validators lack — units, extents, and path refs —
// carried as `x-*` keys on the *same* schema object. So one value is at once:
// validatable (Value.Check), introspectable (annotationsOf → UI/form gen),
// inferrable (Static), and serializable (plain JSON, round-trips). See
// _docs/specs/scene-routing.md.

export { Type, Value, type Static, type TSchema };

/** Annotation keys (JSON-Schema `x-*` extensions). */
export const X_UNIT = 'x-unit';
export const X_EXTENT = 'x-extent';
export const X_REF = 'x-ref';
export const X_WIDGET = 'x-widget';

/** Physical unit for a quantity. `none` = dimensionless (e.g. eccentricity). */
export type Unit = 'none' | 'm' | 'km' | 'kg' | 's' | 'rad' | 'deg';

export interface QuantityOptions {
	/** Inclusive lower bound. */
	min?: number;
	/** Inclusive upper bound. */
	max?: number;
	/** Default value (also a JSON-Schema `default`). */
	default?: number;
	/** Restrict to whole numbers. */
	integer?: boolean;
	description?: string;
	/** Widget hint for the form generator. */
	widget?: string;
}

/**
 * A physical quantity: a number annotated with a `unit` plus an optional extent
 * (min/max) and default. The extent is both a real JSON-Schema constraint
 * (`minimum`/`maximum`, enforced by validation) and a UI hint (`x-extent`).
 */
export function quantity(unit: Unit, options: QuantityOptions = {}) {
	const { min, max, default: def, integer, description, widget } = options;
	const opts: Record<string, unknown> = { [X_UNIT]: unit };
	if (description !== undefined) opts.description = description;
	if (widget !== undefined) opts[X_WIDGET] = widget;
	if (min !== undefined) opts.minimum = min;
	if (max !== undefined) opts.maximum = max;
	if (min !== undefined || max !== undefined) opts[X_EXTENT] = [min ?? null, max ?? null];
	if (def !== undefined) opts.default = def;
	return integer ? Type.Integer(opts) : Type.Number(opts);
}

/** A dimensionless number constrained to an inclusive [min, max] range. */
export function extent(min: number, max: number, options: Omit<QuantityOptions, 'min' | 'max'> = {}) {
	return quantity('none', { ...options, min, max });
}

export interface RefOptions {
	description?: string;
	widget?: string;
}

/**
 * A path reference (the value is a path string — `/methods/orbit`, `../`, `/`).
 * Annotated `x-ref` so the form generator renders a path picker and the loader
 * resolves it to a typed handle at the boundary. Defaults to the given path.
 */
export function ref(path: string, options: RefOptions = {}) {
	const opts: Record<string, unknown> = { [X_REF]: true, default: path };
	if (options.description !== undefined) opts.description = options.description;
	if (options.widget !== undefined) opts[X_WIDGET] = options.widget;
	return Type.String(opts);
}

/**
 * Curried default: `withDefault(schema)(value)`. Define the type once, then stamp a
 * default — the node-template ergonomic. Returns a new schema (does not mutate).
 */
export function withDefault<T extends TSchema>(schema: T) {
	return (value: Static<T>): T => ({ ...schema, default: value }) as T;
}

/** Annotations read back off a schema — what a `getEditor`-style dispatcher consumes. */
export interface SchemaAnnotations {
	unit?: Unit;
	extent?: [number | null, number | null];
	ref?: boolean;
	widget?: string;
	default?: unknown;
	description?: string;
}

/** Extract the domain annotations from a schema (works on a serialized round-trip too). */
export function annotationsOf(schema: TSchema): SchemaAnnotations {
	const s = schema as Record<string, unknown>;
	const out: SchemaAnnotations = {};
	if (typeof s[X_UNIT] === 'string') out.unit = s[X_UNIT] as Unit;
	if (Array.isArray(s[X_EXTENT])) out.extent = s[X_EXTENT] as [number | null, number | null];
	if (s[X_REF] === true) out.ref = true;
	if (typeof s[X_WIDGET] === 'string') out.widget = s[X_WIDGET] as string;
	if ('default' in s) out.default = s.default;
	if (typeof s.description === 'string') out.description = s.description;
	return out;
}

/**
 * Runtime validation against a *live* (in-memory) schema built with these factories.
 *
 * NB: TypeBox's checker keys off an in-memory `Symbol(Kind)` that JSON serialization
 * drops. The schema's *data* — `x-*` annotations and the `type`/`minimum`/`maximum`
 * constraints — round-trips fine (so it still drives the UI), but a *deserialized*
 * schema must be re-hydrated (rebuilt via the factories on load) or validated with a
 * JSON-Schema validator (e.g. ajv) against its plain-data form. See the serializability
 * test and _docs/specs/scene-routing.md.
 */
export function check(schema: TSchema, value: unknown): boolean {
	return Value.Check(schema, value);
}
