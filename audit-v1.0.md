# Functionele Audit — FPS Brandpreventie, Versie 1.0

**Doel Versie 1.0:** "Administratief gereed voor uitvoering" — een project moet volledig binnen de app kunnen worden voorbereid voor uitvoering, zonder Excel, losse e-mails of externe documenten.

**Aard van dit document:** nulmeting. Het beschrijft per onderdeel wat af is, wat ontbreekt en wat afwijkt van het ontwerp. Er is in deze fase niets hersteld; herstel gebeurt in de vervolgtaak na formeel akkoord.

**Datum:** 10 juni 2026

**Statuslegenda:** Afgerond · Deels uitgevoerd · Ontbreekt · Wijkt af van ontwerp

---

## Samenvatting per onderdeel

| # | Onderdeel | Status |
|---|-----------|--------|
| 1 | Dashboard | Deels uitgevoerd |
| 2 | Projecten (overzicht) | Deels uitgevoerd |
| 3 | Projectformulier | Afgerond |
| 4 | E-mailverwerking | Afgerond |
| 5 | Gebouwgegevens | Afgerond |
| 6 | Gebruikers & rechten | Wijkt af van ontwerp |
| 7 | Stappenplan | Wijkt af van ontwerp |
| 8 | Segmentindeling gebouwkaart | Wijkt af van ontwerp |

---

## 1. Dashboard — Deels uitgevoerd

**Wat werkt.** Er zijn rolgebonden dashboards (beheerder, monteur, klant) met live statistieken voor gebouwen, voorzieningen, onderhoud en aankomende inspectiedatums. De cijfers worden server-side berekend en tonen correct.

**Afwijkingen / aandachtspunten.**
- **Dubbele/legacy variant.** Naast de geïnternationaliseerde dashboards (`pages/dashboard/beheerder.tsx` e.a.) bestaat nog een oudere `pages/dashboard.tsx`. Dit is verwarrend en kan tot afwijkende cijfers/teksten leiden; consolideren is gewenst.
- **Terminologie inconsistent.** Door de app heen wordt door elkaar gesproken van "Spots" vs "voorzieningen" en "Projecten" vs "Gebouwen". Voor V1.0 ("administratief gereed") is één consistente term per begrip wenselijk.
- **"Vervallen inspecties" semantiek.** Dit getal wordt afgeleid van inspecties met status *afgekeurd*. De term "vervallen" suggereert echter *verlopen/over datum*. Begrip en berekening lopen mogelijk niet gelijk; afstemmen welke betekenis bedoeld is.

---

## 2. Projecten (overzicht) — Deels uitgevoerd

**Wat werkt.**
- Project-/gebouwkaartweergave met statistieken per project.
- **Archiveren én terugplaatsen** (`PATCH /gebouwen/:id/archief`) met een archief-toggle in het overzicht; gearchiveerde projecten zijn standaard verborgen.
- **Gereedmelden én heropenen** (`PATCH` en `DELETE /gebouwen/:id/gereed`).
- **Sorteren** op vier opties: alfabetisch, aangemaakt, bijgewerkt en laatste spot.
- **Filteren** op opdrachtgevertype en op naam (partij).
- **Zoeken** op naam, adres en stad.

**Afwijkingen / aandachtspunten.**
- **Zoeken op projectnummer/werknummer ontbreekt.** De zoekfunctie (backend `GET /gebouwen`, parameter `zoek`) filtert uitsluitend op naam, adres en stad. Projectnummer en werknummer — juist de identificatoren waarop gebruikers in de praktijk zoeken — worden niet meegenomen. Dit was een expliciet auditpunt en is daarom de belangrijkste functionele tekortkoming in dit onderdeel.

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

## 6. Gebruikers & rechten — Wijkt af van ontwerp

Dit is de grootste afwijking en vraagt een expliciete beslissing vóór herstel.

**Huidige situatie — 5 systeemrollen.** Het systeem kent exact vijf rollen met eigen rechtenlogica: **hoofdbeheerder, beheerder, monteur, controleur, klant** (`utils/rol.ts`, `context/rol-types.tsx`). De rechten worden afgedwongen via `requireRol(...)` en gebouwtoewijzingen.

**Gewenst — 9 rollen.** Het ontwerp vraagt om: hoofdbeheerder, beheerder, **projectleider, werkvoorbereider, project-admin, uitvoerder**, monteur, **timmerman**, controleur.

**De kloof.** De vier ontbrekende rollen (projectleider, werkvoorbereider, project-admin, uitvoerder/timmerman) bestaan vandaag **uitsluitend als projectfunctie** (`gebruikers.functietitels` / projectteam `project_rol`) — een label binnen een project, **zonder eigen rechtenlogica** in de autorisatielaag. Een "projectleider" heeft systeemtechnisch dezelfde rechten als een beheerder; er is geen onderscheidende permissie.

**Let op (legacy).** In de autorisatielaag bestaat nog een rest-rolwaarde `viewer` als fallback (o.a. in `effectieveContext`); deze is geen toewijsbare frontend-rol. Bij het herwerken van het rolmodel moet deze legacy-waarde worden meegenomen.

**Beslissing nodig in herstel.** Twee aanpakken:
1. **Promoveren tot systeemrol** — de gewenste rollen toevoegen aan het rolmodel met elk eigen rechten. Meeste werk, zuiverste rechtenmodel.
2. **Projectfunctie + permissielaag** — rollen als projectfunctie houden, maar er een rechtenlaag aan koppelen. Minder ingrijpend, maar rechten worden projectspecifiek i.p.v. systeembreed.

Aanbeveling: de gewenste functies/rollen en hun concrete rechten eerst met de gebruiker vastleggen, dán implementeren.

---

## 7. Stappenplan — Wijkt af van ontwerp

**Wat werkt.** Het stappenplan (`gebouw-stappenplan.tsx`) toont per project de administratieve voortgang in fasen (project-/gebouwgegevens, opdrachtgever, e-mails, bouwlagen/plattegronden, FPS Projectteam) met een "administratief gereed"-indicatie. De statussen worden live berekend uit de aanwezige gegevens.

**Afwijkingen / aandachtspunten.**
- **Bibliotheekstap hoort er niet bij.** Fase 2 bevat een (optionele) stap "Applicaties/toepassingen in de bibliotheek beschikbaar maken". De bibliotheek is een **geparkeerde module** (ontwikkelstop) en valt niet onder "administratief gereed voor uitvoering". Deze stap hoort hier uit.
- **Status wordt niet vastgelegd.** De voortgang is client-side afgeleid en niet gepersisteerd. Voor V1.0 acceptabel; benoemen als bewuste keuze.

---

## 8. Segmentindeling gebouwkaart — Wijkt af van ontwerp

**Huidige situatie (`detail.tsx`).** Drie tabbladen:
- Tab "Project & gegevens" — kop "Project- en gebouwgegevens"
- Tab "Uitvoering" — kop "Uitvoering op locatie"
- Tab "Beheer" — kop "Beheer en communicatie"

**Gewenst.** Drie segmenten: **Project & Gebouwgegevens**, **Uitvoering**, **Beheer & Historie**.

**Afwijking.** Segmenten 1 en 2 komen inhoudelijk overeen (alleen kleine benamingsverschillen). Segment 3 heet "Beheer" i.p.v. "Beheer & Historie". Het bevat al een activiteitenfeed (een vorm van historie), maar de benaming en het expliciet positioneren van "Historie" wijken af. Dit is grotendeels een **cosmetische/benamingscorrectie**.

---

## Prioriteitsvoorstel voor herstel (input vervolgtaak)

**P1 — Kern voor "administratief gereed" (eerst doen).**
1. **Gebruikers & rechten** — rolmodel afstemmen en implementeren conform de met de gebruiker te bevestigen aanpak (zie onderdeel 6). Grootste post en vereist een beslissing.
2. **Stappenplan opschonen** — bibliotheekstap verwijderen zodat het plan uitsluitend op administratief gereedmaken is gericht.
3. **Dashboard** — terminologie consistent maken (Spots/voorzieningen, Projecten/Gebouwen) en de semantiek van "vervallen inspecties" afstemmen/corrigeren.

**P2 — Functioneel afronden.**
4. **Projecten zoeken** — zoeken op projectnummer/werknummer toevoegen aan `GET /gebouwen`.
5. **Segmentindeling** — derde segment hernoemen naar "Beheer & Historie" (en eerste consistent naar "Project & Gebouwgegevens").

**P3 — Opruimen / consistentie.**
6. **Legacy dashboard** — `pages/dashboard.tsx` consolideren met de rolgebonden dashboards en de dubbele variant verwijderen.

---

## Randvoorwaarde: ontwikkelstop

Tot Versie 1.0 formeel akkoord is, worden geen nieuwe modules of grote functionaliteiten gestart. Geparkeerd blijven: mobiele monteur-app, CRM-module, onderhoudsmodule, klantportaal, abonnementen, afspraakplanner, bibliotheek/versiebeheer, documentbewaking, urenregistratie, verlofmodule en gereedschapbeheer. Bestaande scaffolds (o.a. `pages/crm/`) worden niet verder uitgebouwd. Deze regel is vastgelegd in `replit.md`.
