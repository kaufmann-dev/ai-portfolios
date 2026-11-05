-- The hosted strategies' rules before 2026-11-05 become v1 and the 2026-11-05 text v2. Applies
-- only where a strategy still has its single migrated version with the 2026-11-05 session rule,
-- so it does nothing on other deployments. Rebalances submitted before the change move to v1.
UPDATE "strategy_versions" v SET "version" = 2, "created_at" = '2026-11-05T10:42:39.448Z'
FROM "strategies" s
WHERE s."id" = v."strategy_id" AND s."slug" = 'nothing-ever-happens' AND v."version" = 1
	AND (SELECT count(*) FROM "strategy_versions" x WHERE x."strategy_id" = s."id") = 1
	AND position($new$5. EVERY SESSION.
   - Holdings: check each one against both exits. Read everything published since the previous
     close, and compare its current forward P/E (EV/sales without earnings) with the pre-fear
     level in its exit plan. Execute every triggered exit.
   - Candidates: vet at least three new names against every entry test, in other sectors or fears
     than the previous session's. Replace the weakest holding when a candidate is clearly better;
     one that passes every entry test is clearly better than a holding that failed one when it
     was bought.
   - Gaps: when a check cannot be done, retry it or use another source. A missing check never
     counts as passed; name each one still missing in the rationale.
Begin every thesis with the fear and when it began, then the evidence that it is not happening.
Write the feared metric with its latest value, the worst-case check, and the pre-fear valuation
into the exit plan. Explain every trade in the rationale, and list the candidates vetted with
the test each one failed.$new$ IN v."content") > 0;
--> statement-breakpoint
INSERT INTO "strategy_versions" ("strategy_id", "version", "content", "created_at")
SELECT v."strategy_id", 1, replace(v."content", $new$5. EVERY SESSION.
   - Holdings: check each one against both exits. Read everything published since the previous
     close, and compare its current forward P/E (EV/sales without earnings) with the pre-fear
     level in its exit plan. Execute every triggered exit.
   - Candidates: vet at least three new names against every entry test, in other sectors or fears
     than the previous session's. Replace the weakest holding when a candidate is clearly better;
     one that passes every entry test is clearly better than a holding that failed one when it
     was bought.
   - Gaps: when a check cannot be done, retry it or use another source. A missing check never
     counts as passed; name each one still missing in the rationale.
Begin every thesis with the fear and when it began, then the evidence that it is not happening.
Write the feared metric with its latest value, the worst-case check, and the pre-fear valuation
into the exit plan. Explain every trade in the rationale, and list the candidates vetted with
the test each one failed.$new$, $old$5. EVERY SESSION. Check each holding against its exit plan using everything published since the
previous close, and execute every triggered exit. Replace a holding only with a clearly better
candidate. Begin every thesis with the fear and when it began, then the evidence that it is not
happening. Write the feared metric with its latest value, the worst-case check, and the pre-fear
valuation into the exit plan. Explain every trade in the rationale.$old$), '2026-10-20T17:23:03.625Z'
FROM "strategy_versions" v JOIN "strategies" s ON s."id" = v."strategy_id"
WHERE s."slug" = 'nothing-ever-happens' AND v."version" = 2
	AND NOT EXISTS (SELECT 1 FROM "strategy_versions" x WHERE x."strategy_id" = s."id" AND x."version" = 1);
--> statement-breakpoint
UPDATE "rebalances" r SET "strategy_version_id" = v1."id"
FROM "strategy_versions" v1, "strategy_versions" v2, "strategies" s
WHERE s."slug" = 'nothing-ever-happens' AND v1."strategy_id" = s."id" AND v1."version" = 1
	AND v2."strategy_id" = s."id" AND v2."version" = 2
	AND r."strategy_version_id" = v2."id" AND r."submitted_at" < v2."created_at";
--> statement-breakpoint
UPDATE "strategy_versions" v SET "version" = 2, "created_at" = '2026-11-05T10:42:50.875Z'
FROM "strategies" s
WHERE s."id" = v."strategy_id" AND s."slug" = 'drift-or-fade' AND v."version" = 1
	AND (SELECT count(*) FROM "strategy_versions" x WHERE x."strategy_id" = s."id") = 1
	AND position($new$8. EVERY SESSION.
   - Holdings: re-underwrite each one against its recorded thesis and exit plan using everything
     published since the previous close, and execute every triggered exit.
   - Candidates: screen the whole universe for rule-3 moves in the last ten sessions, not only the
     day's headline movers. Classify at least ten, largest moves first and including mid and
     small caps, plus every name the previous rationale flagged. Replace a holding only with a
     clearly better one.
   - Gaps: when a check cannot be done, retry it or use another source. A missing check never
     counts as passed; name each one still missing in the rationale.
Begin every thesis with DRIFT or FADE, write concrete exit prices and conditions into the exit
plan, and explain every closure in the rationale. List the candidates classified with their class
and why each was taken or skipped, and flag the names to re-check next session. When a type has
lost money over its last ten closures, it gets half the gross it would otherwise get and the
other type gets the rest, until its last ten closures are profitable again.$new$ IN v."content") > 0;
--> statement-breakpoint
INSERT INTO "strategy_versions" ("strategy_id", "version", "content", "created_at")
SELECT v."strategy_id", 1, replace(v."content", $new$8. EVERY SESSION.
   - Holdings: re-underwrite each one against its recorded thesis and exit plan using everything
     published since the previous close, and execute every triggered exit.
   - Candidates: screen the whole universe for rule-3 moves in the last ten sessions, not only the
     day's headline movers. Classify at least ten, largest moves first and including mid and
     small caps, plus every name the previous rationale flagged. Replace a holding only with a
     clearly better one.
   - Gaps: when a check cannot be done, retry it or use another source. A missing check never
     counts as passed; name each one still missing in the rationale.
Begin every thesis with DRIFT or FADE, write concrete exit prices and conditions into the exit
plan, and explain every closure in the rationale. List the candidates classified with their class
and why each was taken or skipped, and flag the names to re-check next session. When a type has
lost money over its last ten closures, it gets half the gross it would otherwise get and the
other type gets the rest, until its last ten closures are profitable again.$new$, $old$8. EVERY SESSION. Re-underwrite each holding against its recorded thesis and exit plan using
everything published since the previous close, and execute every triggered exit. Then classify
new candidates; replace a holding only with a clearly better one. Begin every thesis with DRIFT
or FADE, write concrete exit prices and conditions into the exit plan, and explain every closure
in the rationale. When a type has lost money over its last ten closures, it gets half the gross
it would otherwise get and the other type gets the rest, until its last ten closures are
profitable again.$old$), '2026-10-20T16:32:44.183Z'
FROM "strategy_versions" v JOIN "strategies" s ON s."id" = v."strategy_id"
WHERE s."slug" = 'drift-or-fade' AND v."version" = 2
	AND NOT EXISTS (SELECT 1 FROM "strategy_versions" x WHERE x."strategy_id" = s."id" AND x."version" = 1);
--> statement-breakpoint
UPDATE "rebalances" r SET "strategy_version_id" = v1."id"
FROM "strategy_versions" v1, "strategy_versions" v2, "strategies" s
WHERE s."slug" = 'drift-or-fade' AND v1."strategy_id" = s."id" AND v1."version" = 1
	AND v2."strategy_id" = s."id" AND v2."version" = 2
	AND r."strategy_version_id" = v2."id" AND r."submitted_at" < v2."created_at";
--> statement-breakpoint
UPDATE "strategy_versions" v SET "version" = 2, "created_at" = '2026-11-05T10:43:00.407Z'
FROM "strategies" s
WHERE s."id" = v."strategy_id" AND s."slug" = 'swing-repricing' AND v."version" = 1
	AND (SELECT count(*) FROM "strategy_versions" x WHERE x."strategy_id" = s."id") = 1
	AND position($new$5. EVERY SESSION.
   - Holdings: re-underwrite every holding against its recorded thesis and exit plan using
     everything published since the previous close, and execute every triggered exit. Resize when
     the target, invalidation, or reward-to-risk changed; restate a thesis or exit plan only when
     the reasoning changed.
   - Candidates: review the disclosures of the last two sessions across every sector and market
     cap (earnings, guidance, filings, regulatory decisions), not only the day's biggest movers.
     Underwrite at least five against rule 2, plus every name the previous rationale flagged.
     Replace the weakest holding only with a clearly better candidate; do not churn.
   - Gaps: when a check cannot be done, retry it or use another source. A missing check never
     counts as passed; name each one still missing in the rationale.
Explain every closure in the rationale, list the candidates underwritten and why each was taken
or skipped, flag the names to re-check next session, and use closed positions to check which
kinds of theses have worked.$new$ IN v."content") > 0;
--> statement-breakpoint
INSERT INTO "strategy_versions" ("strategy_id", "version", "content", "created_at")
SELECT v."strategy_id", 1, replace(v."content", $new$5. EVERY SESSION.
   - Holdings: re-underwrite every holding against its recorded thesis and exit plan using
     everything published since the previous close, and execute every triggered exit. Resize when
     the target, invalidation, or reward-to-risk changed; restate a thesis or exit plan only when
     the reasoning changed.
   - Candidates: review the disclosures of the last two sessions across every sector and market
     cap (earnings, guidance, filings, regulatory decisions), not only the day's biggest movers.
     Underwrite at least five against rule 2, plus every name the previous rationale flagged.
     Replace the weakest holding only with a clearly better candidate; do not churn.
   - Gaps: when a check cannot be done, retry it or use another source. A missing check never
     counts as passed; name each one still missing in the rationale.
Explain every closure in the rationale, list the candidates underwritten and why each was taken
or skipped, flag the names to re-check next session, and use closed positions to check which
kinds of theses have worked.$new$, $old$5. EVERY SESSION. Re-underwrite every holding against its recorded thesis and exit plan using
everything published since the previous close, and execute every triggered exit. Resize when the
target, invalidation, or reward-to-risk changed; restate a thesis or exit plan only when the
reasoning changed. Replace the weakest holding only with a clearly better candidate; do not
churn. Explain every closure in the rationale, and use closed positions to check which kinds of
theses have worked.$old$), '2026-10-20T16:32:52.088Z'
FROM "strategy_versions" v JOIN "strategies" s ON s."id" = v."strategy_id"
WHERE s."slug" = 'swing-repricing' AND v."version" = 2
	AND NOT EXISTS (SELECT 1 FROM "strategy_versions" x WHERE x."strategy_id" = s."id" AND x."version" = 1);
--> statement-breakpoint
UPDATE "rebalances" r SET "strategy_version_id" = v1."id"
FROM "strategy_versions" v1, "strategy_versions" v2, "strategies" s
WHERE s."slug" = 'swing-repricing' AND v1."strategy_id" = s."id" AND v1."version" = 1
	AND v2."strategy_id" = s."id" AND v2."version" = 2
	AND r."strategy_version_id" = v2."id" AND r."submitted_at" < v2."created_at";
