<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	let { entryId, field, value, name, editor, updatedAt, disabled = false, max }: {
		entryId: string; field: string; value: number | null; name: string; editor: string | null;
		updatedAt: number | null; disabled?: boolean; max?: number;
	} = $props();
	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let error = $state('');
	let input = $state<HTMLInputElement>()!;
	let button = $state<HTMLButtonElement>()!;
	let tooltip = $derived(editor ? `Last saved by ${editor}${updatedAt ? ` · ${new Date(updatedAt).toLocaleString()}` : ''}` : 'Not yet entered');
	async function edit() {
		draft = value === null ? '' : String(value);
		error = '';
		editing = true;
		await tick();
		input.focus(); input.select();
	}
	async function save() {
		if (!editing || saving) return false;
		if (!input.checkValidity()) { error = input.validationMessage; input.reportValidity(); return false; }
		if (draft === (value === null ? '' : String(value))) { editing = false; return true; }
		saving = true; error = '';
		try {
			const body = new FormData();
			body.set('entryId', entryId); body.set('field', field); body.set('value', draft);
			const response = await fetch('?/saveCell', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await response.text());
			if (result.type !== 'success') throw new Error(result.type === 'failure' ? String(result.data?.error ?? 'Could not save score.') : 'Could not save score.');
			await invalidateAll();
			editing = false;
			return true;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save score.'; return false; }
		finally { saving = false; }
	}
	async function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') { event.preventDefault(); editing = false; error = ''; await tick(); button.focus(); }
		if (event.key === 'Enter') {
			event.preventDefault();
			const row = input.closest('tr');
			const next = (event.shiftKey ? row?.previousElementSibling : row?.nextElementSibling)?.querySelector<HTMLButtonElement>(`button[data-field="${field}"]`);
			const saved = await save();
			if (saved) { await tick(); (next ?? button).focus(); }
		}
	}
	function wheel(event: WheelEvent) {
		// Blur before the number input can step; leave the wheel event free to scroll the table.
		(event.currentTarget as HTMLInputElement).blur();
	}
</script>

<div class="cell">
	{#if editing}
		<input bind:this={input!} aria-label={name} aria-invalid={!!error} aria-describedby={error ? `error-${entryId}-${field}` : undefined} type="number" min="0" {max} step="any" value={draft} oninput={(event) => { draft = event.currentTarget.value; error = ''; }} onkeydown={keydown} onwheel={wheel} onblur={() => { if (!error) void save(); }} readonly={saving} />
	{:else}
		<button bind:this={button!} data-field={field} aria-label={`${name}: ${value ?? 'blank'}. Edit score`} title={tooltip} {disabled} onclick={edit}>{value ?? '—'}</button>
	{/if}
	{#if saving}<small role="status">Saving…</small>{/if}
	{#if error}<small id="error-{entryId}-{field}" role="alert">{error} <button onclick={() => void save()}>Retry</button></small>{/if}
</div>

<style>
	.cell { min-width: 6rem; position: relative; }
	button, input { box-sizing: border-box; width: 100%; min-height: 2.5rem; border: 1px solid transparent; border-radius: 4px; padding: .45rem .7rem; font: inherit; font-variant-numeric: tabular-nums; text-align: right; }
	button { background: #f1f5fa; color: #182b48; cursor: pointer; }
	button:hover:not(:disabled) { border-color: #8da4c4; background: #e6edf7; }
	button:disabled { background: transparent; color: #555; cursor: default; }
	input { border-color: #315eab; background: white; }
	button:focus-visible, input:focus { outline: 2px solid #315eab; outline-offset: 2px; }
	small { display: block; max-width: 14rem; font-size: .75rem; color: #9a2020; }
	small button { text-align: left; min-height: 1.5rem; }
</style>
