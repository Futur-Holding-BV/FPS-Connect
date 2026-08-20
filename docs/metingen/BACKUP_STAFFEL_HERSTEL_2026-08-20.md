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
  kalenderdag zolang geen geslaagde set jonger dan 24 uur bestaat.
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
ok 6 - mislukte Graph-poging wordt later opnieuw geprobeerd en pas na succes gemarkeerd
ok 7 - checksumfout blokkeert de herstelproef vóór Docker
ok 8 - productiebewijs weigert een symlink als dagelijkse set
ok 9 - productiebewijs weigert status van vóór de huidige run
ok 10 - staffel publiceert geen set met een symlink in de inhoud
ok 11 - herstelproef weigert symlinks in de set vóór Docker
ok 12 - productiebewijs weigert zelfstandig symlinks in de setinhoud
ok 13 - staffel hergebruikt geen bestaande symlink als dagset
Alle 13 back-upstaffelproeven zijn geslaagd.
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
| Actions-run | nog uit te voeren na beschikbaarheid van deze workflow op `main` |
| Commit | nog vast te leggen uit de run |
| Nieuwe volledige dagset | nog te meten |
| DB-bestand + manifest + checksums | nog te meten |
| Objectaantal en bytes | nog te meten |
| Herstel naar lege PostgreSQL + MinIO | nog te meten |
| API-health | nog te meten |
| Login + 2FA | nog te meten |
| Document uit herstelde opslag + identieke checksum | nog te meten |

Pas na een groene Actions-run worden bovenstaande velden als **GEMETEN** ingevuld.