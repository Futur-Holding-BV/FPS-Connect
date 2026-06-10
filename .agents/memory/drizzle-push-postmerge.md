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
