---
name: First-install bootstrap pattern
description: Fail-closed "create the first admin user" flow when the users table is empty, and the safe way to smoke-test it without touching the shared dev DB.
---

## Pattern

A public, unauthenticated `GET .../status` + `POST ...` pair that is only allowed to succeed while a users table is empty, used to create the very first admin account on a fresh (self-hosted) install. Once one user exists, the POST must be permanently and unconditionally closed (403) — no config flag, no env var, no way to reopen it.

**Why:** self-hosted deployments start with an empty database and need one bootstrap path to create the first account, but that same path is a standing privilege-escalation risk if it can ever fire again later (e.g. after a user gets deleted, or under a race at first boot).

**How to apply:**
- Reuse the existing user-creation/hashing helper as-is; do not write new hashing/auth logic for the bootstrap path.
- Guard with a cheap pre-check (`SELECT count(*)`) for the common case, then do the real guarantee inside `db.transaction` with `pg_advisory_xact_lock(<fixed arbitrary bigint>)` followed by a re-count *inside* the transaction before inserting. This serializes concurrent POSTs: the loser's re-count sees the winner's committed row and throws/403s.
- Count with no `WHERE` clause (include archived/inactive rows) so the path can't be reopened by soft-deleting the one admin.
- Log only a fixed, non-parameterized string on success (e.g. "First installation completed") — never log the submitted fields.
- On the frontend, compute any "special public path" checks (invite links, password reset, the bootstrap page itself) *before* calling the status hook, and call the hook unconditionally (hooks-rules-safe) with an `enabled` flag rather than skipping the call — then redirect unauthenticated visitors on normal paths to the bootstrap page only when the hook says it's available.

## Safe way to test the positive/race path

Never empty the `gebruikers`/users table on a shared, already-seeded dev database to test this — cascading FKs across many tables can destroy real pilot data, and it's a destructive action without user consent.

Instead: create a throwaway database on the same Postgres cluster (`CREATE DATABASE bootstrap_smoke`), run the schema push against it (`DATABASE_URL=... pnpm --filter @workspace/db run push`), then run one built server process against it on a spare port. Test the positive path (first POST → 201) and the concurrency race (two simultaneous POSTs → exactly one 201 + one 403) against that throwaway DB, then `DROP DATABASE` it. The main dev server/workflow keeps running untouched throughout.

Gotcha: background server processes started with `&`/`nohup`/`disown`/`setsid` from one bash-tool call do **not** survive into the next bash-tool call in this environment (each call appears to be its own isolated shell/session) — do the full start-test-teardown sequence for a throwaway smoke server inside a *single* bash command, not split across multiple tool calls.
