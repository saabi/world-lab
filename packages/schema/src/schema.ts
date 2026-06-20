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
/** Stored units per display unit (e.g. metres-per-km = 1000): the form shows value/scale. */
export const X_SCALE = 'x-scale';

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
	/**
	 * Stored units per display unit. The field stores SI; the form shows value/scale
	 * in `unit` (e.g. unit 'km' + scale 1000 displays a metres field in km). min/max/
	 * default stay in stored units (so validation is on the stored value).
	 */
	scale?: number;
}

/**
 * A physical quantity: a number annotated with a `unit` plus an optional extent
 * (min/max) and default. The extent is both a real JSON-Schema constraint
 * (`minimum`/`maximum`, enforced by validation) and a UI hint (`x-extent`).
 */
export function quantity(unit: Unit, options: QuantityOptions = {}) {
	const { min, max, default: def, integer, description, widget, scale } = options;
	const opts: Record<string, unknown> = { [X_UNIT]: unit };
	if (description !== undefined) opts.description = description;
	if (widget !== undefined) opts[X_WIDGET] = widget;
	if (scale !== undefined) opts[X_SCALE] = scale;
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
	scale?: number;
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
	if (typeof s[X_SCALE] === 'number') out.scale = s[X_SCALE] as number;
	if ('default' in s) out.default = s.default;
	if (typeof s.description === 'string') out.description = s.description;
	return out;
}

// --- Introspection for form generation (the getEditor / TypedField pattern) ---

export type FieldKind =
	| 'number'
	| 'integer'
	| 'boolean'
	| 'string'
	| 'enum'
	| 'object'
	| 'array'
	| 'unknown';

export interface SchemaField {
	key: string;
	schema: TSchema;
	kind: FieldKind;
	annotations: SchemaAnnotations;
	/** Allowed literal values, for `enum` kind. */
	options?: (string | number)[];
}

/** Literal-union options (`Type.Union([Type.Literal(...)])`), or undefined. */
export function enumOptions(schema: TSchema): (string | number)[] | undefined {
	const variants = (schema as { anyOf?: { const?: string | number }[] }).anyOf;
	if (Array.isArray(variants) && variants.every((v) => 'const' in v)) {
		return variants.map((v) => v.const as string | number);
	}
	return undefined;
}

/** Classify a schema into a widget kind for the form generator. */
export function fieldKind(schema: TSchema): FieldKind {
	const t = (schema as { type?: string }).type;
	if (t === 'boolean') return 'boolean';
	if (t === 'integer') return 'integer';
	if (t === 'number') return 'number';
	if (t === 'object') return 'object';
	if (t === 'array') return 'array';
	if (enumOptions(schema)) return 'enum';
	if (t === 'string') return 'string';
	return 'unknown';
}

/** Per-property field descriptors of an object schema — what a form generator walks. */
export function fields(schema: TSchema): SchemaField[] {
	const obj = schema as { type?: string; properties?: Record<string, TSchema> };
	if (obj.type !== 'object' || !obj.properties) return [];
	return Object.entries(obj.properties).map(([key, propSchema]) => ({
		key,
		schema: propSchema,
		kind: fieldKind(propSchema),
		annotations: annotationsOf(propSchema),
		options: enumOptions(propSchema)
	}));
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

/**
 * Build a default instance from a schema — the node-template / spawn mechanism
 * (uses each field's `default`, else a type-appropriate zero value). Needs a live
 * schema (see {@link check} on the Kind symbol).
 */
export function create<T extends TSchema>(schema: T): Static<T> {
	return Value.Create(schema) as Static<T>;
}
