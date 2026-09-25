UPDATE "rebalances" SET "rationale" = 'Not recorded.' WHERE "rationale" IS NULL;--> statement-breakpoint
ALTER TABLE "rebalances" ALTER COLUMN "rationale" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rebalance_positions" ADD COLUMN "thesis" text NOT NULL DEFAULT 'Not recorded.';--> statement-breakpoint
ALTER TABLE "rebalance_positions" ALTER COLUMN "thesis" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rebalance_positions" ADD COLUMN "exit" text NOT NULL DEFAULT 'Not recorded.';--> statement-breakpoint
ALTER TABLE "rebalance_positions" ALTER COLUMN "exit" DROP DEFAULT;
