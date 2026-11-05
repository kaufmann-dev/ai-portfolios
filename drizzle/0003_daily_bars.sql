CREATE TABLE "daily_bars" (
	"ticker" text NOT NULL,
	"date" date NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	CONSTRAINT "daily_bars_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE INDEX "daily_bars_date_idx" ON "daily_bars" USING btree ("date");