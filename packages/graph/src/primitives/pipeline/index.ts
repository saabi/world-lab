import './fullscreenPlane.js';
import './plane.js';
import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { DISPLAY_SINK_DEFINITION } from '../../pipeline.js';
import { MESH_SINK_DEFINITION } from '../../meshTarget.js';
import { BUFFER_FEEDBACK_SINK_DEFINITION } from '../../bufferFeedbackTarget.js';

const noParams = Type.Object({});

const primitives: NodePrimitiveInput[] = [
	{
		id: 'buffer.persist',
		category: 'buffer',
		inputs: [{ name: 'in', dataType: 'geometry', metadata: { semantic: 'geometry-resource' } }],
		outputs: [{ name: 'out', dataType: 'geometry', metadata: { semantic: 'persistent-geometry-resource' } }],
		params: noParams,
		implementation: { kind: 'legacy-structural', marker: 'buffer.persist' },
		metadata: {
			description: 'Caches a generated geometry resource across frames.',
			pure: true,
			deterministic: true,
			role: 'pipelineBuffer'
		}
	},
	{
		id: 'stage.vertex',
		category: 'stage',
		inputs: [{ name: 'mesh', dataType: 'geometry', metadata: { semantic: 'geometry-resource' } }],
		outputs: [{ name: 'varyings', dataType: 'varyings', metadata: { semantic: 'fragment-varyings' } }],
		params: noParams,
		wgsl: { moduleId: 'stage.vertex', entry: 'vertexStage' },
		metadata: {
			description: 'Vertex stage node for pipeline graph execution.',
			pure: true,
			deterministic: true,
			role: 'pipelineStage'
		}
	},
	{
		id: 'stage.fragment',
		category: 'stage',
		inputs: [
			{ name: 'varyings', dataType: 'varyings', metadata: { semantic: 'fragment-varyings' } },
			{ name: 'color', dataType: 'vec4f', metadata: { semantic: 'rgba-field' } }
		],
		outputs: [{ name: 'texture', dataType: 'texture', metadata: { semantic: 'rgba-texture' } }],
		params: noParams,
		implementation: { kind: 'legacy-structural', marker: 'stage.fragment' },
		metadata: {
			description: 'Fragment stage node that writes a field color into a texture resource.',
			pure: false,
			deterministic: false,
			role: 'pipelineStage'
		}
	},
	{
		id: 'target.display',
		category: 'target/sink',
		inputs: [{ name: 'color', dataType: 'texture', metadata: { semantic: 'presentable-color-texture' } }],
		outputs: [],
		params: noParams,
		implementation: { kind: 'sink', sink: DISPLAY_SINK_DEFINITION },
		metadata: {
			description: 'Display target sink for presenting the pipeline color output.',
			pure: false,
			deterministic: false,
			role: 'pipelineTarget'
		}
	},
	{
		id: 'target.mesh',
		category: 'target/sink',
		inputs: [
			{ name: 'position', dataType: 'vec3f', metadata: { semantic: 'mesh-position-field' } },
			{ name: 'normal', dataType: 'vec3f', metadata: { semantic: 'mesh-normal-field' } }
		],
		outputs: [],
		params: Type.Object({
			gridSize: Type.Integer({ minimum: 2, default: 24 }),
			faceCount: Type.Integer({ minimum: 1, maximum: 6, default: 1 })
		}),
		implementation: { kind: 'sink', sink: MESH_SINK_DEFINITION },
		metadata: {
			description: 'Mesh preview sink — tessellates wired position/normal fields for geometry preview.',
			pure: false,
			deterministic: false,
			role: 'meshTarget',
			help: 'Declare a mesh to render in the geometry preview pane.',
			usage: 'Wire vec3f position and normal fields, then set gridSize and faceCount for tessellation.'
		}
	},
	{
		id: 'target.bufferFeedback',
		category: 'target/sink',
		inputs: [],
		outputs: [],
		params: Type.Object({
			gridWidth: Type.Integer({ minimum: 1, default: 256 }),
			gridHeight: Type.Integer({ minimum: 1, default: 256 })
		}),
		implementation: { kind: 'sink', sink: BUFFER_FEEDBACK_SINK_DEFINITION },
		metadata: {
			description: 'Runs the bundled previous-frame storage-buffer feedback proof.',
			pure: false,
			deterministic: true,
			role: 'bufferFeedbackTarget'
		}
	},
	{
		id: 'target.computeBuffer',
		category: 'target/sink',
		inputs: [],
		outputs: [],
		params: Type.Object({
			elementCount: Type.Integer({ minimum: 1, default: 64 })
		}),
		implementation: {
			kind: 'kernel',
			stage: 'compute',
			bindings: [
				{
					name: 'values',
					binding: 0,
					resourceKind: 'buffer',
					access: 'read-write',
					stages: ['compute']
				}
			]
		},
		metadata: {
			description: 'Runs the bundled graph-authored compute-buffer proof.',
			pure: false,
			deterministic: true,
			role: 'computeBufferTarget'
		}
	}
];

for (const primitive of primitives) {
	registerPrimitive(primitive);
}
