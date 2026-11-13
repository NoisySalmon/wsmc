export const adHocCategories = ['team_contest', 'topical_team'] as const;
export type AdHocCategory = typeof adHocCategories[number];
export const adHocLabels = { team_contest: 'Ad Hoc Team Problem', topical_team: 'Ad Hoc Topical' };
export function isAdHocEntry(entry: { ownerSchoolId: string | null; category: string }) {
 return entry.ownerSchoolId === null && adHocCategories.some(category => category === entry.category);
}
export function scoringSection(entry: { ownerSchoolId: string | null; category: string }) {
 return isAdHocEntry(entry) ? `ad_hoc_${entry.category}` : entry.category;
}
