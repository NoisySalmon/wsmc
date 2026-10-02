// Contest regions from https://www.wsmc.net/hs-contest-locations
// (including its embedded locations document), reviewed 2026-10-02.
// Virtual is unnumbered in the source; 11 follows the ten geographic regions.
// Sites and dates vary by season and are configured separately.
export const defaultRegions = [
	{ number: 1, name: 'Spokane area' },
	{ number: 2, name: 'Tri Cities' },
	{ number: 3, name: 'North Central' },
	{ number: 4, name: 'Yakima area' },
	{ number: 5, name: 'Northwest' },
	{ number: 6, name: 'Seattle area' },
	{ number: 7, name: 'Tacoma area' },
	{ number: 8, name: 'Southwest' },
	{ number: 9, name: 'Olympia Area' },
	{ number: 10, name: 'Peninsula' },
	{ number: 11, name: 'Virtual' },
] as const;
