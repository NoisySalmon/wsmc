<script lang="ts">
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
					<form method="POST" action="?/updateStudent">
						<input type="hidden" name="studentId" value={student.id} />
						<label>Name <input name="name" value={student.name} required /></label>
						<label>Actual grade <select name="actualGrade">{#each grades as grade}<option value={grade} selected={grade === student.actualGrade}>{grade}</option>{/each}</select></label>
						<button disabled={data.readOnly} type="submit">Save student</button>
					</form>
					<form method="POST" action="?/deleteStudent"><input type="hidden" name="studentId" value={student.id} /><button class="quiet danger" disabled={data.readOnly} type="submit">Delete</button></form>
				</article>
			{/each}
		</div>
		<form class="add-student" method="POST" action="?/addStudent">
			<label>Name <input name="name" placeholder="Student name" required /></label><label>Actual grade <select name="actualGrade">{#each grades as grade}<option value={grade}>{grade}</option>{/each}</select></label><button disabled={data.readOnly} type="submit">Add annual student</button>
		</form>
	</section>

	<section>
		<h2>Contest roster</h2>
		<p class="help">Select students explicitly for this regional contest. This selection does not create category entries.</p>
		<div class="roster-list">{#each data.students as student}<div class="roster-row"><span><strong>{student.name}</strong> · actual grade {student.actualGrade}</span>{#if rostered(student.id)}<form method="POST" action="?/removeRoster"><input type="hidden" name="studentId" value={student.id} /><button class="quiet" disabled={data.readOnly} type="submit">Remove from roster</button></form>{:else}<form method="POST" action="?/addRoster"><input type="hidden" name="studentId" value={student.id} /><button disabled={data.readOnly} type="submit">Add to roster</button></form>{/if}</div>{/each}</div>
	</section>

	<section>
		<h2>Category entries</h2>
		<p class="help">Create an entry, then add rostered students. Team competing grades are stored per entry membership.</p>
		<form class="new-entry" method="POST" action="?/createEntry">
			<label>Category <select name="category">{#each categories as category}<option value={category[0]}>{category[1]}</option>{/each}</select></label><label>Entry number <input type="number" min="1" name="entryNumber" placeholder="Optional" /></label><button disabled={data.readOnly} type="submit">Create entry</button>
		</form>
		<div class="entry-list">{#each data.entries as entry}<article class="entry-card"><header><div><h3>{label(entry.category)}</h3><span>{entry.entryNumber ? `Entry ${entry.entryNumber}` : 'Unnumbered'} · {entry.entryKind}</span></div><form method="POST" action="?/deleteEntry"><input type="hidden" name="entryId" value={entry.id} /><button class="quiet danger" disabled={data.readOnly} type="submit">Delete entry</button></form></header>
			<ul>{#each membersFor(entry.id) as member}<li>{studentName(member.annualStudentId)}{#if member.competingGrade}<span> · competing grade {member.competingGrade}</span>{/if}<form method="POST" action="?/removeMember"><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="studentId" value={member.annualStudentId} /><button class="remove" disabled={data.readOnly} type="submit" aria-label="Remove {studentName(member.annualStudentId)}">×</button></form></li>{/each}</ul>
			<form class="member-form" method="POST" action="?/addMember"><input type="hidden" name="entryId" value={entry.id} /><label>Rostered student <select name="studentId" required>{#each data.students.filter((student) => rostered(student.id)) as student}<option value={student.id}>{student.name}</option>{/each}</select></label>{#if entry.entryKind === 'team'}<label>Competing grade <select name="competingGrade">{#each grades as grade}<option value={grade}>{grade}</option>{/each}</select></label>{:else}<input type="hidden" name="competingGrade" value="" />{/if}<button disabled={data.readOnly} type="submit">Add member</button></form>
		</article>{/each}</div>
	</section>

	{#if data.canReopen && data.contest.lifecycle === 'roster_locked'}<section class="reopen"><h2>Reopen roster</h2><p>Reopening returns this contest to Registration open and records a reason in the audit history.</p><form method="POST" action="?/reopen"><label>Reason <textarea name="reason" required></textarea></label><button type="submit">Reopen for correction</button></form></section>{/if}
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
	.member-form { grid-template-columns: 1fr 9rem auto; } .roster-list { display: grid; gap: 0.4rem; } .roster-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.6rem 0; border-bottom: 1px solid #eee; }
	.entry-card header, .entry-card li { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; } .entry-card header span, .entry-card li span { color: #666; font-size: 0.85rem; } .entry-card ul { list-style: none; margin: 0.7rem 0; padding: 0; } .entry-card li { padding: 0.35rem 0; border-bottom: 1px solid #eee; } .entry-card li form { margin-left: auto; }
	label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.9rem; } input, select, textarea { box-sizing: border-box; width: 100%; min-height: 2.75rem; padding: 0.55rem; font: inherit; border: 1px solid #aaa; border-radius: 4px; } textarea { min-height: 5rem; }
	button { min-height: 2.75rem; padding: 0.55rem 0.75rem; border: 0; border-radius: 4px; background: #1a1a2e; color: #fff; cursor: pointer; white-space: nowrap; } button:disabled { opacity: 0.5; cursor: not-allowed; } button.quiet { background: #555; } button.danger { background: #8d2d2d; } button.remove { min-height: 2rem; padding: 0.15rem 0.5rem; background: transparent; color: #8d2d2d; font-size: 1.2rem; }
	.error, .success { padding: 0.7rem; border-radius: 5px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; }
	@media (max-width: 620px) { .student-card > form:first-child, .add-student, .new-entry, .member-form { grid-template-columns: 1fr; align-items: stretch; } .roster-row, .entry-card header, .entry-card li { align-items: flex-start; flex-direction: column; } .entry-card li form { margin-left: 0; } }
</style>
