import { describe, expect, it } from 'vitest';
import { ScoringError, validateScoreInput } from './service';

describe('score validation', () => {
	it('keeps blank scores distinct from zero', () => {
		expect(validateScoreInput('project', {})).toMatchObject({ score: null });
		expect(validateScoreInput('project', { score: 0 })).toMatchObject({ score: 0 });
	});

	it('derives topical totals only when both parts are present', () => {
		expect(validateScoreInput('topical_individual', { part1: 20 })).toMatchObject({ score: null, part1: 20, part2: null });
		expect(validateScoreInput('topical_individual', { part1: 0, part2: 0 })).toMatchObject({ score: 0, part1: 0, part2: 0 });
	});

	it('enforces category-specific ranges and shapes', () => {
		expect(() => validateScoreInput('topical_team', { part1: 76, part2: 1 })).toThrowError(ScoringError);
		expect(() => validateScoreInput('project', { score: 1, placement: 1 })).toThrowError(/one numeric score/);
		expect(() => validateScoreInput('knowdown', { placement: 5 })).toThrowError(/1 through 4/);
	});
});
