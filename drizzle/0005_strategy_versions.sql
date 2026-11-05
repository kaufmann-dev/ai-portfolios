CREATE TABLE "strategy_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"strategy_id" integer NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rebalances" ADD COLUMN "strategy_version_id" integer;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_strategy_version_idx" ON "strategy_versions" USING btree ("strategy_id","version");--> statement-breakpoint
ALTER TABLE "rebalances" ADD CONSTRAINT "rebalances_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "strategy_versions" ("strategy_id", "version", "content", "created_at")
SELECT "id", 1, "content", "updated_at" FROM "strategies";--> statement-breakpoint
UPDATE "rebalances" SET "strategy_version_id" = v."id"
FROM "strategy_versions" v
WHERE v."strategy_id" = "rebalances"."strategy_id" AND v."version" = 1;
