# BACKUP_01 — De NAS aansluiten op de externe back-up

Datum: 8 augustus 2026. Hoort bij `docs/antwoorden/BACKUP_01.md`.

## Het model: halen, niet brengen

De VPS bouwt elke nacht een complete back-upset klaar onder `/srv/fps-backup`
(database + alle bestanden + configuratie zonder geheimen, met staffel
dagelijks/wekelijks/maandelijks). **De NAS haalt die sets op; de VPS kan en
mag niets naar de NAS sturen.** De VPS heeft geen enkel toegangsgegeven voor
de NAS. Het account waarmee de NAS binnenkomt (`fps-nas`) kan uitsluitend
lezen, uitsluitend onder `/srv/fps-backup`, en niets anders (rrsync -ro +
`restrict` in authorized_keys). Wie de VPS overneemt kan de kopieën op de NAS
dus niet wissen.

## Wat op de VPS al klaarstaat

- gebruiker `fps-nas` (geen wachtwoord-login, geen shell behalve de wrapper);
- `/usr/local/bin/fps-nas-pull.sh` — logt elke ophaling en dwingt read-only af;
- `/srv/fps-backup/{dagelijks,wekelijks,maandelijks}/…` met per set een
  `manifest.json` en `sha256sums.txt`;
- bewaking (`check-offsite-backup.sh`, dagelijks 08:00): alarm in de app bij
  een uitblijvende, checksum-ongeldige of verdacht kleine set, en — zodra de
  NAS-sleutel actief is — bij een uitblijvende ophaling (> 36 uur). Een
  staffelfout mailt direct via Microsoft Graph; daarna volgt hoogstens één
  herinnering per kalenderdag zolang geen geslaagde set jonger dan 24 uur
  bestaat.

## Wat René op de NAS instelt (eenmalig, ± 15 minuten)

1. **Sleutelpaar maken op de NAS** (of in DSM's taakplanner-gebruiker):
   `ssh-keygen -t ed25519 -f ~/.ssh/fps-backup -N ""`
2. **Publieke sleutel doorgeven** (inhoud van `fps-backup.pub`). Die wordt op
   de VPS in `/home/fps-nas/.ssh/authorized_keys` gezet als:
   `command="/usr/local/bin/fps-nas-pull.sh",restrict ssh-ed25519 AAAA… nas`
   (Geef de sleutel aan de agent of zet hem zelf op de VPS; de regel hierboven
   is verplicht — een kale sleutelregel geeft méér toegang dan de bedoeling.)
3. **Geplande taak op de NAS** (dagelijks, bv. 05:00 — ná de staffelbouw van
   04:00 op de VPS):
   ```bash
   rsync -a --delete -e "ssh -i ~/.ssh/fps-backup -p 22" \
     fps-nas@149.210.181.47:/ /volume1/fps-backup/
   ```
   (Bij rrsync is de bronmap al vastgepind; `:/` betekent `/srv/fps-backup`.)
4. **Versleuteling op de NAS — verplicht.** De kopie bevat personeelsgegevens,
   salarisdocumenten en cv's. Zet de doelmap op een **versleutelde gedeelde
   map** (DSM: gedeelde map aanmaken → versleuteling aanvinken) en bewaar de
   versleutelingssleutel **buiten de VPS én buiten de NAS zelf** (bv. in de
   wachtwoordmanager). Koppel de map niet automatisch bij het opstarten als
   het risico op fysieke diefstal zwaarder weegt dan het gemak.
5. **NAS niet vanaf internet bereikbaar** maken (geen poorten forwarden;
   QuickConnect uit of alleen met 2FA).

## Extra slot: de dump zelf versleutelen (optioneel, aanbevolen)

Wil René dat ook de databasedump op de VPS-schijf al versleuteld is, dan:
`age-keygen -o fps-backup-sleutel.txt` (op een eigen machine, NIET de VPS),
de regel `# public key: age1…` als enige inhoud in `/etc/fps-backup/age-recipient`
op de VPS zetten. Vanaf de volgende nacht is `db.sql.gz.age` alleen nog te
openen met de privésleutel die René zelf bewaart. Zonder deze stap blijft de
dump op de VPS onversleuteld (zoals nu ook al het geval is in
`deploy/db-backups/`) en is de versleuteling op de NAS (stap 4) de grens.

## Controleren dat het loopt

- Op de VPS: `sudo journalctl -t fps-nas-pull --since yesterday` toont elke
  ophaling; `/srv/fps-backup/status.json` toont de laatste staffelbouw.
- In de app: Beheer → Back-ups toont de status van de externe kopie; bij een
  uitblijvende ophaling of set verschijnt een blokkerende melding.
- Op de NAS: vergelijk `sha256sums.txt` in een opgehaalde set:
  `cd /volume1/fps-backup/dagelijks/<datum> && sha256sum -c sha256sums.txt`.
- Een volledige productie- en herstelproef loopt via GitHub Actions
  **Externe back-upstaffel en herstelproef**; zie
  `deploy/BACKUP_RESTORE_PRODUCTION.md`.
