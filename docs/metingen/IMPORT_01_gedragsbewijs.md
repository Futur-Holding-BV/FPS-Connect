# IMPORT_01 — gedragsbewijs (dev) + prod-meting

Datum: 2026-08-08 · Script: `scripts/src/verificatie-import01.ts` (herhaalbaar; maakt eigen testaccounts aan en archiveert ze na afloop)

## Uitvoer (letterlijk)

```
✅ B1: gebruiker zonder rechten wordt overal geweigerd (preview/template/logs 403)
✅ B2: magazijn:4 mag artikelen, maar leveranciers/medewerkers worden geweigerd
✅ B3: uitvoeren zonder voorafgaande controle wordt geweigerd (400)
✅ Eerste import: 3 rijen verwerkt (log #49)
✅ Alle 3 records dragen bron='import' en import_id=49
✅ B4: tweede keer dezelfde lijst → alle 3 rijen herkend als dubbel
✅ B5: bij dubbelen zonder keuze weigert uitvoeren (422)
✅ B4: met keuze 'overslaan' zijn er géén dubbelen ontstaan (nog exact 3 records)
✅ B6: terugdraaien verwijdert exact 3 records, log gemarkeerd, tweede keer 409
✅ Extra: terugdraaien zonder rechten geweigerd (403)

🎉 Alle IMPORT_01-bewijzen geslaagd
```

## API-veldcontrole (dev, ingelogde sessie)

Lijst-endpoints met data geven de herkomstvelden terug:

```
/gebouwen    200 bron:true import_id:true
/facturen    200 bron:true import_id:true
/medewerkers 200 bron:true import_id:true
```
(overige lijsten waren leeg in dev; mappers identiek aangepast, monorepo-typecheck groen)

## Prod-meting (deploy-db-1, fps_production, 2026-08-08)

```
leveranciers|0|0          (totaal | waarvan bron='import')
artikelen|0|0
crm_klanten|0
crm_contactpersonen|0
medewerkers|5
gebouwen|2
eenheidsprijzen|0
facturen|0
import_logs|0
lev_dubbel_naam_stad|0
art_dubbel_code|0
art_dubbel_naam|0
```

Conclusie: nog nooit via de module geïmporteerd op prod; geen dubbelen, geen opschoning nodig.
