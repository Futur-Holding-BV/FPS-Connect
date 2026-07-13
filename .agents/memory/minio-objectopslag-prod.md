---
name: MinIO objectopslag productie
description: Presigned-upload patroon met MinIO achter Caddy op de productie-VPS; test- en backuppatroon.
---

# MinIO objectopslag productie

**Patroon:** MinIO-container (intern http://minio:9000) + Caddy-route
`/<bucket>/*` → minio:9000 met behoud van Host-header (SigV4 signeert de host).
De api signeert presigned PUT's met een aparte presign-client op
`S3_PUBLIC_ENDPOINT` (publiek domein); alle server-side reads/writes blijven op
de interne client. Downloads naar de browser lopen via de geauthenticeerde
server-side stream (/api/storage), niet via presigned GET.

**Why:** presigned URL's met de interne hostnaam zijn voor browsers onbereikbaar;
signeren met het publieke domein en Host-behoud in de proxy is de enige combinatie
waarbij de SigV4-handtekening klopt.

**How to apply / testen:** `mc alias set` tegen het publieke domein werkt NIET
(root van het domein is de frontend, geen S3 — XML syntax error). Presign testen
door in de api-container een klein node-script met `@aws-sdk/client-s3` +
`s3-request-presigner` te draaien (SDK zit in het image) en de URL met curl te
PUT/GET-ten. Root-credentials als app-credentials is een bekende
least-privilege-follow-up (mc admin user svcacct add).

**Backup:** `backup-minio` compose-dienst (profiel backup, mc mirror naar
./minio-backups) + dagelijkse cron naast de pg_dump-cron; api moet
`depends_on: minio-init: service_completed_successfully` hebben (bucket-race).
