function safeCell(value: string | number | null | undefined): string {
	const raw = value === null || value === undefined ? '' : String(value);
	const safe = /^[=+\-@]/.test(raw.trim()) ? `'${raw.trim()}` : raw;
	return `"${safe.replaceAll('"', '""')}"`;
}

export function exportReportCsv(headers: readonly string[], rows: (string | number | null | undefined)[][]): string {
	return `${[headers.join(','), ...rows.map((row) => row.map(safeCell).join(','))].join('\r\n')}\r\n`;
}
