# AVG-afscherming oud-medewerkers — beleidsgrens & lek-audit (2026-08-17, taak #1008)

## Beleidsgrens

`medewerkers.afgeschermd_op` (gezet via `POST /medewerkers/:id/afschermen`, alleen oud-medewerkers) betekent:

- **API/UI-disclosure verboden** voor de velden in `AFGESCHERMDE_VELDEN` (hrm.ts): e-mail, telefoon, mobiel, noodcontact, geboortedatum/-plaats, adres/postcode/woonplaats, rijbewijs(-vervaldatum), cv-tekst, opmerkingen. Geen enkel endpoint mag deze velden van een afgeschermde medewerker teruggeven, ook niet indirect (selectors, kalender, AI-context).
- **`naam` is bewust NIET afgeschermd**: die blijft nodig voor historische verwijzingen (uren, planning, verlof, salarisarchief, dossiers). Endpoints die alleen `naam` (+ id/functie/werkmaatschappij/dienstverband) tonen zijn conform beleid.
- **Interne loon-/wettelijke verwerking mag de data blijven gebruiken** (bewaarplicht, Wet LB art. 28): mandagstaat (naam/geboortedatum/BSN in loonstaat), SCAB-verwerking, salarisarchief-matching, salaris-mutaties, import-duplicaatsleutels, e-mailclassificatie (intern/extern-bepaling). Voorwaarde: de persoonsvelden zelf komen niet in een API-respons of UI terecht — alleen het verwerkingsresultaat (bijv. `naam` of een match-id).

## Audit-inventaris (alle directe reads op medewerkersTable buiten de HRM-mappers)

| Plek | Oordeel |
| --- | --- |
| routes/hrm.ts mappers (medewerkerNaarJson + lijst) | Afgeschermd via `pasAfschermingToe` ✔ |
| routes/hrm.ts offboard-samenvatting | Alleen naam/functie/wm/dienstverband/in_dienst_sinds → conform (naam niet afgeschermd) |
| routes/hrm-wizard.ts duplicate-check | Sluit afgeschermden uit; account alleen geredigeerd bij exacte e-mailmatch ✔ |
| routes/planning-module.ts `/modules/planning/medewerkers` | **GEFIXT**: gaf e-mail/telefoon terug; nu `afgeschermd_op IS NULL`-filter |
| routes/kalender.ts verjaardagen | **GEFIXT**: geboortedatum-gebruik nu met `afgeschermd_op IS NULL` |
| services/moments/verjaardag.ts | **GEFIXT**: idem |
| lib/aiContext/resolvers.ts medewerkerResolver | Alleen naam/functie/wm/dienstverband/actief → conform |
| routes/mijn-privacy.ts | Self-scoped, maar afschermen kan óók bij een nog actief account (actief=true, uit_dienst_per verstreken). Daarom worden email/telefoon/mobiel bij afgeschermd_op ook naar de eigen gebruiker als null teruggegeven; niet-afgeschermde velden (naam, werkmaatschappij, dienstverband, verlofsaldi, opleidingen) blijven zichtbaar. |
| routes/import.ts duplicaatsleutels (email/naam/geb) | Interne matching, sleutels verlaten de server niet → intern-OK |
| routes/emails.ts bepaalEigenOrganisatie | Interne classificatie, e-mails niet gedisclosed → intern-OK |
| routes/salarisarchief.ts matchMedewerker (email) | Loonverwerking-matching; respons bevat alleen naam → intern-OK |
| routes/scab-mail.ts, salaris-mutaties.ts, loon-output.ts, lib/mandagstaat.ts | Loon-/wettelijke verwerking; disclosure beperkt tot naam → intern-OK |
| uren.ts, uitvoering.ts, opdrachten.ts, werkdag.ts, boekhouder.ts, kalender-verlof, verlofVervalService, bewakingsloop | Alleen `naam` (of ID/cao voor berekening) → conform |
| achievements, materiaal-aanvragen, veiligheid, workflow-configs, effectieve-/functie-bevoegdheden, avgAnonimiseren | Alleen ID-matching → veilig |

## IDOR-check (account-ID uit duplicate-check → naam/e-mail?)

- `GET /gebruikers/:id` geeft niet-beheerders `mapGebruikerPubliek`: e-mail `""`, telefoon `null`; alleen naam/rol (bewust, voor toewijzingsweergave).
- `GET /toewijsbare-gebruikers` geeft bewust geen e-mail.
- Conclusie: een lager-gerechtigde kan een account-ID niet omzetten naar e-mail/telefoon; naam-zichtbaarheid is bestaand, bedoeld gedrag en valt buiten `AFGESCHERMDE_VELDEN`.

## Regels voor nieuwe code

1. Nieuwe route die afgeschermde velden van medewerkers teruggeeft → filter op `isNull(medewerkersTable.afgeschermdOp)` of strip via `pasAfschermingToe`.
2. Selectors/keuzelijsten horen afgeschermde oud-medewerkers helemaal niet te tonen.
3. Loonverwerking mag de data lezen, maar de persoonsvelden nooit in de API-respons zetten.

Bewijs: `scripts/src/bewijs-offboard-uitsluiting.ts` (incl. planning-selector-, kalender-verjaardag- en IDOR-checks).
