/**
 * NYSE trading sessions and closing-time arithmetic. Pure: callers pass every instant.
 * Dates are ISO `YYYY-MM-DD` strings in the exchange's local calendar.
 */

export const MARKET_TIME_ZONE = 'America/New_York';

const REGULAR_CLOSE = '16:00';
const EARLY_CLOSE = '13:00';
const DAY_MS = 86_400_000;

function toDate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	return toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
}

function weekday(iso: string): number {
	return toDate(iso).getUTCDay(); // 0 = Sunday
}

function ymd(year: number, month: number, day: number): string {
	return toIso(new Date(Date.UTC(year, month - 1, day)));
}

/** Anonymous Gregorian computus. */
function easter(year: number): string {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return ymd(year, month, day);
}

/** The n-th given weekday (0 = Sunday) of a month. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
	const first = ymd(year, month, 1);
	const offset = (dow - weekday(first) + 7) % 7;
	return addDays(first, offset + 7 * (n - 1));
}

function lastWeekday(year: number, month: number, dow: number): string {
	const last = addDays(ymd(year, month + 1, 1), -1);
	return addDays(last, -((weekday(last) - dow + 7) % 7));
}

/** NYSE observance: Saturday -> preceding Friday, Sunday -> following Monday. */
function observed(holiday: string): string {
	const dow = weekday(holiday);
	if (dow === 6) return addDays(holiday, -1);
	if (dow === 0) return addDays(holiday, 1);
	return holiday;
}

const holidayCache = new Map<number, Set<string>>();

export function marketHolidays(year: number): Set<string> {
	let holidays = holidayCache.get(year);
	if (!holidays) {
		holidays = new Set(
			[
				observed(ymd(year, 1, 1)),
				nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
				nthWeekday(year, 2, 1, 3), // Washington's Birthday
				addDays(easter(year), -2), // Good Friday
				lastWeekday(year, 5, 1), // Memorial Day
				observed(ymd(year, 6, 19)), // Juneteenth
				observed(ymd(year, 7, 4)), // Independence Day
				nthWeekday(year, 9, 1, 1), // Labor Day
				nthWeekday(year, 11, 4, 4), // Thanksgiving
				observed(ymd(year, 12, 25)) // Christmas
			].filter((d) => d.startsWith(`${year}-`))
		);
		holidayCache.set(year, holidays);
	}
	return holidays;
}

export function isTradingDay(iso: string): boolean {
	const dow = weekday(iso);
	return dow !== 0 && dow !== 6 && !marketHolidays(Number(iso.slice(0, 4))).has(iso);
}

/** Scheduled local close time, honoring the 13:00 early closes. */
export function closeTime(iso: string): string {
	const year = Number(iso.slice(0, 4));
	const july4 = observed(ymd(year, 7, 4));
	const christmas = observed(ymd(year, 12, 25));
	const early = [ymd(year, 7, 3), addDays(nthWeekday(year, 11, 4, 4), 1), ymd(year, 12, 24)];
	if (early.includes(iso) && isTradingDay(iso) && iso !== july4 && iso !== christmas) {
		return EARLY_CLOSE;
	}
	return REGULAR_CLOSE;
}

/** Offset in minutes between UTC and New York wall time at the given instant. */
function newYorkOffsetMinutes(instant: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: MARKET_TIME_ZONE,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).formatToParts(instant);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
	return (wall - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000;
}

/** The UTC instant of a New York wall-clock time on the given date. */
export function newYorkInstant(iso: string, hhmm: string): Date {
	const [hour, minute] = hhmm.split(':').map(Number);
	const naive = Date.UTC(
		Number(iso.slice(0, 4)),
		Number(iso.slice(5, 7)) - 1,
		Number(iso.slice(8, 10)),
		hour,
		minute
	);
	const offset = newYorkOffsetMinutes(new Date(naive));
	return new Date(naive - offset * 60_000);
}

/** The close of trading day `iso` as a UTC instant. */
export function closeAt(iso: string): Date {
	return newYorkInstant(iso, closeTime(iso));
}

/** The New York calendar date of an instant. */
export function newYorkDate(instant: Date): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: MARKET_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(instant);
	const get = (type: string) => parts.find((p) => p.type === type)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

export function nextTradingDay(iso: string): string {
	let d = addDays(iso, 1);
	while (!isTradingDay(d)) d = addDays(d, 1);
	return d;
}

export function previousTradingDay(iso: string): string {
	let d = addDays(iso, -1);
	while (!isTradingDay(d)) d = addDays(d, -1);
	return d;
}

/** First trading day whose close is strictly after `submittedAt`. */
export function effectiveDateFor(submittedAt: Date): string {
	let d = newYorkDate(submittedAt);
	while (!(isTradingDay(d) && closeAt(d).getTime() > submittedAt.getTime())) d = addDays(d, 1);
	return d;
}

/** The latest trading day whose close is at or before `now`. */
export function lastCompletedSession(now: Date): string {
	let d = newYorkDate(now);
	while (!(isTradingDay(d) && closeAt(d).getTime() <= now.getTime())) d = addDays(d, -1);
	return d;
}

/** Trading days in the inclusive range [from, to]. */
export function tradingDaysBetween(from: string, to: string): string[] {
	const days: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d)) days.push(d);
	return days;
}
