<script lang="ts">
	let { data, form } = $props();
	const categories = [
		['project', 'Project'],
		['team_contest', 'Team Contest'],
		['topical_team', 'Topical Team'],
		['topical_individual', 'Topical Individual'],
		['knowdown', 'Knowdown'],
	] as const;
	const grades = [9, 10, 11, 12];

	function categoryLabel(category: string) { return categories.find(([value]) => value === category)?.[1] ?? category; }
	function schoolName(schoolId: string | null) { return data.qualifiedSchools.find((school: { schoolId: string }) => school.schoolId === schoolId)?.schoolName ?? data.students.find((student: { schoolId: string }) => student.schoolId === schoolId)?.schoolName ?? schoolId ?? 'Cross-school'; }
	function studentName(studentId: string) { return data.students.find((student: { id: string }) => student.id === studentId)?.name ?? studentId; }
	function participationFor(schoolId: string) { return data.participations.find((item: { participation: { schoolId: string } }) => item.participation.schoolId === schoolId)?.participation; }
	function attendanceFor(schoolId: string) { return data.attendance.find((item: { schoolId: string }) => item.schoolId === schoolId)?.intent ?? 'undecided'; }
	function membersFor(entryId: string) { return data.members.filter((item: { member: { entryId: string } }) => item.member.entryId === entryId); }
</script>

<svelte:head><title>{data.contest.name} state administration — WSMC</title></svelte:head>

<main>
	<p><a href="/program">← Program setup</a></p>
	<h1>{data.contest.name}</h1>
	<p class="subheading">State administration · {data.contest.lifecycle}{#if data.contest.lifecycle === 'scoring' || data.contest.lifecycle === 'finalized'} · <a href="/scoring/{data.contest.id}">Open state scoring</a>{/if}{#if data.contest.lifecycle === 'finalized' && data.contest.resultsPublishedAt} · <a href="/state/{data.contest.id}/results">View published results</a>{/if}</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}

	<section class="readiness" aria-label="State administration summary">
		<strong>{data.qualifiedSchools.length} qualified schools · {data.roster.length} rostered students · {data.entries.length} state entries</strong>
		<span>Topical Individual: {data.settings.topicalIndividualAllowed ? 'allowed' : 'not allowed'} · Cross-school Topical Teams: {data.settings.crossSchoolTopicalTeamsAllowed ? 'allowed' : 'not allowed'}</span>
	</section>

	<section>
		<h2>Qualified-school attendance</h2>
		<p class="help">Attendance is limited to schools with an active, published qualification and a state participation record.</p>
		<div class="school-list">
			{#each data.qualifiedSchools as school}
				<article class="school-card">
					<div><strong>{school.schoolName}</strong><span>Division {participationFor(school.schoolId)?.division ?? 'unconfirmed'} · {participationFor(school.schoolId)?.invitationStatus ?? 'not participating'}</span></div>
					<form method="POST" action="?/setAttendance">
						<input type="hidden" name="schoolId" value={school.schoolId} />
						<label>Attendance <select name="intent" aria-label="Attendance for {school.schoolName}"><option value="undecided" selected={attendanceFor(school.schoolId) === 'undecided'}>Undecided</option><option value="attending" selected={attendanceFor(school.schoolId) === 'attending'}>Attending</option><option value="not_attending" selected={attendanceFor(school.schoolId) === 'not_attending'}>Not attending</option></select></label>
						<button type="submit">Save attendance</button>
					</form>
				</article>
			{/each}
		</div>
	</section>

	<section>
		<h2>State roster</h2>
		<p class="help">Every student needs an explicit admission basis. Individual qualifications cannot be transferred; team-berth additions must identify the state team entry.</p>
		<p><a href={`/state/${data.contest.id}/csv`}>Download state roster CSV</a></p>
		<div class="roster-list">
			{#each data.roster as row}
				<div class="roster-row"><span><strong>{row.student.name}</strong> · {schoolName(row.member.schoolId)} · {row.member.admissionBasis === 'individual_qualification' ? 'individual qualification' : 'team berth'}</span><form method="POST" action="?/removeRoster"><input type="hidden" name="schoolId" value={row.member.schoolId} /><input type="hidden" name="annualStudentId" value={row.member.annualStudentId} /><button class="quiet" type="submit">Remove</button></form></div>
			{/each}
		</div>
		<form class="form-grid roster-form" method="POST" action="?/addRoster">
			<label>School <select name="schoolId" required>{#each data.qualifiedSchools as school}<option value={school.schoolId}>{school.schoolName}</option>{/each}</select></label>
			<label>Student <select name="annualStudentId" required>{#each data.students as student}<option value={student.id}>{student.name} · {schoolName(student.schoolId)} · grade {student.actualGrade}</option>{/each}</select></label>
			<label>Admission basis <select name="admissionBasis"><option value="individual_qualification">Individual qualification</option><option value="team_berth">Team berth</option></select></label>
			<label>Individual qualification <select name="qualificationId"><option value="">Select a qualification</option>{#each data.stateQualifications.filter((qualification: { studentId: string | null }) => qualification.studentId) as qualification}<option value={qualification.id}>{studentName(qualification.studentId!)} · {categoryLabel(qualification.category)} · {qualification.id}</option>{/each}</select></label>
			<label>Team-berth state entry <select name="stateEntryId"><option value="">Select an exercised team entry</option>{#each data.teamBerths.filter((item: { berth: { stateEntryId: string | null } }) => item.berth.stateEntryId) as item}<option value={item.berth.stateEntryId}>{item.berth.stateEntryId} · {categoryLabel(item.berth.category)} · {schoolName(item.berth.schoolId)}</option>{/each}</select></label>
			<button type="submit">Add to state roster</button>
		</form>
	</section>

	<section>
		<h2>State entries</h2>
		<p class="help">Entries are explicit and contest-scoped. A blank owner creates a mixed-school Team Contest only; mixed-school Topical Teams require the configured policy.</p>
		<form class="form-grid" method="POST" action="?/createEntry">
			<label>Category <select name="category">{#each categories as category}<option value={category[0]}>{category[1]}</option>{/each}</select></label>
			<label>Owner school <select name="ownerSchoolId"><option value="">Cross-school Team Contest</option>{#each data.qualifiedSchools as school}<option value={school.schoolId}>{school.schoolName}</option>{/each}</select></label>
			<label>Division <select name="division"><option value="1">Division 1</option><option value="2">Division 2</option></select></label>
			<label>Entry number <input type="number" name="entryNumber" min="1" placeholder="Optional" /></label>
			<button type="submit">Create state entry</button>
		</form>
		<div class="entry-list">
			{#each data.entries as entry}
				<article class="entry-card">
					<header><div><h3>{categoryLabel(entry.category)}</h3><span>{entry.id} · {entry.ownerSchoolId ? schoolName(entry.ownerSchoolId) : 'Cross-school'} · Division {entry.division}</span></div></header>
					<ul>{#each membersFor(entry.id) as row}<li>{row.student.name} · actual grade {row.student.actualGrade}{#if row.member.competingGrade} · competing grade {row.member.competingGrade}{/if}<form method="POST" action="?/removeMember"><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="annualStudentId" value={row.member.annualStudentId} /><button class="remove" type="submit" aria-label="Remove {row.student.name} from {categoryLabel(entry.category)}">Remove</button></form></li>{/each}</ul>
					<form class="member-form" method="POST" action="?/addMember"><input type="hidden" name="entryId" value={entry.id} /><label>Rostered student <select name="annualStudentId" required>{#each data.roster as row}<option value={row.member.annualStudentId}>{row.student.name} · {schoolName(row.member.schoolId)}</option>{/each}</select></label>{#if entry.entryKind === 'team'}<label>Competing grade <select name="competingGrade">{#each grades as grade}<option value={grade}>{grade}</option>{/each}</select></label>{/if}<button type="submit">Add member</button></form>
				</article>
			{/each}
		</div>
	</section>

	<section class="coordinator">
		<h2>Exercise a qualified team berth</h2>
		<p class="help">A coordinator can create the state team entry for a published team qualification. The berth ID is retained as the source record for later substitutions.</p>
		<div class="berth-list">{#each data.teamBerths as item}<div class="berth-row"><span><strong>{item.berth.id}</strong> · {categoryLabel(item.berth.category)} · {schoolName(item.berth.schoolId)}</span>{#if item.berth.stateEntryId}<span>State entry {item.berth.stateEntryId}</span>{:else}<form method="POST" action="?/createTeam"><input type="hidden" name="berthId" value={item.berth.id} /><button type="submit">Create team from berth</button></form>{/if}</div>{/each}</div>
	</section>
</main>

<style>
	main { max-width: 900px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; }
	h1 { margin-bottom: 0.25rem; } h2 { margin-bottom: 0.35rem; } h3 { margin: 0; font-size: 1rem; } .subheading, .help { color: #666; } .help { margin-top: 0; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	.readiness { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 1rem; padding: 0.8rem; border-radius: 6px; background: #eef3ff; } .readiness span { color: #445; }
	.school-list, .entry-list { display: grid; gap: 0.7rem; } .school-card, .entry-card { padding: 0.8rem; border: 1px solid #ddd; border-radius: 6px; } .school-card { display: flex; justify-content: space-between; align-items: center; gap: 1rem; } .school-card > div, .entry-card header div { display: flex; flex-direction: column; gap: 0.2rem; } .school-card span, .entry-card header span { color: #666; font-size: 0.85rem; }
	.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); align-items: end; gap: 0.65rem; margin-top: 0.8rem; } .roster-form { grid-template-columns: repeat(3, 1fr); } .berth-list { display: grid; gap: 0.35rem; } .berth-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.55rem 0; border-bottom: 1px solid #eee; } .berth-row > span { color: #666; }
	.roster-list { display: grid; gap: 0.35rem; } .roster-row { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; padding: 0.55rem 0; border-bottom: 1px solid #eee; } .entry-card ul { list-style: none; padding: 0; margin: 0.7rem 0; } .entry-card li { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid #eee; } .entry-card li form { margin-left: auto; }
	.member-form { display: grid; grid-template-columns: 1fr 9rem auto; align-items: end; gap: 0.65rem; } label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.9rem; } input, select { box-sizing: border-box; width: 100%; min-height: 2.75rem; padding: 0.55rem; font: inherit; border: 1px solid #aaa; border-radius: 4px; } button { min-height: 2.75rem; padding: 0.55rem 0.75rem; border: 0; border-radius: 4px; background: #1a1a2e; color: #fff; cursor: pointer; white-space: nowrap; } button.quiet { background: #555; } button.remove { min-height: 2rem; padding: 0.3rem 0.5rem; background: #555; font-size: 0.8rem; }
	.error, .success { padding: 0.7rem; border-radius: 5px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; }
	@media (max-width: 700px) { .form-grid, .member-form { grid-template-columns: 1fr; align-items: stretch; } .school-card, .roster-row, .berth-row { align-items: flex-start; flex-direction: column; } }
</style>
