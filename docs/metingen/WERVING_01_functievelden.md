# Meting WERVING_01 — vulling van de functie-eisvelden

Datum: 2026-08-10 · Commit: ffafc64

De cv-toetsing werkt per functie-eis en put daarvoor uitsluitend uit de vier
eisvelden op de functie: `taken`, `verantwoordelijkheden`, `competenties`,
`opleidingsvereisten`. Vóór oplevering is gemeten hoe gevuld die velden
werkelijk zijn.

## Meting (query op `functies`, 2026-08-10)

| id | naam | taken | verantwoordelijkheden | competenties | opleidingsvereisten | actief |
|---:|------|:-----:|:---------------------:|:------------:|:-------------------:|:------:|
| 8 | Project administratie | leeg | leeg | leeg | leeg | ja |
| 9 | Algemene Administratie | leeg | leeg | leeg | leeg | ja |
| 10 | Project Administratie | leeg | leeg | leeg | leeg | ja |
| 11 | Algemene Administratie | leeg | leeg | leeg | leeg | ja |

**Uitkomst: 0 van de 4 functies heeft ook maar één gevuld eisveld.**

## Consequentie en gedrag van de module

- De voorbereiding is bewust **fail-closed**: bij een functie zonder gevulde
  eisvelden geeft `POST /werving/kandidaten/:id/voorbereiden` een 422 met de
  melding dat de functieomschrijving eerst gevuld moet worden — er wordt nooit
  "iets" getoetst tegen een lege functie.
- Het bewijs (`scripts/src/verificatie-werving.ts`) maakt daarom een
  tijdelijke testfunctie mét gevulde velden aan en ruimt die weer op.

## Advies aan René

Voordat de wervingsmodule in de praktijk wordt gebruikt: vul per functie
waarop geworven wordt de vier eisvelden in het functiehuis
(Personeel → Functiehuis). Hoe concreter de eisen, hoe bruikbaarder de
toetsing en de voorgestelde cv-vragen.
