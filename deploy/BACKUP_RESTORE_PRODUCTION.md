# FPS Connect — externe back-upstaffel en herstelproef

Dit runbook beschrijft de rampherstellijn buiten de productiecontainers. De
interne app-back-ups blijven bestaan, maar gelden niet als vervanging voor deze
externe staffel.

## Grenzen die niet mogen wijzigen

- Productie staat in `/opt/fps-one`; de externe staffel staat in
  `/srv/fps-backup`.
- De NAS **haalt** via het beperkte account `fps-nas`. De VPS krijgt nooit
  schrijf- of inloggegevens van de NAS.
- `fps-nas` blijft read-only en beperkt tot `/srv/fps-backup` (`rrsync -ro` +
  `restrict`). Zie `deploy/NAS_KOPPELING.md`.
- Een herstelproef gebruikt alleen tijdelijke containers, een eigen
  `fps-herstelproef-*`-netwerk en poorten op `127.0.0.1`. De productiecontainers,
  -database en -objectopslag worden nooit leeggemaakt of beschreven.
- Productiehandelingen lopen uitsluitend via GitHub Actions. De agent gebruikt
  geen rechtstreekse SSH-toegang.

## Dagelijkse keten

| Tijd | Stap | Script / bron |
|---|---|---|
| 03:00 | PostgreSQL-dump maken | bestaande dumpcron, `deploy/db-backups` |
| 03:30 | MinIO-mirror verversen | bestaande mirrorcron, `deploy/minio-backups` |
| 04:00 | Zelfstandige staffelset bouwen | `deploy/backup-staffel.sh` |
| circa 05:00 | NAS haalt read-only op | NAS-taak, zie `NAS_KOPPELING.md` |
| 08:00 | Staffel en NAS-ophaling bewaken | `deploy/check-offsite-backup.sh` |

De staffel bewaart:

- 14 dagelijkse sets;
- 13 wekelijkse sets (zondag);
- 12 maandelijkse sets (eerste dag van de maand).

Elke dagelijkse set bevat:

- `db.sql.gz` of, met een geldige age-recipient, `db.sql.gz.age`;
- `bestanden/` met de volledige MinIO-mirror;
- `config/docker-compose.production.yml`;
- `config/env-sleutels.txt` met uitsluitend namen, nooit waarden;
- `config/migratiestand.txt`;
- `manifest.json`;
- `sha256sums.txt`, inclusief checksum van het manifest.

## Wat bij een fout gebeurt

`backup-staffel.sh` draait met `set -Eeuo pipefail`, maar gebruikt voor
bronselectie geen `ls | head`, `sort | head` of andere vroeg afgeknotte
pijplijnen.

1. De nieuwe set wordt in een unieke verborgen staging-map gebouwd.
2. Pas na manifestgeneratie en een geslaagde `sha256sum -c` wordt die map met
   één rename als dagelijkse set gepubliceerd.
3. Bij iedere opvangbare commandofout, `HUP`, `INT` of `TERM` wordt staging
   verwijderd. Een eerder gepubliceerde volledige set wordt niet verwijderd of
   vervangen.
4. `status.json` wordt via een uniek tijdelijk bestand en rename atomair
   bijgewerkt. De status bewaart fase, originele exitcode, signaal,
   `laatste_geslaagde_run` en `laatste_geslaagde_set`.
5. De API-container verzendt direct een Microsoft Graph-faalmail met zijn eigen
   bestaande Azure-omgeving. Secrets worden niet naar de hostshell, logs of
   status gekopieerd.
6. De 08:00-bewaker blijft een blokkerende in-app melding maken. Zolang geen
   geslaagde set jonger dan 24 uur bestaat, claimt hij hoogstens één
   Graph-herinnering per lokale kalenderdag onder
   `/srv/fps-backup/.alarmstatus/`.

Een herinneringspoging wordt vóór de externe Graph-aanroep atomair als `bezig`
vastgelegd in `staffel-herinnering-status-YYYY-MM-DD.json`. Een aantoonbaar
mislukte aanroep wordt `mislukt`, inclusief pogingsteller, laatste-pogingtijd
en exitcode, en mag later opnieuw proberen. Alleen na een werkelijk geslaagde
Graph-aanroep wordt de status `geslaagd` en daarna de compatibele dagmarker
geschreven. Eindigt het proces tussen de Graph-aanroep en die successtatus, dan
wordt `bezig` bij de volgende controle `onzeker`: de dag heet niet geslaagd,
maar er wordt fail-closed ook niet opnieuw verzonden omdat Graph de eerste mail
al geaccepteerd kan hebben. Hetzelfde geldt voor een sendMail-timeout of
Docker-transportverlies. Alleen bewezen fouten vóór sendMail en expliciete
Graph-non-2xx-antwoorden worden `mislukt` en retrybaar. Zo blijft een volledig
mislukte dag zichtbaar en kan een onzekere uitkomst geen dubbel bericht
veroorzaken.

## Status beoordelen

```bash
sudo python3 - <<'PY'
import json
from pathlib import Path

status = json.loads(Path("/srv/fps-backup/status.json").read_text())
print(json.dumps(status, indent=2, ensure_ascii=False))
PY
```

Gezond betekent minimaal:

- `uitkomst` is `geslaagd`;
- `laatste_geslaagde_run` is minder dan 24 uur oud;
- `laatste_geslaagde_set` bestaat;
- die set bevat DB, bestanden, manifest en checksumlijst;
- onderstaande controle eindigt zonder uitvoer en met exitcode 0:

```bash
SET=/srv/fps-backup/dagelijks/JJJJ-MM-DD
sudo bash -c 'cd "$1" && sha256sum -c --quiet sha256sums.txt' _ "$SET"
```

Beheer → Back-ups leest hetzelfde `status.json` via de read-only mount van de
API-container. Een groene broncode of deploy is op zichzelf geen bewijs dat de
staffel op de VPS weer loopt.

## Veilige productieproef via GitHub Actions

Gebruik workflow **Externe back-upstaffel en herstelproef**:

1. Open GitHub → Actions → **Externe back-upstaffel en herstelproef**.
2. Kies `staffel_en_herstelproef`.
3. Vul exact `HERSTELPROEF` in.
4. Start uitsluitend vanaf `main`.

De workflow:

- gebruikt de reeds beheerde `PROD_SSH_*`-secrets;
- kopieert exact de scripts van de gekozen commit naar een tijdelijke VPS-map;
- bouwt een nieuwe set of valideert de reeds die dag gebouwde volledige set;
- controleert DB-bestand, manifest, objectaantal en alle checksums;
- start daarna `herstelproef.sh` met het expliciete immutable setpad;
- migreert uitsluitend de tijdelijke hersteldatabase naar het actuele schema
  voordat de actuele API-image start; de set en productie blijven ongewijzigd;
- verwijdert de tijdelijke scripts na afloop;
- toont geen envwaarden, tokens, documentinhoud of individuele objectnamen.

Een geslaagde workflowrun is het vereiste productie- en herstelbewijs. Leg
run-id, commit, set, omvang, objectaantal, health, login/2FA,
document-HTTP-status en checksumuitkomst vast in
`docs/metingen/BACKUP_STAFFEL_HERSTEL_2026-08-20.md`.

## Herstelproef handmatig door een beheerder

Alleen wanneer GitHub Actions niet beschikbaar is:

```bash
cd /opt/fps-one
sudo BACKUP_DOEL=/srv/fps-backup bash deploy/herstelproef.sh
```

Een specifieke set:

```bash
cd /opt/fps-one
sudo BACKUP_DOEL=/srv/fps-backup \
  HERSTEL_SET=/srv/fps-backup/dagelijks/JJJJ-MM-DD \
  bash deploy/herstelproef.sh
```

De proef weigert:

- een set buiten `/srv/fps-backup/dagelijks/JJJJ-MM-DD`;
- een ontbrekend manifest of checksumlijst;
- een set waarvan één checksum afwijkt;
- een tweede gelijktijdige herstelproef.

Voor een age-versleutelde DB is aanvullend nodig:

```bash
sudo AGE_KEY_FILE=/veilig/pad/naar/privesleutel \
  BACKUP_DOEL=/srv/fps-backup \
  bash deploy/herstelproef.sh
```

De privésleutel blijft buiten repository, logs, VPS-config en back-upset.

## Lokale regressieproef

```bash
pnpm --filter @workspace/scripts run verificatie-backup-staffel
```

Deze proef gebruikt uitsluitend `/tmp`, fake rsync en een fake mailprogramma.
Hij bewijst:

1. meerdere dumps zonder `head`/SIGPIPE-141;
2. een fout met originele exitcode 23 en geldige atomaire foutstatus;
3. behoud van de vorige volledige set;
4. `SIGTERM` als exitcode 143 + signaal `TERM`;
5. maximaal één Graph-herinnering per kalenderdag;
6. geen herinnering zolang de laatste geslaagde set jonger dan 24 uur is;
7. Graph-fouten blijven per dag atomair als mislukt zichtbaar, mogen opnieuw
   proberen en leveren na de eerste echte verzending geen tweede succesmail;
8. een crash direct na Graph-succes blijft `onzeker` en veroorzaakt geen tweede
   verzending of valse successtatus;
9. timeout/transportverlies na mogelijke Graph-acceptatie blijft `onzeker`
   zonder automatische retry;
10. een checksumfout blokkeert herstel vóór Docker;
11. het Actions-bewijs weigert een symlinkset en status van vóór de huidige run;
12. staffel, herstelproef én Actions-bewijs weigeren symlinks/speciale entries
    binnen de set, inclusief een reeds bestaande symlink-dagset.

## Noodherstel van productie

Een echte productie-restore is destructief en valt **niet** onder de
herstelproef. Stop, informeer de beheerder en maak vóór iedere wijziging een
extra noodkopie. Gebruik pas daarna een afzonderlijk, expliciet goedgekeurd
incidentplan. `herstelproef.sh` mag nooit worden aangepast om rechtstreeks naar
de productiecontainers `db`, `minio` of `api` te schrijven.