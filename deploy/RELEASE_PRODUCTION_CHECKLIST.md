# FPS Connect — Release Productiechecklist

Gebruik deze checklist bij elke productie-release op de eigen server.
Vink elk punt af vóór vrijgave. Geen stap overslaan.

---

## A. Voorbereiding (dag voor de release)

- [ ] Release-branch gemerged en getest in Replit-development
- [ ] `pnpm run typecheck` schoon (0 nieuwe fouten)
- [ ] `pnpm --filter @workspace/api-server run build` geslaagd
- [ ] `pnpm --filter @workspace/firevault run build` geslaagd
- [ ] OpenAPI-codegen uitgevoerd na eventuele API-wijzigingen
- [ ] DB-schema-wijzigingen gedocumenteerd (additief? breaking?)
- [ ] Changelog bijgewerkt in `docs/changelog.md`
- [ ] Bekende beperkingen gedocumenteerd

---

## B. Pre-release backup (op de productieserver)

- [ ] Database-backup gemaakt en gecontroleerd:
  ```bash
  docker compose -f deploy/docker-compose.production.yml --profile backup run --rm backup
  ls -lh deploy/db-backups/ | head -3
  ```
- [ ] Backup-integriteit gecontroleerd (`gunzip -t`)
- [ ] Backup-bestandsnaam genoteerd als rollback-punt: `fps___________.sql.gz`

---

## C. Deployment (op de productieserver)

- [ ] Code bijgewerkt:
  ```bash
  cd /opt/fps-connect
  git pull origin main
  ```
- [ ] Nieuwe images gebouwd:
  ```bash
  docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production build
  ```
- [ ] DB-migraties uitgevoerd (als er schema-wijzigingen zijn):
  ```bash
  docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production run --rm migrate
  ```
- [ ] Applicatie hergestart:
  ```bash
  docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d
  ```
- [ ] API-healthcheck groen:
  ```bash
  curl -s https://fpsbrandpreventie.nl/api/healthz
  ```

---

## D. Smoke tests na release

- [ ] Login met TOTP werkt
- [ ] Gebouwenlijst laadt
- [ ] Documentenlijst laadt
- [ ] Upload van een PDF werkt
- [ ] Planning-overzicht laadt
- [ ] Gebruikerslijst laadt (beheerder)
- [ ] Voorzieningenoverzicht laadt
- [ ] Rapportage-pagina laadt
- [ ] `/release-notes` toont de actieve versie
- [ ] `/beheer/kantoor-release` zichtbaar voor hoofdbeheerder
- [ ] `/beheer/kantoor-release` geeft 403 voor gewone gebruiker
- [ ] Audit-log toont recente activiteit

---

## E. Kantoor Release markeren (in de applicatie)

- [ ] Inloggen als hoofdbeheerder op `https://fpsbrandpreventie.nl`
- [ ] Navigeer naar Beheer > Kantoor Release
- [ ] Maak een nieuwe release aan met het nieuwe versienummer
- [ ] Vul alle 6 acceptatiechecks in
- [ ] Voeg releasenotes toe (toegevoegd / verbeterd / opgelost)
- [ ] Klik op "Vrijgeven" — blokkade treedt op als een check niet groen is

---

## F. Post-release

- [ ] Productie-logs controleren op fouten:
  ```bash
  docker compose -f deploy/docker-compose.production.yml logs api --tail=200 | grep -i "error\|warn"
  ```
- [ ] Rollback-procedure beschikbaar bevestigd (zie ROLLBACK_PRODUCTION.md)
- [ ] Release genoteerd in `docs/changelog.md`
- [ ] Teamleden geïnformeerd over de nieuwe versie

---

## Aanspreekpunten bij blokkade

| Blokkade | Actie |
|---|---|
| Migration faalt | Voer rollback uit (zie ROLLBACK_PRODUCTION.md) |
| Healthcheck faalt | Check `docker logs fps-api-1` |
| Login werkt niet | Controleer `SESSION_SECRET` in `.env.production` |
| Upload mislukt | Controleer storage-secrets en bucketrechten |
| Acceptatiecheck blokkeert vrijgave | Los de check op vóór vrijgave — niet omzeilen |
