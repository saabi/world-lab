<script lang="ts">
	import { isWarning, type GraphDocument, type ValidationIssue } from '@world-lab/graph';

	import {
		countValidationSeverity,
		formatValidationIssue,
		fullValidation,
		issueFocusTarget
	} from './graphValidation.js';

	interface Props {
		graph: GraphDocument;
		markupError?: string | null;
		onfocusnode?: (nodeId: string) => void;
		onfocusedge?: (edgeId: string) => void;
	}

	let { graph, markupError = null, onfocusnode, onfocusedge }: Props = $props();

	const result = $derived(fullValidation(graph));
	const counts = $derived(countValidationSeverity(result.issues));
	const errors = $derived(result.issues.filter((issue) => !isWarning(issue)));
	const warnings = $derived(result.issues.filter((issue) => isWarning(issue)));

	function focusIssue(issue: ValidationIssue) {
		const target = issueFocusTarget(issue);
		if (target.nodeId) onfocusnode?.(target.nodeId);
		else if (target.edgeId) onfocusedge?.(target.edgeId);
	}
</script>

<div class="validation">
	{#if markupError}
		<p class="error">Markup: {markupError}</p>
	{/if}
	{#if result.ok && warnings.length === 0}
		<p class="ok">Graph is valid.</p>
	{:else}
		<p class="summary">
			{#if counts.errors > 0}
				<span class="error">{counts.errors} error{counts.errors === 1 ? '' : 's'}</span>
			{/if}
			{#if counts.warnings > 0}
				{#if counts.errors > 0}<span class="sep"> · </span>{/if}
				<span class="warning">{counts.warnings} warning{counts.warnings === 1 ? '' : 's'}</span>
			{/if}
		</p>
		{#if errors.length > 0}
			<h3 class="group-title error">Errors</h3>
			<ul class="issues">
				{#each errors as issue, index (`e-${index}`)}
					<li>
						<button type="button" class="issue error" onclick={() => focusIssue(issue)}>
							{formatValidationIssue(issue)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if warnings.length > 0}
			<h3 class="group-title warning">Warnings</h3>
			<ul class="issues">
				{#each warnings as issue, index (`w-${index}`)}
					<li>
						<button type="button" class="issue warning" onclick={() => focusIssue(issue)}>
							{formatValidationIssue(issue)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.validation {
		padding: 8px;
		height: 100%;
		overflow: auto;
	}

	.summary {
		margin: 0 0 8px;
		font-size: 11px;
	}

	.sep {
		opacity: 0.6;
	}

	.group-title {
		margin: 8px 0 4px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.group-title.error {
		color: #f1948a;
	}

	.group-title.warning {
		color: #f7dc6f;
	}

	.ok {
		margin: 0;
		font-size: 11px;
		color: #7dcea0;
	}

	.error {
		color: #f1948a;
	}

	.warning {
		color: #f7dc6f;
	}

	.issues {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.issue {
		width: 100%;
		margin: 0;
		padding: 4px 6px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		font-size: 11px;
		text-align: left;
		cursor: pointer;
	}

	.issue:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.issue.error {
		border-color: rgba(241, 148, 138, 0.35);
	}

	.issue.warning {
		border-color: rgba(247, 220, 111, 0.35);
	}
</style>
