---
name: Medewerker-create heeft twee routes + conceptfase
description: POST /medewerkers (UI-pad, óók concept met alleen naam+gebruiker) vs POST /medewerkers/onboarding; contract-aanmaak en validaties moeten beide paden én de PATCH-afronding dekken.
---

- De onboarding-UI (`onboarden.tsx`, `useCreateMedewerker`) gebruikt de **gewone** `POST /medewerkers`, niet `POST /medewerkers/onboarding`. Wijzigingen aan onboarding-servergedrag moeten op beide routes landen (gedeelde helper), anders bewijst een test op de ene route niets over de UI.
- **Wizard-conceptfase:** stap 1 doet `POST /medewerkers` met alléén `naam`+`gebruiker_id` (geen startdatum); afronden gebeurt via `PATCH /medewerkers/:id`. Side-effects die volledige gegevens vereisen (bv. arbeidsovereenkomst aanmaken) moeten dus: (a) fail-safe overslaan bij ontbrekende startdatum, (b) óók op het PATCH-pad draaien met duplicate-guard, (c) atomair in één transactie met de medewerker-write.
- **Why:** onvoorwaardelijke insert bij POST brak de concept-flow (NOT NULL startDatum → 500 + achterblijvend concept dat retries met 409 blokkeert) — architect-review ving dit.
- **How to apply:** helper `maakArbeidsovereenkomstBijOnboarding` in `routes/hrm.ts` is het patroon (guard op startdatum + bestaand contract, tx-parameter). Bewijs: `scripts/src/verificatie-gebruikers01.ts` stap 8/9.
- Vertaaltabel dienstverband→contracttype: vast→onbepaalde_tijd, tijdelijk→bepaalde_tijd, oproep→oproep, stage→stage; zzp/payroll/detachering/directie bewust géén contractrecord. Contracturen geldig bereik 0..48 (0 = nul-urencontract).
