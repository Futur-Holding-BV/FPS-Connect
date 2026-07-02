# Grote bestanden — splitsingsvoorstel

**Status:** analyse, geen code gewijzigd  
**Datum:** 2026-07-02  
**Methode:** structuurinspectie (routes, state, componenten, exports)

---

## Overzicht

| Bestand | Regels | Domeinen / verantwoordelijkheden | Prioriteit |
|---|---|---|---|
| `hrm.ts` | 4 164 | 15 (werkgevers, functies, opleidingen, medewerkers, verlof×4, ziekmeldingen, capaciteit, offboarding, aanstellingen, ZZP, documenten, mijn-routes) | Hoog |
| `plattegrond.tsx` | 3 249 | 7 (canvas, spot-plaatsen, serie, scheiding, logo, opname-laag, cluster) | Hoog |
| `print.tsx` | 2 963 | 5 (constanten, sub-componenten, secties, configuratie, orkestratie) | Middel |
| `veiligheid.ts` | 2 485 | 5 (toolboxen, LMRA, meldingen, incidenten, dashboard) | Middel |
| `documenten-tab.tsx` | 2 349 | 6 (constanten, formulier, detail, koppelingen, signaleringen, audittrail) | Middel |
| `personeel/index.tsx` | 2 202 | 8 tabs (medewerkers, werkgevers, functies, opleidingen, bekwaamheden, verlof, ziekmeldingen, statistieken) | Middel |
| `offertes.ts` | 2 028 | 6 (sjablonen, offertes CRUD, regels/secties, portaal, klantcontracten, verzenden) | Laag-middel |

---

## 1. `hrm.ts` — 4 164 regels

### Huidige verantwoordelijkheden

Het bestand bevat 15 volledig losstaande domeinen in één routerbestand:

| Regels | Domein | Routes |
|---|---|---|
| 134–262 | Werkgevers | GET/POST /werkgevers, GET/PATCH /werkgevers/:id |
| 263–404 | Functies (functietitels) | GET/POST/PATCH/DELETE /functies |
| 405–575 | Opleidingen + catalogus | GET/POST/PATCH/DELETE /opleidingen, AI-voorstel per functie |
| 576–889 | Medewerkers CRUD | GET/POST /medewerkers, GET/PATCH/DELETE /medewerkers/:id, onboarding |
| 890–1019 | Medewerker-opleidingen | GET/POST /medewerkers/:id/opleidingen, PATCH/DELETE /medewerker-opleidingen/:id |
| 1020–1130 | Bekwaamheden | GET/POST/PATCH/DELETE /bekwaamheden |
| 1131–1211 | Verlofsoorten | GET/POST/PATCH/DELETE /verlofsoorten |
| 1212–1327 | Verlofsaldi | GET/POST/PATCH/DELETE /verlofsaldi |
| 1328–1640 | Verlofaanvragen | GET/POST/PATCH/DELETE /verlofaanvragen, log, beoordelings-flow |
| 1641–1893 | Verlof-configuratie | Feestdagen, verlof-instellingen, jaarafsluiting-regels |
| 1894–2158 | Jaarafsluiting + correcties | POST /hrm/jaarafsluiting (265 regels), saldocorrectie |
| 2159–2569 | Capaciteit + statistieken | Capaciteitsoverzicht, capaciteitsanalyse, verlof-overzicht, stats, CAO-opties |
| 2570–2975 | Mijn-routes | /mijn/certificaten, /mijn/verlofsoorten, /mijn/verlofsaldi, /mijn/verlofaanvragen, /mijn/ziekmeldingen |
| 2787–2999 | Ziekmeldingen | GET/POST/PATCH/DELETE /ziekmeldingen, statistieken |
| 3000–4163 | Offboarding + ZZP + documenten | Salaris-config, offboard-samenvatting, offboard, arbeidsgetuigenis-AI, aanstellingen, AI-contract-analyse, medewerker-documenten, ZZP-overeenkomsten |

### Voorstel: 8 bestanden

```
routes/hrm-werkgevers.ts          (~130 regels)
  → /werkgevers, /werkgevers/:id, /werkgevers/:id/salaris-config
  → Bevoegdheid: personeel 1/2

routes/hrm-functies-opleidingen.ts  (~320 regels)
  → /functies, /functies/:id, /functies/:id/opleidingen-voorstel
  → /opleidingen, /opleidingen/:id
  → /bekwaamheden, /bekwaamheden/:id
  → /medewerkers/:id/opleidingen, /medewerker-opleidingen/:id
  → /medewerkers/:id/bekwaamheden
  → Bevoegdheid: personeel 1/2

routes/hrm-medewerkers.ts           (~400 regels)
  → /medewerkers, /medewerkers/onboarding, /medewerkers/:id
  → /medewerkers/:id/ai-contract-analyse
  → /medewerkers/:id/documenten, /medewerkers/:id/documenten/:docId
  → Bevoegdheid: personeel 1/2

routes/hrm-verlof.ts                (~850 regels)
  → /verlofsoorten, /verlofsoorten/:id
  → /verlofsaldi, /verlofsaldi/:id
  → /verlofaanvragen, /verlofaanvragen/:id, /verlofaanvragen/:id/log
  → /feestdagen, /verlof-instellingen, /jaarafsluiting-regels
  → /hrm/jaarafsluiting
  → /medewerkers/:id/saldocorrectie
  → /verlof/overzicht
  → Bevoegdheid: personeel 1/2 + systeem 2 voor beheer

routes/hrm-ziekmeldingen.ts         (~220 regels)
  → /ziekmeldingen, /ziekmeldingen/:id, /ziekmeldingen/statistieken
  → Bevoegdheid: personeel 1/2

routes/hrm-capaciteit.ts            (~420 regels)
  → /capaciteit/bezetting
  → /hrm/capaciteit-analyse
  → /hrm/stats, /hrm/cao-opties
  → Bevoegdheid: personeel 1/2

routes/hrm-offboarding.ts           (~520 regels)
  → /medewerkers/:id/offboard-samenvatting
  → /medewerkers/:id/arbeidsgetuigenis-ai
  → /medewerkers/:id/offboard
  → /medewerkers/:id/aanstellingen, /medewerkers/:id/aanstellingen/:aanstellingId
  → Bevoegdheid: personeel 1/2

routes/hrm-zzp.ts                   (~240 regels)
  → /zzp-overeenkomsten, /zzp-overeenkomsten/:id
  → /zzp-overeenkomsten/ai-vullen
  → Bevoegdheid: personeel 1/2

routes/hrm-mijn.ts                  (~420 regels)
  → /mijn/certificaten, /mijn/verlofsoorten, /mijn/verlofsaldi
  → /mijn/verlofaanvragen (GET + POST)
  → /mijn/ziekmeldingen (GET + POST)
  → Bevoegdheid: requireAuth (geen bevoegdheid-check, eigen routes)
```

**Aansluiting in index.ts / hrm-router.ts:**  
Elk bestand exporteert een eigen Express Router. Een nieuw `routes/hrm.ts` (of `routes/hrm-index.ts`) importeert alle deelrouters en monteert ze op de hoofd-app — exact zoals nu, zodat de URL-structuur ongewijzigd blijft.

### Afhankelijkheden

- `services/opleiding-ai.ts` — alleen gebruikt in `hrm-functies-opleidingen.ts`
- `lib/objectStorage.ts` — gebruikt in `hrm-medewerkers.ts` (documenten-upload) en `hrm-zzp.ts`
- `@workspace/db` tabellen — elk deelbestand importeert alleen de tabellen die het nodig heeft
- Gedeelde middleware (`requireBevoegdheid`, `requireAuth`) — elke deelrouter importeert zelf

### Risico's

- **Jaarafsluiting** (265 regels, regel 1894–2158) is de meest complexe handler: trekt verlofsaldi, berekent overdracht, maakt historische records. Dient in één stuk te blijven in `hrm-verlof.ts`.
- **Offboard-flow** (regel 3395–3509) is 114 regels en raakt medewerker, aanstellingen, documenten én verlof tegelijk. Opsplitsen in handlers wijzigt niets; de interne logica blijft intact.
- **`mijn`-routes** bevatten eigen query-logica die overlapt met de admin-equivalenten (verlofaanvragen, verlofsaldi). De logica hoeft niet gedeeld te worden — de routes lezen gewoon op `req.session.gebruikerId`.
- **Circulaire imports:** geen risico, want alle deelrouters importeren vanuit libs/services, niet van elkaar.

---

## 2. `veiligheid.ts` — 2 485 regels

### Huidige verantwoordelijkheden

Gebruikt `veiligheidRouter` (niet de standaard `router`-naam — dit verklaart waarom de eerste grep niets vond):

| Regels | Domein | Routes |
|---|---|---|
| 130–724 | Toolboxen | CRUD, publiceren, AI-analyse, afronden, koppeling-suggestie, AI-batch, review |
| 725–1341 | LMRA's | CRUD, AI-voorstel, upload, mijn-lmra-status + openstaand |
| 1342–1607 | Veiligheidsmeldingen | CRUD + acties |
| 1608–1684 | Dashboard | GET /veiligheid/dashboard |
| 1685–1902 | Maandopdrachten | CRUD, voortgang, mijn-routes |
| 1903–2259 | Incidenten | CRUD, AI-voorstel, upload |
| 2260–2485 | Overig | AI-batch-genereer toolboxen, review-endpoint, compliance |

### Voorstel: 5 bestanden

```
routes/veiligheid-toolboxen.ts      (~700 regels)
  → /veiligheid/toolboxen (CRUD, publiceren, afronden, koppeling,
     AI-analyse, AI-batch-genereer, review)
  → /veiligheid/toolbox-maandopdrachten + voortgang
  → /veiligheid/toolbox-compliance
  → /mijn/toolbox-maandopdracht + uitstellen + voltooien

routes/veiligheid-lmra.ts           (~620 regels)
  → /veiligheid/lmras (CRUD, AI-voorstel, upload)
  → /mijn/lmra-status, /mijn/lmra-openstaand

routes/veiligheid-meldingen.ts      (~270 regels)
  → /veiligheid/meldingen (CRUD)
  → /veiligheid/meldingen/:id/acties (CRUD)

routes/veiligheid-incidenten.ts     (~360 regels)
  → /veiligheid/incidenten (CRUD, AI-voorstel, upload)

routes/veiligheid.ts                (~120 regels — rump + orkestratie)
  → /veiligheid/dashboard
  → Importeert en monteert de 4 deelrouters
  → Gedeelde helpers: addMonths(), mapToolbox(), bevoegdheid-constanten
```

### Afhankelijkheden

- Gedeelde helpers `addMonths()` en `mapToolbox()` worden in meerdere secties gebruikt. Deze blijven in een nieuw `lib/veiligheid-helpers.ts` of in het rump-bestand.
- `pdf-parse` (CJS-import via `createRequire`) wordt gebruikt in de toolbox-AI-sectie — dit import-blok verhuist mee naar `veiligheid-toolboxen.ts`.
- `services/email.ts` (e-mailverzending bij toolbox-publicatie) verhuist mee naar `veiligheid-toolboxen.ts`.
- `logActiviteit()` wordt gebruikt in minstens 4 van de 5 domeinen — elk deelbestand importeert het zelf.

### Risico's

- **Toolbox-batch-genereer** (regel 2260–2388, 128 regels) bevat complexe AI-logica die deelt met de enkelvoudige AI-analyse. Beide blijven in `veiligheid-toolboxen.ts`.
- **Mijn-routes zijn verspreid**: `/mijn/lmra-*` hoort bij LMRA, `/mijn/toolbox-maandopdracht` hoort bij maandopdrachten. Het splitsen hiervan is correct — elk bestand is verantwoordelijk voor zijn eigen mijn-routes.

---

## 3. `offertes.ts` — 2 028 regels

### Huidige verantwoordelijkheden

| Regels | Domein | Routes |
|---|---|---|
| 72–325 | Sjablonen + voorwaarden | Sjablonen CRUD, hoofdstukken CRUD, voorwaarden-sets CRUD |
| 326–538 | Offertes lijst + analytics | GET /offertes, POST /offertes, GET /offertes/analytics (110 regels) |
| 538–674 | Offerte detail | GET/PATCH/DELETE /offertes/:id, AI-presentatieniveau |
| 674–1142 | Inhoud | Regels, uitgangspunten, secties (incl. initialiseren, AI-schrijven) |
| 1143–1303 | Versies + bijlagen | Versie-beheer, bijlagen CRUD |
| 1304–1515 | Portaal + klantinteractie | Spots-koppeling, portaal-tokens, klantvragen |
| 1516–1846 | Communicatie | Tracking, AI-e-mail (108 regels), verzenden (198 regels) |
| 1847–2028 | Klantcontracten | Upload, CRUD, AI-advies, advies ophalen |

### Voorstel: 5 bestanden

```
routes/offerte-sjablonen.ts         (~260 regels)
  → /offerte-sjablonen (CRUD)
  → /offerte-sjablonen/:id/hoofdstukken (CRUD)
  → /offerte-hoofdstukken/:id (CRUD)
  → /offerte-voorwaarden-sets (CRUD)

routes/offertes.ts                  (~780 regels — kern)
  → /offertes (lijst, POST, analytics)
  → /offertes/:id (GET, PATCH, DELETE, AI-presentatieniveau)
  → /offertes/:id/regels + /offerte-regels/:id
  → /offertes/:id/uitgangspunten + /offerte-uitgangspunten/:id
  → /offertes/:id/secties + /offerte-secties/:id + initialiseren + AI-schrijven
  → /offertes/:id/versies
  → /offertes/:id/bijlagen + /offerte-bijlagen/:id

routes/offerte-portaal.ts           (~210 regels)
  → /offertes/:id/uit-spots
  → /offertes/:id/portaal-token(s)
  → /offertes/:id/vragen + /offertes/:id/vragen/:vraagId
  → /offertes/:id/tracking

routes/offerte-communicatie.ts      (~310 regels)
  → /offertes/:id/ai-email
  → /offertes/:id/verzenden

routes/offerte-klantcontracten.ts   (~180 regels)
  → /offertes/:id/klant-contracten (CRUD, upload-url)
  → /offertes/:id/klant-contracten/:contractId/ai-advies
  → /offertes/:id/klant-contracten/:contractId/advies
```

### Afhankelijkheden

- **Spots-koppeling** (`/offertes/:id/uit-spots`) leest uit de spots/voorzieningen-tabel — dit is een cross-domain join. De route blijft in `offerte-portaal.ts`; de import van de spots-tabel gaat mee.
- **Verzenden** (regel 1649–1846, 198 regels) is de langste handler en raakt e-mail, portaal-token én logging tegelijk. In `offerte-communicatie.ts` houden als ongedeelde handler.
- **Analytics** (regel 429–537, 110 regels) bevat zware SQL-aggregaties. Blijft in de kern `offertes.ts`.

### Risico's

- De `/offertes/analytics`-route staat vóór `/offertes/:id` in de routervolgorde — dit is Express-gevoelig. Bij opsplitsen moet de volgorde worden gerespecteerd: `analytics` eerder registreren dan `:id`.
- **AI-secties-schrijven** (regel 1046–1142, 97 regels) is een inline AI-aanroep zonder service-bestand. Bij opsplitsen verhuist dit in één stuk mee naar `offertes.ts` (kern) of kan worden geëxtraheerd naar `services/offerte-ai.ts` (in lijn met de AI-architectuur uit OPDRACHT 4).

---

## 4. `plattegrond.tsx` — 3 249 regels

### Huidige verantwoordelijkheden

Het bestand heeft twee lagen: gedeelde constanten/sub-componenten (regel 1–485) en een monolithisch hoofdcomponent `Plattegrond` (regel 486–3249) met 7 verweven modi:

| Regels | Verantwoordelijkheid |
|---|---|
| 1–155 | Type-constanten, kleurmaps, canvas-afmetingen, cluster-typen |
| 156–485 | Utility-functies + sub-componenten: ClusterBubble, ClusterOmhulling, VoorzieningIcoon, GridAchtergrond, FotoUploader, AiBadge |
| 486–600 | Hoofdcomponent state (pan/zoom, spot-selectie, nieuw-spot-form, AI-state) |
| 601–700 | Serie-plaatsen state (methode klik/lijn/rechthoek, tellers, lijn-coördinaten) |
| 701–800 | PDF-plattegrond state + effects + logo-sleep state |
| 801–1100 | Canvas event handlers (klik, muis, toetsenbord), pan/zoom logica, clustering |
| 1100–1800 | SVG render-tree (canvas, spots, scheidingen, clusters, opname-laag) |
| 1800–3249 | Dialogen (nieuw spot, serie, scheiding, cluster-beheer) + zijpaneel spot-detail |

### Voorstel: 6 bestanden

```
pages/gebouwen/plattegrond-constanten.ts      (~155 regels)
  → TYPEN, SCHEIDING_TYPEN, CLUSTER_TYPEN, CLUSTER_KLEUREN
  → STATUSKLEUREN, STATUSLABEL, CANVAS_W/H, MIN/MAX_ZOOM
  → WBDBO_OPTIES, RUIMTE_STANDAARD, LEEG_FORM
  → Utility-functies: puntOpAfstand(), markerPosities(), groepCentroid()
  → maakVisueleGroepen(), spotVolgnummer(), getRuimteVolgorde()

pages/gebouwen/plattegrond-componenten.tsx    (~330 regels)
  → ClusterBubble, ClusterOmhulling, VoorzieningIcoon
  → GridAchtergrond, FotoUploader, AiBadge
  → Importeert alleen uit plattegrond-constanten.ts

pages/gebouwen/plattegrond-spot-form.tsx      (~400 regels)
  → Dialoog voor aanmaken nieuwe spot
  → AI-herkenningsstap (foto voor → foto na → AI-voorstel → bevestigen)
  → Props: locatie, labels, fabricant-data, onSluiten, onAangemaakt

pages/gebouwen/plattegrond-serie.tsx          (~280 regels)
  → Dialoog + logica voor serie-plaatsen (klik / lijn / rechthoek)
  → Eigen muis-state voor lijn-preview
  → Props: gebouwId, verdiepingId, onGesloten, onGeplaatstReeks

pages/gebouwen/plattegrond-sidebar.tsx        (~350 regels)
  → Detail-paneel voor geselecteerde spot (rechts)
  → Spot-velden bewerken, foto's, cluster, monteurs, verplaatsen
  → Props: spot, onSluiten, onWijziging

pages/gebouwen/plattegrond.tsx                (~500 regels — orkestratie)
  → Hoofdcomponent: pan/zoom state + handlers
  → Canvas SVG render (spots, scheidingen, clusters, opname-laag)
  → Logo-sleep + PDF-laag
  → Monteert plattegrond-spot-form, plattegrond-serie,
    plattegrond-sidebar via conditionale render
  → Scheiding-tekenmodus (behoudt teken-state hier, dialoog wordt klein)
```

### Afhankelijkheden

- `plattegrond-constanten.ts` heeft geen React-afhankelijkheden — puur TypeScript, herbruikbaar in `print.tsx`
- `plattegrond-componenten.tsx` importeert alleen uit constanten + shadcn/ui
- `plattegrond-spot-form.tsx` importeert AI-hooks (`useSpotHerkenning`, `useVolgendSpotNummer`)
- `plattegrond-sidebar.tsx` importeert hooks voor voorziening-update, foto-upload, cluster
- Het hoofdbestand `plattegrond.tsx` importeert alle deelcomponenten + hooks voor data-fetch

### Risico's

- **State-verweving**: de serie-plaatsen modus gebruikt `serieMuis` in de hoofd-SVG canvas-handler. Bij extractie naar `plattegrond-serie.tsx` moet `serieMuis` als callback of ref worden doorgegeven. Geen logica-wijziging, alleen interface-definitie.
- **Scheiding-tekenmodus** is relatief klein (teken-state + dialoog + SVG-overlay) maar verwerkt muis-events op hetzelfde canvas als pan/zoom. Laat de tekenmodus-state in het hoofdbestand; extraheer alleen de dialoog.
- **Constanten-duplicatie met `print.tsx`**: `TYPEN`, `STATUSKLEUREN`, `STATUSLABEL` en `markerPosities` staan in beide bestanden. Na extractie naar `plattegrond-constanten.ts` kan `print.tsx` hieruit importeren (zie sectie 5).

---

## 5. `print.tsx` — 2 963 regels

### Huidige verantwoordelijkheden

| Regels | Verantwoordelijkheid |
|---|---|
| 1–57 | Imports |
| 58–330 | Constanten: kleuren, labels, rapport-types, preset-secties, rapport-modellen, secties-volgorde |
| 330–408 | Utility-functies: weergeefWerendheid, werendheidUitTestnorm, datumNL, markerPosities |
| 391–912 | Sub-componenten: GridAchtergrond, SpotIcoon, Minimap, SpotDetailBlok |
| 912–1362 | Complexe sub-componenten: VerdiepingSpotSelector, PrintVerdieping, e-mail-helpers |
| 1363–1519 | Hoofdcomponent state + initialisatie-effects |
| 1519–2963 | Configuratie-panel + alle rapport-secties (spots, plattegronden, inspecties, onderhoud, e-mails, documenten, tekeningen, FPS-certificaat, contacten/partijen, samenvatting) |

### Voorstel: 5 bestanden

```
pages/gebouwen/print-constanten.ts            (~270 regels)
  → Importeert gedeelde constanten uit plattegrond-constanten.ts
    (TYPEN, STATUSKLEUREN, STATUSLABEL — niet meer dupliceren)
  → Rapport-specifiek: ONDERHOUD_STATUSLABEL, PRIORITEIT_LABEL,
    INSPECTIE_TYPELABEL, INSPECTIE_STATUSLABEL, PARTIJ_TYPELABEL,
    TEKENING_TYPELABEL, DOCUMENTTYPE_LABEL, RAPPORT_TYPE_LABEL,
    PRESET_SECTIES, RAPPORT_MODELLEN, SECTIES_LABELS, SECTIES_VOLGORDE
  → Utility-functies: weergeefWerendheid, werendheidUitTestnorm,
    datumNL, spotVolgnummer, markerPosities

pages/gebouwen/print-componenten.tsx          (~520 regels)
  → GridAchtergrond, SpotIcoon, Minimap
  → SpotDetailBlok (uitgebreid component, 80+ regels)
  → VerdiepingSpotSelector, PrintVerdieping
  → CertificaatFPS
  → renderScheidingen() (helper-functie)
  → E-mail helpers: afzenderKort, ontvangerKort, emailCategorie, bijlagenKort

pages/gebouwen/print-secties.tsx              (~800 regels)
  → Alle rapport-sectie-renders als losse functies/componenten:
    SectieSpots, SectiePlattegronden, SectieInspecties, SectieOnderhoud,
    SectieEmails, SectieDocumenten, SectieTekeningen, SectiePartijen,
    SectieSamenvatting
  → Props: gebouwData + secties-selectie + configuratie

pages/gebouwen/print-configuratie.tsx         (~420 regels)
  → Configuratie-panel (rechts in de UI)
  → Rapport-type kiezen, secties aan/uit, spot-selectie per verdieping
  → Tekeningen en bijlagen kiezen
  → Rapport opslaan + definitief maken
  → Props: rapportState + callbacks

pages/gebouwen/print.tsx                      (~200 regels — orkestratie)
  → Hoofdcomponent GebouwPrint
  → Laadt data (rapport, gebouw, voorzieningen, plattegronden, etc.)
  → Stelt rapport-state samen
  → Rendert: configuratie-panel + preview-panel
  → Monteert print-secties op basis van actieve configuratie
```

### Afhankelijkheden

- `print-constanten.ts` kan gedeelde constanten importeren uit `plattegrond-constanten.ts` — hierdoor vervalt de duplicatie van `TYPEN`, `STATUSKLEUREN`, `markerPosities`.
- `print-secties.tsx` ontvangt data als props; geen directe API-hooks — alleen rendering.
- `print-configuratie.tsx` heeft de rapport-mutatie-hooks nodig (`useUpdateRapport`, `useMaakRapportDefinitief`, `useBewaarOpleverrapport`).
- Het hoofdcomponent `print.tsx` heeft alle data-hooks.

### Risico's

- **`SpotDetailBlok`** (regel 456–912) is 456 regels en bevat zelf twee subweergaven (enkelvoudig en serie). Verhuist als geheel naar `print-componenten.tsx`.
- **FPS-certificaat** (`CertificaatFPS`, regel 754–912) heeft eigen layout-logica. Verhuist naar `print-componenten.tsx`.
- **Gedeelde constanten met plattegrond.tsx**: extractie naar `plattegrond-constanten.ts` is de aanbevolen aanpak. Als de volgorde gerespecteerd wordt (eerst constanten-bestand, dan print, dan plattegrond), zijn er geen circulaire imports.

---

## 6. `documenten-tab.tsx` — 2 349 regels

### Huidige verantwoordelijkheden

| Regels | Verantwoordelijkheid |
|---|---|
| 1–200 | Imports, type-constanten, label-maps, badge-helpers, geëxporteerde functies |
| 201–276 | FormState type + LEEG_FORM |
| 277–359 | `KoppelingenKiezer` sub-component |
| 360–850 | `DocumentFormulier` — volledig aanmaken/bewerken formulier (490 regels) |
| 851–1190 | `DocumentDetail` — detail-dialoog (340 regels) |
| 1191–1345 | `DocumentGoedkeuringSectie` — goedkeurings-flow (155 regels) |
| 1346–1458 | `DocumentEntiteitKoppelingen` — polymorf koppelen (112 regels) |
| 1459–1558 | `KoppelingToevoegen` — koppeling-toevoegen dialoog (100 regels) |
| 1559–1601 | `DocumentLogboekSectie` — logboek weergave |
| 1603–1752 | `KoppelVoorstellenDialog` — AI-koppel-suggesties dialoog (150 regels) |
| 1752–1960 | `DocumentSignaleringenDashboard` — signaleringen-dashboard (208 regels) |
| 1960–2050 | `DocumentAudittrail` — audittrail weergave |
| 2050–2349 | `TabDocumenten` (export default) — hoofdtab met filters + lijst |

### Voorstel: 5 bestanden

```
pages/beheer/documenten-constanten.ts         (~120 regels)
  → TYPE_LABELS, STATUS_LABELS, GOEDKEURING_LABELS, KOPPELING_LABELS
  → Geëxporteerde functies: goedkeuringBadge(), statusBadge(), foutmelding()
  → geldigheidStatus(), formatTijdstip()
  → AI_VELDEN, FormState type, LEEG_FORM, GETEST_VOOR_LABELS

pages/beheer/documenten-formulier.tsx         (~500 regels)
  → KoppelingenKiezer
  → DocumentFormulier (volledig aanmaken/bewerken, 490 regels)
  → Eigen upload-state, hash-berekening, AI-analyse-aanroep
  → Props: open, document?, onOpenChange, onBewaard

pages/beheer/documenten-detail.tsx            (~620 regels)
  → DocumentDetail (detail-dialoog)
  → DocumentGoedkeuringSectie (goedkeurings-flow)
  → DocumentLogboekSectie (logboek)
  → Props: documentId, open, onOpenChange

pages/beheer/documenten-koppelingen.tsx       (~420 regels)
  → DocumentEntiteitKoppelingen (polymorf koppelen, lees + beheer)
  → KoppelingToevoegen (toevoeg-dialoog)
  → KoppelVoorstellenDialog (AI-suggesties)
  → Props: documentId, koppelingen, onGewijzigd

pages/beheer/documenten-signaleringen.tsx     (~300 regels)
  → DocumentSignaleringenDashboard
  → DocumentAudittrail
  → Props: signaleringen, documentId?

pages/beheer/documenten-tab.tsx               (~400 regels — orkestratie)
  → TabDocumenten (export default, behoudt naam)
  → Filters (type, status, fabrikant)
  → Lijst van documenten
  → Monteert: documenten-formulier, documenten-detail, documenten-koppelingen,
    documenten-signaleringen, documenten-audittrail
```

### Afhankelijkheden

- `goedkeuringBadge()`, `statusBadge()`, `foutmelding()` worden geëxporteerd en gebruikt buiten dit bestand (andere pagina's importeren ze). De exports blijven in `documenten-constanten.ts` en moeten opnieuw worden geëxporteerd vanuit `documenten-tab.tsx` voor achterwaartse compatibiliteit, of alle importerende bestanden worden bijgewerkt.
- `DocumentFormulier` roept de AI-document-analyse aan (`useAiDocumentAnalyse`) — deze hook verhuist mee naar `documenten-formulier.tsx`.
- `KoppelVoorstellenDialog` gebruikt AI-suggesties — verhuist naar `documenten-koppelingen.tsx`.

### Risico's

- **Geëxporteerde functies** (`goedkeuringBadge`, `statusBadge`, `foutmelding`, `TYPE_LABELS`, `STATUS_LABELS`) worden in meerdere andere bestanden geïmporteerd vanuit `documenten-tab`. Na opsplitsen moeten al deze imports worden bijgewerkt naar `documenten-constanten`. Dit is een mechanische maar brede wijziging — grep-zoeken op `from.*documenten-tab` toont de impact.
- **FormState + LEEG_FORM** worden gedeeld door formulier en detail. Beide importeren vanuit `documenten-constanten.ts`.

---

## 7. `personeel/index.tsx` — 2 202 regels

### Huidige verantwoordelijkheden

Één pagina met 8 tabs, elk met eigen formulier-state, dialogen en data-flows:

| Tab | Regels (geschat) | Inhoud |
|---|---|---|
| Statistieken | ~40 | Lazy-loaded `HrmWidgets` |
| Medewerkers | ~380 | Lijst, aanmaken-dialoog, onboarden-flow (3 stappen) |
| Werkgevers | ~250 | Lijst, aanmaken/bewerken dialoog |
| Functiehuis | ~220 | Lijst, aanmaken/bewerken dialoog |
| Opleidingen | ~240 | Lijst, aanmaken/bewerken dialoog, AI-voorstel koppelen |
| Bekwaamheden | ~120 | Lijst, bekwaamheid toevoegen |
| Verlof | ~250 | Verlofoverzicht, goedkeuringen |
| Ziekmeldingen | ~150 | Lijst, aanmelden |

Gedeelde state over meerdere tabs:
- `onboardForm` linkt medewerkers-tab aan functies-tab (functie aanmaken triggert terugkoppeling naar onboardForm)
- `functieBewerkenId` / `opleidingBewerkenId` sturen dialoogweergave

### Voorstel: 8 bestanden

```
pages/personeel/tabs/medewerkers-tab.tsx      (~400 regels)
  → Medewerkers-lijst + filter
  → Aanmaken-dialoog (naam, werkmaatschappij, dienstverband)
  → Onboarden-flow: stap 1 (gebruiker kiezen) → stap 2 (functie) → stap 3 (CAO)
  → Props: onFunctieNodig (callback naar functies-tab)

pages/personeel/tabs/werkgevers-tab.tsx       (~260 regels)
  → Werkgevers-lijst
  → Aanmaken/bewerken dialoog (naam, CAO, adres, btw, kvk, etc.)

pages/personeel/tabs/functies-tab.tsx         (~240 regels)
  → Functies-lijst + werkmaatschappij-filter
  → Aanmaken/bewerken dialoog
  → Props: onFunctieAangemaakt (callback naar medewerkers-tab bij onboarden)

pages/personeel/tabs/opleidingen-tab.tsx      (~260 regels)
  → Opleidingen-catalogus + filter
  → Aanmaken/bewerken dialoog (naam, soort, niveau, lesvorm, kosten)
  → AI-voorstel per functie koppelen

pages/personeel/tabs/bekwaamheden-tab.tsx     (~130 regels)
  → Bekwaamheden-lijst (alle medewerkers, per categorie)
  → Bekwaamheid toevoegen

pages/personeel/tabs/verlof-tab.tsx           (~260 regels)
  → Verlofoverzicht (per medewerker, per periode)
  → Aanvragen goedkeuren/afwijzen

pages/personeel/tabs/ziekmeldingen-tab.tsx    (~160 regels)
  → Ziekmeldingen-lijst
  → Ziekte aanmelden dialoog

pages/personeel/index.tsx                     (~200 regels — orkestratie)
  → Tabs-structuur + TabsList
  → Lazy-loaded HrmWidgets voor statistieken
  → OffboardDialog (blijft hier — wordt vanuit meerdere plekken gebruikt)
  → Gedeelde constanten: DIENSTVERBANDEN, SOORT_OPTIES, NIVEAU_OPTIES, etc.
  → Verdeelt de cross-tab callback (onboarden-functie)
```

### Afhankelijkheden

- **Cross-tab state**: `onboardForm.functie_id` wordt gezet vanuit zowel de medewerkers-tab als de functies-tab. De oplossing is een callback-prop: `medewerkers-tab` geeft `onFunctieNodig` door; `functies-tab` roept `onFunctieAangemaakt(functieId)` aan. Het hoofdcomponent `index.tsx` orchestreert deze koppeling.
- **OffboardDialog** (`./offboard-dialog`) raakt meerdere tabs — blijft in `index.tsx` gemonteerd.
- Alle tabs importeren hun eigen hooks; er zijn geen gedeelde query-resultaten over tabs heen (elke tab fetcht zelf).

### Risico's

- **Onboard-flow** is de meest complexe cross-tab interactie. De state `onboardForm` kan worden gesplitst: het formulier-state leeft in `medewerkers-tab.tsx`, de functie-aanmaak-callback in `functies-tab.tsx`. Een kleine callback-interface in `index.tsx` koppelt ze.
- De constanten `DIENSTVERBANDEN`, `SOORT_OPTIES`, `NIVEAU_OPTIES`, `LESVORM_OPTIES` worden door meerdere tabs gebruikt. Ze verhuizen naar `personeel/index.tsx` en worden als props of imports doorgegeven aan de tabs — of naar een gedeeld `personeel-constanten.ts`.

---

## Samenvatting: aandachtspunten bij uitvoering

### Gelden voor alle bestanden

1. **Bestandsvolgorde in Express** — bij backend-splitsingen moeten routes die op gelijke prefix eindigen (bijv. `/offertes/analytics` vóór `/offertes/:id`) in de juiste volgorde worden geregistreerd. Expliciete volgorde in het orkestratie-bestand voorkomen.

2. **Geëxporteerde symbolen bewaken** — frontend-bestanden (met name `documenten-tab.tsx`) exporteren functies die extern gebruikt worden. Bij opsplitsen: grep op `from.*<bestandsnaam>` om alle importerende bestanden te vinden en bij te werken.

3. **Constanten-duplicatie opheffen** — `plattegrond.tsx` en `print.tsx` dupliceren `TYPEN`, `STATUSKLEUREN`, `markerPosities`. Extractie naar `plattegrond-constanten.ts` heft dit op; `print.tsx` importeert dan vanuit dat bestand.

4. **Één bestand per increment** — elk deelbestand is een zelfstandig terugrolbaar checkpoint. Niet meerdere bestanden in één commit mixen.

5. **Geen gedragswijziging** — alle splits zijn puur structureel: geen logica verandert, geen API-contracten wijzigen, geen state-structuur herzien. De test: alle bestaande E2E-tests slagen na elke stap.
