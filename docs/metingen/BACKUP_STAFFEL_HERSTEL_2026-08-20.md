# Incident- en herstelbewijs externe back-upstaffel

Datum onderzoek en reparatie: 20 augustus 2026.

## Incident

**Aangeleverd productiefeit:** de externe dagelijkse staffel stopte sinds
8 augustus 2026 vroeg met exitcode `141`. Daardoor was er geen actueel bewezen
volledige set.

**In de bron gemeten oorzaak:** `backup-staffel.sh` draaide met
`set -euo pipefail` en selecteerde de nieuwste dump met `ls -t ... | head -1`.
Bij meerdere dumps kan `head` de leeszijde sluiten zodra één regel is ontvangen.
De producer krijgt dan `SIGPIPE` (`128 + 13 = 141`), waarna `pipefail` de hele
back-uprun laat mislukken. Dezelfde klasse kwam ook voor bij selectie van
setmappen en MinIO-mtimes.

De oude foutafhandeling dekte alleen expliciete `fout()`-aanroepen. Een vroege
`set -e`-uitgang of signaal hoefde daardoor geen nieuwe `status.json` te geven.

## Herstel

- Bronselectie loopt via shell-arrays en volledige lussen; geen
  `ls/find/sort | head` of `tail | head`.
- Iedere run bouwt in een unieke verborgen staging-map.
- DB, objectopslag, configuratie, manifest en checksums worden volledig gebouwd
  en met `sha256sum -c` geverifieerd vóór publicatie.
- Een fout of `HUP`/`INT`/`TERM` verwijdert alleen staging. De vorige volledige
  set blijft byte-identiek staan.
- `status.json` wordt altijd best-effort atomair geschreven en bevat de
  originele exitcode, het signaal, de fase en de laatste geslaagde set/run.
- Een staffelfout veroorzaakt direct een Graph-mail vanuit de bestaande
  API-container. De bewaker verstuurt daarna hoogstens één herinnering per
  kalenderdag zolang geen geslaagde set jonger dan 24 uur bestaat. Iedere
  mislukte herinneringspoging blijft atomair per dag geregistreerd; alleen een
  werkelijk geslaagde verzending zet de succesmarker en sluit verdere
  verzendingen die dag uit. Een crash na Graph-succes blijft `onzeker`, zonder
  tweede verzending en zonder valse successtatus. Ook timeout/transportverlies
  na mogelijke Graph-acceptatie blijft `onzeker` en blokkeert een blinde retry.
- De herstelproef accepteert alleen een checksum-geldige immutable dagset en
  gebruikt unieke tijdelijke containers en een eigen netwerk.

## Geïsoleerd regressiebewijs

Commando:

```text
pnpm --filter @workspace/scripts run verificatie-backup-staffel
```

Gemeten uitvoer:

```text
ok 1 - bronselectie gebruikt geen vroeg afgeknotte pipe en volledige set is controleerbaar
ok 2 - foutstatus is atomair, exitcode blijft 23 en vorige set blijft intact
ok 3 - SIGTERM schrijft geldige status en ruimt de onvolledige set op
ok 4 - oude successet geeft hoogstens één Graph-herinnering per kalenderdag
ok 5 - verse successet onderdrukt de dagelijkse Graph-herinnering
ok 6 - mislukte Graph-dag blijft zichtbaar en pas één echte verzending sluit de dag succesvol af
ok 7 - crash na Graph-succes blijft onzeker en veroorzaakt geen tweede verzending
ok 8 - onzekere Graph-transportuitkomst veroorzaakt geen retry of valse successtatus
ok 9 - checksumfout blokkeert de herstelproef vóór Docker
ok 10 - productiebewijs weigert een symlink als dagelijkse set
ok 11 - productiebewijs weigert status van vóór de huidige run
ok 12 - staffel publiceert geen set met een symlink in de inhoud
ok 13 - herstelproef weigert symlinks in de set vóór Docker
ok 14 - productiebewijs weigert zelfstandig symlinkinhoud
ok 15 - staffel hergebruikt geen bestaande symlink als dagset
ok 16 - productiedeploy beheert de volledige 03:00-08:00 back-upplanning
ok 17 - Actions accepteert uitsluitend de vooraf gepinde VPS-hostkey
ok 18 - Actions weigert gepinde RSA- en ECDSA-hostkeys
Alle 18 back-upstaffelproeven zijn geslaagd.
```

De proef gebruikt uitsluitend tijdelijke mappen, fake rsync en een fake
mailprogramma. Hij benadert geen Docker, Azure, `/srv/fps-backup` of productie.
Een fake `head` eindigt bewust altijd met `141`; de succesproef blijft groen
omdat het productiescript `head` niet meer voor selectie gebruikt. De
herstelpreflight gebruikt een fake `docker` en bewijst dat die bij een
checksumfout niet wordt aangeroepen.

## Productie- en herstelproef

Broncode en lokale tests zijn geen productieclaim. Het vereiste bewijs wordt
verzameld met de handmatige GitHub Actions-workflow
**Externe back-upstaffel en herstelproef**. Die gebruikt het bestaande
GitHub→VPS-kanaal en nooit rechtstreekse agent-SSH.

| Bewijs | Stand |
|---|---|
| Actions-run | **GEMETEN GROEN** — [32389750819](https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32389750819), actie `staffel_en_herstelproef` |
| Commit | **GEMETEN** — `6c680abcdb8f1d83a399adc4ece757a0a9d34bc1`; [CI 32388569450](https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32388569450) en [productie-deploy 32388569946](https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32388569946) waren groen. De deploy passeerde vóór SSH uitsluitend de beheerdergeverifieerde, gepinde `ssh-ed25519`-hostfingerprint. |
| Volledige dagset | **GEMETEN** — bestaande immutable set `dagelijks/2026-08-20` bleef ongewijzigd; totale omvang `293.379.490` bytes; 2 dagelijkse sets aanwezig |
| DB-bestand + manifest + checksums | **GEMETEN GROEN** — `db.sql.gz`, manifest en alle checksums geldig; `geheimen_opgenomen=false` |
| Objectaantal en bytes | **GEMETEN** — 251 bestanden, samen `292.915.391` bytes |
| Herstel naar lege PostgreSQL + MinIO | **GEMETEN GROEN** — 13 gebruikers teruggezet; tijdelijke database van 109 geregistreerde migraties met 17 actuele migraties tot 126 bijgewerkt; 251 objecten naar verse tijdelijke MinIO hersteld |
| API-health | **GEMETEN GROEN** — `{"status":"ok"}` tegen de tijdelijke herstelomgeving |
| Login + 2FA | **GEMETEN GROEN** — normale login vroeg `verify_2fa`; bestaande TOTP-verificatie gaf HTTP 200 |
| Document uit herstelde opslag + identieke checksum | **GEMETEN GROEN** — herstelde PDF via de normale document-, gebouw- en bevoegdhedenpoorten gaf HTTP 200, `1.537.761` bytes, `%PDF-`; SHA-256 was **IDENTIEK** aan het bestand in de immutable set |

De herstelproef was in 33 seconden gereed. Alle mutaties — actuele migraties,
het tijdelijke proefaccount en de tijdelijke documentcontext — vonden alleen in
de geïsoleerde hersteldatabase plaats. De back-upset en productie zijn niet
gewijzigd.