// Dates use a fixed timezone so server and browser render the same calendar day.
export function contestDateInput(value: number | null | undefined): string {
	return value == null ? '' : new Date(value).toISOString().slice(0, 10);
}

export function contestDate(value: number | null | undefined): string {
	return value == null ? 'Not scheduled' : new Intl.DateTimeFormat('en-US', {
		year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
	}).format(value);
}
