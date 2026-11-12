/** Only these events compete within school divisions. */
export function usesDivisions(category: string): boolean {
	return category === 'team_contest' || category === 'topical_team';
}

export function eventDivisions(category: string): (1 | 2 | undefined)[] {
	return usesDivisions(category) ? [1, 2] : [undefined];
}
