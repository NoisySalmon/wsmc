import { describe, expect, it } from 'vitest';
import { _hasCompleteResult } from './+page.server';

describe('contest result coverage', () => {
	it('counts either Knowdown final outcome as complete while leaving missing distinct', () => {
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: 'placed', placement: 4 })).toBe(true);
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: 'eliminated', placement: null })).toBe(true);
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: 'placed', placement: null })).toBe(false);
		expect(_hasCompleteResult('knowdown', { knowdownOutcome: null, placement: null })).toBe(false);
	});
});
