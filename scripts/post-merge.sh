#!/bin/bash
set -e
# Zorg dat workspace-binaries (waaronder tsc) bereikbaar zijn, ook in non-login
# omgevingen zoals de post-merge runner (prepare lifecycle roept tsc --build aan).
export PATH="$PWD/node_modules/.bin:$PATH"
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
# Stap 3b: 'drizzle-kit push --force' kan de handmatig aangemaakte
# gebruiker_profielen-UNIQUE-constraint (en vergelijkbare additieve constraints)
# als "drift" beschouwen en droppen. apply-additive is idempotent (IF NOT EXISTS /
# DO-block met pg_constraint-check), dus opnieuw draaien ná de push herstelt dit
# zonder gevolgen als er niets ontbreekt. Voorkomt dat elke merge opnieuw handmatig
# hersteld moet worden.
pnpm --filter @workspace/db run apply-additive
# Stap 4: Schema-healthcheck — voert een lees-only SELECT uit op de kerntabellen om te
# bevestigen dat alle kritieke kolommen daadwerkelijk aanwezig zijn in de database.
# Faalt met exit 1 en een duidelijke foutmelding als een tabel of kolom ontbreekt.
# De merge wordt alleen groen gerapporteerd als deze stap slaagt.
pnpm --filter @workspace/db run schema-healthcheck
# Stap 5: Seed Document Studio-model voor opleverrapport (idempotent; slaat over als reeds aanwezig).
pnpm --filter @workspace/scripts run seed-studio-opleverrapport
