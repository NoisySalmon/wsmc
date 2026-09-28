<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const grades = [9, 10, 11, 12];
	const categories = [
		['project', 'Project'],
		['team_contest', 'Team Contest'],
		['topical_team', 'Topical Team'],
		['topical_individual', 'Topical Individual'],
		['knowdown', 'Knowdown'],
	] as const;

	function label(category: string): string {
		return categories.find(([value]) => value === category)?.[1] ?? category;
	}

	function rostered(studentId: string): boolean {
		return data.rosterIds.includes(studentId);
	}

	function membersFor(entryId: string) {
		return data.members.filter((member: { entryId: string }) => member.entryId === entryId);
	}

	function studentName(studentId: string): string {
		return data.students.find((student: { id: string }) => student.id === studentId)?.name ?? studentId;
	}

	let knowdownIds = $derived(
		new Set(
			data.members
				.filter((member: { entryId: string }) =>
					data.entries.some((entry: { id: string; category: string }) => entry.id === member.entryId && entry.category === 'knowdown'),
				)
				.map((member: { annualStudentId: string }) => member.annualStudentId),
		),
	);

	type MatrixEntry = { id: string; category: string; entryNumber: number | null };
	type MatrixMember = { entryId: string; annualStudentId: string; competingGrade: number | null };

	function sortedEntries(category: string): MatrixEntry[] {
		return (data.entries as MatrixEntry[]).filter((entry) => entry.category === category).sort((a, b) => (a.entryNumber ?? 999) - (b.entryNumber ?? 999));
	}

	function memberGrade(entryId: string, studentId: string): number | null {
		return (data.members as MatrixMember[]).find((member) => member.entryId === entryId && member.annualStudentId === studentId)?.competingGrade ?? null;
	}

	function actualGradeOf(studentId: string): number {
		return data.students.find((student: { id: string }) => student.id === studentId)?.actualGrade ?? 9;
	}

	let rosteredStudents = $derived(data.students.filter((student: { id: string }) => rostered(student.id)));
	let teamContestEntries = $derived(sortedEntries('team_contest'));
	let topicalTeamEntries = $derived(sortedEntries('topical_team'));
	let topicalIndividualIds = $derived(
		new Set(
			(data.members as MatrixMember[]).filter((member) => sortedEntries('topical_individual').some((entry) => entry.id === member.entryId)).map((member) => member.annualStudentId),
		),
	);
	let projectEntries = $derived(sortedEntries('project'));
	let projectIds = $derived(
		new Set((data.members as MatrixMember[]).filter((member) => projectEntries.some((entry) => entry.id === member.entryId)).map((member) => member.annualStudentId)),
	);
	let teamContestByStudent = $derived(
		new Map(
			(data.members as MatrixMember[]).flatMap((member) => {
				const entry = teamContestEntries.find((candidate) => candidate.id === member.entryId);
				return entry ? [[member.annualStudentId, { team: entry.entryNumber ?? 1, grade: member.competingGrade }] as const] : [];
			}),
		),
	);
	let topicalTeamByStudent = $derived(
		new Map(
			(data.members as MatrixMember[]).flatMap((member) => {
				const entry = topicalTeamEntries.find((candidate) => candidate.id === member.entryId);
				return entry ? [[member.annualStudentId, { team: entry.entryNumber ?? 1, grade: member.competingGrade }] as const] : [];
			}),
		),
	);
	let maxTeamContestTeam = $derived(Math.max(0, ...teamContestEntries.map((entry) => entry.entryNumber ?? 0)));
	let maxTopicalTeam = $derived(Math.max(0, ...topicalTeamEntries.map((entry) => entry.entryNumber ?? 0)));
</script>

<svelte:head><title>{data.school.name} registration — WSMC</title></svelte:head>

<main>
	<p><a href="/participation">← Participation</a></p>
	<h1>{data.school.name}</h1>
	<p class="subheading">{data.contest.name} · Division {data.participation.division} · {data.contest.lifecycle}</p>
	{#if data.readOnly}<p class="locked">This roster is read-only while the contest is {data.contest.lifecycle}.</p>{/if}
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.success}</p>{/if}

	<section class="readiness" aria-label="Registration readiness">
		<strong>Registration readiness</strong>
		<span>{data.readiness.annualStudentCount} annual students · {data.readiness.rosterCount} rostered · {data.readiness.entryCount} entries · {data.readiness.categories}/5 categories used</span>
	</section>

	<section>
		<h2>Annual students</h2>
		<p class="help">Keep the annual list separate from contest participation. Students are not automatically entered in any category.</p>
		<div class="student-list">
			{#each data.students as student}
				<article class="student-card">
					<form use:enhance method="POST" action="?/updateStudent">
						<input type="hidden" name="studentId" value={student.id} />
						<label>Name <input name="name" value={student.name} required /></label>
						<label>Actual grade <select name="actualGrade">{#each grades as grade}<option value={grade} selected={grade === student.actualGrade}>{grade}</option>{/each}</select></label>
						<button disabled={data.readOnly} type="submit">Save student</button>
					</form>
					<form use:enhance method="POST" action="?/deleteStudent"><input type="hidden" name="studentId" value={student.id} /><button class="quiet danger" disabled={data.readOnly} type="submit">Delete</button></form>
				</article>
			{/each}
		</div>
		<form class="add-student" use:enhance method="POST" action="?/addStudent">
			<label>Name <input name="name" placeholder="Student name" required /></label><label>Actual grade <select name="actualGrade">{#each grades as grade}<option value={grade}>{grade}</option>{/each}</select></label><button disabled={data.readOnly} type="submit">Add annual student</button>
		</form>
	</section>

	<section>
		<h2>Contest roster</h2>
		<p class="help">Select students explicitly for this regional contest. This selection does not create category entries.</p>
		<form use:enhance method="POST" action="?/saveRoster">
			<div class="roster-list">{#each data.students as student}<label class="roster-row"><input type="checkbox" name="studentIds" value={student.id} checked={rostered(student.id)} disabled={data.readOnly} /><span><strong>{student.name}</strong> · actual grade {student.actualGrade}</span></label>{/each}</div>
			<div class="bulk-actions"><button disabled={data.readOnly} type="submit">Save roster</button><span class="help">Most students participate in most contests — tick everyone attending, then save once.</span></div>
		</form>
	</section>

	<section>
		<h2>Knowdown nominations</h2>
		<p class="help">Nominate up to 3 rostered students. Saving replaces this school's Knowdown entries.</p>
		<form use:enhance method="POST" action="?/saveKnowdown">
			<div class="roster-list">{#each data.students.filter((student: { id: string }) => rostered(student.id)) as student}<label class="roster-row"><input type="checkbox" name="studentIds" value={student.id} checked={knowdownIds.has(student.id)} disabled={data.readOnly} /><span><strong>{student.name}</strong> · actual grade {student.actualGrade}</span></label>{/each}</div>
			<div class="bulk-actions"><button disabled={data.readOnly} type="submit">Save Knowdown ({knowdownIds.size} of 3)</button></div>
		</form>
	</section>

	<section>
		<h2>Team Contest teams</h2>
		<p class="help">Start from each rostered student: pick a team and an optional competing grade (defaults to their actual grade). Saving replaces this school's Team Contest entries.</p>
		{#if rosteredStudents.length === 0}<p class="help">Add students to the contest roster first.</p>{:else}
		<form use:enhance method="POST" action="?/saveTeamContest">
			<div class="matrix-list">{#each rosteredStudents as student}<div class="matrix-row"><span class="matrix-name"><strong>{student.name}</strong> · actual {student.actualGrade}</span><label>Team <select name={`team_${student.id}`}><option value="">—</option>{#each Array.from({ length: maxTeamContestTeam + 1 }, (_, i) => i + 1) as team}<option value={team} selected={teamContestByStudent.get(student.id)?.team === team}>Team {team}</option>{/each}</select></label><label>Competing grade <select name={`grade_${student.id}`}><option value="">Actual ({student.actualGrade})</option>{#each grades as grade}<option value={grade} selected={teamContestByStudent.get(student.id)?.grade === grade}>{grade}</option>{/each}</select></label></div>{/each}</div>
			<div class="bulk-actions"><button disabled={data.readOnly} type="submit">Save Team Contest ({teamContestEntries.length} team{teamContestEntries.length === 1 ? '' : 's'})</button></div>
		</form>{/if}
	</section>

	<section>
		<h2>Topical assignments</h2>
		<p class="help">Each rostered student competes in either a Topical Team or Topical Individual — never both. Saving replaces this school's Topical entries.</p>
		{#if rosteredStudents.length === 0}<p class="help">Add students to the contest roster first.</p>{:else}
		<form use:enhance method="POST" action="?/saveTopical">
			<div class="matrix-list">{#each rosteredStudents as student}<div class="matrix-row"><span class="matrix-name"><strong>{student.name}</strong> · actual {student.actualGrade}</span><label>Participation <select name={`mode_${student.id}`}><option value="unassigned" selected={!topicalTeamByStudent.has(student.id) && !topicalIndividualIds.has(student.id)}>—</option><option value="team" selected={topicalTeamByStudent.has(student.id)}>Team</option><option value="individual" selected={!topicalTeamByStudent.has(student.id) && topicalIndividualIds.has(student.id)}>Individual</option></select></label><label>Team <select name={`team_${student.id}`}><option value="">—</option>{#each Array.from({ length: maxTopicalTeam + 1 }, (_, i) => i + 1) as team}<option value={team} selected={topicalTeamByStudent.get(student.id)?.team === team}>Team {team}</option>{/each}</select></label><label>Competing grade <select name={`grade_${student.id}`}><option value="">Actual ({student.actualGrade})</option>{#each grades as grade}<option value={grade} selected={topicalTeamByStudent.get(student.id)?.grade === grade}>{grade}</option>{/each}</select></label></div>{/each}</div>
			<div class="bulk-actions"><button disabled={data.readOnly} type="submit">Save Topical ({topicalTeamEntries.length} team{topicalTeamEntries.length === 1 ? '' : 's'})</button></div>
		</form>{/if}
	</section>

	<section>
		<h2>Project teams</h2>
		<p class="help">Few schools enter project teams. Tick up to 3 rostered students to form a new team; competing grades default to actual grades.</p>
		{#if rosteredStudents.filter((student) => !projectIds.has(student.id)).length === 0}<p class="help">Every rostered student is already on a project team, or the roster is empty.</p>{:else}
		<form use:enhance method="POST" action="?/createProjectTeam">
			<div class="roster-list">{#each rosteredStudents.filter((student) => !projectIds.has(student.id)) as student}<label class="roster-row"><input type="checkbox" name="memberIds" value={student.id} disabled={data.readOnly} /><span><strong>{student.name}</strong> · actual grade {student.actualGrade}</span><select name={`grade_${student.id}`} aria-label={`Competing grade for ${student.name}`}><option value="">Actual ({student.actualGrade})</option>{#each grades as grade}<option value={grade}>{grade}</option>{/each}</select></label>{/each}</div>
			<div class="bulk-actions"><button disabled={data.readOnly} type="submit">Create project team</button></div>
		</form>{/if}
		{#if projectEntries.length > 0}<div class="entry-list">{#each projectEntries as entry}<article class="entry-card"><header><div><h3>Project</h3><span>{entry.entryNumber ? `Team ${entry.entryNumber}` : 'Unnumbered'} · team</span></div><form use:enhance method="POST" action="?/deleteEntry"><input type="hidden" name="entryId" value={entry.id} /><button class="quiet danger" disabled={data.readOnly} type="submit">Delete team</button></form></header>
			<ul>{#each membersFor(entry.id) as member}<li>{studentName(member.annualStudentId)}{#if member.competingGrade}<span> · competing grade {member.competingGrade}</span>{/if}<form use:enhance method="POST" action="?/removeMember"><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="studentId" value={member.annualStudentId} /><button class="remove" disabled={data.readOnly} type="submit" aria-label="Remove {studentName(member.annualStudentId)}">×</button></form></li>{/each}</ul>
		</article>{/each}</div>{/if}
	</section>

	<details class="advanced">
		<summary>Advanced entry editor</summary>
		<p class="help">Entry-by-entry corrections. Most coaches should use the Team Contest, Topical, Project, and Knowdown panels above.</p>
		<form class="new-entry" use:enhance method="POST" action="?/createEntry">
			<label>Category <select name="category">{#each categories as category}<option value={category[0]}>{category[1]}</option>{/each}</select></label><label>Entry number <input type="number" min="1" name="entryNumber" placeholder="Optional" /></label><button disabled={data.readOnly} type="submit">Create entry</button>
		</form>
		<div class="entry-list">{#each data.entries as entry}<article class="entry-card"><header><div><h3>{label(entry.category)}</h3><span>{entry.entryNumber ? `Entry ${entry.entryNumber}` : 'Unnumbered'} · {entry.entryKind}</span></div><form use:enhance method="POST" action="?/deleteEntry"><input type="hidden" name="entryId" value={entry.id} /><button class="quiet danger" disabled={data.readOnly} type="submit">Delete entry</button></form></header>
			<ul>{#each membersFor(entry.id) as member}<li>{studentName(member.annualStudentId)}{#if member.competingGrade}<span> · competing grade {member.competingGrade}</span>{/if}<form use:enhance method="POST" action="?/removeMember"><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="studentId" value={member.annualStudentId} /><button class="remove" disabled={data.readOnly} type="submit" aria-label="Remove {studentName(member.annualStudentId)}">×</button></form></li>{/each}</ul>
			<form class="member-form" use:enhance method="POST" action="?/addMember"><input type="hidden" name="entryId" value={entry.id} /><label>Rostered student <select name="studentId" required>{#each data.students.filter((student) => rostered(student.id)) as student}<option value={student.id}>{student.name}</option>{/each}</select></label>{#if entry.entryKind === 'team'}<label>Competing grade <select name="competingGrade">{#each grades as grade}<option value={grade}>{grade}</option>{/each}</select></label>{:else}<input type="hidden" name="competingGrade" value="" />{/if}<button disabled={data.readOnly} type="submit">Add member</button></form>
		</article>{/each}</div>
	</details>

	<section class="csv">
		<h2>CSV round trip</h2>
		<p class="help">Download a versioned template, edit it in a spreadsheet, preview the complete file, then upload it to apply all changes atomically.</p>
		<p><a href={`/registration/${data.contest.id}/${data.school.id}/csv`}>Download registration CSV</a></p>
		<div class="csv-forms">
			<form use:enhance method="POST" action="?/previewCsv" enctype="multipart/form-data">
				<label>CSV file to preview <input type="file" name="file" accept=".csv,text/csv" required /></label>
				<button disabled={data.readOnly} type="submit">Preview CSV</button>
			</form>
			<form use:enhance method="POST" action="?/importCsv" enctype="multipart/form-data">
				<label>CSV file to import <input type="file" name="file" accept=".csv,text/csv" required /></label>
				<button disabled={data.readOnly} type="submit">Import CSV</button>
			</form>
		</div>
		{#if form?.csvSummary}<p class="success">{form.csvSummary.rows.length} rows · {form.csvSummary.newStudents} new students · {form.csvSummary.categorySelections} category selections.</p>{/if}
		{#if form?.csvErrors?.length}<ul class="csv-errors">{#each form.csvErrors as csvError}<li>Row {csvError.rowNumber}, {csvError.field}: {csvError.message}</li>{/each}</ul>{/if}
	</section>

	{#if data.canReopen && data.contest.lifecycle === 'roster_locked'}<section class="reopen"><h2>Reopen roster</h2><p>Reopening returns this contest to Registration open and records a reason in the audit history.</p><form use:enhance method="POST" action="?/reopen"><label>Reason <textarea name="reason" required></textarea></label><button type="submit">Reopen for correction</button></form></section>{/if}
</main>

<style>
	main { max-width: 760px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; }
	h1 { margin-bottom: 0.25rem; } h2 { margin-bottom: 0.35rem; } h3 { margin: 0; font-size: 1rem; } .subheading, .help { color: #666; } .help { margin-top: 0; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	.readiness { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 1rem; padding: 0.8rem; border-radius: 6px; background: #eef3ff; } .readiness span { color: #445; }
	.locked { padding: 0.7rem; background: #fff5d6; color: #715500; border-radius: 5px; }
	.student-list, .entry-list { display: grid; gap: 0.7rem; } .student-card, .entry-card { padding: 0.8rem; border: 1px solid #ddd; border-radius: 6px; }
	.student-card > form:first-child { display: grid; grid-template-columns: 1fr 7rem auto; align-items: end; gap: 0.6rem; } .student-card > form:last-child { margin-top: 0.5rem; }
	.add-student, .new-entry, .member-form { display: grid; grid-template-columns: 1fr 8rem auto; align-items: end; gap: 0.6rem; margin-top: 0.8rem; }
	.matrix-list { display: grid; gap: 0.6rem; } .matrix-row { display: grid; grid-template-columns: 1fr 10rem 10rem; gap: 0.6rem; align-items: end; padding: 0.6rem; border: 1px solid #eee; border-radius: 6px; } .matrix-name { align-self: center; } details.advanced { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; } details.advanced summary { cursor: pointer; font-weight: 700; min-height: 2.75rem; }
	.member-form { grid-template-columns: 1fr 9rem auto; } .roster-list { display: grid; gap: 0.4rem; } .roster-row { display: flex; align-items: center; justify-content: flex-start; gap: 0.6rem; padding: 0.6rem 0; border-bottom: 1px solid #eee; cursor: pointer; } .roster-row input[type="checkbox"] { width: 1.25rem; height: 1.25rem; min-height: 0; accent-color: #1a1a2e; } .bulk-actions { display: flex; align-items: center; gap: 0.8rem; margin-top: 0.8rem; flex-wrap: wrap; }
	.entry-card header, .entry-card li { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; } .entry-card header span, .entry-card li span { color: #666; font-size: 0.85rem; } .entry-card ul { list-style: none; margin: 0.7rem 0; padding: 0; } .entry-card li { padding: 0.35rem 0; border-bottom: 1px solid #eee; } .entry-card li form { margin-left: auto; }
	label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.9rem; } input, select, textarea { box-sizing: border-box; width: 100%; min-height: 2.75rem; padding: 0.55rem; font: inherit; border: 1px solid #aaa; border-radius: 4px; } textarea { min-height: 5rem; }
	button { min-height: 2.75rem; padding: 0.55rem 0.75rem; border: 0; border-radius: 4px; background: #1a1a2e; color: #fff; cursor: pointer; white-space: nowrap; } button:disabled { opacity: 0.5; cursor: not-allowed; } button.quiet { background: #555; } button.danger { background: #8d2d2d; } button.remove { min-height: 2rem; padding: 0.15rem 0.5rem; background: transparent; color: #8d2d2d; font-size: 1.2rem; }
	.error, .success { padding: 0.7rem; border-radius: 5px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; }
	.csv-forms { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; } .csv-forms form { display: grid; gap: 0.6rem; padding: 0.8rem; border: 1px solid #ddd; border-radius: 6px; } .csv-errors { padding-left: 1.2rem; color: #9a2020; }
	@media (max-width: 620px) { .student-card > form:first-child, .add-student, .new-entry, .member-form, .matrix-row, .csv-forms { grid-template-columns: 1fr; align-items: stretch; } .roster-row, .entry-card header, .entry-card li { align-items: flex-start; flex-direction: column; } .entry-card li form { margin-left: 0; } }
</style>
