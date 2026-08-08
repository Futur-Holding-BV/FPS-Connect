# KLANT_01 — Fase 0: klantbereikbare routes (vóór wijziging)

**Datum:** 2026-08-08 · **Commit (meting):** `9846b73` · **Methode:** statische analyse (`pnpm --filter @workspace/scripts run klant-routes-analyse`, gemeten) + handmatige verificatie per bestand door codelezing (gemeten, regelnummers in ruwe analyse). Ruwe route-inventaris: `KLANT_01_klantbereikbare_routes_ruwe_analyse.md`.

## Samenvatting

- 1296 routes totaal; 32 publiek (vóór requireAuth: health, auth, uitnodiging, installatie, portaal); 1264 sessieroutes.
- **229 sessieroutes waren vóór deze opdracht bereikbaar voor een klant** — veel meer dan het bedoelde klantoppervlak (~19 routes met `requireBevoegdheidOfKlant`).
- Oorzaak: `requireBevoegdheid` blokkeert klanten wél, maar routes met alleen `requireAuth` lieten iedere ingelogde gebruiker door, dus ook klanten.

## A. Bedoeld klantoppervlak (requireBevoegdheidOfKlant) — begrensd op toegewezen gebouwen?

| Route | Module | Begrensd op toewijzing (vóór) | Veldweglating |
|---|---|---|---|
| GET /dashboard/stats, /recente-activiteit, /status-verdeling, /vervaldagen | gebouwen | JA (helper filtert op toegewezenGebouwIds) | n.v.t. |
| GET /gebouwen | gebouwen | JA (+ alleen gepubliceerde gebouwen) | JA (klantweergave) |
| GET /gebouwen/:id | gebouwen | JA (+ publicatie-check, 403) | JA |
| GET /gebouwen/:id/kaart, /publicatiestatus | gebouwen | JA (via gebouwscope) | n.v.t. |
| GET /inspecties, /inspecties/:id, /:id/bevindingen | inspecties | JA | n.v.t. |
| GET /gebouwen/:id/rapporten (+detail) | rapportages | **NEE — GAT 4.2**: alleen statusfilter (definitief/gearchiveerd), géén check dat het gebouw aan de klant is toegewezen | deels |
| POST /gebouwen/:id/rapporten/:rid/klant-reactie | rapportages | **NEE** (zelfde gat) | n.v.t. |
| GET /opdrachten/:id/pim | offertes | **NEE — GAT 4.1**: alleen veldweglating via mapPim, elke opdracht-id opvraagbaar | JA (mapPim) |
| GET /opdrachten/:id/pim/uitvoering/stappen, /huidige-stap, /stap/:sid/foto-analyse/:aid, /verslag | offertes | **NEE** (zelfde gat, zonder veldweglating) | NEE |

## B. Onbedoeld klantbereikbaar (alleen requireAuth) — belangrijkste bevindingen

| Categorie | Routes (voorbeelden) | Risico vóór wijziging |
|---|---|---|
| **Ernstig: lezen + muteren zonder enige check** | projecten.ts: GET/PATCH/DELETE /projecten(/:id) · opname.ts: 15 routes (opnames/items/foto's van élk gebouw lezen, wijzigen, verwijderen) · workflow.ts: alle CRUD op workflowdefinities/lanes/cards | Klant kon projecten van andere klanten inzien, wijzigen en **verwijderen**; opnames van vreemde gebouwen muteren; kantoorprocessen herconfigureren |
| Kantoor-/personeelsdata lezen | GET /chat/gebruikers (alle medewerkers + e-mail) · GET /info/instellingen · GET /nieuws · GET /kantoor-release/actief · GET /beheer/go-live/* (in avg.ts) · GET /workflow-definities · classificatie GETs (géén middleware) · systeem GET module-beoordelingen · cqo GETs | Interne bedrijfs-/persoonsgegevens zichtbaar voor klant |
| AI-routes | POST /ai/invullen (context van willekeurige CRM-klant/gebouw/leverancier) · GET/POST /ai/beslissingen/:token | Datalek + beïnvloeding AI-beslissingen |
| Sessie-gescoped (laag risico) | /mijn/*-routes (HRM, salaris, AVG, verlof), chat-gesprekken, werkdag, meldingen POST | Alleen eigen data; klant heeft normaliter geen medewerkersprofiel |
| Bestanden | GET /storage/objects|thumbnails (requireAuth-only, geen object-ACL) | Wie een pad kent kan het bestand lezen |

Per-route detail met regelnummers: zie de drie onderzoeksrapporten samengevat in `docs/antwoorden/KLANT_01.md` en de ruwe analyse.

## C. Situatie ná KLANT_01

- **Centrale klant-poort** (`middlewares/klantPoort.ts`, gemount direct na `laadPermissies` in `routes/index.ts`): dicht tenzij open. Alle 229 onbedoeld bereikbare routes geven nu **403** voor een klant; alleen de expliciete allowlist (26 regels: dashboard, gebouwen, inspecties, rapporten, PIM, assistent, eigen chat, bestandsweergave, eigen AVG, melding indienen) blijft open.
- **Gaten 4.1/4.2 gedicht in de handlers** (tweede laag): PIM (alle 5 klantroutes) en rapporten (lijst/detail/klant-reactie) controleren nu `magBijGebouw` en geven 404 bij een niet-toegewezen gebouw.
- **Buildcontrole** (`pnpm --filter @workspace/scripts run klant-poort-check`): faalt als de poort niet gemount is, als een `requireBevoegdheidOfKlant`-route niet in de allowlist staat, of als een allowlist-regel op geen enkele route meer matcht.
- **Bewijs:** `scripts/src/verificatie-klant01.ts` — 2 klantaccounts met elk een eigen gebouw + hoofdbeheerder; K1–K5 + M1 groen (kruistoegang lijst én directe URL, rapport/PIM 404, 15 poort-blokkades incl. muterend, klantoppervlak werkt, medewerker ongewijzigd).
