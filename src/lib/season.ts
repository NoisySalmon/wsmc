export const seasonStages = ['regional', 'qualifications', 'state', 'archived'] as const;
export const seasonLabels: Record<string, string> = {
	regional: 'Regional contests', qualifications: 'Qualifications', state: 'State contest', archived: 'Archived'
};
export const seasonDescriptions: Record<string, string> = {
	regional: 'Regional contests are in progress.',
	qualifications: 'Administrators are settling state qualifications. State roster editing is not open yet.',
	state: 'Qualifications are settled. Coaches can prepare their state rosters when state registration is open.',
	archived: 'This season is permanently read-only.'
};
