# Kwaliteitscontrole en Ontwikkelrichtlijn — FPS Platform

> Vastgesteld door de platformeigenaar. Van kracht voor het volledige FPS-platform:
> FPS Connect, FPS One en alle toekomstige modules.

## Hoofddoel

Het platform moet tijdens de volledige ontwikkeling stabiel, onderhoudbaar, veilig en uitbreidbaar blijven. Nieuwe functionaliteit mag nooit ten koste gaan van bestaande functionaliteit.

---

## Ontwikkelregels

- Bouw nieuwe functionaliteit **modulair**.
- Voorkom **breaking changes**.
- **Hergebruik** bestaande componenten waar mogelijk.
- Houd modules **logisch gescheiden**.
- Zorg dat iedere module later zelfstandig aangepast of uitgebreid kan worden.
- Nieuwe modules mogen **nooit** bestaande modules verstoren.
- Elke wijziging wordt opgeleverd als een afzonderlijke, **terugdraaibare checkpoint**.
- **Stabiliteit heeft altijd prioriteit boven nieuwe functionaliteit.**

---

## Kwaliteitscontrolescript

```bash
pnpm --filter @workspace/scripts run kwaliteitscheck
```

Rapporteert alleen — wijzigt niets. Bevindingen worden geclassificeerd als:

| Ernst   | Betekenis                                          |
|---------|----------------------------------------------------|
| Kritiek | Bouw stopt; onmiddellijk herstel vereist           |
| Hoog    | Bouw stopt; herstel vereist vóór volgende sessie   |
| Middel  | Oplossen binnen huidige sprint                     |
| Laag    | Technische schuld; bijhouden                       |
| Info    | Ter informatie                                     |

---

## Controlecategorieën

### Codekwaliteit
- Build- en compilefouten
- TypeScript-fouten (libs → frontend → API → scripts)
- Runtime-errors en console-errors
- Dependency-conflicten
- Dode code en ongebruikte componenten
- Dubbele functies
- Performance-regressies

### Database
- Migraties en dataconsistentie
- Relaties en ontbrekende indexen
- Schema-exports volledigheid
- Ongebruikte tabellen

### API's
- OpenAPI spec aanwezig en actueel (codegen-drift)
- Endpoint-validatie
- Authenticatie en autorisatie achter `requireAuth`
- Foutafhandeling en response-tijden

### Front-end
- Desktop, tablet, mobiel — responsiviteit
- Styling en componentconsistentie
- Navigatie en toegankelijkheid

### Security
- Authenticatie (sessie + TOTP)
- Autorisatie (bevoegdhedenmatrix)
- Secrets en environment variables nooit in code
- Input-validatie (Zod op alle API-inputs)
- SQL-injection / XSS / CSRF / rate limiting

### Architectuurscheiding

| Module       | Pad                          | Verantwoordelijkheid              |
|--------------|------------------------------|-----------------------------------|
| FPS Connect  | `/pages/connect/`            | Intern platform                   |
| FPS One      | `/pages/one/`                | Klantomgeving                     |
| Modules      | `/pages/modules/`            | Planning, Calculatie, etc.        |
| Kerndomein   | `/pages/gebouwen/` etc.      | Gedeeld projectbeheer             |

---

## Regressietesten

Na iedere grotere wijziging automatisch controleren dat het volgende nog werkt:

- Inloggen (wachtwoord + TOTP)
- Gebruikersbeheer
- Projecten / Gebouwen
- Spots (plaatsen, bewerken, plattegrond)
- Documenten (upload, versie, goedkeuring)
- Oplevering
- Onderhoud
- Dashboard
- Navigatie (sidebar, routing)

Testcommando (e2e CI):

```bash
pnpm --filter @workspace/scripts run e2e-monteur-ci
```

---

## Uitvoeringstriggers

| Trigger                          | Actie                              |
|----------------------------------|------------------------------------|
| Na iedere grotere bouwsessie     | Volledige kwaliteitscheck          |
| Na OpenAPI-wijziging             | Codegen + typecheck                |
| Na DB schema-wijziging           | `pnpm --filter @workspace/db run push` + typecheck |
| Vóór start nieuwe fase/module    | Kwaliteitscheck + regressietest    |

> Automatische scheduling (elke 4 uur) is niet beschikbaar in de huidige omgeving.
> De agent voert de check handmatig uit na iedere significante bouwsessie.

---

## Ontwikkelvolgorde

Nieuwe functionaliteit mag uitsluitend worden gebouwd wanneer:

1. De build succesvol is
2. Geen kritieke of hoge fouten aanwezig zijn
3. Regressietesten succesvol zijn
4. De codebase stabiel is

---

## Logging & changelog

Elke commit bevat een gestructureerde commit message met:

- Nieuwe en gewijzigde functionaliteit
- Bugfixes
- Databasewijzigingen
- API-wijzigingen
- Beveiligingsaanpassingen
- Performanceverbeteringen

Elke wijziging is volledig herleidbaar via de git-history.

---

## Automatisch herstel

De agent herstelt automatisch alle **veilige** fouten (typfouten, import-correcties,
codegen-drift, missing exports). Wijzigingen die bestaande functionaliteit kunnen
beïnvloeden vereisen eerst een impactanalyse.

---

*Vastgesteld: juni 2026. Van kracht voor alle toekomstige ontwikkelsessies.*
