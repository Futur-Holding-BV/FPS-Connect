---
name: Module-beoordelingen (Ontwikkelstatus sign-off)
description: Per-module Gereed/Niet akkoord sign-off op /beheer/ontwikkelstatus, in Postgres; hoe de agent afkeuringen ophaalt en onderzoekt
---

Op `/beheer/ontwikkelstatus` markeert een beheerder per module "Gereed" of
"Niet akkoord" (met optionele opmerking). Opgeslagen in Postgres-tabel
`module_beoordelingen` (uniek op `module_sleutel`), NIET localStorage, zodat
de keuzes sessie-overschrijdend bewaard blijven en queryable zijn.

**Agent-onderzoeksloop (waarvoor dit bestaat):** als de gebruiker een module op
"niet akkoord" zet, lees je die rijen op via `executeSql`
(`select module_sleutel, status, opmerking from module_beoordelingen where
status = 'niet_akkoord'`), onderzoek je waarom dat onderdeel niet voldoet en
kom je met een voorstel. De opmerking is optioneel: ontbreekt die, onderzoek
de module dan generiek.

**Sleutel is bewust losgekoppeld van de weergavenaam.** Elke module in de
`MODULES`-array heeft een eigen stabiele, URL-veilige `sleutel`. Niet afleiden
uit `naam`.
**Waarom:** dit is een sign-off/audit-functie; zou de sleutel uit de
weergavetekst komen, dan laat een hernoeming een bestaande beoordeling
verweesd raken (of botst met een ander). Bij het toevoegen van een module:
geef 'm een nieuwe, nooit-hergebruikte `sleutel`.

**Autorisatie:** GET is alleen `requireAuth` (geen `alleenBeheerder`) zodat
lezers geen 403 krijgen; PUT/DELETE via de bestaande
`alleenBeheerder = requireBevoegdheid("systeem", 1)` — hetzelfde gate als alle
andere writes in `systeem.ts`. UI-gating (`bevoegdheden.systeem >= 1`) is
spiegeling, geen access control.
