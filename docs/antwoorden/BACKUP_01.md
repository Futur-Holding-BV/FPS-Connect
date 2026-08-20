# BACKUP_01 — Externe back-up buiten de VPS (halen, niet brengen)

Datum: 8 augustus 2026 · Status: VPS-kant gebouwd en bewezen; wacht op NAS-aansluiting door René.

## Wat er is gebouwd

**Model: de NAS haalt op, de VPS kan niets naar de NAS sturen.** De VPS heeft
geen enkel toegangsgegeven voor de NAS. Het ophaal-account (`fps-nas`) kan
uitsluitend lezen, uitsluitend onder `/srv/fps-backup` (rrsync -ro + `restrict`),
en elke ophaling wordt onwisbaar gelogd (syslog + marker).

1. **Staffelbouw** (`backup-staffel.sh`, dagelijks 04:00, na de bestaande
   dump- en mirror-crons van 03:00/03:30): complete zelfstandige set onder
   `/srv/fps-backup/dagelijks/<datum>/` met
   - `db.sql.gz` — verse pg_dump (geweigerd als >24u oud of corrupt);
   - `bestanden/` — volledige MinIO-bucket (hardlinks, geen dubbele opslag);
   - `config/` — compose-bestand, **alleen de sleutelnamen** van
     `.env.production` (nooit waarden), migratiestand;
   - `manifest.json` + `sha256sums.txt` (controleerbare inhoudsopgave).
   Staffel: **14 dagen dagelijks, 13 weken wekelijks (zo), 12 maanden
   maandelijks (1e)** — promotie via hardlinks, automatische retentie.
2. **Leesaccount `fps-nas`** met ForceCommand-wrapper
   (`fps-nas-pull.sh`): logt elke verbinding, dwingt read-only rsync af.
   Wachtwoord-login geblokkeerd; wacht alleen nog op René's publieke sleutel.
3. **Bewaking** (uitbreiding SCHULD_01 punt 83):
   - een staffelfout schrijft atomair status en mailt direct via Graph;
     `check-offsite-backup.sh` (dagelijks 08:00) maakt daarnaast een
     blokkerende in-app melding bij >36u geen set, checksumfout, verdacht
     kleine set (<50% van gisteren), of — zodra de NAS-sleutel actief is —
     >36u geen ophaling. Zonder verse (<24u) successet volgt hoogstens één
      geslaagde Graph-herinnering per kalenderdag. Mislukte pogingen blijven in
      `.alarmstatus` atomair als mislukt zichtbaar en mogen opnieuw proberen;
      alleen een werkelijk geslaagde verzending zet de dagmarker. Een
      onafgeronde poging wordt `onzeker` en wordt niet herhaald, zodat een crash
      na Graph-acceptatie geen dubbel bericht en ook geen valse succesdag geeft.
      Ook sendMail-timeouts en transportverlies zijn `onzeker`; alleen bewezen
      pre-dispatchfouten en expliciete Graph-afwijzingen zijn retrybaar.
   - **Eén plek zichtbaar**: Beheer → Back-ups toont nu twee kaarten
     ("klaargezette back-upset" en "laatste NAS-ophaling") via
     `GET /api/backups/offsite/status` (statusbestanden read-only gemount in
     de api-container).
4. **Herstelproef** (`herstelproef.sh`, herhaalbaar op de VPS): zet de set
   terug in een volledig lege omgeving en bewijst de vier acceptatie-eisen.
   De actuele handmatige Actions-route staat in
   `deploy/BACKUP_RESTORE_PRODUCTION.md`; meetbewijs staat in
   `docs/metingen/BACKUP_STAFFEL_HERSTEL_2026-08-20.md`.

## Gemeten (niet aangenomen)

- Eerste volledige kopie: **110 MB** (164 objecten + 266 KB db-dump gz) —
  triviaal voor een thuisverbinding; dagelijkse verversing is grotendeels
  ongewijzigd (rsync haalt alleen verschillen op).
- Herstelproef in lege omgeving: **21–22 seconden** totaal, document uit de
  herstelde bucket **checksum-identiek**, UI-login (incl. 2FA) bewezen met
  screenshot.

## Versleuteling (§6)

- **In transit**: SSH (rsync over ssh) — staat.
- **Op de NAS**: versleutelde gedeelde map op de NAS, sleutel bij René buiten
  VPS én NAS — **in te stellen door René** (stap 4 in `deploy/NAS_KOPPELING.md`).
- **Extra slot (optioneel, aanbevolen)**: het staffelscript versleutelt
  `db.sql.gz` automatisch met een age-*publieke* sleutel zodra die in
  `/etc/fps-backup/age-recipient` staat; de privésleutel blijft bij René en
  komt nooit op de VPS.

## Besluiten / acties voor René (§9)

| # | Actie | Toelichting |
|---|---|---|
| 1 | NAS-sleutelpaar maken en publieke sleutel doorgeven | stap 1–2 in `deploy/NAS_KOPPELING.md` (± 5 min) |
| 2 | Geplande ophaaltaak op de NAS instellen (dagelijks ~05:00) | stap 3 (± 5 min) |
| 3 | Versleutelde doelmap op de NAS + sleutel extern bewaren | stap 4 — **verplicht**, personeels-/salarisdocumenten |
| 4 | Vraag aan VPS-provider: maakt die zelf snapshots van de server? | antwoord vastleggen; dit vervangt de NAS-kopie níét (zelfde leverancier/locatie) |
| 5 | Optioneel: age-sleutelpaar voor versleuteling op de VPS zelf | "Extra slot" hierboven |
| 6 | §10-voorstel: extra externe (cloud)bucket voor de maandelijkse kopie | alleen ter beoordeling; niet gebouwd. Voordeel: derde locatie, ook bij brand thuis. Nadeel: maandkosten + sleutelbeheer bij een derde partij |

Zolang actie 1–2 openstaan toont de app "Nog nooit opgehaald" en slaat de
bewaking de pull-controle over (met logvermelding), zodat er geen loos alarm
ontstaat.

## Wat bewust NIET is gedaan

- Geen geheimen in de back-up (alleen env-sleutelnamen; `.env.production`
  moet apart veilig bewaard blijven — staat al zo in het runbook).
- De NAS-kant is beschreven, niet gebouwd (geen toegang; bewust ontwerp).
- De bestaande in-app back-ups (03:00, object storage op dezelfde machine)
  blijven bestaan als eerste herstellijn; de NAS-kopie is de ramplijn.
