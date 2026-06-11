---
name: Set-sync edit-dialog data-loss val
description: Wanneer een bewerkdialoog een volledige set "delete-all-then-insert" naar de server schrijft, mag opslaan pas na een SUCCESVOL geladen huidige set.
---

# Set-sync edit-dialog data-loss val

Regel: bij een endpoint dat een volledige set vervangt (server doet delete-all-WHERE-parent
gevolgd door insert van de meegestuurde ids — bv. `syncLabelDocumenten`,
`syncLabelApplicaties`), moet de client zijn werk-set initialiseren uit een **succesvol**
geladen query (`isSuccess`), NIET uit `!isLoading`. Gate de Opslaan-knop tot die init
gelukt is, en toon een expliciete foutstatus als de query faalt.

**Why:** React Query's `data` valt met `data: x = []` terug op `[]` zodra de query niet
succesvol is. Bij `isLoading=false` na een **fout** (of als de gebruiker opslaat vóórdat de
query klaar is) wordt de werk-set dan `[]`, en de delete-all-then-insert wist stilzwijgend
ALLE koppelingen — inclusief gearchiveerde/vervangen revisies die juridisch nog gelden.
De architect ving dit als enige blokkerende defect in de bibliotheekketen-feature.

**How to apply:**
- Init met een ref-guard op `isSuccess` (eenmalig), niet op `!isLoading`.
- Houd een `klaar`-state bij; zet `disabled` op de Opslaan-knop én een defensieve
  `if (!klaar) return` in de bewaar-functie.
- Render een aparte `isError`-tak (geen lege-state-tekst die een mislukte load maskeert).
- Geldt voor elke many-to-many "vervang de hele set"-dialoog, beide kanten van een
  spiegelpaar (`PUT /labels/:id/documenten` ↔ `PUT /documenten/:id/toepassingen`).
