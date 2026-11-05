import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	doublePrecision,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

export * from './auth-schema';

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
};

export const strategies = pgTable('strategies', {
	id: serial('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	content: text('content').notNull(),
	...timestamps
});

export const portfolios = pgTable('portfolios', {
	id: serial('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	...timestamps
});

export const rebalanceStatus = pgEnum('rebalance_status', ['pending', 'executed']);
export const positionSide = pgEnum('position_side', ['long', 'short']);

export const rebalances = pgTable(
	'rebalances',
	{
		id: serial('id').primaryKey(),
		portfolioId: integer('portfolio_id')
			.notNull()
			.references(() => portfolios.id, { onDelete: 'cascade' }),
		submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
		effectiveDate: date('effective_date').notNull(),
		status: rebalanceStatus('status').notNull().default('pending'),
		rationale: text('rationale').notNull(),
		strategyId: integer('strategy_id').references(() => strategies.id, { onDelete: 'set null' }),
		executedAt: timestamp('executed_at', { withTimezone: true })
	},
	(t) => [
		// A new submission replaces the pending one for the same close; an earlier close keeps its own.
		uniqueIndex('rebalances_portfolio_date_idx').on(t.portfolioId, t.effectiveDate),
		index('rebalances_status_idx').on(t.status, t.effectiveDate)
	]
);

export const rebalancePositions = pgTable(
	'rebalance_positions',
	{
		rebalanceId: integer('rebalance_id')
			.notNull()
			.references(() => rebalances.id, { onDelete: 'cascade' }),
		ticker: text('ticker').notNull(),
		side: positionSide('side').notNull(),
		shares: integer('shares').notNull(),
		/** Why the position is held; carried forward from the previous target when not restated. */
		thesis: text('thesis').notNull(),
		/** When or under what conditions the position should be closed; carried forward like `thesis`. */
		exit: text('exit').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.rebalanceId, t.ticker] }),
		check('rebalance_positions_shares_positive', sql`${t.shares} > 0`)
	]
);

/** Unadjusted daily closing prices. */
export const priceBars = pgTable(
	'price_bars',
	{
		ticker: text('ticker').notNull(),
		date: date('date').notNull(),
		close: numeric('close', { precision: 18, scale: 6, mode: 'number' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.ticker, t.date] })]
);

export const corporateActionKind = pgEnum('corporate_action_kind', ['split', 'dividend']);

export const corporateActions = pgTable(
	'corporate_actions',
	{
		ticker: text('ticker').notNull(),
		date: date('date').notNull(),
		kind: corporateActionKind('kind').notNull(),
		splitFrom: numeric('split_from', { precision: 18, scale: 6, mode: 'number' }),
		splitTo: numeric('split_to', { precision: 18, scale: 6, mode: 'number' }),
		cashAmount: numeric('cash_amount', { precision: 18, scale: 6, mode: 'number' })
	},
	(t) => [primaryKey({ columns: [t.ticker, t.date, t.kind] })]
);

/** Trading sessions whose market-wide closes and corporate actions have been fetched. */
export const marketSessions = pgTable('market_sessions', {
	date: date('date').primaryKey(),
	hadData: boolean('had_data').notNull(),
	fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull()
});

/** Active U.S.-listed stocks and ETFs, mirrored from Massive once per trading day. */
export const tickers = pgTable('tickers', {
	ticker: text('ticker').primaryKey(),
	name: text('name').notNull(),
	type: text('type'),
	syncedAt: timestamp('synced_at', { withTimezone: true }).notNull()
});

/**
 * Daily bars of every U.S. ticker over the last year of sessions, from the market-wide grouped
 * bars. Split-adjusted: earlier bars are rescaled when a split takes effect.
 */
export const dailyBars = pgTable(
	'daily_bars',
	{
		ticker: text('ticker').notNull(),
		date: date('date').notNull(),
		open: doublePrecision('open').notNull(),
		high: doublePrecision('high').notNull(),
		low: doublePrecision('low').notNull(),
		close: doublePrecision('close').notNull(),
		volume: doublePrecision('volume').notNull()
	},
	(t) => [primaryKey({ columns: [t.ticker, t.date] }), index('daily_bars_date_idx').on(t.date)]
);

export const massivePlan = pgEnum('massive_plan', ['basic', 'starter']);

/** App-wide settings; a single row. */
export const appSettings = pgTable(
	'app_settings',
	{
		id: integer('id').primaryKey().default(1),
		massivePlan: massivePlan('massive_plan').notNull().default('basic'),
		...timestamps
	},
	(t) => [check('app_settings_single_row', sql`${t.id} = 1`)]
);
