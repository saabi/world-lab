import type { SinkCompilerAdapter } from '@world-lab/compiler';
import { SinkHandlerRegistry } from '@world-lab/graph';
import { describe, expect, it, vi } from 'vitest';

import type { SinkExecutionHandler } from './sinkHandlers.js';

describe('sink handler registries', () => {
	it('rejects duplicate kinds while keeping compiler and runtime handlers independent', () => {
		const compiler = new SinkHandlerRegistry<SinkCompilerAdapter>();
		const runtime = new SinkHandlerRegistry<SinkExecutionHandler>();
		const compilerAdapter: SinkCompilerAdapter = {
			sinkKind: 'display',
			toConsumerDescriptor: () => ({ type: 'image', outputs: ['image'] })
		};
		const runtimeHandler: SinkExecutionHandler = {
			sinkKind: 'display',
			execute: vi.fn()
		};

		compiler.register(compilerAdapter);
		runtime.register(runtimeHandler);

		expect(compiler.get('display')).toBe(compilerAdapter);
		expect(runtime.get('display')).toBe(runtimeHandler);
		expect(() => compiler.register(compilerAdapter)).toThrow(
			'Sink handler already registered: display'
		);
		expect(() => runtime.register(runtimeHandler)).toThrow(
			'Sink handler already registered: display'
		);
	});
});
