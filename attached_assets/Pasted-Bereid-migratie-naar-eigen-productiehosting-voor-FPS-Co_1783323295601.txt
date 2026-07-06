Bereid migratie naar eigen productiehosting voor FPS Connect voor.

Doel:
FPS Connect moet loskomen van Replit als productieomgeving. Replit blijft alleen development/buildomgeving. Productie krijgt een eigen server, eigen database, eigen storage, eigen secrets, eigen backups en eigen domein.

Scope:
Geen nieuwe functionaliteit bouwen. Alleen portabiliteit, migratievoorbereiding en productiehosting-documentatie.

Eisen:

1. Maak een productie-migratiepakket voor FPS Connect
   - INSTALL_PRODUCTION.md
   - MIGRATION_FROM_REPLIT.md
   - BACKUP_RESTORE_PRODUCTION.md
   - ENV_PRODUCTION.example
   - docker-compose.production.yml
   - RELEASE_PRODUCTION_CHECKLIST.md
   - ROLLBACK_PRODUCTION.md

2. Dockeriseer FPS Connect volledig
   - api-server
   - frontend
   - database-migraties
   - object storage configuratie
   - healthcheck
   - restart policy
   - logrotatie

3. Productie-infrastructuur specificeren
   - Ubuntu LTS server
   - PostgreSQL productie apart
   - S3-compatible object storage of lokale MinIO
   - HTTPS via reverse proxy
   - dagelijks backupbeleid
   - restoreprocedure
   - aparte production secrets

4. Replit-export voorbereiden
   - database export
   - object storage export
   - release v1.0.0 export
   - gebruikers/rollen export
   - controle op testdata
   - migratievolgorde documenteren

5. Productie-environment scheiden
   - development mag nooit productie-database gebruiken
   - development mag nooit productie-storage gebruiken
   - production secrets mogen niet in Replit development staan
   - geen gedeelde buckets
   - geen gedeelde DATABASE_URL

6. Verificatie na installatie
   Controleer:
   - login
   - gebouwen
   - documenten
   - uploads
   - planning
   - gebruikers
   - voorzieningen
   - rapportages
   - release v1.0.0 actief
   - backup gemaakt
   - restore droog getest
   - HTTPS actief
   - rollback beschikbaar

7. Opleverrapport
   Rapporteer:
   - welke bestanden zijn toegevoegd/gewijzigd
   - hoe FPS Connect buiten Replit geïnstalleerd wordt
   - welke serververeisten gelden
   - welke secrets nodig zijn
   - welke stappen ik later handmatig moet uitvoeren
   - welke risico’s nog openstaan

Belangrijk:
Voeg geen nieuwe features toe. Dit is uitsluitend productie-migratievoorbereiding voor eigen hosting.