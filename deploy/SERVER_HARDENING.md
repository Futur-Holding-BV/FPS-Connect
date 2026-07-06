# FPS Connect — Server Hardening

Stap-voor-stap beveiligingsinrichting voor een Ubuntu 24.04 LTS VPS.
Voer elke stap uit vóór ingebruikname met echte bedrijfsdata.

---

## A. Basisconfiguratie

```bash
# Hostname instellen
hostnamectl set-hostname fps-productie

# Tijdzone (Amsterdam)
timedatectl set-timezone Europe/Amsterdam
timedatectl status

# Locale
locale-gen nl_NL.UTF-8
update-locale LANG=nl_NL.UTF-8
dpkg-reconfigure --frontend=noninteractive locales

# NTP tijdsynchronisatie (chrony — nauwkeuriger dan systemd-timesyncd)
apt install -y chrony
systemctl enable chrony && systemctl start chrony
chronyc tracking

# Automatische security-updates
apt install -y unattended-upgrades
dpkg-reconfigure --frontend=noninteractive unattended-upgrades
# Configuratie staat in /etc/apt/apt.conf.d/50unattended-upgrades
# Zorg dat "security" actief is en mail-notificaties aan staan.

# Volledige systeem-update
apt update && apt upgrade -y && apt autoremove -y
```

---

## B. Gebruikersbeheer

```bash
# Maak een beheerdersaccount (GEEN dagelijks root-gebruik)
adduser fps-beheer
usermod -aG sudo fps-beheer

# Kopieer SSH-key van root naar de nieuwe gebruiker
mkdir -p /home/fps-beheer/.ssh
cp /root/.ssh/authorized_keys /home/fps-beheer/.ssh/
chown -R fps-beheer:fps-beheer /home/fps-beheer/.ssh
chmod 700 /home/fps-beheer/.ssh
chmod 600 /home/fps-beheer/.ssh/authorized_keys

# Test SSH-toegang als fps-beheer vóórdat je root uitschakelt
# Vanuit een tweede terminal: ssh fps-beheer@SERVER_IP
```

### SSH-sleutel aanmaken (op jouw lokale machine)

```bash
ssh-keygen -t ed25519 -C "fps-productie-beheer" -f ~/.ssh/fps_productie
ssh-copy-id -i ~/.ssh/fps_productie.pub fps-beheer@SERVER_IP
```

---

## C. SSH-hardening

Bewerk `/etc/ssh/sshd_config`:

```
# Protocol en authenticatie
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Sessie-limieten
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2

# Onnodige features uitschakelen
X11Forwarding no
AllowTcpForwarding no
PrintMotd no
Banner none

# Beperk gebruikers die mogen inloggen
AllowUsers fps-beheer
```

Toepassen:

```bash
sshd -t   # Configuratie valideren (geen fouten = veilig)
systemctl restart sshd
```

> **Kritisch:** Test altijd vanuit een tweede, open SSH-sessie voordat je de eerste sessie sluit.

---

## D. Firewall (UFW)

```bash
# UFW installeren en standaard alles blokkeren
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing

# Alleen noodzakelijke poorten openen
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Caddy redirect naar HTTPS)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3 QUIC'

# Logging inschakelen
ufw logging on

# UFW activeren
ufw enable
ufw status verbose
```

### Controleren

```bash
ufw status numbered
# Verwacht: alleen 22, 80, 443 (tcp) en 443 (udp)

# Probeer een geblokkeerde poort (moet timeout geven)
# nc -zv SERVER_IP 8080   # moet mislukken
```

---

## E. Docker security

```bash
# Docker installeren (officiële methode)
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Beheergebruiker Docker-rechten geven (herstart sessie daarna)
usermod -aG docker fps-beheer

# Docker daemon hardening
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  },
  "no-new-privileges": true,
  "userland-proxy": false
}
EOF

systemctl restart docker
```

### Regels voor containers

- Nooit `--privileged` tenzij absoluut noodzakelijk
- Alleen noodzakelijke volumes mounten (geen `/var/run/docker.sock` tenzij vereist)
- Altijd `restart: always` voor productiecontainers
- Altijd `healthcheck` configureren
- Geen containers als root draaien (de api-server draait al als `fps`-gebruiker — zie Dockerfile.api)

### Images bijhouden

```bash
# Maandelijks: nieuwe base images trekken en herbouwen
docker compose -f deploy/docker-compose.production.yml pull
docker compose -f deploy/docker-compose.production.yml build --no-cache
docker compose -f deploy/docker-compose.production.yml up -d
docker image prune -f
```

---

## F. Logging

### Docker-logs bekijken

```bash
docker compose -f deploy/docker-compose.production.yml logs api --tail=200 -f
docker compose -f deploy/docker-compose.production.yml logs caddy --tail=100
docker compose -f deploy/docker-compose.production.yml logs db --tail=50
```

### Systemd-logs

```bash
journalctl -u docker --since "1 hour ago"
journalctl -p err -n 50    # Alleen fouten
```

### Logrotatie (automatisch via Docker daemon.json)

De `log-opts` in `daemon.json` zorgen voor automatische rotatie:
- max 20 MB per logbestand voor api
- max 5 logbestanden bewaard
- Docker ruimt automatisch op

### Systeemlogrotatie

```bash
# /etc/logrotate.d/fps-connect
/var/log/fps-*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## G. Monitoring

### Basischecks (handmatig)

```bash
# Schijfruimte
df -h

# Geheugen
free -h

# CPU-gebruik
top -bn1 | head -5

# Container-status
docker compose -f deploy/docker-compose.production.yml ps

# PostgreSQL gezond?
docker compose -f deploy/docker-compose.production.yml exec db \
  pg_isready -U fps_app -d fps_production

# Caddy HTTPS-certificaat
curl -sI https://fpsbrandpreventie.nl | grep -i "strict-transport"
```

### Automatische monitoring (crontab fps-beheer)

```bash
crontab -e
```

```
# Schijfruimte controleren (waarschuwing bij >85%)
*/30 * * * * df / | awk 'NR==2 {gsub("%","",$5); if($5>85) print "WAARSCHUWING: schijf "$5"% vol"}' | grep WAARSCHUWING | mail -s "FPS Schijf vol" admin@fpsbrandpreventie.nl

# Container-status elke 5 minuten
*/5 * * * * docker compose -f /opt/fps-connect/deploy/docker-compose.production.yml ps --format json | python3 -c "import sys,json; cs=[c for c in json.load(sys.stdin) if c['State']!='running' and c['Service'] not in ['migrate','backup']]; [print('FOUT: container',c['Service'],'staat',c['State']) for c in cs]" | grep FOUT | mail -s "FPS Container Down" admin@fpsbrandpreventie.nl

# Backup-controle dagelijks om 06:00
0 6 * * * /opt/fps-connect/deploy/check-backup.sh | grep -v OK | mail -s "FPS Backup Status" admin@fpsbrandpreventie.nl
```

---

## H. Backupcontrole

```bash
# Dagelijkse backup handmatig starten
docker compose -f deploy/docker-compose.production.yml \
  --profile backup run --rm backup

# Meest recente backup controleren
ls -lht deploy/db-backups/ | head -3
gunzip -t deploy/db-backups/fps_DATUM.sql.gz && echo "OK"

# Restore-validatie (droog, op testcontainer — zie BACKUP_RESTORE_PRODUCTION.md)
```

Stel een maandelijkse restore-drill in op een testserver om te verifiëren dat de backup ook daadwerkelijk herstelbaar is.

---

## I. Maandelijks onderhoud

```bash
# 1. Ubuntu-updates
apt update && apt upgrade -y && apt autoremove -y

# 2. Docker images herbouwen (nieuwe base images)
cd /opt/fps-connect
git pull
docker compose -f deploy/docker-compose.production.yml build --no-cache
docker compose -f deploy/docker-compose.production.yml up -d

# 3. Ongebruikte Docker-resources opruimen
docker system prune -f

# 4. Logbestanden controleren op afwijkingen
docker compose -f deploy/docker-compose.production.yml logs api --since "30d" | grep -i "error\|warn" | tail -50

# 5. Certificaatstatus (Caddy vernieuwt automatisch, maar controleer)
docker compose -f deploy/docker-compose.production.yml exec caddy \
  caddy list-certificates 2>/dev/null || echo "Caddy beheert certificaten automatisch"

# 6. PostgreSQL-statistieken
docker compose -f deploy/docker-compose.production.yml exec db \
  psql -U fps_app -d fps_production -c "
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS grootte
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"
```

---

## J. Hardening-checklist

Vink elk punt af vóór productiegebruik:

**Basis**
- [ ] Ubuntu 24.04 LTS geïnstalleerd met volledige updates
- [ ] Hostname ingesteld op `fps-productie`
- [ ] Tijdzone ingesteld op `Europe/Amsterdam`
- [ ] NTP actief en gesynchroniseerd (`chronyc tracking`)
- [ ] Automatische security-updates ingesteld

**Gebruikers**
- [ ] Beheerdersaccount `fps-beheer` aangemaakt met sudo
- [ ] SSH-key gekopieerd naar `fps-beheer`
- [ ] SSH-login getest als `fps-beheer` vóór root-uitschakeling
- [ ] Root SSH-login uitgeschakeld (`PermitRootLogin no`)
- [ ] Wachtwoordauthenticatie uitgeschakeld (`PasswordAuthentication no`)

**SSH**
- [ ] `sshd_config` bijgewerkt en gevalideerd (`sshd -t`)
- [ ] `MaxAuthTries 3`, `LoginGraceTime 20` ingesteld
- [ ] `X11Forwarding no`, `AllowTcpForwarding no`
- [ ] `AllowUsers fps-beheer` ingesteld

**Firewall**
- [ ] UFW actief en ingeschakeld
- [ ] Alleen poorten 22, 80, 443 (tcp) en 443 (udp) open
- [ ] Alle overige poorten geblokkeerd
- [ ] UFW-logging ingeschakeld

**Docker**
- [ ] Officiële Docker geïnstalleerd
- [ ] `daemon.json` aangemaakt met logrotatie en `no-new-privileges`
- [ ] `fps-beheer` in de `docker`-groep
- [ ] Geen `--privileged` containers

**Applicatie**
- [ ] `.env.production` aangemaakt met alle secrets (nooit in Git)
- [ ] `docker compose up -d` succesvol
- [ ] Healthcheck api groen
- [ ] Caddy HTTPS-certificaat actief

**Monitoring & Backup**
- [ ] Crontab-monitoring ingesteld (schijf, containers, backup)
- [ ] Nul-backup gemaakt en gecontroleerd
- [ ] Restore-drill uitgevoerd (droog, op testcontainer)
