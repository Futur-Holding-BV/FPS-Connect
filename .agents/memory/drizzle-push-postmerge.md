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

**How to apply:** when data vanishes across multiple clients, curl the underlying list endpoint first — a 500 (not 401/empty) points at schema drift, not the UI. Reconcile the DB additively (CREATE TABLE / ALTER ADD COLUMN to match the schema source of truth) and restart the API (fresh process clears stale prepared statements) before touching frontend code. NB: requireAuth makes an unauthenticated curl return 401 *before* the handler runs, so 401 does NOT prove the query is fine — verify by mimicking the handler's exact `SELECT <all cols>` against the DB instead.

## The UNIQUE-prompt is usually a name mismatch, not a missing constraint

The "do you want to truncate <table>?" prompt that aborts post-merge almost always means the constraint already EXISTS under Postgres' default name `<table>_<cols>_key`, but the drizzle schema's `.unique()` expects `<table>_<cols>_unique`. Drizzle doesn't recognize the `_key` one and tries to add its own → truncate-confirm prompt → TTY abort.

- Fix: `ALTER TABLE <t> RENAME CONSTRAINT <t>_<cols>_key TO <t>_<cols>_unique;` (rename, do NOT add a second redundant unique). Find them all at once: `SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype='u' AND connamespace='public'::regnamespace AND conname LIKE '%\_key';` then rename each. Beats whack-a-mole (push only reports one prompt per run).
- Composite name = columns joined by `_` in `unique().on(a,b)` order, e.g. `label_applicaties_label_id_type_code_unique`.

## Benign "[✓] Changes applied" churn — do not chase, do not --force

After all prompts are resolved, `push` may still print "[✓] Changes applied" on every run without prompting. Run `drizzle-kit push --verbose` to see the SQL: it's harmless idempotent churn — a Postgres 63-char identifier truncation on a long FK name (drizzle drops `..._gebruikers_id_f` and re-adds `..._gebruikers_id_fk`, which Postgres re-truncates, forever), plus repeated `ALTER COLUMN ... SET DEFAULT`. These are non-destructive and post-merge still exits success. Leave them. **Never** switch post-merge to `push --force` to silence it — `--force` would also apply destructive diffs (drops/truncates) without asking.

## Now auto-reconciled: `_key`→`_unique` rename runs before push

`scripts/post-merge.sh` now runs `pnpm --filter @workspace/db run reconcile` (a small idempotent node script, `lib/db/scripts/reconcile-unique.mjs`) **before** push. It renames every `public` `%_key` unique constraint (except `session`) to drizzle's `<table>_<cols>_unique` convention, so the name-mismatch prompt no longer recurs by itself. It is best-effort (exits 0 on error) so it never blocks push.

**Why:** the `_key`/`_unique` mismatch is the dominant recurring cause of the non-TTY abort; automating the rename removes the whack-a-mole without the dangerous `--force`.

**Still manual:** adding a NEW `.unique()` to an existing, populated column that has *no* constraint yet — reconcile only renames constraints that already exist. That case still needs a dup-check + direct `ALTER TABLE … ADD CONSTRAINT …_unique UNIQUE(...)`. Also watch 63-char identifier truncation on very long/composite unique names: it can leave a residual mismatch (monitor if push prompts again; never `--force`).
