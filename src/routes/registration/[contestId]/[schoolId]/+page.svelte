<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	let studentNameInput: HTMLInputElement;
	let feedbackVisible = $state(true);
	let { data, form } = $props();
	let saving = $state(false);
	let editing = $state(false);
	let correcting = $state(false);
	const correctionAvailable = $derived(!data.readOnly && data.contest.lifecycle !== 'registration_open');
	const readOnly = $derived(data.readOnly || (correctionAvailable && !correcting));
	let reviewedRows = $state('');
	let confirmRemoval = $state(false);
	let studentDrafts = $state<Record<string, { name: string; actualGrade: number }>>({});
	let savingStudent = $state<string | null>(null);
	let deletingStudent = $state<string | null>(null);
	let deletionFeedback = $state<{ message: string; error: boolean } | null>(null);
	const grades = [9, 10, 11, 12];
	type Row = {
		id: string;
		name: string;
		actualGrade: number;
		attending: string;
		team: string;
		teamGrade: string;
		topical: string;
		topicalGrade: string;
		project: string;
		projectGrade: string;
		knowdown: boolean;
	};
	function assignment(studentId: string, category: string) {
		const member = data.members.find(
			(m) =>
				m.annualStudentId === studentId &&
				data.entries.some((e) => e.id === m.entryId && e.category === category),
		);
		const entry = data.entries.find((e) => e.id === member?.entryId);
		return {
			team: entry ? String(entry.entryNumber ?? 1) : '',
			grade: String(member?.competingGrade ?? ''),
		};
	}
	function makeRows(): Row[] {
		return data.students
			.map((student) => {
				const team = assignment(student.id, 'team_contest');
				const topical = assignment(student.id, 'topical_team');
				const project = assignment(student.id, 'project');
				return {
					...student,
					attending: data.rosterIds.includes(student.id) ? 'yes' : 'no',
					team: team.team,
					teamGrade: team.grade || String(student.actualGrade),
					topical:
						topical.team ||
						(data.members.some(
							(m) =>
								m.annualStudentId === student.id &&
								data.entries.some(
									(e) =>
										e.id === m.entryId && e.category === 'topical_individual',
								),
						)
							? 'individual'
							: ''),
					topicalGrade: topical.grade || String(student.actualGrade),
					project: project.team,
					projectGrade: project.grade || String(student.actualGrade),
					knowdown: data.members.some(
						(m) =>
							m.annualStudentId === student.id &&
							data.entries.some(
								(e) => e.id === m.entryId && e.category === 'knowdown',
							),
					),
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}
	type SortKey = 'name' | 'attending' | 'team' | 'topical' | 'project' | 'knowdown';
	const sortColumns: { key: SortKey; label: string; detail?: string }[] = $derived([
		{ key: 'name', label: 'Student' },
		{ key: 'attending', label: 'Attendance' },
		{ key: 'team', label: 'Team Contest', detail: 'Team · competing grade' },
		{ key: 'topical', label: 'Topical', detail: 'Team or individual · grade' },
		{ key: 'project', label: 'Project', detail: 'Optional team · grade' },
		{ key: 'knowdown', label: 'Knowdown', detail: `Up to ${data.contest.knowdownLimit} students` },
	]);
	let sortKey = $state<SortKey>('name');
	let sortDirection = $state<'ascending' | 'descending'>('ascending');
	function worksheetSnapshot(value: Row[]) {
		return JSON.stringify([...value].sort((a, b) => a.id.localeCompare(b.id)));
	}
	let rows = $state<Row[]>(makeRows());
	let savedRows = $state(worksheetSnapshot(makeRows()));
	const removalReview = $derived(form && 'scoredRemovals' in form ? form : null);
	const showRemovalReview = $derived(Boolean(removalReview?.scoredRemovals?.length) && reviewedRows === worksheetSnapshot(rows));
	const dirty = $derived(worksheetSnapshot(rows) !== savedRows);
	function sortRows(
		key: SortKey,
		direction: 'ascending' | 'descending' = key === sortKey && sortDirection === 'ascending'
			? 'descending'
			: 'ascending',
	) {
		sortKey = key;
		sortDirection = direction;
		const sign = direction === 'ascending' ? 1 : -1;
		// Sort only on request so changing an assignment never moves a focused row.
		rows.sort((a, b) => {
			const byName = a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
			if (key === 'name') return sign * byName;
			if (key === 'attending') return sign * b.attending.localeCompare(a.attending) || byName;
			if (key === 'knowdown') return sign * (Number(b.knowdown) - Number(a.knowdown)) || byName;
			// Only attendees have active event assignments. Keep unassigned rows last
			// in either direction, and individual topical entrants after teams.
			const left = a.attending === 'yes' ? a[key] : '';
			const right = b.attending === 'yes' ? b[key] : '';
			if (!left || !right) return Number(!left) - Number(!right) || byName;
			if (left === 'individual' || right === 'individual') {
				return Number(left === 'individual') - Number(right === 'individual') || byName;
			}
			const gradeKey = `${key}Grade` as 'teamGrade' | 'topicalGrade' | 'projectGrade';
			return sign * (Number(left) - Number(right)) || Number(a[gradeKey]) - Number(b[gradeKey]) || byName;
		});
	}
	$effect(() => {
		const freshRows = makeRows();
		rows = freshRows;
		savedRows = worksheetSnapshot(freshRows);
		untrack(() => sortRows(sortKey, sortDirection));
	});
	const attending = $derived(rows.filter((r) => r.attending === 'yes'));
	const teamCount = $derived(
		new Set(attending.map((r) => r.team).filter(Boolean)).size,
	);
	const topicalTeams = $derived(new Set(attending.map((r) => r.topical).filter((t) => t && t !== 'individual')).size);
	const topicalIndividuals = $derived(attending.filter((r) => r.topical === 'individual').length);
	const projectTeams = $derived(new Set(attending.map((r) => r.project).filter(Boolean)).size);
	const cellErrors = $derived.by(() => {
		const errors: Record<string, string> = {};
		for (const category of ['team', 'topical', 'project'] as const) {
			const groups = new Map<string, Row[]>();
			for (const row of attending) {
				const team = row[category];
				if (!team || team === 'individual') continue;
				const group = groups.get(team) ?? [];
				group.push(row);
				groups.set(team, group);
			}
			for (const [team, group] of groups) {
				const gradeKey = `${category}Grade` as 'teamGrade' | 'topicalGrade' | 'projectGrade';
				for (const row of group) {
					const messages = [];
					if (group.length > 3) messages.push(`Team ${team} has ${group.length} students; maximum 3.`);
					if (group.filter((r) => r[gradeKey] === row[gradeKey]).length > 1) messages.push(`Team ${team} has more than one student competing in grade ${row[gradeKey]}.`);
					if (Number(row[gradeKey]) < row.actualGrade) messages.push('Competing grade cannot be below actual grade.');
					if (messages.length) errors[`${category}_${row.id}`] = messages.join(' ');
				}
			}
		}
		return errors;
	});
	const nominees = $derived(attending.filter((r) => r.knowdown).length);
	const teamNumbers = $derived(
		Array.from(
			{
				length:
					Math.max(
						3,
						rows.length,
						...data.entries.map((e) => e.entryNumber ?? 0),
					) + 1,
			},
			(_, i) => String(i + 1),
		),
	);
	function cancelContestChanges() {
		const freshRows = makeRows();
		rows = freshRows;
		savedRows = worksheetSnapshot(freshRows);
		untrack(() => sortRows(sortKey, sortDirection));
	}
	function guardNavigation(event: MouseEvent) {
		if (
			dirty &&
			!window.confirm('You have unsaved contest changes. Leave this page?')
		)
			event.preventDefault();
	}
</script>

<svelte:head><title>{data.school.name} · My team — WSMC</title></svelte:head>
<svelte:window
	onbeforeunload={(event) => {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
<main>
	<a class="back" href={data.canReopen ? `/contests/${data.contest.id}` : "/my-schools"} onclick={guardNavigation}>← {data.canReopen ? data.contest.name : 'My schools'}</a>
	<header class="page-heading">
		<div>
			<p class="eyebrow">MY TEAM / {data.season?.year ?? 'Season'}</p>
			<h1>{data.school.name}</h1>
			<p class="intro">
				Add your students. Set their events. Keep the whole team in one place.
			</p>
		</div>
		<span class="division">Division {data.participation.division}</span>
	</header>
	<nav class="contests" aria-label="Season contests">
		<a
			class="active"
			aria-current="page"
			href={`/registration/${data.contest.id}/${data.school.id}`}
			onclick={guardNavigation}
			><span class="contest-number">01</span><span
				><strong>Regional contest</strong><small>{data.contest.name}</small
				></span
			><span class="status"
				>{data.participation.withdrawnAt != null ? 'Withdrawn' : readOnly ? 'Read only' : correctionAvailable ? 'Coordinator editing' : 'Registration open'}</span
			></a
		>{#if data.stateContest}<a
				href={`/state/${data.stateContest.id}?schoolId=${data.school.id}`}
				onclick={guardNavigation}
				><span class="contest-number">02</span><span
					><strong>State contest ↗</strong><small
						>Configure after qualification</small
					></span
				></a
			>{:else}<div class="future">
				<span class="contest-number">02</span><span
					><strong>State contest</strong><small
						>Available after qualification</small
					></span
				>
			</div>{/if}
	</nav>
	{#if data.participation.withdrawnAt != null}<p class="notice">This school has withdrawn. Registration is preserved. A coordinator can restore participation from the <a href="/contests/{data.contest.id}">contest page</a>.</p>{:else if readOnly}<p class="notice">
			{#if correctionAvailable}
				Registration is closed for coaches. You can make coordinator corrections.
				<button type="button" onclick={() => correcting = true}>Edit registration</button>
			{:else if data.canReopen}
				{data.lockReason}
				{#if data.contest.lifecycle === 'finalized' && data.season?.status !== 'archived'}<a href="/scoring/{data.contest.id}">Reopen for correction from Scoring</a>.{/if}
			{:else}
				Registration is closed. Contact your coordinator for corrections.
			{/if}
		</p>{/if}

	{#if correcting && correctionAvailable}<p class="notice">Coordinator corrections: changes affect contest results. Scores already entered will be preserved unless you confirm removal of a scored entry. <button type="button" disabled={dirty || saving} onclick={() => correcting = false}>Finish editing</button></p>{/if}
	<p><a href="/help/coach/regional" target="_blank" rel="noopener">Regional coach guide ↗</a></p>
	<section class="worksheet" aria-label="Contest assignments">
		<div class="section-heading">
			<div>
				<p class="eyebrow">REGIONAL CONTEST</p>
				<h2>Who’s doing what?</h2>
				<p>
					Everyone you add is included. Mark anyone sitting this contest out as
					“Not attending”.
				</p>
			</div>
		</div>
		<div class="counts">
			<span><strong>{rows.length}</strong> students</span><span
				><strong>{attending.length}</strong> attending</span
			><span
				><strong>{teamCount}</strong> Team Contest {teamCount === 1
					? 'team'
					: 'teams'}</span
			><span><strong>{topicalTeams}</strong> Topical {topicalTeams === 1 ? 'team' : 'teams'} · <strong>{topicalIndividuals}</strong> {topicalIndividuals === 1 ? 'individual' : 'individuals'}</span
			>{#if projectTeams}<span><strong>{projectTeams}</strong> Project {projectTeams === 1 ? 'team' : 'teams'}</span>{/if}<span class:over={nominees > data.contest.knowdownLimit}
				><strong>{nominees}/{data.contest.knowdownLimit}</strong> Knowdown nominees</span
			>
		</div>
		<p class="sort-hint">Sort by an event to review teams in competing-grade order. Click again to reverse team order.</p>
		<div class="mobile-sort">
			<label for="roster-sort">Sort students by</label>
			<select id="roster-sort" value={sortKey} onchange={(event) => sortRows(event.currentTarget.value as SortKey, 'ascending')}>
				{#each sortColumns as column}<option value={column.key}>{column.label}</option>{/each}
			</select>
			<button type="button" class="secondary" onclick={() => sortRows(sortKey)} aria-label="Reverse student sort order">{sortDirection === 'ascending' ? '↑' : '↓'}</button>
		</div>
		<form
			method="POST"
			action="?/saveWorksheet"
			oninput={(event) => { feedbackVisible = false; if ((event.target as HTMLInputElement).name !== "confirmRemoval") confirmRemoval = false; }}
			onchange={() => { feedbackVisible = false; }}
			use:enhance={() => {
				saving = true;
				feedbackVisible = false;
				return async ({ result, update }) => {
					if (result.type === 'failure' && result.data?.scoredRemovals) {
						reviewedRows = worksheetSnapshot(rows);
						confirmRemoval = false;
					}
					await update({ reset: false });
					saving = false;
					feedbackVisible = true;
				};
			}}
		>
			{#if showRemovalReview}
				<div class="notice" role="alert">
					<strong>Review scored entries being removed</strong>
					<ul>{#each removalReview?.scoredRemovals ?? [] as removal}<li>
						{removal.category.replaceAll('_', ' ')} {removal.entryNumber ?? ''}: {removal.students.join(', ')} —
						{#if removal.result.part1 !== null}Part 1: {removal.result.part1}; {/if}
						{#if removal.result.part2 !== null}Part 2: {removal.result.part2}; {/if}
						{#if removal.result.score !== null}Score: {removal.result.score}; {/if}
						{#if removal.result.placement !== null}Place: {removal.result.placement}; {/if}
						{#if removal.result.knowdownOutcome}Outcome: {removal.result.knowdownOutcome}{/if}
					</li>{/each}</ul>
					<label><input type="checkbox" name="confirmRemoval" bind:checked={confirmRemoval} /> Remove these entries and their results when saving.</label>
					<input type="hidden" name="removalConfirmation" value={confirmRemoval ? removalReview?.removalConfirmation ?? '' : ''} />
				</div>
			{/if}
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							{#each sortColumns as column}
								<th scope="col" class:student-col={column.key === 'name'} class:knowdown-col={column.key === 'knowdown'} aria-sort={sortKey === column.key ? sortDirection : 'none'}>
									<button type="button" class="sort-button" onclick={() => sortRows(column.key)}>
										{column.label} <span class="sort-icon" aria-hidden="true">{sortKey === column.key ? (sortDirection === 'ascending' ? '↑' : '↓') : '↕'}</span>
									</button>
									{#if column.detail}<small>{column.detail}</small>{/if}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.id)}<tr
								class:absent={row.attending === 'no'}
							>
								<td class="student-col"
									><input
										type="hidden"
										name="studentId"
										value={row.id}
									/><strong>{row.name}</strong><small
										>Grade {row.actualGrade}</small
									></td
								>
								<td data-label="Attendance"
									><select
										name={`attending_${row.id}`}
										aria-label={`Attendance for ${row.name}`}
										bind:value={row.attending}
										disabled={readOnly}
										><option value="yes">Attending</option><option value="no"
											>Not attending</option
										></select
									></td
								>
								<td data-label="Team Contest" class:invalid-cell={Boolean(cellErrors[`team_${row.id}`])}
									><div class="assignment">
										<select
											name={`team_${row.id}`}
											aria-invalid={Boolean(cellErrors[`team_${row.id}`])}
											aria-describedby={cellErrors[`team_${row.id}`] ? `team-error-${row.id}` : undefined}
											aria-label={`Team Contest team for ${row.name}`}
											bind:value={row.team}
											disabled={readOnly || row.attending === 'no'}
											><option value="">No event</option
											>{#each teamNumbers as team}<option value={team}
													>Team {team}</option
												>{/each}</select
										><select
											name={`teamGrade_${row.id}`}
											aria-invalid={Boolean(cellErrors[`team_${row.id}`])}
											aria-describedby={cellErrors[`team_${row.id}`] ? `team-error-${row.id}` : undefined}
											aria-label={`Team Contest grade for ${row.name}`}
											bind:value={row.teamGrade}
											disabled={readOnly ||
												row.attending === 'no' ||
												!row.team}
											>{#each grades.filter((g) => g >= row.actualGrade) as grade}<option
													value={String(grade)}>{grade}</option
												>{/each}</select
										>
									</div>{#if cellErrors[`team_${row.id}`]}<small class="cell-error" id={`team-error-${row.id}`}>{cellErrors[`team_${row.id}`]}</small>{/if}</td
								>
								<td data-label="Topical" class:invalid-cell={Boolean(cellErrors[`topical_${row.id}`])}
									><div class="assignment">
										<select
											name={`topical_${row.id}`}
											aria-invalid={Boolean(cellErrors[`topical_${row.id}`])}
											aria-describedby={cellErrors[`topical_${row.id}`] ? `topical-error-${row.id}` : undefined}
											aria-label={`Topical event for ${row.name}`}
											bind:value={row.topical}
											disabled={readOnly || row.attending === 'no'}
											><option value="">No event</option><option
												value="individual">Individual</option
											>{#each teamNumbers as team}<option value={team}
													>Team {team}</option
												>{/each}</select
										><select
											name={`topicalGrade_${row.id}`}
											aria-invalid={Boolean(cellErrors[`topical_${row.id}`])}
											aria-describedby={cellErrors[`topical_${row.id}`] ? `topical-error-${row.id}` : undefined}
											aria-label={`Topical grade for ${row.name}`}
											bind:value={row.topicalGrade}
											disabled={readOnly ||
												row.attending === 'no' ||
												!row.topical ||
												row.topical === 'individual'}
											>{#each grades.filter((g) => g >= row.actualGrade) as grade}<option
													value={String(grade)}>{grade}</option
												>{/each}</select
										>
									</div>{#if cellErrors[`topical_${row.id}`]}<small class="cell-error" id={`topical-error-${row.id}`}>{cellErrors[`topical_${row.id}`]}</small>{/if}</td
								>
								<td data-label="Project" class:invalid-cell={Boolean(cellErrors[`project_${row.id}`])}
									><div class="assignment">
										<select
											name={`project_${row.id}`}
											aria-invalid={Boolean(cellErrors[`project_${row.id}`])}
											aria-describedby={cellErrors[`project_${row.id}`] ? `project-error-${row.id}` : undefined}
											aria-label={`Project team for ${row.name}`}
											bind:value={row.project}
											disabled={readOnly || row.attending === 'no'}
											><option value="">No event</option
											>{#each teamNumbers as team}<option value={team}
													>Team {team}</option
												>{/each}</select
										><select
											name={`projectGrade_${row.id}`}
											aria-invalid={Boolean(cellErrors[`project_${row.id}`])}
											aria-describedby={cellErrors[`project_${row.id}`] ? `project-error-${row.id}` : undefined}
											aria-label={`Project grade for ${row.name}`}
											bind:value={row.projectGrade}
											disabled={readOnly ||
												row.attending === 'no' ||
												!row.project}
											>{#each grades.filter((g) => g >= row.actualGrade) as grade}<option
													value={String(grade)}>{grade}</option
												>{/each}</select
										>
									</div>{#if cellErrors[`project_${row.id}`]}<small class="cell-error" id={`project-error-${row.id}`}>{cellErrors[`project_${row.id}`]}</small>{/if}</td
								>
								<td class="knowdown-col" data-label="Knowdown" class:invalid-cell={row.knowdown && row.attending === 'yes' && nominees > data.contest.knowdownLimit}
									><input
										type="checkbox"
										name={`knowdown_${row.id}`}
										aria-label={`Nominate ${row.name} for Knowdown`}
										bind:checked={row.knowdown}
										disabled={readOnly || row.attending === 'no'}
									/></td
								>
							</tr>{:else}<tr
								><td colspan="6" class="empty"
									>Your team starts here. Add your first student below.</td
								></tr
							>{/each}
					</tbody>
				</table>
			</div>
			<div class="worksheet-feedback">	{#if feedbackVisible && form?.error}<p class="error" role="alert">
			{form.error} Your changes have not been saved.
		</p>{/if}
	{#if feedbackVisible && form?.success}<p class="success" role="status">{form.success}</p>{/if}
			</div>
			<div class="save-bar">
				<p>
					{#if dirty}<span class="dot"></span> Unsaved changes{:else}All
						assignments shown are saved{/if}<small
						>Not attending clears this contest’s assignments when you save.</small
					>
				</p>
				<div class="save-actions">
					<button class="secondary" type="button" onclick={cancelContestChanges} disabled={!dirty || saving}>Cancel</button>
				<button type="submit" disabled={readOnly || !dirty || saving || nominees > data.contest.knowdownLimit || (showRemovalReview && !confirmRemoval)}
					>{saving ? 'Saving…' : 'Save contest'}</button
				>
				</div>
			</div>
		</form>
		<form class="add-student" method="POST" action="?/addStudent" use:enhance={() => {
			feedbackVisible = false;
			return async ({ result, update }) => {
				await update();
				feedbackVisible = true;
				if (result.type === 'success') {
					await tick();
					// SvelteKit queues selection cleanup after applying a successful action.
					// Restore the input caret after that cleanup, not just its focus ring.
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
					studentNameInput?.focus();
					studentNameInput?.setSelectionRange(0, 0);
				}
			};
		}}>
			<div>
				<strong>Add a student</strong><small
					>Included in this contest · available all season</small
				>
			</div>
			<label class="sr-only" for="student-name">Student name</label><input
				id="student-name"
				bind:this={studentNameInput}
				name="name"
				placeholder="Full name"
				required
				disabled={readOnly || dirty}
			/><label class="sr-only" for="student-grade">Actual grade</label><select
				id="student-grade"
				name="actualGrade"
				disabled={readOnly || dirty}
				>{#each grades as grade}<option value={grade}>Grade {grade}</option
					>{/each}</select
			><button class="secondary" disabled={readOnly || dirty}
				>+ Add student</button
			>
		</form>
		{#if dirty}<p class="add-hint">
				Save or cancel your contest changes before adding or editing students.
			</p>{/if}
	</section>
	<p class="rules">
		<strong>Team rules</strong> Up to 3 students per team, with different competing
		grades. Students can compete at their actual grade or above. Team Contest, Topical,
		and Project teams are independent.
	</p>
	<div class="details-toggle">
		<a href="/help/coach/regional#student-details" target="_blank" rel="noopener">Help with editing or removing students ↗</a>
			<button
				class="secondary"
				type="button"
				onclick={() => (editing = !editing)}
				>{editing ? 'Close student details' : 'Edit student details'}</button
			>
	</div>
	{#if editing}<section class="details-panel">
			<h2>Student details</h2>
			<p class="intro">Names and actual grades are shared across the season.</p>
			<p class="intro">To delete a duplicate, mark them “Not attending” above and save the contest first. Deleting removes their student record for this season.</p>
			{#if deletionFeedback}<p class:error={deletionFeedback.error} class:success={!deletionFeedback.error} role={deletionFeedback.error ? 'alert' : 'status'}>{deletionFeedback.message}</p>{/if}
			{#each data.students as student (student.id)}
				{@const draft = studentDrafts[student.id] ?? student}
				{@const studentDirty = draft.name !== student.name || draft.actualGrade !== student.actualGrade}
				<div class="student-detail-row">
				<form
					class="edit-row"
					method="POST"
					action="?/updateStudent"
					use:enhance={() => {
						savingStudent = student.id;
						return async ({ result, update }) => {
							try {
								await update({ reset: false });
								if (result.type === 'success') delete studentDrafts[student.id];
							} finally {
								savingStudent = null;
							}
						};
					}}
				>
					<input type="hidden" name="studentId" value={student.id} /><input
						aria-label={`Name for ${student.name}`}
						name="name"
						value={draft.name}
						oninput={(event) => { studentDrafts[student.id] = { ...draft, name: event.currentTarget.value }; }}
						disabled={readOnly || savingStudent !== null || deletingStudent !== null}
						required
					/><select
						aria-label={`Actual grade for ${student.name}`}
						name="actualGrade"
						value={draft.actualGrade}
						onchange={(event) => { studentDrafts[student.id] = { ...draft, actualGrade: Number(event.currentTarget.value) }; }}
						disabled={readOnly || savingStudent !== null || deletingStudent !== null}
						>{#each grades as grade}<option value={grade}>Grade {grade}</option>{/each}</select
					><button disabled={readOnly || dirty || !studentDirty || savingStudent !== null || deletingStudent !== null}>{savingStudent === student.id ? 'Saving…' : 'Save student'}</button>
				</form>
				<form
					method="POST"
					action="?/deleteStudent"
					use:enhance={({ cancel }) => {
						if (!window.confirm(`Delete ${student.name} from the ${data.season?.year ?? ''} season? This permanently removes their student record and cannot be undone.`)) {
							cancel();
							return;
						}
						deletingStudent = student.id;
						deletionFeedback = null;
						return async ({ result, update }) => {
							try {
								await update({ reset: false });
								if (result.type === 'success') {
									delete studentDrafts[student.id];
									deletionFeedback = { message: `${student.name} deleted from this season.`, error: false };
								} else {
									deletionFeedback = { message: result.type === 'failure' && typeof result.data?.error === 'string' ? result.data.error : 'Student could not be deleted. Please try again.', error: true };
								}
							} finally {
								deletingStudent = null;
							}
						};
					}}
				>
					<input type="hidden" name="studentId" value={student.id} />
					<button
						class="delete-student"
						aria-label={`Delete ${student.name}`}
						disabled={readOnly || dirty || studentDirty || data.rosterIds.includes(student.id) || data.members.some((member) => member.annualStudentId === student.id) || savingStudent !== null || deletingStudent !== null}
					>{deletingStudent === student.id ? 'Deleting…' : 'Delete student'}</button>
				</form>
				</div>{/each}
		</section>{/if}
	<details class="tools">
		<summary>Add students from CSV</summary>
		<p>
			Download the template and fill in one row per student. Upload adds new students as attending; existing students are skipped by name and grade. Save worksheet changes first.
		</p>
		<a href={`/registration/${data.contest.id}/${data.school.id}/csv`}
			>Download registration CSV template</a
		>
		<p class="hint">Use positive whole numbers for teams. Blank Team Contest means no event; blank Topical means individual. Knowdown accepts Yes or No (blank means No). Competing grades start at the student’s grade. Set Project teams and correct registration problems in the worksheet. CSV imports are available only while registration is open.</p>
		<div class="csv-forms">
			{#each ['previewCsv', 'importCsv'] as action}<form
					method="POST"
					action={`?/${action}`}
					enctype="multipart/form-data"
					use:enhance
				>
					<label
						>{action === 'previewCsv' ? 'Preview a CSV' : 'Import a CSV'}<input
							type="file"
							name="file"
							accept=".csv,text/csv"
							required
						/></label
					><button disabled={readOnly || dirty || data.contest.lifecycle !== 'registration_open'}
						>{action === 'previewCsv' ? 'Preview CSV' : 'Import CSV'}</button
					>
				</form>{/each}
		</div>
		{#if form?.csvSummary}<p>
				{form.csvSummary.newStudents} students to add · {form.csvSummary.duplicateRows} duplicates skipped · {form.csvSummary.skippedRows} incomplete or unreadable rows skipped
			</p>{/if}{#if form?.csvErrors?.length}<ul>
				{#each form.csvErrors as error}<li>
						Row {error.rowNumber}, {error.field}: {error.message}
					</li>{/each}
			</ul>{/if}
	</details>
	{#if data.canReopen && !data.readOnly && data.contest.lifecycle === 'roster_locked'}<section
			class="details-panel"
		>
			<h2>Reopen registration for all coaches</h2>
			<p>Use this when coaches need to review their registrations again before scoring. For a single correction, use Edit registration above.</p>
			<form method="POST" action="?/reopen" use:enhance>
				<label>Reason <textarea name="reason" required></textarea></label
				><button>Reopen registration</button>
			</form>
		</section>{/if}
</main>

<style>
	:global(body) {
		background: #f5f6fa;
	}
	main {
		max-width: 1400px;
		margin: auto;
		padding: 32px 36px 60px;
		color: #20283d;
	}
	.back {
		color: #58647b;
		text-decoration: none;
		font-size: 14px;
	}
	.page-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 26px 0;
	}
	.eyebrow {
		font-size: 11px;
		font-weight: 750;
		letter-spacing: 0.12em;
		color: #64718a;
		margin: 0 0 10px;
	}
	h1 {
		font-size: 32px;
		letter-spacing: -0.03em;
		margin: 0 0 9px;
	}
	h2 {
		font-size: 23px;
		letter-spacing: -0.025em;
		margin: 0 0 8px;
	}
	.intro,
	.section-heading p:not(.eyebrow) {
		color: #667187;
		font-size: 14px;
		margin: 0;
		line-height: 1.6;
	}
	.division {
		padding: 9px 14px;
		border: 1px solid #d9dfea;
		border-radius: 24px;
		font-size: 13px;
		background: white;
	}
	.contests {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 26px;
	}
	.contests a,
	.future {
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 18px 22px;
		background: white;
		border: 1px solid #dee3ec;
		border-radius: 10px;
		color: #667187;
		text-decoration: none;
	}
	.contests .active {
		border-color: #7584b1;
		background: #eff2fc;
		color: #293d79;
		box-shadow: inset 0 0 0 1px #7584b1;
	}
	.contest-number {
		font-size: 12px;
		font-weight: 750;
		padding: 9px;
		border-radius: 7px;
		background: #e6eaf5;
	}
	.contests strong {
		font-size: 14px;
	}
	small {
		display: block;
		color: #7b8496;
		font-size: 11px;
		font-weight: 400;
		margin-top: 5px;
	}
	.status {
		margin-left: auto;
		font-size: 11px;
		padding: 6px 9px;
		border-radius: 20px;
		background: #dcece5;
		color: #356650;
		white-space: nowrap;
	}
	.worksheet {
		background: white;
		border: 1px solid #dde2ec;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 4px 20px #24345c04;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding: 26px 26px 20px;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 25px;
		padding: 0 26px 23px;
		font-size: 12px;
		color: #68738a;
	}
	.counts strong {
		color: #283750;
		font-size: 16px;
		margin-right: 4px;
	}
	.counts .over,
	.counts .over strong {
		color: #a12929;
	}
	.sort-hint {
		margin: -8px 26px 18px;
		color: #68738a;
		font-size: 12px;
		line-height: 1.5;
	}
	.mobile-sort { display: none; }
	button.sort-button {
		min-height: 32px;
		padding: 4px 0;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: inherit;
		font: inherit;
	}
	.sort-button:hover { color: #30477f; text-decoration: underline; }
	.sort-button:focus-visible { outline: 2px solid #30477f; outline-offset: 4px; }
	.sort-icon { margin-left: 5px; color: #7b8496; }
	th[aria-sort='ascending'] .sort-icon,
	th[aria-sort='descending'] .sort-icon { color: #30477f; }

	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}
	th {
		background: #f7f8fc;
		border-top: 1px solid #e6eaf1;
		border-bottom: 1px solid #e6eaf1;
		font-size: 12px;
		font-weight: 650;
		padding: 15px 12px;
		white-space: nowrap;
	}
	td {
		padding: 16px 12px;
		border-bottom: 1px solid #edf0f5;
	}
	.student-col {
		padding-left: 26px;
		min-width: 145px;
	}
	td.student-col strong {
		font-size: 13px;
	}
	.assignment {
		display: flex;
		gap: 5px;
	}
	.assignment select:first-child {
		min-width: 105px;
		flex: 1;
	}
	.assignment select:last-child {
		width: 54px;
	}
	.knowdown-col {
		text-align: center;
		padding-right: 22px;
	}
	.absent {
		background: #fafafa;
	}
	.absent .student-col strong {
		color: #808898;
	}
	.empty {
		padding: 40px;
		text-align: center;
		color: #7b8496;
	}
	input,
	select,
	textarea {
		box-sizing: border-box;
		font: inherit;
		font-size: 13px;
		min-height: 40px;
		border: 1px solid #d7ddea;
		border-radius: 6px;
		background: white;
		padding: 8px 9px;
		color: #35435c;
	}
	select {
		cursor: pointer;
	}
	input[type='checkbox'] {
		width: 19px;
		height: 19px;
		min-height: 0;
		accent-color: #344d91;
		cursor: pointer;
	}
	select:disabled {
		background: #f5f6f9;
		color: #a3a9b5;
	}
	button {
		min-height: 40px;
		background: #30477f;
		color: white;
		border: 1px solid #30477f;
		border-radius: 7px;
		padding: 10px 18px;
		font: inherit;
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;
		white-space: nowrap;
	}
	.secondary {
		background: white;
		border-color: #d4dce9;
		color: #344563;
	}
	button:disabled,
	input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.worksheet-feedback { padding: 0 26px; }
	.invalid-cell { background: #fff0f0; }
	.invalid-cell select { border-color: #bc3636; }
	.cell-error { color: #972929; max-width: 230px; line-height: 1.5; }
	.details-toggle { margin: 20px 0 0; }
	@media (max-width: 650px) {
		td.invalid-cell { flex-wrap: wrap; padding: 10px 6px; }
		.cell-error { flex-basis: 100%; max-width: none; }
	}
	.save-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 18px 26px;
	}
	.save-actions {
		display: flex;
		gap: 10px;
	}
	.save-bar p {
		margin: 0;
		color: #5e6d85;
		font-size: 12px;
	}
	.dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #ce9136;
		margin-right: 5px;
	}
	.add-student {
		display: grid;
		grid-template-columns: 1fr 1fr 115px auto;
		gap: 12px;
		align-items: center;
		padding: 22px 26px;
		border-top: 1px solid #e6eaf1;
		background: #fafbfe;
	}
	.add-student strong {
		font-size: 13px;
	}
	.add-hint {
		margin: 0;
		padding: 0 26px 16px;
		font-size: 12px;
		color: #667187;
		background: #fafbfe;
	}
	.rules {
		font-size: 12px;
		color: #788399;
		line-height: 1.8;
		margin: 18px 2px 26px;
	}
	.rules strong {
		color: #53617a;
		margin-right: 8px;
	}
	.tools,
	.details-panel {
		padding: 20px 26px;
		border: 1px solid #dde2ec;
		border-radius: 10px;
		background: white;
		margin-top: 20px;
	}
	summary {
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;
	}
	.tools p,
	.tools a {
		font-size: 13px;
	}
	.student-detail-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 12px;
	}
	button.delete-student { background: white; color: #a12929; border-color: #d4dce9; }
	.edit-row {
		display: grid;
		grid-template-columns: 1fr 120px auto;
		flex: 1;
		gap: 12px;
	}
	.csv-forms {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		margin-top: 20px;
	}
	.csv-forms form,
	label {
		display: grid;
		gap: 10px;
	}
	.notice,
	.success,
	.error {
		padding: 14px 20px;
		border-radius: 8px;
		font-size: 14px;
	}
	.notice {
		background: #fff1d5;
	}
	.success {
		background: #e0f1e7;
		color: #285e42;
	}
	.error {
		background: #fbe7e7;
		color: #972929;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 850px) {
		main {
			padding: 24px 16px;
		}
		.contests {
			grid-template-columns: 1fr;
		}
		.section-heading {
			align-items: flex-start;
		}
		.status {
			display: none;
		}
		.add-student {
			grid-template-columns: 1fr 120px;
		}
		.add-student > div {
			grid-column: 1 / -1;
		}
		.add-student input {
			grid-column: 1;
			min-width: 0;
			width: 100%;
		}
		.section-heading,
		.save-bar {
			flex-wrap: wrap;
		}
		.student-detail-row { display: block; }
		.student-detail-row > form + form { margin-top: 12px; }
		.edit-row {
			grid-template-columns: 1fr;
		}
		.page-heading {
			gap: 15px;
		}
		h1 {
			font-size: 27px;
		}
		.division {
			white-space: nowrap;
		}
	}
	@media (max-width: 650px) {
		.mobile-sort {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 0 20px 18px;
			font-size: 12px;
		}
		.mobile-sort select { flex: 1; min-width: 0; }
		.sort-hint { margin-left: 20px; margin-right: 20px; }
		.page-heading {
			align-items: flex-start;
		}
		.division {
			padding: 7px 10px;
			font-size: 11px;
		}
		.section-heading {
			padding: 20px;
		}
		.counts {
			padding: 0 20px 20px;
			gap: 14px;
		}
		.table-scroll {
			overflow: visible;
		}
		table,
		tbody {
			display: block;
		}
		thead {
			display: none;
		}
		tr {
			display: block;
			padding: 14px 20px;
			border-top: 1px solid #e6eaf1;
		}
		td {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			border: 0;
			padding: 6px 0;
		}
		td::before {
			content: attr(data-label);
			font-size: 12px;
			color: #68738a;
		}
		td.student-col {
			display: block;
			padding: 0 0 12px;
		}
		td.student-col::before {
			display: none;
		}
		td.student-col strong {
			font-size: 15px;
		}
		.assignment {
			width: 190px;
		}
		td > select {
			width: 190px;
		}
		.knowdown-col {
			text-align: left;
		}
		.save-bar {
			padding: 20px;
		}
		.save-bar button {
			width: 100%;
		}
		.add-student {
			padding: 20px;
		}
		.contests a,
		.future {
			padding: 15px;
		}
		.tools {
			padding: 20px;
		}
	}
</style>
