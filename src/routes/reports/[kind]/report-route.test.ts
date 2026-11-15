import { afterEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { GET } from './+server';

const admin = {
	id: 'user-coordinator',
	email: 'coordinator@example.com',
	displayName: 'Coordinator',
	isAdmin: true,
	regionalContestIds: [],
	coachAssignments: [],
	scorekeeperContestIds: [],
};
const event = (kind: string, DB?: unknown, principal: unknown = admin) =>
	({
		locals: { principal, sessionId: 'test-session' },
		platform: DB ? { env: { DB } } : undefined,
		params: { kind },
		url: new URL(`https://wsmc.example/reports/${kind}?seasonId=season-2026`),
	}) as never;
const workers: Miniflare[] = [];
afterEach(async () => {
	await Promise.all(workers.splice(0).map((worker) => worker.dispose()));
});

describe('season snapshot downloads', () => {
	it('requires an administrator even for published data', async () => {
		await expect(GET(event('regionals', undefined, null))).rejects.toMatchObject({ status: 401 });
		for (const assignment of [
			{ coachAssignments: [{ schoolId: 'school-alpha' }] },
			{ regionalContestIds: ['contest-region-1'] },
			{ scorekeeperContestIds: ['contest-region-1'] },
		]) {
			await expect(
				GET(event('qualifications', undefined, { ...admin, isAdmin: false, ...assignment })),
			).rejects.toMatchObject({ status: 403 });
		}
		await expect(GET(event('schools'))).rejects.toMatchObject({ status: 404 });
	});

	it(
		'downloads complete, season-scoped spreadsheets during scoring, draft review, and state registration',
		{ timeout: 25_000 },
		async () => {
			const worker = new Miniflare({
				modules: true,
				script: 'export default { fetch() { return new Response("test"); } }',
				compatibilityDate: '2026-03-10',
				d1Databases: ['DB'],
			});
			workers.push(worker);
			const d1 = await worker.getD1Database('DB');
			for (const file of readdirSync('drizzle')
				.filter((name) => name.endsWith('.sql'))
				.sort())
				for (const statement of readFileSync(`drizzle/${file}`, 'utf8')
					.split('--> statement-breakpoint')
					.map((sql) => sql.trim())
					.filter(Boolean))
					await d1.prepare(statement).run();
			for (const statement of readFileSync('scripts/seed.sql', 'utf8')
				.split(';')
				.map((sql) => sql.trim())
				.filter(Boolean))
				await d1.prepare(statement).run();
			await d1
				.prepare(
					`WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n<105)
   INSERT INTO entries (id,contest_id,owner_school_id,category,entry_kind,entry_number,division)
   SELECT 'bulk-entry-'||n,'contest-region-1','school-alpha','team_contest','team',200+n,1 FROM sequence`,
				)
				.run();
			await d1
				.prepare(
					`INSERT INTO qualifications (id,round_id,season_id,entry_id)
   SELECT 'bulk-qualification-'||entry_number,'round-regional-2026','season-2026',id FROM entries WHERE entry_number BETWEEN 201 AND 305`,
				)
				.run();
			await d1
				.prepare(
					`INSERT INTO qualification_reasons (id,qualification_id,kind,rank)
   SELECT 'bulk-reason-'||entry_number,'bulk-qualification-'||entry_number,'regional_placement',entry_number FROM entries WHERE entry_number BETWEEN 201 AND 304`,
				)
				.run();
			await d1
				.prepare(
					"INSERT INTO qualification_rounds (id,season_id,kind,status,thresholds_json,created_by) VALUES ('draft-report','season-2026','state_cutoff','draft','{\"project\":42}','user-coordinator')",
				)
				.run();
			await d1
				.prepare(
					"INSERT INTO qualifications (id,round_id,season_id,entry_id,active) VALUES ('draft-decision','draft-report','season-2026','bulk-entry-1',0)",
				)
				.run();
			await d1
				.prepare(
					"INSERT INTO qualification_reasons (id,qualification_id,kind,detail_json) VALUES ('draft-reason','draft-decision','manual_exclude','{\"reason\":\"Coach requested withdrawal\"}')",
				)
				.run();
			await d1.prepare("UPDATE results SET score=0 WHERE entry_id='entry-r1-team-beta'").run();
			await d1
				.prepare("UPDATE annual_students SET name='=Unsafe, \"Student\"' WHERE id='student-alpha-12'")
				.run();
			await d1
				.prepare('INSERT INTO state_worksheets (contest_id,school_id,rows_json,updated_at) VALUES (?,?,?,?)')
				.bind(
					'contest-state-2026',
					'school-alpha',
					JSON.stringify([
						{
							id: 'student-alpha-12',
							attending: false,
							events: {
								project: '',
								team_contest: '',
								topical_team: '',
								topical_individual: '',
								knowdown: '',
							},
							grades: { project: 12 },
							adHocOptOuts: ['team_contest'],
						},
					]),
					1,
				)
				.run();
			// Execute real SQL with the deployed D1 parameter limit, including batch queries.
			const boundedD1 = new Proxy(d1, {
				get(target, property) {
					if (property === 'prepare')
						return (query: string) => {
							const statement = target.prepare(query);
							return new Proxy(statement, {
								get(prepared, key) {
									if (key === 'bind')
										return (...values: unknown[]) => {
											expect(values.length).toBeLessThanOrEqual(100);
											return prepared.bind(...values);
										};
									const value = Reflect.get(prepared, key);
									return typeof value === 'function' ? value.bind(prepared) : value;
								},
							});
						};
					const value = Reflect.get(target, property);
					return typeof value === 'function' ? value.bind(target) : value;
				},
			});
			const download = async (kind: string) => {
				const response = await GET(event(kind, boundedD1));
				expect(response.headers.get('content-type')).toBe('application/zip');
				expect(response.headers.get('cache-control')).toContain('no-store');
				const bytes = unzipSync(new Uint8Array(await response.arrayBuffer()));
				return Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, strFromU8(data)]));
			};
			const regionals = await download('regionals');
			expect(regionals['entries_and_scores.csv']).toContain('bulk-entry-105'); // Unscored entries survive.
			expect(regionals['entries_and_scores.csv']).not.toContain('entry-state-cross-school-team');
			expect(regionals['entry_members.csv']).toContain(`'=Unsafe, ""Student""`);
			expect(regionals['scoring_topical_individual.csv']).toContain('"137","65","72"'); // Total derived from recorded parts.
			expect(regionals['scoring_team_contest.csv']).toContain('"0","",""'); // Zero differs from an unrecorded score.
			expect(regionals['qualification_rounds.csv']).toBeUndefined();
			const qualifications = await download('qualifications');
			expect(qualifications['qualifications.csv'].trimEnd().split('\r\n')).toHaveLength(114); // Header, seven seeded, 105 added, one draft.
			expect(qualifications['qualifications.csv']).toContain('"draft","no"');
			expect(qualifications['qualifications.csv']).toContain('bulk-qualification-305'); // No reason is required.
			expect(qualifications['qualification_reasons.csv']).toContain('bulk-reason-304');
			expect(qualifications['qualification_reasons.csv']).toContain('Coach requested withdrawal');
			expect(qualifications['qualification_cutoffs.csv']).toContain('"project","","42"');
			const state = await download('state');
			expect(state['entries_and_scores.csv']).toContain('entry-state-cross-school-team');
			expect(state['entry_members.csv']).toContain('student-gamma-11');
			expect(state['state_worksheet.csv']).toContain('"no","team_contest","","","yes"');
			expect(state['state_roster.csv']).toContain('individual_qualification');
			expect(state['state_attendance.csv']).toContain('undecided');
			expect(state['README.txt']).toContain('manually');
			expect(Object.values(state).join('\n')).not.toContain('coordinator@example.com');
			await d1.prepare("UPDATE seasons SET status='archived' WHERE id='season-2026'").run();
			await d1.prepare("INSERT INTO seasons (id,year,status) VALUES ('other-season',2027,'regional')").run();
			await d1
				.prepare(
					"INSERT INTO annual_students (id,season_id,school_id,name,actual_grade) VALUES ('other-student','other-season','school-alpha','Other season student',12)",
				)
				.run();
			const archived = await download('state');
			expect(archived['entries_and_scores.csv']).toContain('entry-state-cross-school-team');
			expect(archived['students.csv']).not.toContain('Other season student');
		},
	);
});
