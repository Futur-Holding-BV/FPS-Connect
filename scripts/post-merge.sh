#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Trek Postgres' standaard '<tabel>_<kolom>_key' unique-constraintnamen gelijk met de
# door Drizzle verwachte '_unique'-conventie. Zonder deze stap breekt 'drizzle-kit push'
# tijdens een merge (non-TTY) af op de defensieve "truncate?"-prompt bij een naam-mismatch,
# waardoor geen enkele additieve wijziging wordt toegepast. Hernoemen is niet-destructief.
pnpm --filter @workspace/db run reconcile
pnpm --filter @workspace/db run push
