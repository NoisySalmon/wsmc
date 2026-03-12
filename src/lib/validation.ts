/**
 * Pure validation functions for WSMC contest rules.
 * No DB dependencies — these work on plain data for testability.
 */

export type StudentData = {
	id: string;
	name: string;
	actualGrade: number;
	competingGrade: number;
	isKnowdown: boolean;
};

export type TeamData = {
	id: string;
	contestType: 'project' | 'team_problem' | 'topical';
	teamNumber: number;
	members: { studentId: string; competingGrade: number }[];
};

/** competing_grade must be >= actual_grade */
export function validatePlayUp(actualGrade: number, competingGrade: number): string | null {
	if (competingGrade < actualGrade) {
		return `Competing grade (${competingGrade}) cannot be lower than actual grade (${actualGrade}).`;
	}
	return null;
}

/** Grade must be 9-12 */
export function validateGrade(grade: number): string | null {
	if (![9, 10, 11, 12].includes(grade)) {
		return `Grade must be 9, 10, 11, or 12.`;
	}
	return null;
}

/** Max 3 knowdown per school */
export function validateKnowdownCount(students: StudentData[], addingId?: string): string | null {
	const count = students.filter((s) => s.isKnowdown).length;
	const alreadyKnowdown = addingId ? students.find((s) => s.id === addingId)?.isKnowdown : false;
	const effective = alreadyKnowdown ? count : count; // if toggling on, count doesn't include yet
	if (count >= 3 && !alreadyKnowdown) {
		return 'A school may have at most 3 Knowdown competitors.';
	}
	return null;
}

/** Team max 3 members */
export function validateTeamSize(memberCount: number): string | null {
	if (memberCount > 3) {
		return 'A team may have at most 3 members.';
	}
	return null;
}

/** Team members must have different competing_grade values */
export function validateTeamGrades(competingGrades: number[]): string | null {
	const unique = new Set(competingGrades);
	if (unique.size !== competingGrades.length) {
		return 'All team members must have different competing grade levels.';
	}
	return null;
}

/**
 * A student on a topical team cannot also compete individually in topical.
 * Returns error if the student is on a topical team.
 */
export function validateTopicalExclusivity(
	studentId: string,
	teams: TeamData[]
): string | null {
	const onTopicalTeam = teams.some(
		(t) => t.contestType === 'topical' && t.members.some((m) => m.studentId === studentId)
	);
	if (onTopicalTeam) {
		return 'This student is on a topical team and cannot also compete individually in topical.';
	}
	return null;
}

/**
 * Check if adding a student to a team would violate any rules.
 * Returns array of error messages (empty = valid).
 */
export function validateTeamAssignment(
	student: StudentData,
	team: TeamData,
	allTeamsForType: TeamData[]
): string[] {
	const errors: string[] = [];

	// Team size check (after adding)
	const sizeErr = validateTeamSize(team.members.length + 1);
	if (sizeErr) errors.push(sizeErr);

	// Grade uniqueness check (after adding)
	const grades = [...team.members.map((m) => m.competingGrade), student.competingGrade];
	const gradeErr = validateTeamGrades(grades);
	if (gradeErr) errors.push(gradeErr);

	// Student already on another team of same type
	const alreadyOnTeam = allTeamsForType.some(
		(t) => t.members.some((m) => m.studentId === student.id)
	);
	if (alreadyOnTeam) {
		errors.push(`This student is already on a ${formatContestType(team.contestType)} team.`);
	}

	return errors;
}

export function formatContestType(type: string): string {
	switch (type) {
		case 'project': return 'Project';
		case 'team_problem': return 'Team Problem';
		case 'topical': return 'Topical';
		default: return type;
	}
}
