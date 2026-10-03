import { describe, it, expect } from 'vitest';
import { validatePlayUp, validateGrade } from '../validation';

describe('validatePlayUp', () => {
	it('allows same grade', () => {
		expect(validatePlayUp(10, 10)).toBeNull();
	});
	it('allows playing up', () => {
		expect(validatePlayUp(9, 11)).toBeNull();
	});
	it('rejects playing down', () => {
		expect(validatePlayUp(11, 10)).not.toBeNull();
	});
});

describe('validateGrade', () => {
	it('accepts 9-12', () => {
		for (const g of [9, 10, 11, 12]) {
			expect(validateGrade(g)).toBeNull();
		}
	});
	it('rejects other values', () => {
		expect(validateGrade(8)).not.toBeNull();
		expect(validateGrade(13)).not.toBeNull();
		expect(validateGrade(0)).not.toBeNull();
	});
});
