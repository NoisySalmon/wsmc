<script lang="ts">
	import ContestStatus from '$lib/components/ContestStatus.svelte';
	let screenshotView = $state('auto');
	const phoneMedia = $derived(screenshotView === 'phone' ? 'all' : screenshotView === 'desktop' ? 'not all' : '(max-width: 650px)');
	const stages = [
		{ status: 'setup', description: 'Your coordinator is preparing the contest. Contact them if you need to register.' },
		{ status: 'registration_open', description: 'Coaches can add students and save registrations.' },
		{ status: 'roster_locked', description: 'Coach registration is closed. Ask your coordinator for corrections.' },
		{ status: 'scoring', description: 'Scores are being entered. Ask your coordinator for corrections.' },
		{ status: 'finalized', description: 'Results have been finalized. Coach registration remains closed.' }
	];
</script>

<svelte:head>
	<title>Regional contest coach guide — WSMC</title>
	<meta name="description" content="How to register your regional contest team, use the worksheet, edit student details, and remove a student." />
</svelte:head>

<main>
	<a href="/help">← All help</a>
	<header>
		<p class="eyebrow">COACH GUIDE · REGIONAL CONTEST</p>
		<h1>Register your regional team</h1>
		<p class="lead">From your first student to a saved contest roster. Keep this guide open beside your worksheet.</p>
		<p class="caption">Screenshots use a local demonstration school. Your students, season, assignments, and Knowdown limit may differ. Phone examples show a 390-pixel-wide layout. All screenshots are captured at twice their display resolution for clear text.</p>
		<label class="screenshot-choice">Screenshot view <select bind:value={screenshotView}><option value="auto">Match my screen</option><option value="phone">Phone</option><option value="desktop">Desktop</option></select></label>
	</header>
	<div class="guide-layout">
		<aside>
			<nav aria-label="On this page">
				<strong>On this page</strong>
				<a href="#start">1. Find your school</a>
				<a href="#add-students">2. Add students</a>
				<a href="#worksheet">3. Assign events</a>
				<a href="#save">4. Save and review</a>
				<a href="#student-details">Edit student details</a>
				<a href="#remove-student">Remove a student</a>
				<a href="#csv">Import a CSV</a>
				<a href="#troubleshooting">Gotchas and help</a>
			</nav>
		</aside>
		<article>
			<div class="callout"><strong>Two kinds of information, two save buttons.</strong> Use <b>Save contest</b> for attendance and events. Use <b>Save student</b> in Student details for a name or actual grade. Worksheet edits do not save automatically.</div>
			<section id="start">
				<h2>1. Find your school</h2>
				<p>Sign in using the link sent to your email. Choose <a href="/my-schools">My schools</a> in the navigation, check the school and season year, then choose <b>Open school registration</b>. Check the regional contest and division before entering students.</p>
				<figure class:phone={screenshotView === 'phone'} class:auto-view={screenshotView === 'auto'}><picture><source media={phoneMedia} srcset="/help/images/coach-regional/my-schools-phone.png" width="390" height="844" /><img src="/help/images/coach-regional/my-schools.png" alt="My schools showing Hanford, its regional assignment, a Registration open badge, and Open school registration." width="1280" height="800" /></picture><figcaption>Start with the correct school and season. Use the Phone or Desktop links below each screenshot to view it at full size. <span class="full-size">Full size: <a href="/help/images/coach-regional/my-schools-phone.png">Phone</a> · <a href="/help/images/coach-regional/my-schools.png">Desktop</a></span></figcaption></figure>
				<p>If your school is missing or its contest or division is wrong, contact your regional coordinator. These assignments are managed by organizers.</p>
				<dl class="stages">{#each stages as stage}<div><dt><ContestStatus status={stage.status} /></dt><dd>{stage.description}</dd></div>{/each}</dl>
				<p>A withdrawn school or archived season is also read only. The worksheet’s notice tells you when registration is closed.</p>
			</section>
			<section id="add-students">
				<h2>2. Add students</h2>
				<ol><li>Scroll below the worksheet to <b>Add a student</b>.</li><li>Enter their full name and actual school grade (9–12).</li><li>Choose <b>+ Add student</b>. This saves the student immediately and includes them as attending this contest.</li><li>Find their row in the worksheet and assign their events.</li></ol>
				<p>The student record is available throughout this season. Attendance and event assignments belong to this contest. An attending student still needs event selections; attendance alone does not select every event.</p>
				<figure class:phone={screenshotView === 'phone'} class:auto-view={screenshotView === 'auto'}><picture><source media={phoneMedia} srcset="/help/images/coach-regional/add-student-phone.png" width="390" height="844" /><img src="/help/images/coach-regional/add-student.png" alt="The bottom of the worksheet with Save contest and the Add a student name, grade, and button." width="1280" height="800" loading="lazy" /></picture><figcaption>Add students below the worksheet. Save or cancel worksheet edits first if adding is disabled. <span class="full-size">Full size: <a href="/help/images/coach-regional/add-student-phone.png">Phone</a> · <a href="/help/images/coach-regional/add-student.png">Desktop</a></span></figcaption></figure>
			</section>
			<section id="worksheet">
				<h2>3. Use the “Who’s doing what?” worksheet</h2>
				<p>Each row is one student. Work across the row to set attendance and events. Counts above the table reflect your current selections; they can include unsaved changes.</p>
				<figure class:phone={screenshotView === 'phone'} class:auto-view={screenshotView === 'auto'}><picture><source media={phoneMedia} srcset="/help/images/coach-regional/worksheet-phone.png" width="390" height="844" /><img src="/help/images/coach-regional/worksheet.png" alt="Regional worksheet showing student attendance, Team Contest, Topical, Project, and Knowdown assignments." width="1280" height="800" loading="lazy" /></picture><figcaption>Team numbers group students within each event. The adjacent grade is their competing grade for that team event. <span class="full-size">Full size: <a href="/help/images/coach-regional/worksheet-phone.png">Phone</a> · <a href="/help/images/coach-regional/worksheet.png">Desktop</a></span></figcaption></figure>
				<div class="table-wrap"><table><thead><tr><th scope="col">Column</th><th scope="col">What to choose</th></tr></thead><tbody>
					<tr><th scope="row">Student</th><td>Name and actual grade. Change these in <a href="#student-details">Student details</a>, below the worksheet.</td></tr>
					<tr><th scope="row">Attendance</th><td><b>Attending</b> includes the student. <b>Not attending</b> disables their event controls and clears this contest’s assignments when you save.</td></tr>
					<tr><th scope="row">Team Contest</th><td>Select a team number and competing grade, or <b>No event</b>.</td></tr>
					<tr><th scope="row">Topical</th><td>Select a team number and competing grade, <b>Individual</b>, or <b>No event</b>. The grade selector is disabled for Individual.</td></tr>
					<tr><th scope="row">Project</th><td>An optional team number and competing grade, or <b>No event</b>.</td></tr>
					<tr><th scope="row">Knowdown</th><td>Check to nominate the student. Follow the limit shown above the column and in the nominee count; it can vary by contest.</td></tr>
				</tbody></table></div>
				<h3>Team numbers and competing grades</h3>
				<p>Give teammates the same team number <em>in that event</em>. Team Contest, Topical, and Project teams are independent: Team 1 in one column does not populate Team 1 in another.</p>
				<p>Each team can have up to three students, with different competing grades. A student can compete at their actual grade or above, never below it. For example, two actual grade 9 students on the same team need different competing grades, such as 9 and 10.</p>
				<h3>Sort to review teams</h3>
				<p>Choose a column heading to sort. Event sorting groups teams in competing-grade order; choose it again to reverse team order. Sorting does not change assignments. On a phone, each student appears as a card: scroll down within the page to work through the roster. Use <b>Sort students by</b> above the first card to choose an event, and the arrow button beside it to reverse the order.</p>
			</section>
			<section id="save">
				<h2>4. Save and review</h2>
				<ol><li>Scroll past <em>all</em> student rows or cards to the save bar and choose <b>Save contest</b>.</li><li>Read the feedback. Fix any highlighted cells or reported registration issues, then save again.</li><li>Check attendance, team composition, competing grades, and the Knowdown total. Confirm the save bar says <b>All assignments shown are saved</b>.</li></ol>
				<p><b>Cancel</b> restores the last saved worksheet assignments. It does not undo students you added or name changes you saved separately. Save or cancel worksheet changes before adding students, saving student details, deleting a student, or importing CSV.</p>
				<p>There is no separate “Submit registration” button. Keep the saved worksheet correct before your coordinator closes registration. After closure, contact them for corrections.</p>
			</section>
			<section id="student-details">
				<h2>Edit a student’s name or actual grade</h2>
				<ol><li>Save or cancel pending worksheet changes.</li><li>Scroll below the team rules and choose <b>Edit student details</b>.</li><li>Find the student and edit their name or actual grade.</li><li>Choose <b>Save student</b> on that student’s row. On a phone, the name, grade, Save student, and Delete student controls are stacked for each student; check the name above the button before using it. Repeat for other students, then choose <b>Close student details</b> when finished.</li></ol>
				<figure class:phone={screenshotView === 'phone'} class:auto-view={screenshotView === 'auto'}><picture><source media={phoneMedia} srcset="/help/images/coach-regional/student-details-phone.png" width="390" height="844" /><img src="/help/images/coach-regional/student-details.png" alt="Student details panel with an edited Guide Example Student name and an enabled Save student button." width="1280" height="800" loading="lazy" /></picture><figcaption>Save student applies only to that row. It becomes available after you change the name or actual grade. <span class="full-size">Full size: <a href="/help/images/coach-regional/student-details-phone.png">Phone</a> · <a href="/help/images/coach-regional/student-details.png">Desktop</a></span></figcaption></figure>
				<p>Names and actual grades are shared across the season. Competing grades are event assignments in the worksheet. If increasing an actual grade conflicts with an existing lower competing grade, correct the competing grades and save the contest first. Contact your coordinator if the conflicting entry is in another contest or registration is closed.</p>
				<p>Closing the panel is not a save action. Save each intended change explicitly.</p>
			</section>
			<section id="remove-student">
				<h2>Remove a student: choose the right outcome</h2>
				<h3>They are sitting out this regional contest</h3>
				<ol><li>Set their worksheet Attendance to <b>Not attending</b>.</li><li>Choose <b>Save contest</b> below the worksheet.</li></ol>
				<p>This removes their attendance and event assignments from this contest while keeping their season student record. If they return later, set Attending again and reassign their events; the saved assignments were cleared.</p>
				<figure class:phone={screenshotView === 'phone'} class:auto-view={screenshotView === 'auto'}><picture><source media={phoneMedia} srcset="/help/images/coach-regional/not-attending-phone.png" width="390" height="844" /><img src="/help/images/coach-regional/not-attending.png" alt="Guide Example Student marked Not attending with disabled event fields in the worksheet." width="1280" height="800" loading="lazy" /></picture><figcaption>Marking Not attending is the first step. Save contest commits the removal from this contest. <span class="full-size">Full size: <a href="/help/images/coach-regional/not-attending-phone.png">Phone</a> · <a href="/help/images/coach-regional/not-attending.png">Desktop</a></span></figcaption></figure>
				<h3>They are a duplicate or were added by mistake</h3>
				<ol><li>Mark the unwanted student <b>Not attending</b> and choose <b>Save contest</b>.</li><li>Open <b>Edit student details</b> below the worksheet.</li><li>Find that student and choose <b>Delete student</b>. Finish or revert any unsaved name or grade edits on that row first.</li><li>Read the confirmation, check the student and season, and confirm only if you want to permanently delete that season record.</li><li>Look for the “deleted from this season” message and check that their row is gone.</li></ol>
				<figure class:phone={screenshotView === 'phone'} class:auto-view={screenshotView === 'auto'}><picture><source media={phoneMedia} srcset="/help/images/coach-regional/delete-student-phone.png" width="390" height="844" /><img src="/help/images/coach-regional/delete-student.png" alt="Student details after saving Not attending, with Delete student enabled for Guide Example Student." width="1280" height="800" loading="lazy" /></picture><figcaption>Delete student becomes available after the saved regional roster and entries no longer use the student. <span class="full-size">Full size: <a href="/help/images/coach-regional/delete-student-phone.png">Phone</a> · <a href="/help/images/coach-regional/delete-student.png">Desktop</a></span></figcaption></figure>
				<div class="callout warning"><strong>Deletion cannot be undone.</strong> It removes the student record for this season. Records still used by any contest roster or event entry cannot be deleted. If deletion is blocked after saving Not attending here, ask your coordinator to check other contest registrations.</div>
			</section>
			<section id="csv">
				<h2>Add students from CSV</h2>
				<ol><li>Save or cancel worksheet changes, then expand <b>Add students from CSV</b>.</li><li>Choose <b>Download registration CSV template</b> and fill in one row per student using its headers.</li><li>Select your file under <b>Preview a CSV</b> and choose <b>Preview CSV</b>. Read the summary and any row errors; correct your file as needed. Preview does not import.</li><li>Select the corrected file again under <b>Import a CSV</b> and choose <b>Import CSV</b>.</li><li>Review the resulting worksheet and feedback. Set Project teams and correct remaining registration issues there, then save worksheet edits.</li></ol>
				<p>Imports add new students as attending. Existing students are skipped by name and grade; importing an edited file does not update existing students or replace their assignments. Incomplete or unreadable rows can be skipped, so check the counts.</p>
				<ul><li>Use positive whole numbers for team numbers.</li><li>Blank Team Contest means no event.</li><li><b>Blank Topical means Individual in CSV</b>; check the worksheet if you meant no Topical event.</li><li>Knowdown accepts Yes or No; blank means No.</li><li>Competing grades start at the student’s actual grade. Review play-up grades in the worksheet.</li><li>CSV imports are available only while registration is open.</li></ul>
			</section>
			<section id="troubleshooting">
				<h2>Gotchas and help</h2>
				<dl class="faq">
					<dt>Why is Save student disabled?</dt><dd>Change that row’s name or actual grade first. Save or cancel worksheet edits. Registration must be editable, and another student save or deletion must finish first.</dd>
					<dt>Why is Delete student disabled?</dt><dd>Save Not attending in the worksheet first. Resolve pending worksheet and student-detail edits. The student must have no roster or event memberships, and registration must be editable.</dd>
					<dt>Why are event fields disabled?</dt><dd>The student may be Not attending, the event may be No event, or registration may be read only. Topical Individual does not use the team competing-grade selector.</dd>
					<dt>Why is a team cell red?</dt><dd>Read the message beside it. Check for more than three teammates, repeated competing grades, or a competing grade below actual grade. Check the Knowdown limit too.</dd>
					<dt>Can I change a closed registration?</dt><dd>Coaches cannot edit after registration closes. Contact your regional coordinator with your school, student, and requested correction. A withdrawn school or archived season also blocks editing.</dd>
					<dt>Can I leave and return later?</dt><dd>Yes, after saving. Leaving with worksheet changes can lose them. Use the guide links beside the worksheet to open help in a separate tab while working.</dd>
				</dl>
				<p>Before contest day, review the correct school and season, attendance, all event assignments, competing grades, and nominees. Resolve reported issues and confirm everything is saved.</p>
			</section>
			<p><a href="#start">Back to the start ↑</a> · <a href="/my-schools">Open My schools</a></p>
		</article>
	</div>
</main>

<style>
	:global(body) { background: #f5f6fa; }
	main { max-width: 1200px; margin: auto; padding: 2rem 1.5rem 4rem; color: #20283d; }
	header { max-width: 850px; margin: 2rem 0; }
	.eyebrow { color: #586887; font-size: .75rem; font-weight: 700; letter-spacing: .1em; }
	h1 { font-size: clamp(2rem, 4vw, 2.8rem); line-height: 1.15; margin: .5rem 0 1rem; }
	.lead { font-size: 1.2rem; color: #53617a; }
	.guide-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 2.5rem; align-items: start; }
	aside { position: sticky; top: 1rem; }
	nav { display: grid; gap: .65rem; font-size: .9rem; padding: 1rem 0; }
	a { color: #304d86; text-underline-offset: .15em; }
	article { min-width: 0; }
	section { scroll-margin-top: 1.5rem; padding-top: 1rem; margin-bottom: 2.5rem; }
	h2 { font-size: 1.6rem; line-height: 1.3; margin: 1rem 0; }
	h3 { margin-top: 1.5rem; font-size: 1.15rem; }
	p, li, dd { line-height: 1.7; }
	li { margin-bottom: .65rem; padding-left: .25rem; }
	.callout { border-left: 4px solid #45639b; background: #eaf0fb; border-radius: 5px; padding: 1rem 1.25rem; line-height: 1.7; }
	.callout strong { display: block; }
	.warning { border-color: #aa6e15; background: #fff3d7; }
	figure { margin: 1.5rem 0; }
	figure.phone { max-width: 390px; }
	.full-size { display: block; margin-top: .35rem; }
	.screenshot-choice { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; font-size: .9rem; font-weight: 600; margin-top: 1rem; }
	.screenshot-choice select { font: inherit; padding: .65rem; border: 1px solid #bac5d6; border-radius: 6px; background: white; color: #20283d; min-height: 44px; }
	@media (max-width: 650px) { figure.auto-view { max-width: 390px; } }
	img { display: block; width: 100%; height: auto; border: 1px solid #d7ddea; border-radius: 8px; box-sizing: border-box; }
	figcaption, .caption { font-size: .85rem; line-height: 1.6; color: #58647a; }
	figcaption { margin-top: .6rem; }
	.table-wrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; background: white; }
	th, td { text-align: left; vertical-align: top; padding: .8rem; border-bottom: 1px solid #dce1ea; line-height: 1.6; }
	thead { background: #eaf0f8; }
	.stages > div { display: grid; grid-template-columns: 150px 1fr; gap: .75rem; margin: 1rem 0; }
	dd { margin: 0; }
	.faq dt { font-weight: 700; margin-top: 1.25rem; }
	@media (max-width: 800px) { .guide-layout { grid-template-columns: 1fr; gap: 1rem; } aside { position: static; } nav { border-block: 1px solid #dce1ea; } }
	@media (max-width: 480px) { main { padding: 1.25rem 1rem 3rem; } .stages > div { grid-template-columns: 1fr; gap: .3rem; } }
	@media print { aside, main > a { display: none; } .guide-layout { display: block; } :global(body) { background: white; } main { padding: 0; } figure, tr, .callout { break-inside: avoid; } }
</style>
