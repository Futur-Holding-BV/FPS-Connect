# Functionele Audit — FPS Brandpreventie, Versie 1.0

**Doel Versie 1.0:** "Administratief gereed voor uitvoering" — een project moet volledig binnen de app kunnen worden voorbereid voor uitvoering, zonder Excel, losse e-mails of externe documenten.

**Aard van dit document:** functionele audit, oorspronkelijk opgesteld als nulmeting. De bevindingen per onderdeel zijn behouden als referentie. Een deel van het herstel is daarna — na akkoord van de gebruiker — in dezelfde taak uitgevoerd; per bevinding staat hieronder de **actuele herstelstatus**. De resterende punten (met name het rolmodel) volgen na formele bevestiging.

**Datum nulmeting:** 10 juni 2026 · **Laatst bijgewerkt (herstelstatus):** 10 juni 2026

**Statuslegenda (nulmeting):** Afgerond · Deels uitgevoerd · Ontbreekt · Wijkt af van ontwerp
**Herstellegenda:** Hersteld · Deels hersteld · Open

---

## Herstelstatus in het kort

| # | Onderdeel | Nulmeting | Herstelstatus |
|---|-----------|-----------|---------------|
| 1 | Dashboard | Deels uitgevoerd | Deels hersteld (terminologie + "Afgekeurde inspecties" gedaan; legacy `dashboard.tsx` open) |
| 2 | Gebouwen (overzicht) | Deels uitgevoerd | Hersteld (zoeken op projectnummer/werknummer toegevoegd) |
| 3 | Projectformulier | Afgerond | n.v.t. |
| 4 | E-mailverwerking | Afgerond | n.v.t. |
| 5 | Gebouwgegevens | Afgerond | n.v.t. |
| 6 | Gebruikers & rechten | Wijkt af van ontwerp | Deels hersteld (functietitel-whitelist web/server gesynchroniseerd; definitieve rolmodel-beslissing **open**) |
| 7 | Stappenplan | Wijkt af van ontwerp | Hersteld (bibliotheekstap verwijderd) |
| 8 | Segmentindeling gebouwkaart | Wijkt af van ontwerp | Hersteld (segmenten hernoemd) |

> **Nog open vóór V1.0-akkoord:** (a) rolmodel-beslissing en -implementatie (onderdeel 6, P1) en (b) opruimen legacy `dashboard.tsx` (P3). V1.0 is pas formeel "gereed voor uitvoering" na functionele test door de gebruiker.

---

## 1. Dashboard — nulmeting: Deels uitgevoerd

**Wat werkt.** Er zijn rolgebonden dashboards (beheerder, monteur, klant) met live statistieken voor gebouwen, spots, onderhoud en aankomende inspectiedatums. De cijfers worden server-side berekend en tonen correct.

**Afwijkingen / aandachtspunten.**
- **Dubbele/legacy variant.** Naast de geïnternationaliseerde dashboards (`pages/dashboard/beheerder.tsx` e.a.) bestaat nog een oudere `pages/dashboard.tsx`. Dit is verwarrend en kan tot afwijkende cijfers/teksten leiden; consolideren is gewenst. — **Status: Open** (P3; `dashboard.tsx` is niet geroutet/dead code, daarom laag risico).
- **Terminologie inconsistent.** Door de app heen werd door elkaar gesproken van "Spots" vs "voorzieningen" en "Projecten" vs "Gebouwen". — **Status: Hersteld.** Entiteit geüniformeerd naar **Gebouwen** (navigatie, overzicht, dashboard, "niet gevonden"), objecten naar **Spots**. "Project" blijft bewust gereserveerd voor het administratieve dossier/lifecycle (gereed/archiveren, segment "Project & Gebouwgegevens", FPS Projectteam, projectnummer, projectfunctie, opleverrapport).
- **"Vervallen inspecties" semantiek.** Dit getal wordt afgeleid van inspecties met status *afgekeurd*, terwijl "vervallen" *verlopen/over datum* suggereert. — **Status: Hersteld.** Tegel hernoemd naar **"Afgekeurde inspecties"** in alle talen; de tellingbron (afgekeurde inspecties) is ongewijzigd, het label dekt nu de berekening.

---

## 2. Gebouwen (overzicht) — nulmeting: Deels uitgevoerd

**Wat werkt.**
- Gebouwkaartweergave met statistieken per gebouw.
- **Archiveren én terugplaatsen** (`PATCH /gebouwen/:id/archief`) met een archief-toggle in het overzicht; gearchiveerde gebouwen zijn standaard verborgen.
- **Gereedmelden én heropenen** (`PATCH` en `DELETE /gebouwen/:id/gereed`).
- **Sorteren** op vier opties: alfabetisch, aangemaakt, bijgewerkt en laatste spot.
- **Filteren** op opdrachtgevertype en op naam (partij).
- **Zoeken** op naam, adres en stad.

**Afwijkingen / aandachtspunten.**
- **Zoeken op projectnummer/werknummer ontbrak.** De zoekfunctie (`GET /gebouwen`, parameter `zoek`) filterde uitsluitend op naam, adres en stad. — **Status: Hersteld.** `zoek` doorzoekt nu ook **projectnummer** en **werknummer** (naast naam, adres, stad en partijnamen).

---

## 3. Projectformulier — Afgerond

**Wat werkt.**
- Vastleggen van opdrachtgever, eigenaar/opdrachtgever en contactpersonen.
- AI-aangevulde projectgegevens (adres-/gebouwgegevens), met bevestiging door de beheerder (geverifieerd-vlag).
- CRM-voorbereiding: een uit e-mail herkende contactpersoon kan als **vaste contactpartij** worden opgeslagen bij het gebouw (`POST /gebouwen/:id/partijen`).

**Aandachtspunt.** De bredere CRM-module is bewust geparkeerd (ontwikkelstop). De vaste-contactpartij-opslag die V1.0 nodig heeft, functioneert wel. Geen blokkerende bevindingen.

---

## 4. E-mailverwerking — Afgerond

**Wat werkt.**
- Upload van `.eml`- en `.msg`-bestanden; andere bestandstypen worden geweigerd. Bijlagen worden automatisch uitgelezen.
- AI-projectsamenvatting over de gecombineerde correspondentie (opdrachtomschrijving, opdrachtgever, contactgegevens, afspraken, besluiten, tekeningen, risico's).
- Extractie van **actiepunten** en van **contactpersonen**, inclusief **relevantiebepaling** ("relevant" vs "ter_controle") zodat de beheerder twijfelgevallen zelf beoordeelt.

**Aandachtspunt (buiten scope).** De AI draait op `gpt-4o-mini`. De modelupgrade valt onder een aparte, niet-gerelateerde taak en is hier bewust niet meegenomen.

---

## 5. Gebouwgegevens — Afgerond

**Wat werkt.**
- Adresvelden (adres, postcode, stad) en gebouwkenmerken (type, verdiepingen, hoogte, oppervlakte, afmetingen).
- **Google Maps** locatieweergave (`GET /gebouwen/:id/kaart`): satellietbeeld via lat/lng, of een place-query op adres + stad. De API-sleutel blijft server-side.
- Metrics/spot-statistieken per gebouw.
- Bouwlagen en PDF-plattegronden per verdieping.

Geen blokkerende bevindingen.

---

## 6. Gebruikers & rechten — nulmeting: Wijkt af van ontwerp · herstel: Deels hersteld

Dit is de grootste afwijking en vraagt een expliciete beslissing vóór verder herstel.

**Huidige situatie — 5 systeemrollen.** Het systeem kent exact vijf rollen met eigen rechtenlogica: **hoofdbeheerder, beheerder, monteur, controleur, klant** (`utils/rol.ts`, `context/rol-types.tsx`). De rechten worden afgedwongen via `requireRol(...)` en gebouwtoewijzingen.

**Gewenst — meer rollen.** Het ontwerp vraagt om aanvullende functies: projectleider, werkvoorbereider, project-admin, uitvoerder, timmerman.

**De kloof.** Deze functies bestaan vandaag **als projectfunctie** (`gebruikers.functietitels` / projectteam `project_rol`) — een label binnen een project, **zonder eigen, onderscheidende rechtenlogica** in de autorisatielaag. Een "projectleider" heeft systeemtechnisch dezelfde rechten als een beheerder.

**Reeds gedaan (deelherstel).** De whitelist van kantoor-functietitels is opgeschoond en **identiek gemaakt tussen web (`pages/gebruikers/index.tsx`) en server (`api-server/routes/gebruikers.ts`)**, zodat web en backend niet meer uiteenlopen. Er zijn **geen** nieuwe systeemrollen toegevoegd. Een read-only DB-controle bevestigde dat er geen verouderde functietitel-waarden in de database achterblijven.

**Let op (legacy).** In de autorisatielaag bestaat nog een rest-rolwaarde `viewer` als fallback (o.a. in `effectieveContext`); deze is geen toewijsbare frontend-rol. Bij het herwerken van het rolmodel moet deze legacy-waarde worden meegenomen.

**Beslissing nog open.** Twee aanpakken:
1. **Promoveren tot systeemrol** — de gewenste rollen toevoegen aan het rolmodel met elk eigen rechten. Meeste werk, zuiverste rechtenmodel.
2. **Projectfunctie + permissielaag** — rollen als projectfunctie houden, maar er een rechtenlaag aan koppelen. Minder ingrijpend, maar rechten worden projectspecifiek i.p.v. systeembreed.

Aanbeveling: de gewenste functies/rollen en hun concrete rechten eerst met de gebruiker vastleggen, dán implementeren. **Dit is het belangrijkste resterende punt vóór V1.0-akkoord.**

---

## 7. Stappenplan — nulmeting: Wijkt af van ontwerp · herstel: Hersteld

**Wat werkt.** Het stappenplan (`gebouw-stappenplan.tsx`) toont per project de administratieve voortgang in fasen (project-/gebouwgegevens, opdrachtgever, e-mails, bouwlagen/plattegronden, FPS Projectteam) met een "administratief gereed"-indicatie. De statussen worden live berekend uit de aanwezige gegevens.

**Afwijkingen / aandachtspunten.**
- **Bibliotheekstap hoorde er niet bij.** Fase 2 bevatte een (optionele) stap rond de bibliotheek (geparkeerde module). — **Status: Hersteld.** De bibliotheekstap is uit het stappenplan verwijderd; het plan richt zich nu uitsluitend op administratief gereedmaken.
- **Status wordt niet vastgelegd.** De voortgang is client-side afgeleid en niet gepersisteerd. — **Status: Open (bewuste keuze).** Voor V1.0 acceptabel; benoemd als bewuste keuze.

---

## 8. Segmentindeling gebouwkaart — nulmeting: Wijkt af van ontwerp · herstel: Hersteld

**Nulmeting (`detail.tsx`).** Drie tabbladen waarvan segment 1 en 3 qua benaming afweken van het ontwerp (segment 3 heette "Beheer" i.p.v. "Beheer & Historie").

**Gewenst.** Drie segmenten: **Project & Gebouwgegevens**, **Uitvoering**, **Beheer & Historie**.

**Status: Hersteld.** De tabbladen heten nu **"Project & Gebouwgegevens"**, **"Uitvoering"** en **"Beheer & Historie"** (`detail.tsx`), conform het ontwerp. De activiteitenfeed (historie) zit in segment 3.

---

## Prioriteitsvoorstel voor herstel — voortgang

**P1 — Kern voor "administratief gereed".**
1. **Gebruikers & rechten** — rolmodel afstemmen en implementeren (zie onderdeel 6). — **Deels hersteld** (whitelist gesynchroniseerd); **beslissing + implementatie nog open.** Grootste resterende post.
2. **Stappenplan opschonen** — bibliotheekstap verwijderen. — **Hersteld.**
3. **Dashboard** — terminologie consistent maken (Spots/Gebouwen) en semantiek "vervallen inspecties" corrigeren. — **Hersteld.**

**P2 — Functioneel afronden.**
4. **Gebouwen zoeken** — zoeken op projectnummer/werknummer toevoegen aan `GET /gebouwen`. — **Hersteld.**
5. **Segmentindeling** — segmenten hernoemen conform ontwerp. — **Hersteld.**

**P3 — Opruimen / consistentie.**
6. **Legacy dashboard** — `pages/dashboard.tsx` consolideren met de rolgebonden dashboards en de dubbele variant verwijderen. — **Open** (dead code, laag risico; uit te voeren bij gelegenheid).

---

## Randvoorwaarde: ontwikkelstop

Tot Versie 1.0 formeel akkoord is, worden geen nieuwe modules of grote functionaliteiten gestart. Geparkeerd blijven: mobiele monteur-app, CRM-module, onderhoudsmodule, klantportaal, abonnementen, afspraakplanner, bibliotheek/versiebeheer, documentbewaking, urenregistratie, verlofmodule en gereedschapbeheer. Bestaande scaffolds (o.a. `pages/crm/`) worden niet verder uitgebouwd. Deze regel is vastgelegd in `replit.md`.
