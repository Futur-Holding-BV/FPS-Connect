PRODUCTIE-MIGRATIEPAKKET – AANVULLENDE HARDENING EN INFRASTRUCTUURVERIFICATIE

Doel
Breid het bestaande productie-migratiepakket uit zodat het niet alleen de applicatie migreert, maar ook de volledige productie-infrastructuur reproduceerbaar, veilig en beheerbaar maakt.

Er mag GEEN nieuwe functionaliteit aan FPS Connect worden toegevoegd. Alleen documentatie, configuratie en verificatie van de productieomgeving.

────────────────────────────────────────
1. SERVER_HARDENING.md (NIEUW)
────────────────────────────────────────

Maak een volledig document "SERVER_HARDENING.md".

Beschrijf stap voor stap:

A. Basisconfiguratie
- Ubuntu 24.04 LTS
- hostname instellen
- timezone
- locale
- NTP tijdsynchronisatie
- automatische security-updates
- systeemupdates

B. Gebruikers
- geen dagelijks gebruik van root
- beheergebruiker met sudo
- SSH-login uitsluitend via SSH-key
- root-login uitschakelen
- password authentication uitschakelen
- PermitRootLogin configuratie
- PubkeyAuthentication controleren

C. Firewall
- UFW configuratie
- alleen poorten:
  - 22
  - 80
  - 443
- overige poorten blokkeren
- logging inschakelen

D. SSH-hardening
- aanbevolen sshd_config
- MaxAuthTries
- LoginGraceTime
- ClientAliveInterval
- ClientAliveCountMax
- Protocol 2
- X11Forwarding uit
- AllowTcpForwarding indien nodig
- Banner uit

E. Docker security
- Docker als systemd service
- restart policies
- geen containers privileged
- minimale rechten
- alleen noodzakelijke volumes
- image updates
- healthchecks

F. Logging
- journalctl
- Docker logs
- logrotatie
- bewaartermijnen

G. Monitoring
- diskruimte
- geheugen
- CPU
- containerstatus
- PostgreSQL status
- backupstatus

H. Backupcontrole
- dagelijkse controle
- restore-validatie
- meldingen bij mislukte backup

I. Onderhoud
- maandelijkse updates
- Docker images
- PostgreSQL
- Ubuntu packages

J. Hardening-checklist
Maak een afvinkbare checklist.

────────────────────────────────────────
2. PRODUCTIESTACK CONTROLEREN
────────────────────────────────────────

Controleer de productie-stack.

Verifieer waarom zowel:

- nginx
- Caddy

tegelijk aanwezig zijn.

Indien beide noodzakelijk zijn:

documenteer exact waarom.

Indien één component overbodig is:

vereenvoudig de stack.

Doel:

zo eenvoudig mogelijk,
zonder verlies van functionaliteit.

────────────────────────────────────────
3. STORAGE-ADVIES
────────────────────────────────────────

Voeg een extra hoofdstuk toe.

Beschrijf:

Fase 1
- MinIO lokaal op dezelfde VPS

Fase 2
- aparte storage-server

Fase 3
- optioneel externe S3-provider

Leg uit waarom deze volgorde het beste past bij FPS Connect.

────────────────────────────────────────
4. SECRETS
────────────────────────────────────────

Voeg een apart hoofdstuk toe:

PRODUCTIE-SECRETS

Beschrijf:

- nooit in GitHub
- nooit in broncode
- nooit in backups zonder encryptie
- rechtenbeheer
- rotatiebeleid
- herstelprocedure

────────────────────────────────────────
5. DNS EN LIVEGANG
────────────────────────────────────────

Voeg een gecontroleerd livegangscenario toe.

Stapvolgorde:

1.
testen via IP-adres

2.
HTTPS controleren

3.
database

4.
storage

5.
login

6.
documenten

7.
uploads

8.
rapporten

9.
backups

10.
pas daarna:

connect.fps-one.nl

naar de productie-VPS laten verwijzen.

────────────────────────────────────────
6. EINDVERIFICATIE
────────────────────────────────────────

Voeg een laatste hoofdstuk toe:

PRODUCTIE ACCEPTATIE

Beantwoord minimaal:

□ server gehard
□ SSH gecontroleerd
□ firewall actief
□ Docker gezond
□ PostgreSQL gezond
□ storage gezond
□ HTTPS actief
□ backups getest
□ restore getest
□ monitoring actief
□ logging actief
□ DNS actief
□ productie gescheiden van development
□ rollback getest
□ FPS Connect gereed voor invoer van echte bedrijfsdata

────────────────────────────────────────
Randvoorwaarden
────────────────────────────────────────

- Geen nieuwe functionaliteit.
- Geen wijzigingen aan workflows.
- Geen wijzigingen aan databaseontwerp.
- Alleen documentatie, verificatie en productie-hardening.
- Werk alle bestaande documentatie bij zodat deze consistent blijft met de nieuwe serverarchitectuur.

Oplevering:

Lever een overzicht op van:
- nieuw aangemaakte bestanden;
- gewijzigde bestanden;
- motivatie van iedere wijziging;
- definitieve productie-architectuur voor FPS Connect.