const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const price = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 4
});

export function formatMoney(value: number): string {
	return usd.format(value);
}

/** Money with an explicit sign, for P&L. */
export function formatSignedMoney(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	if (rounded === 0) return usd.format(0);
	return `${rounded > 0 ? '+' : '−'}${usd.format(Math.abs(rounded))}`;
}

export function formatPrice(value: number): string {
	return price.format(value);
}

export function formatShares(value: number): string {
	return integer.format(value);
}

/** Percentage with an explicit sign, from a fraction (0.0123 -> +1.23%). */
export function formatSignedPct(value: number): string {
	const pct = Math.round(value * 10_000) / 100;
	if (pct === 0) return '0.00%';
	return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`;
}

export function formatPct(value: number): string {
	return `${(value * 100).toFixed(2)}%`.replace('-', '−');
}

export function formatRatio(value: number | null): string {
	return value === null ? '—' : value.toFixed(2).replace('-', '−');
}

/** `2026-09-25` -> `Fri, Sep 25, 2026`. */
export function formatDate(iso: string): string {
	return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

/** Timestamps are shown in market time so server and browser render the same text. */
export function formatDateTime(value: string | Date): string {
	const text = new Date(value).toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'America/New_York'
	});
	return `${text} ET`;
}

/** Tailwind text colour for a signed value; always paired with a +/− sign in the text. */
export function toneClass(value: number): string {
	if (value > 0.000_05) return 'text-gain';
	if (value < -0.000_05) return 'text-loss';
	return '';
}

export const ORDER_LABELS = {
	buy: 'Buy',
	sell: 'Sell',
	sell_short: 'Sell short',
	buy_to_cover: 'Buy to cover'
} as const;
