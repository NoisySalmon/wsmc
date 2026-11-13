export const stateEvents = ['team_contest', 'topical_team', 'topical_individual', 'project', 'knowdown'] as const;
export type StateEvent = typeof stateEvents[number];
export const adHocEvents = ['team_contest', 'topical_team'] as const;
export type AdHocEvent = typeof adHocEvents[number];
export type NewStateStudent = { id: string; name: string; actualGrade: number };
export type StateRow = {
 id: string;
 attending: boolean;
 events: Record<StateEvent, string>;
 grades: Record<StateEvent, number>;
 adHocOptOuts?: AdHocEvent[];
};

/** Fill free event slots without undoing a coach's explicit No event choice. */
export function defaultStateAdHoc(row: StateRow, eligible: boolean, topicalIndividualQualified = false): StateRow {
 if (!row.attending || !eligible) return row;
 for (const category of adHocEvents) {
  if (row.events[category] || row.adHocOptOuts?.includes(category)) continue;
  if (category === 'topical_team' && (topicalIndividualQualified || row.events.topical_individual)) continue;
  row.events[category] = 'ad_hoc';
 }
 return row;
}
