---
name: S3-opslagabstractie
description: Hoe de objectopslag-laag werkt voor productie (S3) vs. Replit-dev (GCS).
---

## Beslissing

De opslaglaag detecteert automatisch de backend op basis van `S3_BUCKET`:
- `S3_BUCKET` aanwezig → S3-compatibele backend (AWS/R2/MinIO)
- Niet aanwezig → Replit GCS-backend via sidecar op `http://127.0.0.1:1106`

## Bestanden

- `objectStorageTypes.ts` — `StorageFile` interface + `ObjectNotFoundError` (gedeeld, geen circulaire deps)
- `objectStorageS3.ts` — `S3StorageFile` class, `createS3Client()`, `getS3File()`, `s3PresignedPut()`
- `objectStorage.ts` — `ObjectStorageService` factory + re-exports; beide backends lazy-init

## API-wijziging

`getObjectEntityUploadURL()` retourneert nu `{ uploadURL: string; objectPath: string }`.
Routes destructureren direct: `const { uploadURL, objectPath } = await ...`.
`normalizeObjectEntityPath()` is nog aanwezig voor GCS backward-compat maar niet meer in routes.

## S3-metadata (ACL)

`objectAcl.ts` gebruikt `StorageFile` ipv GCS `File`. De ACL-policy staat als JSON in user-metadata
onder key `"custom:aclPolicy"`. Voor S3-objecten retourneert `getObjectAclPolicy()` null (key bestaat
niet) → `downloadObject()` valt terug op `Cache-Control: private`. Functioneel correct voor alle
productie-objecten (toegang via `magBestandInGebouw()`, niet via ACL-policy).

## S3 CORS-vereiste

De S3-bucket moet CORS toestaan voor `PUT` van het frontend-domein (presigned uploads).

**Why:** GCS-backend leunt op Replit-sidecar die niet beschikbaar is buiten Replit.
S3-compatible backends (R2, MinIO, AWS) zijn portabel en provider-onafhankelijk.

**How to apply:** Bij toevoegen van nieuwe storage-operaties: altijd beide backends implementeren
in `objectStorageS3.ts` (S3) en `objectStorage.ts` (GCS-pad). Geen directe `@google-cloud/storage`
imports meer buiten `objectStorage.ts`.
