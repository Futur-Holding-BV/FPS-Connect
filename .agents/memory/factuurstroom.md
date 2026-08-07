---
name: FACTUUR_02 factuurstroom
description: Ontwerpregels van de automatische factuurstroom (mail → goedgekeurd/afgewezen) en de bewuste grenzen ervan.
---
# Factuurstroom (FACTUUR_02)

- Eén ingang: facturen komen via de factuurmailbox (werk-inbox, `is_factuurmailbox`); pipeline draait na elke sync + 15-min-achtergrondlus. AI-extractie zit bewust in `documentIntelligence.ts` (nooit een tweede herkenner).
- Statusmachine additief op de bestaande text-kolom: `wacht_op_inkoper` → `wacht_op_goedkeuring` → `klaar_voor_betaling`. Goedkeuren-stroom mag UITSLUITEND vanuit `wacht_op_goedkeuring` — de inkoperstap is nooit te omzeilen.
- **Why:** systeem bereidt voor maar keurt nooit goed; rolscheiding (inkoper bevestigt, directie keurt) is een harde eis uit het opdrachtdoc.
- Afwijzen = gesloten redencodelijst (`FACTUUR_AFWIJSREDENEN`, 7 codes), nooit vrije tekst; systeem zet conceptmail klaar, mens verstuurt. `status_voor_afwijzing` maakt hervatten na leveranciersreactie (Graph `conversationId`) mogelijk.
- Signalen (`factuur_signalen`, 9 types): `rekeningnummer_gewijzigd` mag nooit stil afgehandeld worden — afhandelen zonder toelichting geeft 422. `maakSignaal` dedupt op open signalen.
- Mail-claim (`factuur_verwerkt_op`) wordt bij een verwerkingsfout TERUGGEGEVEN zodat de volgende run opnieuw probeert; anders laat een tijdelijke Graph/AI-fout de mail permanent liggen.
- Leverancier alleen koppelen bij exact één match — nooit gokken; anders signaal `onbekende_leverancier`.
- Bekende restpunten (review): legacy-intakes (handmatige upload, oude mailbox-sync, legacy accorderen) bestaan nog naast de stroom; geen DB-idempotentie op mail+bijlage-identiteit; niet-transactionele verwerking. Betalen/SEPA = FACTUUR_03.
- Verificatie: endpoints via `scripts/src/verificatie-factuurstroom.ts`; volledige mail-naar-factuur-pijplijn via `artifacts/api-server/src/verificatie-mail-naar-factuur.ts` (beide ruimen zelf op).
