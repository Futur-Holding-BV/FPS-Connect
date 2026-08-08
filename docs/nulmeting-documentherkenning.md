# Nulmeting documentherkenning (DOCUMENT_01)

**Status: WACHT OP BESTANDEN** — De acht geplande testdocumenten zijn nog niet aangeleverd.
Zodra de PDF's in `attached_assets/nulmeting/` staan, draai dan:

```bash
S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/nulmeting-documentherkenning.ts
```

Dit overschrijft dit bestand met de echte meetresultaten.

---

## Geplande meting

Aangevraagd op: 2026-08-08 · Instellingen: 220 DPI, max 2000 px, JPEG 85, detail=high, max 5 pagina's.

| Document | Verwacht type | Opmerking |
|---|---|---|
| SVO_Pico30_ED.pdf | `productdocument` | Technisch toepassingsdocument fabrikant |
| SVO_Pico60_ED_38mm.pdf | `productdocument` | Technisch toepassingsdocument fabrikant |
| 2013-Efectis-R0220e_Brandmanchet.pdf | `testrapport` | Efectis-testrapport, 46 pagina's |
| Bestelling_Cilinders_Thorbeckerstraat.pdf | `aanvraag` | Eigen inkoopopdracht (geen leveranciers-offerte) |
| Prijsopgave_1264978.pdf | `offerte` | Offerte leverancier |
| Prijsopgave_1360102.pdf | `offerte` | Jaarprijsafspraak leverancier |
| Thorbeckestraat_VLB200932.pdf | `tekening` | Sluitplan / cilinderplan |
| Verklaring_geen_privegebruik_auto.pdf | `personeelsdocument` | Formulier Belastingdienst |

### Verwachte uitdagingen

- **`productdocument`** — categorie bestaat in de engine; motor gebruikt vision + tekstsignalen; kans op misclassificatie als `bibliotheek` of `algemeen`.
- **`testrapport` (46 p.)** — engine leest max 5 pagina's; titelblad en eerste pagina's moeten "testrapport"-signalen bevatten (Efectis, testnorm, brandmanchet).
- **Inkoopopdracht vs. offerte** — `Bestelling_Cilinders_*` is een *eigen* opdracht; motor ziet wellicht dezelfde signalen als een leveranciersofferte → kans op `offerte`.
- **Sluitplan** — tekst is waarschijnlijk minimaal; vision-stap is cruciaal voor `tekening`.
- **Belastingdienst-formulier** — `personeelsdocument` is een brede categorie; motor herkent overheidsformulieren mogelijk als `algemeen`.

### Scoremethode (in te vullen na meting)

| Metric | Waarde |
|---|---|
| Exact-match categorie (van 8) | — |
| Betrouwbaarheid gemiddeld | — |
| Factuurextractie correct (leverancier + bedrag) | — |
| AI-kosten indicatief | — |

### Hoe de echte meting te starten

1. Plaatst René de 8 PDF's in `attached_assets/nulmeting/`.
2. Draai het meetscript:
   ```bash
   S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/nulmeting-documentherkenning.ts
   ```
3. Controleer de kolom **Klopt?** in het gegenereerde bestand handmatig.
4. Leg conclusies vast in dit document.

---

*Infrastructuur aanwezig: `scripts/src/nulmeting-documentherkenning.ts` · Categorie-engine: `artifacts/api-server/src/lib/documentIntelligence.ts`*
