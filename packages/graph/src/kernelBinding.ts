import type {
	KernelBindingTemplate,
	ResolvedKernelBinding,
	ShaderStage
} from './implementation.js';

const WGSL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const WGSL_RESERVED_WORDS = new Set([
	'alias',
	'break',
	'case',
	'const',
	'const_assert',
	'continue',
	'continuing',
	'default',
	'diagnostic',
	'discard',
	'else',
	'enable',
	'false',
	'fn',
	'for',
	'if',
	'let',
	'loop',
	'override',
	'requires',
	'return',
	'struct',
	'switch',
	'true',
	'var',
	'while'
]);

export function validateKernelBindingTemplates(
	templates: readonly KernelBindingTemplate[],
	ownerStage: ShaderStage
): void {
	const names = new Set<string>();
	const bindings = new Set<number>();
	for (const template of templates) {
		if (!WGSL_IDENTIFIER.test(template.name)) {
			throw new Error(`Kernel binding has an invalid shader name: "${template.name}"`);
		}
		if (WGSL_RESERVED_WORDS.has(template.name)) {
			throw new Error(
				`Kernel binding uses a reserved WGSL keyword as its shader name: "${template.name}"`
			);
		}
		if (names.has(template.name)) {
			throw new Error(`Duplicate kernel binding name: "${template.name}"`);
		}
		names.add(template.name);
		if (!Number.isInteger(template.binding) || template.binding < 0) {
			throw new Error(
				`Kernel binding "${template.name}" has an invalid binding index: ${template.binding}`
			);
		}
		if (bindings.has(template.binding)) {
			throw new Error(
				`Duplicate kernel binding index ${template.binding} ("${template.name}")`
			);
		}
		bindings.add(template.binding);
		if (template.stages.length === 0) {
			throw new Error(`Kernel binding "${template.name}" declares no visible stages`);
		}
		if (!template.stages.includes(ownerStage)) {
			throw new Error(
				`Kernel binding "${template.name}" is not visible in its owning kernel's stage ` +
					`"${ownerStage}" (declares stages: ${template.stages.join(', ')})`
			);
		}
		if (template.resourceKind === 'sampler' && template.access !== 'read') {
			throw new Error(
				`Kernel binding "${template.name}" is a sampler and must declare access:'read'`
			);
		}
		if (template.resourceKind === 'texture' && template.access !== 'read') {
			throw new Error(
				`Kernel binding "${template.name}" is a texture binding and must declare ` +
					`access:'read' (storage textures are deferred - see F2.3)`
			);
		}
	}
}

export function isBindingVisibleInStage(
	binding: Pick<KernelBindingTemplate, 'stages'>,
	stage: ShaderStage
): boolean {
	return binding.stages.includes(stage);
}

export function resolveKernelBindings(
	templates: readonly KernelBindingTemplate[],
	ownerStage: ShaderStage,
	resourceIds: ReadonlyMap<string, string>
): ResolvedKernelBinding[] {
	validateKernelBindingTemplates(templates, ownerStage);
	return templates.map((template) => {
		const resourceId = resourceIds.get(template.name);
		if (resourceId === undefined) {
			throw new Error(`Kernel binding "${template.name}" has no resolved resource id`);
		}
		return {
			resourceId,
			access: template.access,
			name: template.name,
			binding: template.binding,
			resourceKind: template.resourceKind,
			stages: template.stages
		};
	});
}
