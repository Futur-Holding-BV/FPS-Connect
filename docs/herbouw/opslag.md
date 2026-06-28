# Opslag en bestanden (S3-compatibel)

FPS Connect slaat bestanden op via een **S3-compatibele object storage**.
In productie wordt MinIO (eigen server), Backblaze B2 of AWS S3 gebruikt.
In Replit-ontwikkelomgeving wordt Replit Object Storage gebruikt.

---

## Opslagstructuur

```
S3-bucket: fps-connect-bestanden/
│
├── private/                   ← privébestanden (nooit publiek)
│   ├── documenten/            ← geüploade PDF/Word-bestanden
│   │   └── {gebouw_id}/{bestand_id}.pdf
│   ├── foto's/                ← spotfoto's, inspectiebeelden
│   │   └── {spot_id}/{foto_id}.jpg
│   ├── handtekeningen/        ← opgeleverde handtekeningbestanden
│   ├── backups/               ← dagelijkse databaseback-ups
│   │   └── {datum}/db.sql.gz
│   └── exports/               ← rapportage-exports
│
└── public/                    ← publiek toegankelijk (via signedURL)
    ├── logos/                 ← werkgeverslogo's
    └── assets/                ← gedeelde platform-assets
```

---

## Lokale MinIO (eigen server — aanbevolen voor productie)

### Installatie

```bash
# Via Docker
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=fps_admin \
  -e MINIO_ROOT_PASSWORD=STERK_WACHTWOORD \
  -v /data/minio:/data \
  minio/minio server /data --console-address ":9001"
```

### Bucket aanmaken

```bash
# Via MinIO CLI (mc)
mc alias set fps http://localhost:9000 fps_admin STERK_WACHTWOORD
mc mb fps/fps-connect-bestanden
mc policy set private fps/fps-connect-bestanden
```

### Omgevingsvariabelen

```env
S3_ENDPOINT=http://localhost:9000
S3_REGION=eu-west-1
S3_BUCKET=fps-connect-bestanden
S3_ACCESS_KEY_ID=fps_app_key
S3_SECRET_ACCESS_KEY=STERK_GEGENEREERDE_KEY
```

---

## Backblaze B2 (cloud-alternatief)

1. Maak account aan op https://www.backblaze.com/b2
2. Maak bucket `fps-connect-bestanden` aan (Private)
3. Maak Application Key aan met toegang tot de bucket
4. Gebruik het S3-compatible endpoint: `https://s3.{region}.backblazeb2.com`

```env
S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
S3_REGION=eu-central-003
S3_BUCKET=fps-connect-bestanden
S3_ACCESS_KEY_ID=<keyID uit Backblaze>
S3_SECRET_ACCESS_KEY=<applicationKey uit Backblaze>
```

---

## AWS S3

```env
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=eu-west-1
S3_BUCKET=fps-connect-bestanden
S3_ACCESS_KEY_ID=<IAM access key>
S3_SECRET_ACCESS_KEY=<IAM secret key>
```

IAM-policy minimaal vereist:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::fps-connect-bestanden",
      "arn:aws:s3:::fps-connect-bestanden/*"
    ]
  }]
}
```

---

## Verificatie

Test of de opslag werkt via de API:

```bash
# Upload een testbestand
curl -X POST https://connect.fps-brandpreventie.nl/api/beheer/opslag-test \
  -H "Cookie: <sessiecookie>"
```

Of direct in de applicatie: **Beheer → Back-up & Herstel → Opslag testen**.

---

## Bestandsverwijdering en retentie

- Bestanden worden nooit automatisch verwijderd tenzij een document/spot
  expliciet wordt verwijderd via de API
- Back-upbestanden worden bewaard conform `BACKUP_RETENTIE_DAGEN` (standaard: 90)
- Verwijdering verloopt altijd via de ObjectStorageService — nooit rechtstreeks
  in S3 (anders entstaan wees-records in de database)

---

## Herstel van bestanden na verlies

Als bestanden verloren gaan (bucket-ongeluk):

1. Herstel de meest recente back-up (zie [backup-restore.md](backup-restore.md))
2. Bestanden die jonger zijn dan de back-up zijn onherstelbaar tenzij de
   bucket-provider versioning had ingeschakeld
3. **Aanbeveling:** schakel **S3 versioning** in op de bucket voor extra bescherming
