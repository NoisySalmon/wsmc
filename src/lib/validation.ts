/**
 * Pure validation functions for WSMC contest rules.
 * No DB dependencies — these work on plain data for testability.
 */

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
