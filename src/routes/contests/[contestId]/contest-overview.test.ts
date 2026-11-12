import { describe, expect, it } from 'vitest';
import { _hasCompleteResult } from './+page.server';

describe('contest result coverage', () => {
	it('counts only leaderboard placements as recorded Knowdown results', () => {
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: 'placed', placement: 4 })).toBe(true);
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: 'eliminated', placement: null })).toBe(false);
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: 'placed', placement: null })).toBe(false);
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: null, placement: null })).toBe(false);
	});
});
