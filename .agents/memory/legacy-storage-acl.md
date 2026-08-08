---
name: Legacy storage-paden gebouw-ACL
description: Hoe ongescoopte /objects/uploads|algemeen-paden toch gebouw-ACL krijgen
---

# Legacy storage-paden: gebouw-koppeling afgeleid uit DB-registraties

Ongescoopte paden (`/objects/uploads/...`, `/objects/algemeen/...`) hebben geen
gebouw-id in het pad. `magBestandInGebouw` (storage-routes) leidt de koppeling
live af uit de tabellen die het pad refereren: fotos→voorzieningen, tekeningen,
verdiepingen.plattegrond_url, opname_fotos→opnames, spot_ai_voorstellen. Match
op padvarianten (`/objects/...` én `/api/storage/objects|thumbnails/...`).
Gevonden koppeling ⇒ zelfde gebouw-ACL als gestructureerde paden; geen
koppeling ⇒ medewerker-leesbaar; klant altijd dicht (KLANT_01).

**Why:** bewust géén registratietabel/padmigratie — live afleiden kan niet
stale worden en vergt geen schemawijziging.

**How to apply:** nieuwe tabel die object-paden opslaat en gebouw-gescoped is?
Voeg de bron toe aan `zoekGebouwenVoorLegacyPad` in
`artifacts/api-server/src/routes/storage.ts`. Bewijs:
`scripts/src/verificatie-legacy-bestand-acl.ts` (L1–L7). Persoonsgebonden
paden (salaris/HRM) zijn nog medewerker-breed leesbaar (aparte taak).
