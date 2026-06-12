---
name: Drizzle push & post-merge DB drift
description: Why post-merge `drizzle-kit push` fails in this repo and how to resolve schema drift safely.
---

# Drizzle push & post-merge schema drift

`scripts/post-merge.sh` runs `drizzle-kit push` (interactive) with stdin closed, so any drizzle prompt aborts with a TTY error and the post-merge reports failure.

Two recurring causes:

1. **Additive UNIQUE constraints prompt.** Adding a `.unique()` to the schema makes drizzle ask "…do you want to truncate <table>?" before adding the constraint. No TTY -> abort.
   - Fix: apply it yourself via direct SQL after confirming safety. Check duplicates first (`SELECT col, COUNT(*) FROM t GROUP BY col HAVING COUNT(*)>1`); NULLs are fine (Postgres allows multiple NULLs under UNIQUE). Then `ALTER TABLE <t> ADD CONSTRAINT <t>_<col>_unique UNIQUE (<col>);`. Re-run push to surface the next diff.

2. **The `session` table.** Created/managed by connect-pg-simple, intentionally NOT in the drizzle schema, so drizzle wants to DROP it on every push (destructive prompt -> abort, and would wipe live sessions).
   - Fix (permanent): `tablesFilter: ["!session"]` in `lib/db/drizzle.config.ts`.

**Why:** push is the post-merge reconciliation step; if it never goes green every merge reports a false failure and real drift hides behind it.

**How to apply:** when a merge's post-merge push fails, run `pnpm --filter @workspace/db run push` locally to read the first pending diff, resolve additive constraints via ALTER SQL after a dup-check, never let it drop `session`, then confirm with `runPostMergeSetup()` (expect `success: true`; push prints "[✓] Changes applied").

## Symptom: missing column/table → select-all 500 (masquerades as a frontend bug)

Drizzle `db.select().from(table)` enumerates **every** schema column in the emitted SQL. If post-merge drift left a schema column or table out of the dev DB (e.g. a new table plus its FK column), every list query on that table throws `column ... does not exist` and returns 500 — for all clients at once.

Downstream this does NOT look like a DB problem. Real case: spots stopped rendering on the floorplan on **both** web and mobile while the PDF base layer still drew fine — it read like a renderer/clipping regression. It was the voorzieningen list endpoint 500ing because `clusters` table + `voorzieningen.cluster_id` were missing.

**Why:** select-all couples list endpoints to the *entire* current schema, so one missing column silently breaks unrelated UI and tempts you to refactor the renderer.

**How to apply:** when data vanishes across multiple clients, curl the underlying list endpoint first — a 500 (not 401/empty) points at schema drift, not the UI. Reconcile the DB additively (CREATE TABLE / ALTER ADD COLUMN to match the schema source of truth) and restart the API (fresh process clears stale prepared statements) before touching frontend code.
