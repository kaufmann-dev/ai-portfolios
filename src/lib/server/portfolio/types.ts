export type Side = 'long' | 'short';

export interface Position {
	ticker: string;
	side: Side;
	shares: number;
}

export interface CorporateAction {
	ticker: string;
	date: string;
	kind: 'split' | 'dividend';
	splitFrom: number | null;
	splitTo: number | null;
	cashAmount: number | null;
}

export type OrderAction = 'buy' | 'sell' | 'sell_short' | 'buy_to_cover';

export interface Order {
	action: OrderAction;
	ticker: string;
	shares: number;
}
