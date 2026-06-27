---
name: Opdracht/Werkbegroting flow
description: Hoe offerte omgezet wordt naar opdracht met werkbegroting, planning-koppeling en nacalculatie
---

## De keten

Calculatie → Opdracht (POST /offertes/:id/maak-opdracht) → Werkbegroting (project_begrotingen + werkbegroting_regels) → Vaststellen → Planning-items koppelen via planning_items.opdracht_id → Uurstaten koppelen via uren_registraties.opdracht_id → Nacalculatie

## Maak-opdracht logica

- POST /offertes/:id/maak-opdracht maakt opdracht + begroting in één transactie
- Calculatieregels met `isStaartkosten=true` of `isBouwplaatskosten=true` worden NIET gekopieerd naar werkbegroting
- Arbeid uren = hoeveelheid × muPerEenheid (indien muPerEenheid > 0), anders hoeveelheid direct
- Opslagen/winst zijn NIET in werkbegroting_regels (basisprijs direct uit calculatieregel.tarief)
- 409 als er al een opdracht bestaat voor de offerte (UNIQUE controle via query, niet constraint)

## DB-tabellen

- `opdrachten` — brug offerte→uitvoering (status: actief/gepauzeerd/afgerond/geannuleerd)
- `project_begrotingen` — werkbegroting (status: concept/vastgesteld); bevat opdracht_id FK
- `werkbegroting_regels` — regels zonder opslagen; calc_regel_id FK naar mod_calc_regels
- `planning_items.opdracht_id` en `uren_registraties.opdracht_id` — koppeling naar opdracht

## Route middleware

- Gebruikt `requireBevoegdheid("offertes", 1/2)` — NIET een aparte "opdrachten" bevoegdheid
- `ListOpdrachtenParams` is flexibel (URLSearchParams.entries) → je kunt `offerte_id`, `gebouw_id`, `status` doorgeven ook als ze niet in het TS-type staan

## Frontend patroon

- Offerte studio toont amber banner "Maak opdracht" als portaal_status ∈ ["akkoord","ondertekend"] en er nog geen opdracht bestaat
- Offerte studio toont blauwe banner "Ga naar opdracht" als er al een opdracht bestaat
- Planning pagina toont amber banner met openstaande vastgestelde opdrachten (status=actief + begroting_status=vastgesteld)
- Route /opdrachten/:id → artifacts/firevault/src/pages/opdrachten/detail.tsx

**Why:** Offerte Intelligence fase-1 brug; opslagen/winst niet tonen aan uitvoerende teams; begroting vaststellen voor nacalculatie is de juridische baseline.
