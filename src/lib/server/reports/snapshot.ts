import { and, asc, eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { schema, type Database } from '$lib/server/db';
import { exportReportCsv } from './csv';
import { rankRegionalResults, rankStateResults, type RegionalResultRow } from '$lib/server/scoring/rankings';
import { isAdHocEntry } from '$lib/ad-hoc';
import { usesDivisions } from '$lib/events';
import type { StateRow } from '$lib/state-registration';

export const snapshotKinds = ['regionals', 'qualifications', 'state'] as const;
export type SnapshotKind = (typeof snapshotKinds)[number];
type Cell = string | number | boolean | null | undefined;
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

/** All source reads share a D1 batch/transaction so a live export is internally consistent. */
export async function exportSeasonSnapshot(db: Database, seasonId: string, kind: SnapshotKind) {
	const contestScope =
		kind === 'state'
			? eq(schema.contests.seasonId, seasonId)
			: and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional'));
	const [
		seasons,
		regions,
		contests,
		schools,
		students,
		participations,
		roster,
		entries,
		members,
		results,
		rounds,
		qualifications,
		reasons,
		attendance,
		berths,
		stateRoster,
		worksheets,
		signups,
	] = await db.batch([
		db.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId)),
		db
			.select()
			.from(schema.regions)
			.where(eq(schema.regions.seasonId, seasonId))
			.orderBy(asc(schema.regions.number)),
		db.select().from(schema.contests).where(contestScope).orderBy(asc(schema.contests.name)),
		db.select().from(schema.schools).orderBy(asc(schema.schools.name)),
		db
			.select()
			.from(schema.annualStudents)
			.where(eq(schema.annualStudents.seasonId, seasonId))
			.orderBy(asc(schema.annualStudents.name)),
		db
			.select({ row: schema.schoolParticipations })
			.from(schema.schoolParticipations)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
			.where(contestScope),
		db
			.select({ row: schema.contestRosterMembers })
			.from(schema.contestRosterMembers)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.contestRosterMembers.contestId))
			.where(contestScope),
		db
			.select({ row: schema.entries })
			.from(schema.entries)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId))
			.where(contestScope)
			.orderBy(asc(schema.entries.category), asc(schema.entries.entryNumber), asc(schema.entries.id)),
		db
			.select({ row: schema.entryMembers })
			.from(schema.entryMembers)
			.innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId))
			.innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId))
			.where(contestScope)
			.orderBy(asc(schema.entryMembers.annualStudentId)),
		db
			.select({ row: schema.results })
			.from(schema.results)
			.innerJoin(schema.entries, eq(schema.entries.id, schema.results.entryId))
			.innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId))
			.where(contestScope),
		db
			.select()
			.from(schema.qualificationRounds)
			.where(eq(schema.qualificationRounds.seasonId, seasonId))
			.orderBy(asc(schema.qualificationRounds.kind)),
		db
			.select()
			.from(schema.qualifications)
			.where(eq(schema.qualifications.seasonId, seasonId))
			.orderBy(asc(schema.qualifications.id)),
		db
			.select({ row: schema.qualificationReasons })
			.from(schema.qualificationReasons)
			.innerJoin(
				schema.qualifications,
				eq(schema.qualifications.id, schema.qualificationReasons.qualificationId),
			)
			.where(eq(schema.qualifications.seasonId, seasonId)),
		db
			.select({ row: schema.stateAttendances })
			.from(schema.stateAttendances)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.stateAttendances.contestId))
			.where(eq(schema.contests.seasonId, seasonId)),
		db
			.select({ row: schema.stateTeamBerths })
			.from(schema.stateTeamBerths)
			.innerJoin(schema.qualifications, eq(schema.qualifications.id, schema.stateTeamBerths.qualificationId))
			.where(eq(schema.qualifications.seasonId, seasonId)),
		db
			.select({ row: schema.stateRosterMembers })
			.from(schema.stateRosterMembers)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.stateRosterMembers.contestId))
			.where(eq(schema.contests.seasonId, seasonId)),
		db
			.select({ row: schema.stateWorksheets })
			.from(schema.stateWorksheets)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.stateWorksheets.contestId))
			.where(eq(schema.contests.seasonId, seasonId)),
		db
			.select({ row: schema.stateAdHocSignups })
			.from(schema.stateAdHocSignups)
			.innerJoin(schema.contests, eq(schema.contests.id, schema.stateAdHocSignups.contestId))
			.where(eq(schema.contests.seasonId, seasonId)),
	]);
	const season = seasons[0];
	if (!season) return null;
	const exportedAt = new Date().toISOString();
	const files: Record<string, Uint8Array> = {};
	const counts: [string, number][] = [];
	function csv(name: string, headers: string[], rows: Cell[][]) {
		files[`${name}.csv`] = strToU8(
			'\uFEFF' +
				exportReportCsv(
					headers,
					rows.map((row) => row.map((cell) => (typeof cell === 'boolean' ? (cell ? 'yes' : 'no') : cell))),
				),
		);
		counts.push([`${name}.csv`, rows.length]);
	}
	const schoolMap = new Map(schools.map((s) => [s.id, s]));
	const studentMap = new Map(students.map((s) => [s.id, s]));
	const contestMap = new Map(contests.map((c) => [c.id, c]));
	const entryMap = new Map(entries.map(({ row }) => [row.id, row]));
	const resultMap = new Map(
		results.map(({ row }) => [
			row.entryId,
			{
				...row,
				score: row.score ?? (row.part1 !== null && row.part2 !== null ? row.part1 + row.part2 : null),
			},
		]),
	);
	const participationMap = new Map(
		participations.map(({ row }) => [`${row.contestId}:${row.schoolId}`, row]),
	);
	const memberMap = new Map<string, typeof members>();
	for (const member of members) {
		const group = memberMap.get(member.row.entryId) ?? [];
		group.push(member);
		memberMap.set(member.row.entryId, group);
	}
	const schoolName = (id: string | null) =>
		id ? (schoolMap.get(id)?.name ?? '') : 'Mixed-school / statewide entry';
	const context = (id: string): Cell[] => {
		const c = contestMap.get(id);
		const r = regions.find((r) => r.id === c?.regionId);
		return [id, c?.name, c?.kind, r?.number, c?.lifecycle];
	};
	const contextHeaders = ['contest_id', 'contest', 'contest_kind', 'region', 'contest_status'];
	const studentContext = (id: string): Cell[] => {
		const s = studentMap.get(id);
		return [id, s?.name, s?.actualGrade, s?.schoolId, s ? schoolName(s.schoolId) : ''];
	};
	const studentHeaders = ['student_id', 'student', 'actual_grade', 'school_id', 'school'];
	const withdrawn = (contestId: string, schoolId: string | null) =>
		schoolId ? participationMap.get(`${contestId}:${schoolId}`)?.withdrawnAt != null : false;
	const rankingMap = new Map<string, { rank: number; actualGradeRank?: number }>();
	for (const contest of contests) {
		const rows: RegionalResultRow[] = entries
			.filter(({ row: e }) => e.contestId === contest.id && !withdrawn(e.contestId, e.ownerSchoolId))
			.map(({ row: e }) => {
				const result = resultMap.get(e.id);
				const student = studentMap.get(memberMap.get(e.id)?.[0]?.row.annualStudentId ?? '');
				return {
					entryId: e.id,
					adHoc: isAdHocEntry(e),
					category: e.category,
					division: e.division,
					entryNumber: e.entryNumber,
					schoolName: schoolName(e.ownerSchoolId),
					studentId: e.entryKind === 'individual' ? (student?.id ?? null) : null,
					studentName: e.entryKind === 'individual' ? (student?.name ?? null) : null,
					actualGrade: student?.actualGrade ?? null,
					score: result?.score ?? null,
					part1: result?.part1 ?? null,
					part2: result?.part2 ?? null,
					placement: result?.placement ?? null,
				};
			});
		for (const board of Object.values(
			contest.kind === 'state' ? rankStateResults(rows) : rankRegionalResults(rows),
		))
			for (const ranked of board) rankingMap.set(ranked.entryId, ranked);
	}
	csv(
		'contests',
		[...contextHeaders, 'starts_at_utc', 'results_published_at_utc', 'scoring_revision', 'knowdown_limit'],
		contests.map((c) => [
			...context(c.id),
			iso(c.startsAt),
			iso(c.resultsPublishedAt),
			c.scoringRevision,
			c.knowdownLimit,
		]),
	);
	csv(
		'regions',
		['region_id', 'region', 'name'],
		regions.map((r) => [r.id, r.number, r.name]),
	);
	// Include annual students even if absent or not yet assigned to an event.
	csv(
		'students',
		studentHeaders,
		students.map((s) => studentContext(s.id)),
	);
	const schoolIds = new Set([
		...students.map((s) => s.schoolId),
		...participations.map(({ row }) => row.schoolId),
	]);
	csv(
		'schools',
		[
			'school_id',
			'school',
			'short_name',
			'division',
			'address',
			'city',
			'state',
			'postal_code',
			'contact_email',
			'active',
		],
		schools
			.filter((s) => schoolIds.has(s.id))
			.map((s) => [
				s.id,
				s.name,
				s.shortName,
				s.division,
				s.address,
				s.city,
				s.state,
				s.postalCode,
				s.contactEmail,
				s.active,
			]),
	);
	csv(
		'school_participation',
		[...contextHeaders, 'participation_id', 'school_id', 'school', 'division', 'withdrawn_at_utc'],
		participations.map(({ row: p }) => [
			...context(p.contestId),
			p.id,
			p.schoolId,
			schoolName(p.schoolId),
			p.division,
			iso(p.withdrawnAt),
		]),
	);
	csv(
		'roster',
		[...contextHeaders, ...studentHeaders, 'participation_id'],
		roster.map(({ row: r }) => [
			...context(r.contestId),
			...studentContext(r.annualStudentId),
			r.participationId,
		]),
	);
	const entryHeaders = [
		...contextHeaders,
		'entry_id',
		'category',
		'entry_kind',
		'entry_number',
		'division',
		'school_id',
		'school',
		'members',
		'withdrawn',
		'ad_hoc',
		'score',
		'part1',
		'part2',
		'knowdown_outcome',
		'placement',
		'rank',
		'actual_grade_rank',
		'result_version',
		'result_updated_at_utc',
	];
	const entryRows = entries.map(({ row: e }) => {
		const r = resultMap.get(e.id);
		const rank = rankingMap.get(e.id);
		return [
			...context(e.contestId),
			e.id,
			e.category,
			e.entryKind,
			e.entryNumber,
			usesDivisions(e.category) && !isAdHocEntry(e) ? e.division : null,
			e.ownerSchoolId,
			schoolName(e.ownerSchoolId),
			(memberMap.get(e.id) ?? [])
				.map(({ row: m }) => {
					const s = studentMap.get(m.annualStudentId);
					return `${s?.name ?? m.annualStudentId} (${s?.actualGrade ?? ''}, ${s ? schoolName(s.schoolId) : ''})`;
				})
				.join('; '),
			withdrawn(e.contestId, e.ownerSchoolId),
			isAdHocEntry(e),
			r?.score,
			r?.part1,
			r?.part2,
			r?.knowdownOutcome,
			r?.placement,
			rank?.rank,
			rank?.actualGradeRank,
			r?.version,
			r ? iso(r.updatedAt) : null,
		];
	});
	csv('entries_and_scores', entryHeaders, entryRows);
	for (const category of ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'])
		csv(
			`scoring_${category}`,
			entryHeaders,
			entryRows.filter((row) => row[6] === category),
		);
	csv(
		'entry_members',
		[...contextHeaders, 'entry_id', 'category', 'entry_number', ...studentHeaders, 'competing_grade'],
		members.map(({ row: m }) => {
			const e = entryMap.get(m.entryId)!;
			return [
				...context(e.contestId),
				e.id,
				e.category,
				e.entryNumber,
				...studentContext(m.annualStudentId),
				m.competingGrade,
			];
		}),
	);
	if (kind !== 'regionals') {
		const roundMap = new Map(rounds.map((r) => [r.id, r]));
		csv(
			'qualification_rounds',
			['round_id', 'kind', 'status', 'published_at_utc', 'created_at_utc', 'source_revision'],
			rounds.map((r) => [r.id, r.kind, r.status, iso(r.publishedAt), iso(r.createdAt), r.sourceRevision]),
		);
		const cutoffRows: Cell[][] = [];
		for (const round of rounds)
			for (const [category, threshold] of Object.entries(JSON.parse(round.thresholdsJson))) {
				if (threshold !== null && typeof threshold === 'object')
					for (const [division, value] of Object.entries(threshold))
						cutoffRows.push([round.id, round.status, category, division, value as Cell]);
				else cutoffRows.push([round.id, round.status, category, null, threshold as Cell]);
			}
		csv(
			'qualification_cutoffs',
			['round_id', 'round_status', 'category', 'division', 'threshold'],
			cutoffRows,
		);
		csv(
			'qualifications',
			[
				'qualification_id',
				'round_id',
				'round_kind',
				'round_status',
				'active',
				...contextHeaders,
				'entry_id',
				'category',
				'entry_number',
				'school_id',
				'school',
				'student_id',
				'student',
				'actual_grade',
			],
			qualifications.map((q) => {
				const r = roundMap.get(q.roundId)!;
				const e = entryMap.get(q.entryId);
				const s = q.studentId ? studentMap.get(q.studentId) : null;
				return [
					q.id,
					r.id,
					r.kind,
					r.status,
					q.active,
					...context(e?.contestId ?? ''),
					q.entryId,
					e?.category,
					e?.entryNumber,
					e?.ownerSchoolId,
					schoolName(e?.ownerSchoolId ?? null),
					q.studentId,
					s?.name,
					s?.actualGrade,
				];
			}),
		);
		csv(
			'qualification_reasons',
			['reason_id', 'qualification_id', 'kind', 'rank', 'scope', 'actual_grade', 'threshold', 'explanation'],
			reasons.map(({ row: r }) => [
				r.id,
				r.qualificationId,
				r.kind,
				r.rank,
				r.scope,
				r.actualGrade,
				r.threshold,
				Object.entries(JSON.parse(r.detailJson))
					.map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
					.join('; '),
			]),
		);
	}
	if (kind === 'state') {
		csv(
			'state_attendance',
			[...contextHeaders, 'school_id', 'school', 'intent', 'updated_at_utc'],
			attendance.map(({ row: r }) => [
				...context(r.contestId),
				r.schoolId,
				schoolName(r.schoolId),
				r.intent,
				iso(r.updatedAt),
			]),
		);
		csv(
			'state_team_berths',
			['berth_id', 'qualification_id', 'state_entry_id', 'school_id', 'school', 'category'],
			berths.map(({ row: r }) => [
				r.id,
				r.qualificationId,
				r.stateEntryId,
				r.schoolId,
				schoolName(r.schoolId),
				r.category,
			]),
		);
		csv(
			'state_roster',
			[...contextHeaders, ...studentHeaders, 'admission_basis', 'qualification_id', 'state_entry_id'],
			stateRoster.map(({ row: r }) => [
				...context(r.contestId),
				...studentContext(r.annualStudentId),
				r.admissionBasis,
				r.qualificationId,
				r.stateEntryId,
			]),
		);
		csv(
			'state_worksheet',
			[
				...contextHeaders,
				...studentHeaders,
				'attending',
				'category',
				'assignment',
				'competing_grade',
				'ad_hoc_opt_out',
				'updated_at_utc',
			],
			worksheets.flatMap(({ row: w }) =>
				(JSON.parse(w.rowsJson) as StateRow[]).flatMap((r) =>
					Object.entries(r.events).map(([category, assignment]) => [
						...context(w.contestId),
						...studentContext(r.id),
						r.attending,
						category,
						assignment,
						r.grades[category as keyof typeof r.grades],
						r.adHocOptOuts?.some((c) => c === category) ?? false,
						iso(w.updatedAt),
					]),
				),
			),
		);
		csv(
			'state_ad_hoc_signups',
			[...contextHeaders, ...studentHeaders, 'category'],
			signups.map(({ row: r }) => [
				...context(r.contestId),
				...studentContext(r.annualStudentId),
				r.category,
			]),
		);
	}
	csv('manifest', ['file', 'rows'], counts.slice());
	files['README.txt'] = strToU8(
		`WSMC ${season.year} ${kind} snapshot (wsmc.snapshot.v1)\nDownloaded: ${exportedAt}\nSeason status: ${season.status}\n\nUnzip and open CSV files in Excel, LibreOffice, or another spreadsheet application.\nUTF-8 CSVs include a BOM for Excel. Dates are UTC ISO 8601. Blank scores mean not recorded; zero is a recorded score.\n\nStart with entries_and_scores.csv, or a scoring_EVENT.csv file for one event. One row per entry; team members are listed together. entry_members.csv has each student's actual and competing grades. Filter by contest, division, or school. Record scores offline, then enter them manually in the website when connectivity returns. These files cannot be uploaded as score or roster imports.\n\nRanks reflect recorded scores at download time and are provisional until contests are finalized. Withdrawn entries are retained but unranked. Knowdown eliminated entrants remain in the sheets even though they have no placement. Ad-hoc teams rank separately. Division is blank for events without divisions.\n\nRegional exports include all regionals. Qualifications also include stored draft, frozen, and published rounds, decisions (including inactive decisions), reasons, and cutoffs; they do not generate or save drafts. State exports include regionals, qualifications, and state data, including absences, event opt-outs, and mixed-school membership. Empty files retain headers. manifest.csv gives row counts.\n\nThese are snapshots, not live spreadsheets. Download again after changes. Contest status and publication dates are in contests.csv; round status is in qualification_rounds.csv. In-progress contests and draft qualifications can be incomplete.\n\nNames accompany stable IDs so records can be matched across files. Student and school contact information is included; store these downloads appropriately. User accounts, access assignments, sessions, tokens, audit logs, and import logs are excluded.\n`,
	);
	return {
		filename: `wsmc-${season.year}-${kind}-${exportedAt.replaceAll(':', '-')}.zip`,
		bytes: zipSync(files),
	};
}
