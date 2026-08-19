# GEBRUIKERS_01 v2 — migratie- en consolidatiebewijs

Datum: 19-08-2026

## Migratie 0101 — niet-destructieve consolidatie

| Controle | Uitkomst |
|---|---|
| Dev-migratie | 51/51 PASS |
| Rollback dry-run | 8/8 (altijd ROLLBACK — geen echte schrijf) |
| Drift na migratie | 0 |
| Rename/change-controles | groen |
| Volledige workspace-typecheck | groen |
| Functienaam-helper unit-tests | 6/6 |
| Echte API-ketenproef | 9/9 stappen PASS |
| Functierechten-escalatieproef | 3/3 stappen PASS (alle omwegen HTTP 403, fail-closed) |
| Legacy rechtenomwegen | HTTP 410 bewezen |
| Browserproef | PASS |

## Consolidatieresultaat

| Actie | Detail |
|---|---|
| IDs 8 en 9 | Inactief gemaakt (niet verwijderd) |
| IDs 10 en 11 | Behouden als leidende functies, BV-kenmerk verwijderd |
| Nieuwe functies | 16 aangemaakt, elk via `functies.profiel_id` aan bestaande matrix gebonden |
| Speculatieve namen | Niet aangemaakt (8 namen niet in database/PRESETS aangetroffen) |
| Werkmaatschappijbinding | Geen — functies gelden globaal voor alle vier BV's |

## Architectuurwijzigingen

| Onderdeel | Status |
|---|---|
| `beheer/profielen.tsx` | Verwijderd |
| `beheer/rollen-rechten.tsx` | Verwijderd |
| Oude profiel-/rollen-/objectrechtroutes | Redirect naar Functiehuis |
| Instellingen-item | Één "Functiehuis"-ingang |
| API-veld `functietitels` | Compatibiliteitsnaam, live gevuld uit actuele HRM-functies |
| Legacy functie/profiel/accountmutaties | Gesloten met HTTP 410 |
| Onboarding | Geen los profiel; rechtenpreview rechtstreeks uit gekozen functie |
| `is_uitvoerend_veld` | Afkomstig uit actieve functies |
| OpenAPI contracturen | 0..48, inclusief nulurencontract |

## Effectieve rechten

- Optelling actieve functiebasisrechten: hoofd-aanstelling + alle
  nevenafspraken.
- Per-module afwijkingen per persoon als override.
- Auditlog: reden, actor, tijdstip — append-only.
- `apply` overschrijft nooit stilzwijgend afwijkingen.
- Expliciete reset vereist een opgegeven reden.
- Functierechten beheren of via HRM koppelen is zelf een rechtenmutatie:
  `personeel:2` mag per module alleen niveaus beheren die de actor zelf
  effectief bezit; oude én nieuwe functie worden gecontroleerd.
- `scripts/src/verificatie-gebruikers01-autorisatie.ts` bewijst met een echte
  sessie dat `gebruikers:4` maken, hogere functie koppelen en alle vervang-,
  intrek-, verplaats- en AI-wizardomwegen 403 geven. Medewerker en voorstel
  blijven ongewijzigd.
- De AI-voorstelbeoordeling autoriseert vóór statusmutatie en schrijft
  voorstel+medewerker atomair; een geweigerde indienstdatum blijft `open`.
- `pnpm test`: 39 testbestanden groen, 593 tests geslaagd, 2 overgeslagen.

## Snapshot en herstelprocedure

Vóór de datamigratie vastgelegd: alle functies, profielkoppelingen en
verwijzende medewerker-/aanstellings-IDs. Inverse herstelprocedure getest
tegen de developmentdatabase (rollback dry-run 8/8, altijd ROLLBACK).
Zie `docs/metingen/GEBRUIKERS_01-herstelprocedure.md`.
