import { describe, expect, it } from 'vitest';

import {
	graphEditorHighlightStyle,
	graphEditorSyntaxHighlighting,
	graphEditorTheme
} from './theme.js';

describe('graphEditor theme', () => {
	it('exports theme and highlight helpers', () => {
		expect(graphEditorTheme).toBeTruthy();
		expect(graphEditorHighlightStyle).toBeTruthy();
		expect(graphEditorSyntaxHighlighting()).toBeTruthy();
	});
});
