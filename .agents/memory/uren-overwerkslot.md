---
name: UREN_01 ADV/overwerkslot/weekcontrole
description: CAO-instellingen centraal, overwerkslot-toets in uren-routes, weekcontrole-voeder — valkuilen en ontwerpkeuzes.
---

# UREN_01-patronen

- **CAO-instellingen**: `lib/caoInstellingen.ts` is de enige bron (namen exact: "Metaal & Techniek", "Bouw & Infra", "Geen CAO / individueel" — frontend matcht op naam). ADV = `min(max, max(0, gewerkt − drempel))`; dienstverband "vast" vereist. Overwerkgrens = drempel + max (meestal 40).
- **Overwerkslot**: `overwerk_sloten` (migratie 0029). Toets in POST/PATCH /uren: deel van de regel boven de weekgrens moet gedekt zijn door een slot dat op de **regel-datum** open staat voor **dat** project; anders 422 `OVERWERK_SLOT_DICHT` (hele regel weigeren, nooit afkappen/stil).
  **Why:** plafond-races: verbruik boeken vóór de insert via één conditionele UPDATE (`WHERE verbruik+delta<=plafond`, sluit zichzelf bij vol). PATCH boekt bewust alleen bij (nooit terug) — plafond kan hooguit strenger uitvallen.
- **Weekcontrole** (`lib/weekControle.ts`, voeder in bewakingsloop): draait alleen maandag (`UREN01_WEEKCONTROLE_FORCE=1` voor bewijs), via `syncBron` zodat opgeloste weken zelf sluiten. Norm = contracturen hoofdaanstelling; verlof/feestdagen/ziekte tellen mee (nooit alleen netto_uren). Overtreding = per-regel attributie op datumvolgorde boven norm+2, zelfde semantiek als de invoertoets; inmiddels gesloten sloten tellen mee als ze op de regel-datum geldig waren.
- **ISO-jaar**: rond nieuwjaar altijd `isoJaarWeek()` (ISO-jaar ≠ kalenderjaar); dit beet eerder in isWeekVergrendeld en mijn-week-default.
- **TvT**: geaccepteerd overwerk geeft alleen een `overwerk.tvt_voorstel` in de POST /uren-respons; vastleggen doet de medewerker zelf via de bestaande TvT-route. Herinnering na 31 dagen via voeder, geen verval.
- Slot openen/sluiten: alleen hoofdbeheerder of functietitel "Projectleider" (via `vindGebruikersMetFunctietitel`), altijd met einddatum + reden.
- Bewijs: `scripts/src/bewijs-uren01.ts` (mobile-login-patroon + eigen testdata + opruimen).
