import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
	it('keeps same-origin paths', () => {
		expect(safeReturnTo('/portfolios/growth?tab=history')).toBe('/portfolios/growth?tab=history');
	});

	it('rejects external, protocol-relative, and auth URLs', () => {
		for (const value of [
			'https://evil.test',
			'//evil.test',
			'/\\evil.test',
			'/login',
			'/api/auth/x',
			'',
			null
		]) {
			expect(safeReturnTo(value)).toBe('/');
		}
	});
});
