# Meting SNAGSTREAM_ARCHIEF_01 — 19 augustus 2026

## Meetopzet

Gemeten op de ontwikkelomgeving, werkboom vanaf
`8866ec14389e6b32c2dd79ac4a9b66bfe6328320`. Alle tijdelijke rapporten, snags,
gebouwen en uploadregistraties zijn na iedere proef verwijderd.

## Geautomatiseerd bedrijfsbewijs

Commando:

```text
pnpm --filter @workspace/scripts run verificatie-snagstream-archief
```

Uitslag: **12 geslaagd, 0 mislukt**.

Bewezen:

1. browser-SHA-256 en serverhercontrole van PDF, hash en grootte;
2. gebruikergebonden, tijdelijk uploadtoken;
3. een buiten-scope inhoudsdubbel geeft geen rapportmetadata prijs;
4. alleen een server-beheerd object onder de exclusieve Snagstream-opslagprefix wordt verwijderd; legacyrijen staan na migratie fail-closed;
5. afzonderlijke uitkomsten voor exacte dubbel en naamconflict;
6. migratiekolom en hashindex;
7. inhoudsdubbel ondanks andere bestandsnaam;
8. dezelfde naam met verschillende hashes blijft zichtbaar;
9. snagzoeken levert rapport, snag en pagina;
10. ongekoppeld rapport kan worden gekoppeld;
11. gebouwaggregatie telt rapporten en snags;
12. bewijsdata is volledig teruggedraaid.

## Repository-E2E

Commando:

```text
pnpm --filter @workspace/scripts run e2e-snagstream-archief
```

Uitslag: **1 test geslaagd**.

De test `scripts/e2e/web-snagstream-archief.spec.ts` bewees via echte HTTP- en
storagecalls:

| Scenario | Gemeten resultaat |
|---|---|
| Uploadtoken aanvragen | 200 |
| Presigned PDF-PUT | 2xx |
| Eerste rapport voltooien | 201 |
| Exacte hash opnieuw controleren | `exact_dubbel`; geen tweede upload |
| Zelfde naam, andere hash | `naamconflict` |
| Voltooien zonder bevestiging | 409 |
| Opnieuw voltooien met hetzelfde token en bevestiging | 201 |
| Token van andere gebruiker aanbieden | 409; geen rapport |
| Zoeken in snagomschrijving | rapporttreffer met `pdf_pagina = 7` |
| Gebouwenoverzicht | 2 rapporten en 1 snag voor bewijsgebouw |
| PDF vóór rapportdelete | storage GET 200 |
| Rapport verwijderen | DELETE 204 |
| PDF na rapportdelete | storage GET 404 |
| Verlopen retry naar reeds ontbrekend object | retry-rij verwijderd |

## Handmatige browserdoorloop

De draaiende Firevault-app is doorlopen met een tijdelijk geldig PDF-bestand.
Gemeten:

- archiefpagina met gebouwenoverzicht boven de rapportlijst;
- uploaddialoog met inhoudscontrole en gebouwkeuze;
- exacte dubbel opent bestaand rapport met melding;
- dezelfde naam/andere inhoud toont beide bewuste keuzes;
- zoeken op snagomschrijving toont `Snag … · pagina …`;
- directe link opent het rapport op `#snag-<id>`;
- gebouwkaart toont rapport- en snagaantallen;
- na cleanup is het archief weer leeg;
- geen blokkerende browser- of serverfouten.

## Technische controles

| Controle | Uitslag |
|---|---|
| `pnpm run typecheck` | groen |
| `pnpm --filter @workspace/db run migrate` | migraties 0101 t/m 0104 toegepast |
| `pnpm --filter @workspace/db run drift-check` | geen drift |
| `pnpm --filter @workspace/db run check-wijziging` | groen |
| `pnpm --filter @workspace/db run check-hernoeming` | groen |
| API-workflow herstart | server luistert schoon op poort 8080 |
| Firevault-workflow herstart | Vite gereed |
| Architectuur-/securityreview | READY |

## Nulmeting na cleanup

```json
{
  "rapporten": { "totaal": 0, "zonder_hash": 0 },
  "dubbelen": { "dubbelgroepen": 0 },
  "uploads": { "pending": 0, "opruim_retry": 0 }
}
```

Omdat de ontwikkeldata geen bestaande Snagstream-rapporten bevatte, is de echte
productieomvang van de backfill niet aangenomen. Het mechanisme is wel
idempotent en met geïsoleerde database- en browserdata bewezen.
