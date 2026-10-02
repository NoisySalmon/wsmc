<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let dirty = $state(false);
	let saving = $state(false);
	let editing = $state(false);
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
					teamGrade: team.grade,
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
					topicalGrade: topical.grade,
					project: project.team,
					projectGrade: project.grade,
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
	let rows = $state<Row[]>(makeRows());
	$effect(() => {
		rows = makeRows();
		dirty = false;
	});
	const attending = $derived(rows.filter((r) => r.attending === 'yes'));
	const teamCount = $derived(
		new Set(attending.map((r) => r.team).filter(Boolean)).size,
	);
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
	<a class="back" href="/my-schools" onclick={guardNavigation}>← My schools</a>
	<header class="page-heading">
		<div>
			<p class="eyebrow">MY TEAM / {data.season?.name ?? 'Season'}</p>
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
				>{data.readOnly ? 'Read only' : 'Registration open'}</span
			></a
		>{#if data.stateContest}<a
				href={`/state/${data.stateContest.id}`}
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
	{#if data.readOnly}<p class="notice">
			This contest is read-only ({data.contest.lifecycle.replaceAll('_', ' ')}).
			Contact your coordinator for corrections.
		</p>{/if}
	{#if form?.error}<p class="error" role="alert">
			{form.error} Your changes have not been saved.
		</p>{/if}
	{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
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
			<button
				class="secondary"
				type="button"
				onclick={() => (editing = !editing)}
				>{editing ? 'Close student details' : 'Edit student details'}</button
			>
		</div>
		<div class="counts">
			<span><strong>{rows.length}</strong> students</span><span
				><strong>{attending.length}</strong> attending</span
			><span
				><strong>{teamCount}</strong> Team Contest {teamCount === 1
					? 'team'
					: 'teams'}</span
			><span class:over={nominees > 3}
				><strong>{nominees}/3</strong> Knowdown nominees</span
			>
		</div>
		<form
			method="POST"
			action="?/saveWorksheet"
			oninput={() => (dirty = true)}
			onchange={() => (dirty = true)}
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			<div class="table-scroll">
				<table>
					<thead
						><tr
							><th class="student-col">Student</th><th>Attendance</th><th
								>Team Contest<small>Team · competing grade</small></th
							><th>Topical<small>Team or individual · grade</small></th><th
								>Project<small>Optional team · grade</small></th
							><th class="knowdown-col"
								>Knowdown<small>Up to 3 students</small></th
							></tr
						></thead
					><tbody>
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
										disabled={data.readOnly}
										><option value="yes">Attending</option><option value="no"
											>Not attending</option
										></select
									></td
								>
								<td data-label="Team Contest"
									><div class="assignment">
										<select
											name={`team_${row.id}`}
											aria-label={`Team Contest team for ${row.name}`}
											bind:value={row.team}
											disabled={data.readOnly || row.attending === 'no'}
											><option value="">No event</option
											>{#each teamNumbers as team}<option value={team}
													>Team {team}</option
												>{/each}</select
										><select
											name={`teamGrade_${row.id}`}
											aria-label={`Team Contest grade for ${row.name}`}
											bind:value={row.teamGrade}
											disabled={data.readOnly ||
												row.attending === 'no' ||
												!row.team}
											><option value="">{row.actualGrade}</option
											>{#each grades.filter((g) => g >= row.actualGrade) as grade}<option
													value={String(grade)}>{grade}</option
												>{/each}</select
										>
									</div></td
								>
								<td data-label="Topical"
									><div class="assignment">
										<select
											name={`topical_${row.id}`}
											aria-label={`Topical event for ${row.name}`}
											bind:value={row.topical}
											disabled={data.readOnly || row.attending === 'no'}
											><option value="">No event</option><option
												value="individual">Individual</option
											>{#each teamNumbers as team}<option value={team}
													>Team {team}</option
												>{/each}</select
										><select
											name={`topicalGrade_${row.id}`}
											aria-label={`Topical grade for ${row.name}`}
											bind:value={row.topicalGrade}
											disabled={data.readOnly ||
												row.attending === 'no' ||
												!row.topical ||
												row.topical === 'individual'}
											><option value="">{row.actualGrade}</option
											>{#each grades.filter((g) => g >= row.actualGrade) as grade}<option
													value={String(grade)}>{grade}</option
												>{/each}</select
										>
									</div></td
								>
								<td data-label="Project"
									><div class="assignment">
										<select
											name={`project_${row.id}`}
											aria-label={`Project team for ${row.name}`}
											bind:value={row.project}
											disabled={data.readOnly || row.attending === 'no'}
											><option value="">No event</option
											>{#each teamNumbers as team}<option value={team}
													>Team {team}</option
												>{/each}</select
										><select
											name={`projectGrade_${row.id}`}
											aria-label={`Project grade for ${row.name}`}
											bind:value={row.projectGrade}
											disabled={data.readOnly ||
												row.attending === 'no' ||
												!row.project}
											><option value="">{row.actualGrade}</option
											>{#each grades.filter((g) => g >= row.actualGrade) as grade}<option
													value={String(grade)}>{grade}</option
												>{/each}</select
										>
									</div></td
								>
								<td class="knowdown-col" data-label="Knowdown"
									><input
										type="checkbox"
										name={`knowdown_${row.id}`}
										aria-label={`Nominate ${row.name} for Knowdown`}
										bind:checked={row.knowdown}
										disabled={data.readOnly || row.attending === 'no'}
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
			<div class="save-bar">
				<p>
					{#if dirty}<span class="dot"></span> Unsaved changes{:else}All
						assignments shown are saved{/if}<small
						>Not attending clears this contest’s assignments when you save.</small
					>
				</p>
				<button type="submit" disabled={data.readOnly || saving || nominees > 3}
					>{saving ? 'Saving…' : 'Save contest'}</button
				>
			</div>
		</form>
		<form class="add-student" method="POST" action="?/addStudent" use:enhance>
			<div>
				<strong>Add a student</strong><small
					>Included in this contest · available all season</small
				>
			</div>
			<label class="sr-only" for="student-name">Student name</label><input
				id="student-name"
				name="name"
				placeholder="Full name"
				required
				disabled={data.readOnly || dirty}
			/><label class="sr-only" for="student-grade">Actual grade</label><select
				id="student-grade"
				name="actualGrade"
				disabled={data.readOnly || dirty}
				>{#each grades as grade}<option value={grade}>Grade {grade}</option
					>{/each}</select
			><button class="secondary" disabled={data.readOnly || dirty}
				>+ Add student</button
			>
		</form>
		{#if dirty}<p class="add-hint">
				Save your contest changes before adding or editing students.
			</p>{/if}
	</section>
	<p class="rules">
		<strong>Team rules</strong> Up to 3 students per team, with different competing
		grades. Students can compete at their actual grade or above. Team Contest, Topical,
		and Project teams are independent.
	</p>
	{#if editing}<section class="details-panel">
			<h2>Student details</h2>
			<p class="intro">Names and actual grades are shared across the season.</p>
			{#each data.students as student}<form
					class="edit-row"
					method="POST"
					action="?/updateStudent"
					use:enhance
				>
					<input type="hidden" name="studentId" value={student.id} /><input
						aria-label={`Name for ${student.name}`}
						name="name"
						value={student.name}
						required
					/><select
						aria-label={`Actual grade for ${student.name}`}
						name="actualGrade"
						>{#each grades as grade}<option
								value={grade}
								selected={grade === student.actualGrade}>Grade {grade}</option
							>{/each}</select
					><button disabled={data.readOnly || dirty}>Save student</button>
				</form>{/each}
		</section>{/if}
	<details class="tools">
		<summary>Spreadsheet import & export</summary>
		<p>
			Download your registration, edit it in a spreadsheet, and preview before
			importing. Save worksheet changes first.
		</p>
		<a href={`/registration/${data.contest.id}/${data.school.id}/csv`}
			>Download registration CSV</a
		>
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
					><button disabled={data.readOnly || dirty}
						>{action === 'previewCsv' ? 'Preview CSV' : 'Import CSV'}</button
					>
				</form>{/each}
		</div>
		{#if form?.csvSummary}<p>
				{form.csvSummary.rows.length} rows · {form.csvSummary.newStudents} new students
			</p>{/if}{#if form?.csvErrors?.length}<ul>
				{#each form.csvErrors as error}<li>
						Row {error.rowNumber}, {error.field}: {error.message}
					</li>{/each}
			</ul>{/if}
	</details>
	{#if data.canReopen && data.contest.lifecycle === 'roster_locked'}<section
			class="details-panel"
		>
			<h2>Reopen for corrections</h2>
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
	.save-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 18px 26px;
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
	.edit-row {
		display: grid;
		grid-template-columns: 1fr 120px auto;
		gap: 12px;
		margin-top: 12px;
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
