import { describe, expect, it } from 'vitest';
import { scopeStateDashboard } from './access';

describe('state dashboard access scope', () => {
	it('keeps only assigned school data and excludes mixed coordinator entries', () => {
		const dashboard = {
			contest: { id: 'state-1' }, settings: {},
			participations: [{ participation: { schoolId: 'school-alpha' } }, { participation: { schoolId: 'school-beta' } }],
			qualifiedSchools: [{ schoolId: 'school-alpha' }, { schoolId: 'school-beta' }],
			stateQualifications: [{ id: 'qualification-alpha', schoolId: 'school-alpha' }, { id: 'qualification-cross-school', schoolId: null }],
			teamBerths: [{ berth: { id: 'berth-beta' } }],
			attendance: [{ schoolId: 'school-alpha' }, { schoolId: 'school-beta' }],
			roster: [{ member: { schoolId: 'school-alpha' } }, { member: { schoolId: 'school-beta' } }],
			entries: [{ id: 'entry-alpha', ownerSchoolId: 'school-alpha' }, { id: 'entry-mixed', ownerSchoolId: null }, { id: 'entry-beta', ownerSchoolId: 'school-beta' }],
			members: [{ member: { entryId: 'entry-alpha' } }, { member: { entryId: 'entry-mixed' } }, { member: { entryId: 'entry-beta' } }],
			students: [{ id: 'student-alpha', schoolId: 'school-alpha' }, { id: 'student-beta', schoolId: 'school-beta' }],
		} as never;

		const scoped = scopeStateDashboard(dashboard, new Set(['school-alpha']));
		expect(scoped.participations).toHaveLength(1);
		expect(scoped.qualifiedSchools).toEqual([{ schoolId: 'school-alpha' }]);
		expect(scoped.stateQualifications).toEqual([{ id: 'qualification-alpha', schoolId: 'school-alpha' }]);
		expect(scoped.teamBerths).toEqual([]);
		expect(scoped.entries).toEqual([{ id: 'entry-alpha', ownerSchoolId: 'school-alpha' }]);
		expect(scoped.members).toEqual([{ member: { entryId: 'entry-alpha' } }]);
		expect(scoped.roster).toHaveLength(1);
		expect(scoped.students).toHaveLength(1);
	});
});
