<script lang="ts">
 import AdHocTeams from './AdHocTeams.svelte';
 import type { getAdHocDashboard } from '$lib/server/state/ad-hoc';
 import { defaultStateAdHoc, type AdHocEvent } from '$lib/state-registration';
 import { enhance } from '$app/forms';
 import type { getStateWorksheet, StateEvent, StateRow, NewStateStudent } from '$lib/server/state/worksheet';
 let { registration, form, isCoordinator, adHoc: adHocPools }: { registration: Awaited<ReturnType<typeof getStateWorksheet>>; form: { error?: string; success?: string } | null; isCoordinator: boolean; adHoc: Awaited<ReturnType<typeof getAdHocDashboard>> } = $props();
 const columns: { key: StateEvent; label: string }[] = [{key:'team_contest',label:'Team Contest'}, {key:'topical_team',label:'Topical Team'}, {key:'topical_individual',label:'Topical Individual'}, {key:'knowdown',label:'Knowdown'}];
 let rows = $state<StateRow[]>([]);
 let newStudents = $state<NewStateStudent[]>([]);
 let newName = $state('');
 let newGrade = $state(9);
 const students = $derived([...registration.students, ...newStudents]);
 function addSubstitute(event: SubmitEvent) {
  event.preventDefault();
  const name = newName.trim();
  if (!name) return;
  const id = crypto.randomUUID();
  newStudents.push({ id, name, actualGrade: Number(newGrade) });
  rows.push({ id, attending: true, events: { team_contest:'', topical_team:'', topical_individual:'', project:'', knowdown:'' }, grades: { team_contest:Number(newGrade), topical_team:Number(newGrade), topical_individual:Number(newGrade), project:Number(newGrade), knowdown:Number(newGrade) } });
  newName = ''; showAll = true; feedback = false;
 }
 function invited(id: string) { return originalOptions(id).some(o => o.category === 'project'); }

 let baseline = $state('');
 let saving = $state(false);
 let attendanceSaving = $state(false);
 let confirmingWithdrawal = $state(false);
 let confirmWithdrawal = $state(false);
 let showAll = $state(false);
 let feedback = $state(true);
 $effect(() => { rows = structuredClone(registration.rows); newStudents = []; baseline = JSON.stringify(registration.rows); confirmingWithdrawal = false; confirmWithdrawal = false; });
 const dirty = $derived(JSON.stringify(rows) !== baseline);
 const canChangeSchoolAttendance = $derived(registration.seasonStatus === 'state' && (registration.contest.lifecycle === 'registration_open' || (isCoordinator && registration.contest.lifecycle === 'roster_locked')));
 const readOnly = $derived(registration.withdrawn || registration.seasonStatus !== 'state' || registration.contest.lifecycle !== 'registration_open');
 function originalOptions(id: string) { return registration.options.filter(o => o.studentId === id || (o.team && o.originalIds.includes(id))); }
 const visibleRows = $derived(rows.filter(r => showAll || r.attending || originalOptions(r.id).length));
 const attending = $derived(rows.filter(r => r.attending));
 function qualifyingTeam(row: StateRow) { return registration.options.some(o => o.team && o.category !== 'project' && row.events[o.category] === o.id); }
 function individualQualified(id: string) { return registration.options.some(option => option.category === 'topical_individual' && option.studentId === id); }
 function defaultEvents(row: StateRow) { defaultStateAdHoc(row, Boolean(originalOptions(row.id).length || qualifyingTeam(row)), individualQualified(row.id)); }
 function changeEvent(row: StateRow, category: StateEvent) {
  if (category === 'team_contest' || category === 'topical_team') {
   row.adHocOptOuts = (row.adHocOptOuts ?? []).filter(event => event !== category);
   if (!row.events[category]) row.adHocOptOuts.push(category as AdHocEvent);
  }
  if (category === 'topical_individual' && row.events.topical_individual && row.events.topical_team === 'ad_hoc') row.events.topical_team = '';
  if (category === 'topical_team' && row.events.topical_team) row.events.topical_individual = '';
  defaultEvents(row);
 }
 function needsTeam(row: StateRow) { return !registration.withdrawn && row.attending && !originalOptions(row.id).length && !qualifyingTeam(row); }
 const unattachedSubstitutes = $derived(attending.filter(needsTeam));
 const missingParticipation = $derived(attending.filter(r => !invited(r.id) && !Object.entries(r.events).some(([category, value]) => category !== 'project' && value)));
 const adHoc = $derived(attending.flatMap(r => ['team_contest', 'topical_team'].filter(category => r.events[category as StateEvent] === 'ad_hoc')));
 const teams = $derived(registration.options.filter(o => o.team && o.category !== 'project').map(option => ({ option, members: rows.filter(r => r.attending && r.events[option.category] === option.id) })));
 const warnings = $derived(teams.filter(t => t.members.length && (!t.members.some(r => t.option.originalIds.includes(r.id)) || t.members.length > 3 || new Set(t.members.map(r => r.grades[t.option.category])).size !== t.members.length)));
 function student(id: string) { return students.find(s => s.id === id)!; }
 function teamLabel(o: typeof registration.options[number]) { return `Team ${o.number ?? registration.options.filter(x => x.category === o.category).indexOf(o) + 1}`; }
 function reset() { rows = structuredClone(registration.rows); newStudents = []; feedback = false; }
 function leave(event: MouseEvent) { if (dirty && !confirm('You have unsaved state registration changes. Leave this page?')) event.preventDefault(); }
</script>
<svelte:window onbeforeunload={event => {if(dirty) {event.preventDefault();event.returnValue='';}}}/>
<main>
 <a href={isCoordinator ? `/state/${registration.contest.id}` : '/my-schools'} onclick={leave}>← {isCoordinator ? 'All state schools' : 'My schools'}</a>
 <header><div><p class="eyebrow">MY TEAM / STATE CONTEST</p><h1>{registration.school.schoolName}</h1><p class="intro">Your regional qualifiers, ready for State. Confirm attendance, choose events, and fill out your teams.</p></div><span class="division">Division {registration.school.division}</span></header>
 <nav aria-label="State registration"><a class="active" href="#roster">Who’s doing what?</a><a href="#teams">Review teams</a><a href={`/state/${registration.contest.id}/csv?schoolId=${registration.school.schoolId}`}>Download roster CSV</a></nav>
 <section class="school-attendance" aria-label="School attendance">
  <strong>{registration.withdrawn ? 'School not attending State' : registration.saved ? 'Registration saved' : 'Attendance undecided'}</strong>
  {#if registration.withdrawn}
   <p>{registration.saved ? 'Your saved worksheet is preserved below for reference. Your school has no active entries or Ad Hoc signups. Resume registration to restore the saved roster and event choices.' : 'Your school is not attending State. Resume registration to review the qualification preview; attendance will remain undecided until you save.'}</p>
   {#if canChangeSchoolAttendance}<form method="POST" action="?/changeSchoolAttendance" use:enhance={() => {attendanceSaving=true; return async ({update}) => {await update({reset:false});attendanceSaving=false;feedback=true;};}}><input type="hidden" name="schoolId" value={registration.school.schoolId}/><input type="hidden" name="change" value="resume"/><button disabled={attendanceSaving}>{attendanceSaving ? 'Resuming…' : 'Resume registration'}</button></form>{:else}<p>Contact a state administrator to change attendance after rosters lock.</p>{/if}
  {:else if canChangeSchoolAttendance}
   {#if !confirmingWithdrawal}<button class="secondary" type="button" disabled={saving || attendanceSaving} onclick={() => confirmingWithdrawal=true}>Withdraw registration</button>
   {:else}<form class="withdraw-confirmation" method="POST" action="?/changeSchoolAttendance" use:enhance={() => {attendanceSaving=true; return async ({update}) => {await update({reset:false});attendanceSaving=false;feedback=true;};}}>
    <input type="hidden" name="schoolId" value={registration.school.schoolId}/><input type="hidden" name="change" value="withdraw"/>
    <p>Withdraw the whole school? This removes all students from active entries and Ad Hoc signup pools. {registration.saved ? 'Your last saved worksheet will be kept for resuming.' : 'You can resume later to review your published qualifications.'}</p>
    {#if dirty}<p>Unsaved worksheet changes will be discarded. Cancel withdrawal to save them first.</p>{/if}
    <label class="toggle"><input type="checkbox" name="confirmWithdrawal" value="yes" required bind:checked={confirmWithdrawal}/> Confirm that our school will not attend State.</label>
    <button type="button" class="secondary" disabled={attendanceSaving} onclick={() => {confirmingWithdrawal=false;confirmWithdrawal=false;}}>Cancel</button> <button disabled={!confirmWithdrawal || attendanceSaving || saving}>{attendanceSaving ? 'Withdrawing…' : 'Confirm school withdrawal'}</button>
   </form>{/if}
  {:else if registration.saved && registration.contest.lifecycle !== 'registration_open'}<p>Contact a state administrator to change school attendance.</p>{/if}
 </section>
 {#if readOnly && !registration.withdrawn}<p class="notice">State registration is closed. This worksheet is read-only.</p>{:else if !registration.saved && !registration.withdrawn}<p class="notice">Starting from published qualifications and regional team assignments. Review the defaults, then save to confirm your state registration.</p>{/if}
 {#if feedback && form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if feedback && form?.success}<p class="success" role="status">{form.success}</p>{/if}
 {#if registration.needsTrackUpdate && !readOnly}<p class="notice">Saved Topical Team choices for Topical Individual qualifiers have been cleared from this worksheet. Save registration to apply the update.</p>{/if}
 <section id="roster">
  <p class="eyebrow">STATE CONTEST</p><h2>{registration.withdrawn ? registration.saved ? 'Saved worksheet' : 'Qualification preview' : 'Who’s doing what?'}</h2>
  <p>Qualified students start in their qualified events, with Ad Hoc filling free Team Contest and topical slots. Topical Individual qualifiers keep the individual track. Mark absences as “Not attending” or choose “No event” to opt out. Attendees without a Knowdown entry join the audience. Individual qualifications stay with the student. Every attendee needs an event, a Project / Math + Art invitation, or an Ad Hoc signup. Substitutes must belong to a qualified team.</p>
  <div class="counts"><span><strong>{rows.filter(r => originalOptions(r.id).length).length}</strong> regional qualifiers</span><span><strong>{registration.withdrawn ? 0 : attending.length}</strong> attending</span><span><strong>{registration.withdrawn ? 0 : teams.filter(t => t.members.length).length}</strong> teams</span><span><strong>{registration.withdrawn ? 0 : adHoc.length}</strong> Ad Hoc signups</span></div>
  <label class="toggle"><input type="checkbox" bind:checked={showAll} /> Show the full school roster to add substitutes</label>
  <form method="POST" action="?/saveWorksheet" oninput={() => feedback = false} use:enhance={() => { saving = true; return async ({update}) => {await update({reset:false}); saving=false;feedback=true;}; }}>
   <input type="hidden" name="newStudents" value={JSON.stringify(newStudents)}/><input type="hidden" name="schoolId" value={registration.school.schoolId}/><input type="hidden" name="rows" value={JSON.stringify(rows)}/>
   <div class="table-scroll"><table><thead><tr><th>Student</th><th>{registration.withdrawn ? registration.saved ? 'Saved attendance' : 'Default attendance' : 'Attendance'}</th>{#each columns as column}<th>{column.label}<small>{column.key === 'team_contest' || column.key === 'topical_team' ? 'Team · competing grade' : 'Qualified individual'}</small></th>{/each}</tr></thead><tbody>
    {#each visibleRows as row (row.id)}
     <tr class:absent={!row.attending} class:invalid={missingParticipation.includes(row) || needsTeam(row)}><th scope="row">{student(row.id).name}<small>Grade {student(row.id).actualGrade} · {originalOptions(row.id).length ? 'Regional qualifier' : 'Substitute'}</small><small class="qualified">{originalOptions(row.id).map(o => o.category === 'project' ? 'Project / Math + Art invitee' : `${columns.find(c => c.key === o.category)?.label}${o.team ? ' '+teamLabel(o) : ''}`).join(' · ')}</small></th>
      <td>{#if readOnly}{row.attending ? registration.withdrawn ? registration.saved ? 'Previously attending' : 'Would attend' : 'Attending' : 'Not attending'}{:else}<select aria-label={`Attendance for ${student(row.id).name}`} bind:value={() => row.attending, value => { row.attending = value; defaultEvents(row); }}><option value={true}>Attending</option><option value={false}>Not attending</option></select>{/if}{#if needsTeam(row)}<small class="participation-error">Join a qualified team or mark Not attending.</small>{:else if missingParticipation.includes(row)}<small class="participation-error">Choose an event or Ad Hoc, or mark Not attending.</small>{/if}</td>
      {#each columns as column}
       {@const choices = registration.options.filter(o => o.category === column.key && (o.team || o.studentId === row.id))}
       <td data-label={column.label}>
        {#if !row.attending}<span class="muted">—</span>{:else if column.key === 'topical_team' && individualQualified(row.id)}<span class="muted">No event</span>{:else if !choices.length && column.key !== 'team_contest' && column.key !== 'topical_team'}<span class="muted">{column.key === 'knowdown' ? 'Audience' : 'No event'}</span>{:else if readOnly}{@const selected = choices.find(o => o.id === row.events[column.key])}{row.events[column.key] === 'ad_hoc' ? 'Ad Hoc' : selected ? selected.team ? teamLabel(selected) : 'Participating' : column.key === 'knowdown' ? 'Audience' : 'No event'}{:else}
         <div class="assignment"><select aria-label={`${column.label} for ${student(row.id).name}`} bind:value={() => row.events[column.key], value => { row.events[column.key] = value; changeEvent(row, column.key); }}><option value="">{column.key === 'knowdown' ? 'Audience' : 'No event'}</option>{#if column.key === 'team_contest' || column.key === 'topical_team'}<option value="ad_hoc" disabled={!originalOptions(row.id).length && !qualifyingTeam(row)}>Ad Hoc{!originalOptions(row.id).length && !qualifyingTeam(row) ? ' — join a qualified team first' : ''}</option>{/if}{#each choices as option}<option value={option.id}>{option.team ? teamLabel(option) : 'Participating'}</option>{/each}</select>
         {#if choices.some(o => o.team) && row.events[column.key] && row.events[column.key] !== 'ad_hoc'}<select class="grade" aria-label={`${column.label} competing grade for ${student(row.id).name}`} bind:value={row.grades[column.key]}>{#each [9,10,11,12].filter(g => g >= student(row.id).actualGrade) as grade}<option value={grade}>{grade}</option>{/each}</select>{/if}</div>
        {/if}
       </td>
      {/each}
     </tr>
    {/each}
   </tbody></table></div>
   {#if !registration.withdrawn && warnings.length}<div class="error" role="alert">Review highlighted teams below. Each active team needs an original member, no more than three players, and different competing grades.</div>{/if}
   {#if !readOnly}<div class="save"><span>{dirty ? 'Unsaved changes' : registration.saved ? 'Registration saved' : 'Ready for review'}</span><button type="button" class="secondary" onclick={reset} disabled={!dirty || saving}>Cancel changes</button><button type="submit" disabled={saving || attendanceSaving || warnings.length > 0 || missingParticipation.length > 0 || unattachedSubstitutes.length > 0}>{saving ? 'Saving…' : 'Save state registration'}</button></div>{/if}
  </form>
  {#if !readOnly}<details class="add-student"><summary>Add a new substitute student</summary><p>Not already on your school roster? Add their name and actual grade, then attach them to a qualified team above. Ad Hoc alone does not admit substitutes to State. The student is added when you save registration.</p>
   <form onsubmit={addSubstitute} class="student-form"><label>Student name<input required maxlength="150" bind:value={newName} /></label><label>Actual grade<select bind:value={newGrade}>{#each [9,10,11,12] as grade}<option value={grade}>{grade}</option>{/each}</select></label><button type="submit">Add to worksheet</button></form>
  </details>{/if}
 </section>
 {#if !registration.withdrawn}<section id="teams"><p class="eyebrow">TEAM REVIEW</p><h2>Your qualified teams</h2><p>Keep at least one original regional member on each participating team. Fill vacancies or substitute from your school roster above. Up to three players, different competing grades, and playing up through grade 12.</p>
  <div class="team-grid">{#each teams as team}<article class:invalid={warnings.includes(team)}><h3>{columns.find(c => c.key === team.option.category)?.label} · {teamLabel(team.option)}</h3><p class="muted">Regional members: {team.option.originalIds.map(id => registration.students.find(s => s.id === id)?.name ?? 'Unknown student').join(', ') || 'No regional members recorded'}</p>
   {#if team.members.length}<ul>{#each team.members as row}<li>{student(row.id).name} · Grade {row.grades[team.option.category]} <small>{team.option.originalIds.includes(row.id) ? 'Original member' : 'Substitute'}</small></li>{/each}</ul>{:else}<p>Not participating at State</p>{/if}
   {#if warnings.includes(team)}<p class="error">{!team.members.some(r => team.option.originalIds.includes(r.id)) ? 'Keep at least one original member or withdraw this team.' : 'Use up to three players with different competing grades.'}</p>{/if}
  </article>{/each}</div>
 </section>
 {/if}
 <AdHocTeams pools={adHocPools} lifecycle={registration.contest.lifecycle} schoolView />
 <aside><h2>The rest of the day</h2><p>Students can join Ad Hoc teams with players from other schools. Choose Ad Hoc under Team Contest or Topical Team to sign up here. See your assigned teams above; assignments are tentative until registration locks. Math + Art displays and math activities are also available.</p></aside>
</main>
<style>
 .school-attendance{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem 1.5rem;padding:1rem;border:1px solid #dce1e8;border-radius:8px;margin:1.5rem 0}.school-attendance>p,.school-attendance>form{flex-basis:100%;margin:0}.school-attendance p{color:#596273;line-height:1.5}.withdraw-confirmation{margin-top:1rem}
 .participation-error{color:#9a2020}.add-student{margin-top:1.5rem;padding:1rem;border:1px solid #dce1e8;border-radius:8px}.add-student summary{cursor:pointer;font-weight:600}.student-form{display:flex;gap:1rem;align-items:end;flex-wrap:wrap}.student-form label{display:grid;gap:.5rem}.student-form input{padding:.65rem;font:inherit;border:1px solid #aeb6c2;border-radius:4px}tr.invalid{background:#fff5f4}
 main{max-width:1400px;margin:auto;padding:2rem 1.5rem;color:#202838}a{color:#315ba6}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:1.8rem 0}h1{font-size:2.4rem;margin:.3rem 0}.eyebrow{font-size:.75rem;font-weight:750;letter-spacing:.12em;color:#596273}h2{margin:.4rem 0;font-size:1.6rem}.intro,section>p{color:#596273;line-height:1.6}.division{background:#edf1f7;border-radius:6px;padding:.6rem 1rem;white-space:nowrap}nav{display:flex;gap:1.5rem;border-bottom:1px solid #dce1e8;padding:1rem 0;flex-wrap:wrap}.active{font-weight:700}section{margin-top:2rem}small{display:block;font-size:.75rem;font-weight:400;margin-top:.35rem;color:#596273}.qualified{color:#315ba6;line-height:1.5}.notice{background:#eef3ff;padding:1rem;border-radius:6px;line-height:1.5}.counts{display:flex;gap:2rem;padding:1rem 0}.toggle{display:flex;gap:.6rem;align-items:center;margin:1rem 0;font-size:.9rem}.table-scroll{overflow-x:auto;border:1px solid #dce1e8;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{text-align:left;padding:.8rem;vertical-align:top;border-bottom:1px solid #e5e7eb;min-width:115px}thead{background:#f3f5f8}tbody th{min-width:190px}.absent{background:#f8f9fb}.muted{color:#677488}select{box-sizing:border-box;width:100%;padding:.5rem;font:inherit;min-height:40px;background:white;border:1px solid #aeb6c2;border-radius:4px}.assignment{display:flex;gap:5px}.assignment>select:first-child{min-width:105px;flex:1}.assignment>select.grade{width:54px;flex:none}.save{display:flex;gap:1rem;align-items:center;justify-content:flex-end;padding:1rem;background:#f3f5f8;position:sticky;bottom:0}.save span{margin-right:auto;font-size:.85rem}button{padding:.7rem 1rem;border:0;border-radius:4px;background:#1a1a2e;color:white;font:inherit;cursor:pointer}.secondary{background:white;color:#315ba6;border:1px solid #c9d2e0}button:disabled{opacity:.5;cursor:default}.team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}article{border:1px solid #dce1e8;border-radius:8px;padding:1rem}h3{font-size:1rem;margin:0}li{margin:.7rem 0}.invalid{border-color:#c54343}.error{background:#fbe3e3;color:#9a2020;padding:.8rem;border-radius:4px}.success{background:#e2f5e8;padding:.8rem;color:#176b35}aside{background:#f3f5f8;padding:1.5rem;border-radius:8px;margin-top:2rem}aside p{line-height:1.6}@media(max-width:650px){main{padding:1rem}.counts{gap:.7rem;flex-wrap:wrap}.save{flex-wrap:wrap}.save span{width:100%}header{align-items:start}h1{font-size:1.8rem}}
</style>
