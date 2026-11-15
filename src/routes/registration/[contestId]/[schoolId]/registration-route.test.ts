import { describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

const unauthenticated = { principal: null, sessionId: null };

describe('regional registration endpoint authorization', () => {
	it('rejects unauthenticated page loads before touching the database', async () => {
		await expect(
			load({
				locals: unauthenticated,
				platform: undefined,
				params: { contestId: 'contest-1', schoolId: 'school-1' },
			} as never),
		).rejects.toMatchObject({ status: 401 });
	});

	it('rejects unauthenticated mutation posts before touching the database', async () => {
		await expect(
			actions.addStudent({
				locals: unauthenticated,
				platform: undefined,
				params: { contestId: 'contest-1', schoolId: 'school-1' },
				request: new Request('https://wsmc.example', { method: 'POST' }),
			} as never),
		).rejects.toMatchObject({ status: 401 });
	});
});

it(
	'reviews an upload without saving, then confirms it without a second file upload and rechecks locks',
	{ timeout: 20_000 },
	async () => {
		const { Miniflare } = await import('miniflare');
		const { readFileSync, readdirSync } = await import('node:fs');
		const worker = new Miniflare({
			modules: true,
			script: 'export default { fetch() { return new Response("test"); } }',
			compatibilityDate: '2026-03-10',
			d1Databases: ['DB'],
		});
		try {
			const d1 = await worker.getD1Database('DB');
			for (const file of readdirSync('drizzle')
				.filter((name) => name.endsWith('.sql'))
				.sort())
				for (const statement of readFileSync(`drizzle/${file}`, 'utf8')
					.split('--> statement-breakpoint')
					.map((s) => s.trim())
					.filter(Boolean))
					await d1.prepare(statement).run();
			for (const statement of readFileSync('scripts/seed.sql', 'utf8')
				.split(';')
				.map((s) => s.trim())
				.filter(Boolean))
				await d1.prepare(statement).run();
			await d1.exec(
				"UPDATE contests SET lifecycle='registration_open'; UPDATE seasons SET status='regional'; UPDATE qualification_rounds SET status='draft'",
			);
			const post = (data: FormData) =>
				({
					locals: {
						principal: {
							id: 'user-coordinator',
							isAdmin: true,
							coachAssignments: [],
							regionalContestIds: [],
							scorekeeperContestIds: [],
						},
					},
					platform: { env: { DB: d1 } },
					params: { contestId: 'contest-region-1', schoolId: 'school-alpha' },
					request: new Request('https://wsmc.example/registration', { method: 'POST', body: data }),
				}) as never;
			const csv = 'Student name,Grade,Team contest team,Topical team,Knowdown\nConfirm Student,10,,,No\n';
			const upload = new FormData();
			upload.set('file', new File([csv], 'roster.csv', { type: 'text/csv' }));
			const preview = (await actions.previewCsv(post(upload))) as {
				csvUpload: string;
				csvSummary: { newStudents: number };
			};
			expect(preview).toMatchObject({ csvSummary: { newStudents: 1 } });
			expect(
				await d1.prepare("SELECT COUNT(*) AS n FROM annual_students WHERE name='Confirm Student'").first(),
			).toEqual({ n: 0 });
			const confirmation = new FormData();
			confirmation.set('confirmedCsv', preview.csvUpload);
			expect(await actions.importCsv(post(confirmation))).toMatchObject({ csvSummary: { newStudents: 1 } });
			expect(
				await d1.prepare("SELECT COUNT(*) AS n FROM annual_students WHERE name='Confirm Student'").first(),
			).toEqual({ n: 1 });
			await d1.exec("UPDATE contests SET lifecycle='roster_locked'");
			expect(await actions.importCsv(post(confirmation))).toMatchObject({
				status: 400,
				data: { error: expect.stringContaining('not open') },
			});
		} finally {
			await worker.dispose();
		}
	},
);
