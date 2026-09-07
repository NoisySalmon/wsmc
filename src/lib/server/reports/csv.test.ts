import { describe, expect, it } from 'vitest';
import { exportReportCsv } from './csv';

describe('report CSV', () => {
	it('protects formula-like values', () => {
		expect(exportReportCsv(['name'], [['=SUM(A1)', 1]])).toContain("'=SUM(A1)");
	});
});
