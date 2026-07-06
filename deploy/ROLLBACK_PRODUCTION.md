# FPS Connect — Rollback Productie

## Wanneer rollback uitvoeren

- Kritieke fout na deployment die niet snel opgelost kan worden
- Data-inconsistentie gedetecteerd
- Healthcheck faalt na deployment
- Gebruikers kunnen niet inloggen na update

**Beslissingscriterium:** Als een probleem niet binnen 30 minuten opgelost kan worden, voer dan rollback uit.

---

## Rollback Niveau 1 — Alleen applicatiecode (geen DB-wijzigingen)

Gebruik dit als er geen schema-wijzigingen waren in de release.

```bash
cd /opt/fps-connect

# 1. Ga terug naar de vorige Git-versie
git log --oneline -10          # Noteer de vorige commit-hash
git checkout <vorige-commit>   # Of: git checkout HEAD~1

# 2. Bouw opnieuw
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production build

# 3. Herstart
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d

# 4. Controleer
curl -s https://fpsbrandpreventie.nl/api/healthz
```

**Duur:** 5–10 minuten downtime.

---

## Rollback Niveau 2 — Met database-herstel

Gebruik dit als er schema-wijzigingen waren en de migratie problemen veroorzaakte.

```bash
# 1. Stop de API-server
docker compose -f deploy/docker-compose.production.yml stop api

# 2. Identificeer de juiste backup (gemaakt vóór de release)
ls -lht deploy/db-backups/fps_*.sql.gz | head -5

# 3. Database herstellen naar de backup vóór de release
gunzip -c deploy/db-backups/fps_DATUM_TIJDSTIP.sql.gz | \
  docker compose -f deploy/docker-compose.production.yml exec -T db \
  pg_restore -U fps_app -d fps_production \
  --no-owner --no-acl --clean --if-exists

# 4. Ga terug naar de vorige applicatiecode
git checkout <vorige-commit>

# 5. Bouw en start opnieuw
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production build
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d

# 6. Controleer
curl -s https://fpsbrandpreventie.nl/api/healthz
curl -s https://fpsbrandpreventie.nl/api/kantoor-release/actief
```

**Duur:** 15–30 minuten, afhankelijk van databasegrootte.

---

## Rollback Niveau 3 — Kantoor Release terugdraaien (in applicatie)

Als de applicatie draait maar de nieuwe release problemen geeft, gebruik dan de ingebouwde rollback-functie:

1. Log in als hoofdbeheerder op `https://fpsbrandpreventie.nl`
2. Navigeer naar Beheer > Kantoor Release
3. Selecteer de vorige stabiele versie in de versiegeschiedenis
4. Klik op "Terugdraaien" — dit markeert de vorige versie als actief

Dit is een administratieve rollback — de applicatiecode blijft ongewijzigd.

Via de API:
```bash
# Haal de versie-ID op van de te herstellen versie
curl -s -b cookies.txt https://fpsbrandpreventie.nl/api/kantoor-release/releases | python3 -m json.tool

# Voer rollback uit (vervang :id door het versie-id)
curl -s -X POST -b cookies.txt https://fpsbrandpreventie.nl/api/kantoor-release/releases/:id/rollback
```

---

## Post-rollback verificatie

Na elke rollback, controleer in volgorde:

```bash
# 1. Server bereikbaar
curl -s https://fpsbrandpreventie.nl/api/healthz

# 2. Actieve release correct
curl -s https://fpsbrandpreventie.nl/api/kantoor-release/actief | python3 -m json.tool

# 3. Database-integriteit
docker compose -f deploy/docker-compose.production.yml exec db \
  psql -U fps_app -d fps_production -c "
SELECT COUNT(*) AS gebruikers FROM gebruikers;
SELECT COUNT(*) AS gebouwen FROM gebouwen;
SELECT COUNT(*) AS documenten FROM documenten;
"

# 4. Logs op fouten
docker compose -f deploy/docker-compose.production.yml logs api --tail=100 | grep -i error
```

---

## Rollback-beslissingsboom

```
Probleem na deployment
        │
        ▼
Is de database aangetast?
    │           │
   JA          NEE
    │           │
    ▼           ▼
Niveau 2    Zijn er schema-wijzigingen?
                │           │
               JA          NEE
                │           │
                ▼           ▼
            Niveau 2    Niveau 1
```

---

## Communicatie tijdens rollback

Informeer direct:
- **René** (hoofdbeheerder): melding dat rollback wordt uitgevoerd
- **Gebruikers**: korte downtime-melding als de dienst langer dan 5 minuten onbeschikbaar is

Template melding:
```
FPS Connect is tijdelijk niet beschikbaar vanwege een technische update.
Verwachte hersteltijd: [TIJDSTIP].
Excuses voor het ongemak.
```
