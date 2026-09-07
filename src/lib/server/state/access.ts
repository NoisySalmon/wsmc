import type { getStateDashboard } from './service';

export type StateDashboard = Awaited<ReturnType<typeof getStateDashboard>>;

/** Limit coach-visible state data to school-owned records in their assignments. */
export function scopeStateDashboard(dashboard: StateDashboard, schoolIds: Set<string>): StateDashboard {
	const qualifiedSchools = dashboard.qualifiedSchools.filter((school) => schoolIds.has(school.schoolId));
	const roster = dashboard.roster.filter(({ member }) => schoolIds.has(member.schoolId));
	const students = dashboard.students.filter((student) => schoolIds.has(student.schoolId));
	const entries = dashboard.entries.filter((entry) => Boolean(entry.ownerSchoolId && schoolIds.has(entry.ownerSchoolId)));
	const entryIds = new Set(entries.map((entry) => entry.id));
	return {
		...dashboard,
		participations: dashboard.participations.filter(({ participation }) => schoolIds.has(participation.schoolId)),
		qualifiedSchools,
		stateQualifications: dashboard.stateQualifications.filter((qualification) => Boolean(qualification.schoolId && schoolIds.has(qualification.schoolId))),
		teamBerths: [],
		attendance: dashboard.attendance.filter((item) => schoolIds.has(item.schoolId)),
		roster,
		entries,
		members: dashboard.members.filter(({ member }) => entryIds.has(member.entryId)),
		students,
	};
}
