import { describe, expect, it } from 'vitest';
import {
	closeAt,
	closeTime,
	effectiveDateFor,
	isTradingDay,
	lastCompletedSession,
	marketHolidays,
	tradingDaysBetween
} from './calendar';

describe('market calendar', () => {
	it('knows the 2026 NYSE holidays', () => {
		expect([...marketHolidays(2026)].sort()).toEqual([
			'2026-01-01',
			'2026-01-19',
			'2026-02-16',
			'2026-04-03',
			'2026-05-25',
			'2026-06-19',
			'2026-07-03',
			'2026-09-07',
			'2026-11-26',
			'2026-12-25'
		]);
	});

	it('treats weekends and holidays as closed', () => {
		expect(isTradingDay('2026-09-26')).toBe(false); // Saturday
		expect(isTradingDay('2026-11-26')).toBe(false); // Thanksgiving
		expect(isTradingDay('2026-09-25')).toBe(true);
	});

	it('closes early after Thanksgiving and on Christmas Eve', () => {
		expect(closeTime('2026-11-27')).toBe('13:00');
		expect(closeTime('2026-12-24')).toBe('13:00');
		expect(closeTime('2026-09-25')).toBe('16:00');
		// July 3 2026 is the observed Independence Day holiday, not an early close.
		expect(isTradingDay('2026-07-03')).toBe(false);
	});

	it('converts the close to UTC across daylight saving time', () => {
		expect(closeAt('2026-09-25').toISOString()).toBe('2026-09-25T20:00:00.000Z');
		expect(closeAt('2026-12-01').toISOString()).toBe('2026-12-01T21:00:00.000Z');
		expect(closeAt('2026-11-27').toISOString()).toBe('2026-11-27T18:00:00.000Z');
	});

	it('fills at the first close strictly after submission', () => {
		expect(effectiveDateFor(new Date('2026-09-25T19:00:00Z'))).toBe('2026-09-25');
		expect(effectiveDateFor(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-28');
		expect(effectiveDateFor(new Date('2026-09-26T15:00:00Z'))).toBe('2026-09-28');
		// After the 13:00 early close the next session applies.
		expect(effectiveDateFor(new Date('2026-11-27T18:30:00Z'))).toBe('2026-11-30');
		// Late evening in New York is already the next UTC day.
		expect(effectiveDateFor(new Date('2026-09-25T02:00:00Z'))).toBe('2026-09-25');
	});

	it('finds the last completed session', () => {
		expect(lastCompletedSession(new Date('2026-09-25T19:59:00Z'))).toBe('2026-09-24');
		expect(lastCompletedSession(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-25');
		expect(lastCompletedSession(new Date('2026-09-27T12:00:00Z'))).toBe('2026-09-25');
	});

	it('lists trading days in a range', () => {
		expect(tradingDaysBetween('2026-09-04', '2026-09-09')).toEqual([
			'2026-09-04',
			'2026-09-08',
			'2026-09-09'
		]);
	});
});
