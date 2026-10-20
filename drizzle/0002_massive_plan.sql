CREATE TYPE "public"."massive_plan" AS ENUM('basic', 'starter');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"massive_plan" "massive_plan" DEFAULT 'basic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "last_closes" (
	"ticker" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"close" numeric(18, 6) NOT NULL,
	"previous_date" date,
	"previous_close" numeric(18, 6)
);
--> statement-breakpoint
TRUNCATE TABLE "tickers";--> statement-breakpoint
ALTER TABLE "tickers" ADD COLUMN "synced_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "tickers" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "tickers" DROP COLUMN "checked_at";