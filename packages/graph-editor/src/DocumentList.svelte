<script module lang="ts">
	import type { DocumentListEntry } from './graphArtifact.js';
	import type { GraphArtifact } from './graphArtifact.js';

	export interface DocumentListActions {
		onNew: () => void;
		onSave: () => void;
		onSaveAs: (name: string) => void;
		onLoadSaved: (name: string) => void;
		onLoadSample: (artifact: GraphArtifact) => void;
		onRename: (fromName: string, toName: string) => void;
		onDelete: (name: string) => void;
		onDownload: () => void;
		onUpload: () => void;
		onLoadLayoutChange: (enabled: boolean) => void;
	}
</script>

<script lang="ts">
	import { focusTrap } from './focusTrap.js';

	const UNTITLED_VALUE = '';

	let {
		activeName = null,
		readOnly = false,
		loadLayout = true,
		dirty = false,
		savedDocuments = [],
		sampleDocuments = [],
		statusMessage = null,
		canUndo = false,
		canRedo = false,
		undoLabel = null,
		redoLabel = null,
		onUndo,
		onRedo,
		actions
	}: {
		activeName?: string | null;
		readOnly?: boolean;
		loadLayout?: boolean;
		/** Does the active document hold edits that exist nowhere but memory? See GraphEditor's
		 * `hasUnsavedRisk` — only true for an unnamed new graph or a loaded (read-only) sample. */
		dirty?: boolean;
		savedDocuments?: DocumentListEntry[];
		sampleDocuments?: GraphArtifact[];
		statusMessage?: string | null;
		canUndo?: boolean;
		canRedo?: boolean;
		undoLabel?: string | null;
		redoLabel?: string | null;
		onUndo?: () => void;
		onRedo?: () => void;
		actions: DocumentListActions;
	} = $props();

	let moreOpen = $state(false);
	let moreRoot: HTMLDivElement | undefined = $state();

	let namePromptOpen = $state(false);
	let namePromptMode = $state<'saveAs' | 'rename'>('saveAs');
	let namePromptTitle = $state('');
	let namePromptValue = $state('');

	let deleteTarget = $state<string | null>(null);

	const switcherValue = $derived(
		activeName === null ? UNTITLED_VALUE : `${readOnly ? 'sample' : 'saved'}:${activeName}`
	);

	function closeMore() {
		moreOpen = false;
	}

	function toggleMore() {
		moreOpen = !moreOpen;
	}

	function onDocumentPointerDown(event: PointerEvent) {
		if (!moreOpen || !moreRoot) return;
		if (!moreRoot.contains(event.target as Node)) closeMore();
	}

	function onDocumentKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeMore();
	}

	function onSwitcherChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value === UNTITLED_VALUE) return;
		const separator = value.indexOf(':');
		const kind = value.slice(0, separator);
		const name = value.slice(separator + 1);
		if (kind === 'saved') {
			actions.onLoadSaved(name);
		} else if (kind === 'sample') {
			const sample = sampleDocuments.find((doc) => doc.name === name);
			if (sample) actions.onLoadSample(sample);
		}
	}

	function openSaveAs() {
		namePromptMode = 'saveAs';
		namePromptTitle = 'Save document as';
		namePromptValue = activeName ?? '';
		namePromptOpen = true;
		closeMore();
	}

	function openRename() {
		if (!activeName || readOnly) return;
		namePromptMode = 'rename';
		namePromptTitle = 'Rename document';
		namePromptValue = activeName;
		namePromptOpen = true;
		closeMore();
	}

	function confirmNamePrompt() {
		const name = namePromptValue.trim();
		if (!name) return;
		if (namePromptMode === 'saveAs') {
			actions.onSaveAs(name);
		} else if (activeName) {
			actions.onRename(activeName, name);
		}
		namePromptOpen = false;
	}

	function openDelete() {
		if (!activeName || readOnly) return;
		deleteTarget = activeName;
		closeMore();
	}

	function confirmDelete() {
		if (!deleteTarget) return;
		actions.onDelete(deleteTarget);
		deleteTarget = null;
	}

	function formatUpdatedAt(iso: string | undefined): string | null {
		if (!iso) return null;
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:document onpointerdown={onDocumentPointerDown} onkeydown={onDocumentKeyDown} />

<div class="document-bar">
	<div class="switcher-wrap">
		<select
			class="switcher"
			value={switcherValue}
			onchange={onSwitcherChange}
			aria-label="Current document"
			title={activeName ?? 'Untitled'}
		>
			<option value={UNTITLED_VALUE}>Untitled</option>
			{#if sampleDocuments.length}
				<optgroup label="Examples">
					{#each sampleDocuments as sample (sample.name)}
						<option value={`sample:${sample.name}`}>{sample.name}</option>
					{/each}
				</optgroup>
			{/if}
			{#if savedDocuments.length}
				<optgroup label="Saved">
					{#each savedDocuments as entry (entry.name)}
						{@const updated = formatUpdatedAt(entry.updatedAt)}
						<option value={`saved:${entry.name}`}>{entry.name}{updated ? ` — ${updated}` : ''}</option>
					{/each}
				</optgroup>
			{/if}
		</select>
		{#if dirty}
			<span class="dirty" aria-hidden="true" title="Unsaved changes">*</span>
		{/if}
	</div>

	<div class="actions">
		<button type="button" onclick={actions.onNew}>New</button>
		<button type="button" disabled={readOnly} onclick={actions.onSave}>Save</button>

		<div class="more" bind:this={moreRoot}>
			<button
				type="button"
				class="more-btn"
				aria-expanded={moreOpen}
				aria-haspopup="menu"
				onclick={toggleMore}
			>
				More&hellip;
			</button>
			{#if moreOpen}
				<div class="more-menu" role="menu">
					<button type="button" role="menuitem" onclick={openSaveAs}>Save As&hellip;</button>
					<button
						type="button"
						role="menuitem"
						disabled={!activeName || readOnly}
						onclick={openRename}
					>
						Rename&hellip;
					</button>
					<button
						type="button"
						role="menuitem"
						disabled={!activeName || readOnly}
						onclick={openDelete}
					>
						Delete&hellip;
					</button>
					<div class="menu-sep" role="separator"></div>
					<button
						type="button"
						role="menuitem"
						onclick={() => {
							actions.onDownload();
							closeMore();
						}}
					>
						Download&hellip;
					</button>
					<button
						type="button"
						role="menuitem"
						onclick={() => {
							actions.onUpload();
							closeMore();
						}}
					>
						Upload&hellip;
					</button>
					<div class="menu-sep" role="separator"></div>
					<label class="menu-toggle">
						<input
							type="checkbox"
							checked={loadLayout}
							onchange={(event) =>
								actions.onLoadLayoutChange((event.currentTarget as HTMLInputElement).checked)}
						/>
						<span>Load layout with document</span>
					</label>
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="icon-btn"
			disabled={!canUndo}
			aria-label="Undo"
			title={undoLabel ? `Undo ${undoLabel}` : 'Undo'}
			onclick={onUndo}
		>
			&#8630;
		</button>
		<button
			type="button"
			class="icon-btn"
			disabled={!canRedo}
			aria-label="Redo"
			title={redoLabel ? `Redo ${redoLabel}` : 'Redo'}
			onclick={onRedo}
		>
			&#8631;
		</button>
	</div>

	{#if statusMessage}
		<p class="status">{statusMessage}</p>
	{/if}
</div>

{#if namePromptOpen}
	<div class="dialog-backdrop" role="presentation" onclick={() => (namePromptOpen = false)}></div>
	<div class="dialog" role="dialog" aria-label={namePromptTitle} tabindex="-1" use:focusTrap={{ onEscape: () => (namePromptOpen = false) }}>
		<label>
			<span>{namePromptTitle}</span>
			<input bind:value={namePromptValue} />
		</label>
		<div class="dialog-actions">
			<button type="button" onclick={() => (namePromptOpen = false)}>Cancel</button>
			<button type="button" onclick={confirmNamePrompt}>
				{namePromptMode === 'rename' ? 'Rename' : 'Save'}
			</button>
		</div>
	</div>
{/if}

{#if deleteTarget}
	<div class="dialog-backdrop" role="presentation" onclick={() => (deleteTarget = null)}></div>
	<div class="dialog" role="dialog" aria-label="Delete document" tabindex="-1" use:focusTrap={{ onEscape: () => (deleteTarget = null) }}>
		<p>Delete "{deleteTarget}"? This can't be undone.</p>
		<div class="dialog-actions">
			<button type="button" onclick={() => (deleteTarget = null)}>Cancel</button>
			<button type="button" class="danger" onclick={confirmDelete}>Delete</button>
		</div>
	</div>
{/if}

<style>
	.document-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}

	.switcher-wrap {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		max-width: 220px;
	}

	.switcher {
		flex: 1;
		min-width: 0;
		font-size: 11px;
		padding: 4px 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #151a28;
		color: inherit;
	}

	.dirty {
		font-size: 13px;
		opacity: 0.7;
	}

	.actions {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.actions button,
	.dialog-actions button {
		font-size: 11px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.actions button:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.actions button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.icon-btn {
		font-size: 13px !important;
		line-height: 1;
		padding: 3px 7px !important;
	}

	.more {
		position: relative;
	}

	.more-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		min-width: 180px;
		background: #1a1f30;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		padding: 4px;
		gap: 1px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	}

	.more-menu button {
		font-size: 11px;
		text-align: left;
		padding: 6px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.more-menu button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}

	.more-menu button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.menu-sep {
		height: 1px;
		margin: 4px 2px;
		background: rgba(255, 255, 255, 0.1);
	}

	.menu-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		padding: 6px 8px;
	}

	.status {
		margin: 0;
		font-size: 11px;
		opacity: 0.7;
	}

	.dialog-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 20;
	}

	.dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 21;
		background: #1a1f30;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 240px;
	}

	.dialog label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
	}

	.dialog input {
		font-size: 11px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #12151f;
		color: inherit;
	}

	.dialog p {
		margin: 0;
		font-size: 11px;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}

	.dialog-actions button.danger {
		border-color: rgba(255, 110, 110, 0.5);
		color: #ff9b9b;
	}
</style>
