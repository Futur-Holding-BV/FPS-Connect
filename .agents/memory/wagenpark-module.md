---
name: Wagenpark-module patronen
description: WAGENPARK_01-beslissingen — voertuigdocumenten, mijn-auto scoping, RDW, sync-dedupe, garagemail
---

- Voertuigdocumenten hergebruiken `documenten` + `document_koppelingen` (doelType `voertuig`). **Download uitsluitend via de eigen route** `GET /wagenpark/voertuigen/:id/documenten/:documentId/download` (koppeling-check + scan-gate); de generieke `/storage/objects`-route kent geen voertuig-ACL. `/api/storage/files?path=...` bestaat NIET als route (offertes/snagstream gebruiken die vorm alleen als string in mails).
- Verwijderen = koppeling unlinken; document pas archiveren als géén koppelingen resteren (many-to-many, anders data-loss bij andere doelen).
- Server-side uploads (multer memory) moeten `scanBestandBytes` draaien VÓÓR opslag, fail-closed, met `objectPad` in de scan-input zodat de download-gate (`haalScanStatusOpVoorPad`) matcht.
- `GET /wagenpark/mijn-auto` = requireAuth zonder module-recht, scoping op `(await effectieveContext(req)).userId` (LET OP: effectieveContext is async, uit `utils/rol`, niet uit middlewares/auth).
- Rit-dedupe: partiële unieke index `wagenpark_ritten_provider_rit_id_uniek` + `onConflictDoNothing` — nooit select-then-insert (parallelle syncs).
- Bewakingsloop-signalen wagenpark (documenten/APK/km/bandenwissel/sync-uitgebleven) = module wagenpark **niveau 3** (§5.3-fallbackbesluit).
- Garagemail §6.1: mail éérst, status `doorgezet_garage` pas na succes; falen = 502/503 + werkbak-item bron `wagenpark_garagemail` dedup `garagemail:<id>`.
- Dev-mail is GECONFIGUREERD (Graph): doorzetten-garage slaagt in dev echt; faalpad alleen testbaar door mail-config te breken.
- Buiten-werktijdrapport = bewuste privacygrens: voertuiggericht, nooit adressen/personen in de respons, en elke raadpleging AVG-loggen; alle dag/tijd-classificatie en periodegrenzen in Europe/Amsterdam (niet servertijd), anders kloppen randritten en DST-overgangen niet.
