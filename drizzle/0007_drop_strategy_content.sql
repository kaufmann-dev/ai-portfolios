ALTER TABLE "rebalances" DROP CONSTRAINT "rebalances_strategy_id_strategies_id_fk";
--> statement-breakpoint
ALTER TABLE "rebalances" DROP COLUMN "strategy_id";--> statement-breakpoint
ALTER TABLE "strategies" DROP COLUMN "content";