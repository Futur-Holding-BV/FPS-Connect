#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Stap 1: Additieve schemaherstel — voegt ontbrekende tabellen en kolommen toe
# via idempotente IF NOT EXISTS SQL-statements. Draait vóór reconcile en push
# zodat het drizzle-diff klein blijft en geen interactieve prompts triggert.
pnpm --filter @workspace/db run apply-additive
# Stap 2: Trek Postgres' standaard '<tabel>_<kolom>_key' unique-constraintnamen gelijk met de
# door Drizzle verwachte '_unique'-conventie. Zonder deze stap breekt 'drizzle-kit push'
# tijdens een merge (non-TTY) af op de defensieve "truncate?"-prompt bij een naam-mismatch,
# waardoor geen enkele additieve wijziging wordt toegepast. Hernoemen is niet-destructief.
pnpm --filter @workspace/db run reconcile
# Stap 3: --force: sla interactieve data-loss prompts over (non-TTY omgeving). Stale kolommen
# die Drizzle wil droppen worden vooraf handmatig via directe SQL verwijderd zodat
# --force nooit onbedoeld echte data verwijdert.
pnpm --filter @workspace/db run push-force
