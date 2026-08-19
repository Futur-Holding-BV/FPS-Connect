---
name: UREN_01 ADV/overwerkslot/weekcontrole
description: CAO-instellingen centraal, overwerkslot-toets in uren-routes, weekcontrole-voeder — valkuilen en ontwerpkeuzes.
---

# UREN_01-patronen

- **CAO-instellingen**: `lib/caoInstellingen.ts` is de enige bron (namen exact: "Metaal & Techniek", "Bouw & Infra", "Geen CAO / individueel" — frontend matcht op naam). ADV = `min(max, max(0, gewerkt − drempel))`; dienstverband "vast" vereist. Overwerkgrens = drempel + max (meestal 40).
- **Overwerkslot**: `overwerk_sloten` (migratie 0029). Toets in POST/PATCH /uren: deel van de regel boven de weekgrens moet gedekt zijn door een slot dat op de **regel-datum** open staat voor **dat** project; anders 422 `OVERWERK_SLOT_DICHT` (hele regel weigeren, nooit afkappen/stil).
  **Why:** plafond-races: verbruik boeken vóór de insert via één conditionele UPDATE (`WHERE verbruik+delta<=plafond`, sluit zichzelf bij vol). PATCH boekt bewust alleen bij (nooit terug) — plafond kan hooguit strenger uitvallen.
- **Weekcontrole** (`lib/weekControle.ts`, voeder in bewakingsloop): draait alleen maandag (`UREN01_WEEKCONTROLE_FORCE=1` voor bewijs), via `syncBron` zodat opgeloste weken zelf sluiten. Norm = contracturen hoofdaanstelling; verlof/feestdagen/ziekte tellen mee (nooit alleen netto_uren). Overtreding = per-regel attributie op datumvolgorde boven norm+2, zelfde semantiek als de invoertoets; inmiddels gesloten sloten tellen mee als ze op de regel-datum geldig waren.
- **Scope volledige-weekbewaking:** uitsluitend medewerkers van wie de gekoppelde functie expliciet `uitvoerend=true` is; kantoor, ontbrekende functie en onbekende classificatie vallen fail-closed buiten de controle.
  **Why:** urenverantwoording op volledige contractweken geldt alleen voor buitendienstmedewerkers; kantoorpersoneel mag hiervoor geen werkbaksignalen krijgen.
  **How to apply:** selecteer op de functiehuisclassificatie vóór weekberekening en signaalbouw, zodat een volgende `syncBron`-draai ook oude kantoormeldingen automatisch sluit.
- **ISO-jaar**: rond nieuwjaar altijd `isoJaarWeek()` (ISO-jaar ≠ kalenderjaar); dit beet eerder in isWeekVergrendeld en mijn-week-default.
- **TvT**: geaccepteerd overwerk geeft alleen een `overwerk.tvt_voorstel` in de POST /uren-respons; vastleggen doet de medewerker zelf via de bestaande TvT-route. Herinnering na 31 dagen via voeder, geen verval.
- Slot openen/sluiten: alleen hoofdbeheerder of functietitel "Projectleider" (via `vindGebruikersMetFunctietitel`), altijd met einddatum + reden.
- Bewijs: `scripts/src/bewijs-uren01.ts` (mobile-login-patroon + eigen testdata + opruimen).

## §6b — uurcodes (2026-08-09)
- Uren op een opdracht vereisen precies één keuze: normtijd uit de werkbegroting | indirecte werkzaamheid (actief) | niet_in_begroting+omschrijving → anders 400 UURCODE_VEREIST. Kantoor/magazijn-uren blijven vrij.
- "Niet in begroting" is nooit een blokkade; het plaatst een werkbak-signaal (bron `uren_niet_in_begroting`) bij WVB+cc PL. Nieuwe werkbak-bron = eerst whitelisten in werkbakService (gesloten lijst gooit anders 500).
- PATCH van uren boekt alleen de TOENAME van het boven-grensdeel op het slot; afname wordt bewust niet teruggegeven (teruggave gebeurt bij DELETE).


## Transactioneel (2026-08-09) — beleid
- Uren-mutaties serialiseren per medewerker+ISO-week via een transactie-gebonden advisory lock; toets, slotboeking en schrijfactie zijn ondeelbaar (mislukte schrijfactie rolt slotverbruik mee terug).
- Slotverbruik wordt per regel geadministreerd; PATCH-delta's en DELETE-teruggave lezen die administratie. Legacy-rijen (van vóór de per-regel-administratie) worden binnen dezelfde transactie herleid (slotkeuze: slot dat het verbruik nog draagt, voorkeur open) — geen backfill nodig.
- Alle effectieve PATCH-inputs (project/tijden/uurcode) worden pas ná de weeklock uit de VERSE rij afgeleid; toetsen op een stale kopie boekt/retourneert op het verkeerde slot.
- Locks nooit ná de verse lezing bijnemen (breekt de vaste volgorde → deadlockrisico): ligt de rij inmiddels in een niet-vergrendelde week, rol terug en herprobeer met uitgebreide lockset (retry-protocol).
- Teruggave-beleid: DELETE geeft verbruik terug; PATCH naar een ÁNDER slot boekt eerst nieuw en geeft oud in dezelfde tx terug (nooit verweesd verbruik); afname op HETZELFDE slot wordt bewust niet teruggegeven. Alleen een automatisch (plafond-)gesloten slot gaat bij teruggave weer open; handmatig gesloten blijft dicht.
- Bewijs: `scripts/src/bewijs-uren01c-concurrency.ts` (parallelle races + slotwissel) + herdraai bewijs-uren01.ts.
- GET /opdrachten/:id/uurcodes en /uren-per-uurcode vereisen projecten:1 (uren, geen bedragen).
**Waarom:** review-ronde vond dubbeltelling bij ongewijzigd PATCH-opslaan en open object-access op de uurcodelijst.
## §6c — mandagstaat (2026-08-09)
- BSN mag UITSLUITEND op de mandagstaat-pdf: één centrale policy `magMandagstaatGenereren` (vereist-vlag aan + personeel≥2 + magBijGebouw + nooit klant) afgedwongen op ÉLKE genereerweg — GET-route én factuurweg. Review vond dat de factuurweg eerst alleen financieel-recht checkte: elke nieuwe uitvoerweg voor gevoelige pdf's moet door dezelfde policy.
- Alleen goedgekeurde/vergrendelde weekstaten leveren regels; weekselectie voor de factuur met hetzelfde filter (anders claimt de helper weken met alleen concepturen).
- Bijlage hoort bij /definitief van de verkoopfactuur (object storage `facturen/{id}/mandagstaten/`, paden in respons), NIET bij de leveranciers-afkeurmail; ontbreken = waarschuwing, nooit blokkade.
- Weekstaat-detail lekte medewerker_bsn/geboortedatum (ongebruikt) — verwijderd; HRM-profiel toont geboortedatum als bestaand HRM-gedrag (gemeld, niet gewijzigd).
- Inkomende mandagstaten van eigen onderaannemers = bewust eigen opdracht (niet gebouwd).
