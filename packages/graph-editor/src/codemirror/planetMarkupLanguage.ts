import { xml } from '@codemirror/lang-xml';
import type { Extension } from '@codemirror/state';

export function planetMarkupLanguage(): Extension {
	return xml();
}
