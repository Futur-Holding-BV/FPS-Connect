# Domeinarchitectuur — Migratievoorstel

**Status:** voorstel, ter beoordeling — nog GEEN wijzigingen aan navigatie of code  
**Datum:** 2026-07-02  
**Scope:** FPS Connect (beheerder-layout) — alle 57 nav-items + FPS One (klantportaal)

---

## Uitgangspunt en doel

Het platform is organisch gegroeid. De huidige navigatie heeft 12 secties waarvan de grenzen niet altijd logisch zijn: Opnames en Offertes zitten onder "Projectaanpak", Gereedschappen en Wagenpark zitten onder "Organisatie", Documentopmaak en Workflow zitten óók onder "Organisatie". Gebruikers moeten gissen waar modules staan.

Het doel van deze herstructurering is een intuïtief domeinmodel waarbij een gebruiker op basis van zijn/haar werkdomein direct de juiste module kan vinden. De URL-structuur en bevoegdheidsmatrix worden **niet** aangeraakt — alleen de navigatieindeling.

---

## Huidige structuur (huidig, 12 secties)

| Huidige sectie | Aantal items |
|---|---|
| Dashboard | 1 |
| Projectaanpak (Calculatiefase / Uitvoering / Oplevering) | 12 |
| Inkoop | 2 |
| Magazijn | 9 |
| Commercie | 6 |
| Communicatie | 3 |
| Veiligheid | 6 |
| Financieel | 9 |
| Organisatie | 10 |
| Personeel | 11 |
| Loon | 6 |
| Instellingen | 23 |
| **Totaal** | **98** (inclusief sub-items FPS One) |

---

## Nieuwe domeinstructuur (6 domeinen + platformniveau)

```
FPS Connect
├── [Platform] Dashboard
├── Domein 1: Projecten & Uitvoering
├── Domein 2: Inkoop, Magazijn & Veiligheid
├── Domein 3: Financieel & Loon
├── Domein 4: Commercie
├── Domein 5: Organisatie & Communicatie
└── Domein 6: Instellingen & Beheer

FPS One (apart klantportaal — ongewijzigd)
```

---

## Domein 1 — Projecten & Uitvoering

**Doel:** het brandpreventieve kernproces van opdracht tot oplevering.  
**Doelgroep:** projectleiders, uitvoerders, beheerders.

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Projecten | `/gebouwen` | Projectaanpak | Centrale entiteit van het platform; thuisbasis van de projectleider |
| Werkvoorbereiding | `/werkvoorbereiding` | Projectaanpak › Uitvoering | Directe uitvoering, hoort bij projectflow |
| Regiewerk | `/regie` | Projectaanpak › Uitvoering | Idem |
| Planning | `/modules/planning` | Projectaanpak › Uitvoering | Idem |
| Uitvoering *(disabled)* | — | Projectaanpak › Uitvoering | In aanbouw, blijft in dit domein |
| Opleverrapportage | `/rapporten` | Projectaanpak › Oplevering | Eindresultaat van het project |
| Onderhoud | `/onderhoud` | Projectaanpak › Oplevering | Post-oplevering, logisch verlengstuk |
| Dossiers | `/dossiers` | Projectaanpak › Oplevering | Projectdossier per gebouw |
| Documenten | `/documenten` | Projectaanpak › Oplevering | Projectdocumenten (tekeningen, rapporten) |
| Snagstream archief | `/snagstream` | Projectaanpak › Oplevering | AI-foto-archief van spotafwerking; onderdeel kwaliteitscontrole |

**Aantal items:** 10 (+ 1 disabled)  
**Verplaatsing t.o.v. huidig:** geen — alle items bleven in de hoofdgroep "Projectaanpak"

**Impact:** laag. Items blijven bij elkaar, alleen de groepsnaam "Projectaanpak" wordt "Projecten & Uitvoering".

**Afhankelijkheden:**
- Projecten (`/gebouwen`) is bron voor bijna alle andere domeinen: Commercie koppelt offertes aan gebouwen, Financieel koppelt facturen aan gebouwen, Onderhoud koppelt werkbonnen aan gebouwen.
- Dossiers bouwt voort op Documenten (bevriezingsmechanisme V1.5).
- Opleverrapportage heeft stroomopwaarts afhankelijkheid van spots (Projecten) en stroomafwaarts van Rapporten (V1.5, ook in dit domein).

---

## Domein 2 — Inkoop, Magazijn & Veiligheid

**Doel:** materiaalbeheer, leveranciersrelaties en werkplekveiligheid.  
**Doelgroep:** inkoop, magazijnmedewerkers, veiligheidscoördinatoren.

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Leveranciers | `/leveranciers` | Inkoop | Blijft bij Inkoop |
| Artikelen (inkoop) | `/artikelen` | Inkoop | Inkoopkatalogus; onderscheiden van magazijncatalogus |
| Magazijn dashboard | `/magazijn` | Magazijn | Blijft bij Magazijn |
| Artikelen (magazijn) | `/magazijn/artikelen` | Magazijn | Fysieke voorraadartikelen |
| Locaties | `/magazijn/locaties` | Magazijn | Magazijnlocaties |
| Voorraad | `/magazijn/voorraad` | Magazijn | Voorraadbeheer |
| Stellingscans | `/magazijn/stellingscans` | Magazijn | Barcode/QR-scanregistratie |
| Mutaties | `/magazijn/mutaties` | Magazijn | Voorraadmutaties |
| Reserveringen | `/magazijn/reserveringen` | Magazijn | Gereserveerde materialen per project |
| Uitgifte | `/magazijn/uitgiftes` | Magazijn | Materiaaluitgifte |
| Retouren | `/magazijn/retouren` | Magazijn | Materiaalretour |
| **Gereedschappen** | `/gereedschappen` | **Organisatie** | Gereedschap is een fysiek bedrijfsmiddel; hoort bij magazijn/materiaal, niet bij organisatiebeheer |
| Toolbox Center | `/veiligheid/toolboxen` | Veiligheid | Blijft bij Veiligheid |
| LMRA | `/veiligheid/lmra` | Veiligheid | Last Minute Risico Analyse; werkplekveiligheid |
| Meldingen | `/veiligheid/meldingen` | Veiligheid | Veiligheidsmeldingen |
| Incidenten | `/veiligheid/incidenten` | Veiligheid | Incidentregistratie |
| PBM & Middelen | `/veiligheid/pbm` | Veiligheid | Persoonlijke beschermingsmiddelen |
| Toolbox Compliance | `/veiligheid/toolbox-compliance` | Veiligheid | Rapportage toolbox-deelname |

**Aantal items:** 18  
**Verplaatsing t.o.v. huidig:** Gereedschappen van "Organisatie" → hier

**Reden voor Gereedschappen:** Gereedschappen zijn bedrijfsmiddelen die worden aangeschaft (Inkoop), opgeslagen (Magazijn) en onderhouden. De logische collega van een boorma­chine is de magazijnlocatie, niet de werkmaatschappij.

**Impact:** laag. Inkoop en Magazijn waren al gescheiden groepen; Veiligheid ook. Gereedschappen verdwijnt uit Organisatie — dat is de enige verschuiving.

**Afhankelijkheden:**
- Reserveringen koppelt aan projecten (Domein 1).
- PBM koppelt aan medewerkers (Domein 5).
- Toolbox Center maakt toolboxen aan die medewerkers (Domein 5) moeten lezen en bevestigen.

---

## Domein 3 — Financieel & Loon

**Doel:** alle financiële stromen, facturering en salarisverwerking.  
**Doelgroep:** financieel medewerkers, salarisadministrateurs, directie.

### Sub-sectie: Financieel

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| AccountView-koppeling | `/beheer/boekhouding` | Financieel (systeem) | Integratieconfiguratie; logisch bij Financieel, niet bij Instellingen |
| Facturen | `/facturen/dashboard` | Financieel | Blijft |
| Crediteuren inbox | `/financieel/crediteuren` | Financieel | Inkomende facturen |
| Bedrijfsresultaten | `/financieel/bedrijfsresultaten` | Financieel | P&L-overzicht |
| Onderhanden werk | `/financieel/onderhanden-werk` | Financieel | OHW-berekening |
| Jaarrekening OHW | `/financieel/jaarrekening` | Financieel | Jaarverwerking OHW |
| Klaar voor export | `/facturen/klaar-voor-export` | Financieel | Exportwachtrij naar AccountView |
| Exportlog | `/facturen/exportlog` | Financieel | Audittrail van exports |
| SEPA-bestanden | `/sepa-bestanden` | Financieel | Betaalopdrachten |

### Sub-sectie: Loon

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Salarismutaties | `/salaris-mutaties` | Loon | Blijft |
| SCAB Salarismails | `/scab-mail` | Loon | Blijft |
| Loon-output | `/loon-output` | Loon | Blijft |
| Boekhouderportaal | `/boekhouder` | Loon | Blijft |
| Jaarafsluiting verlof | `/personeel/jaarafsluiting` | Loon | URL misleidend (personeel-prefix), maar functie is loon/payroll jaarafsluiting |
| Salarisarchief | `/salarisarchief` | Loon | Blijft |

**Aantal items:** 15  
**Verplaatsingen t.o.v. huidig:** geen — Financieel en Loon worden samengevoegd tot één domein

**Reden voor samenvoeging:** Financieel en Loon zijn sterk verweven: salarissen zijn een kostenpost in de P&L, SEPA-betaalopdrachten hebben betrekking op zowel crediteuren als loonbetalingen, de boekhouder werkt in beide sub-secties. Twee aparte secties in de huidige nav creëren een kunstmatige scheiding.

**Impact:** laag. Samenvoegen van twee bestaande secties; geen items verhuizen naar andere domeinen.

**Afhankelijkheden:**
- AccountView-koppeling raakt de Instellingen & Beheer-beheerders (API-sleutel instelling). Dubbele zichtbaarheid kan gewenst zijn.
- Jaarafsluiting verlof heeft inhoudelijke koppeling met Verlof-instellingen (Domein 6).
- Facturen koppelen aan projecten (Domein 1) en klanten (Domein 4).

---

## Domein 4 — Commercie

**Doel:** het pre-project commerciële proces van lead tot opdracht.  
**Doelgroep:** accountmanagers, calculatoren, directie.

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| **Opnames** | `/opname` | **Projectaanpak › Calculatiefase** | Opname is een pre-sales site-survey om scope te bepalen; input voor calculatie en offerte |
| **Calculaties** | `/modules/calculatie` | **Projectaanpak › Calculatiefase** | Kostenraming op basis van opname; commerciële fase |
| **Offertes** | `/offertes` | **Projectaanpak › Calculatiefase** | Output van calculatie naar klant; commerciële fase |
| Projectkansen | `/crm/projectkansen` | Commercie (CRM) | Blijft |
| Klanten | `/crm` | Commercie (CRM) | Blijft |
| Organisaties | `/crm/organisaties` | Commercie (CRM) | Blijft |
| Concurrenten | `/crm/concurrenten` | Commercie (CRM) | Blijft |
| Marktinzicht | `/crm/marktintelligentie` | Commercie (CRM) | Blijft |
| Kennisbibliotheek | `/crm/kennisbibliotheek` | Commercie (CRM) | Blijft |

**Aantal items:** 9  
**Verplaatsingen t.o.v. huidig:** Opnames, Calculaties en Offertes van "Projectaanpak" → hier

**Reden voor Opnames/Calculaties/Offertes:** De huidige "Calculatiefase" sub-scheiding in Projectaanpak erkent zelf al dat deze items anders van aard zijn. De stroom is: Projectkans (CRM) → Opname (site visit) → Calculatie → Offerte → Opdracht. Zodra een offerte een opdracht wordt, gaat het project naar Domein 1. De commerciële drempel (pre-opdracht) is de logische domeingrens.

**Impact:** middelhoog. Opnames, Calculaties en Offertes verhuizen uit de centrale "Projectaanpak"-sectie. Gebruikers die gewend zijn alle stappen in één overzicht te zien moeten wennen aan de scheiding op de commerciële drempel. Aanbeveling: in het project-detail (Domein 1) een snelkoppeling naar de bijbehorende offerte tonen.

**Afhankelijkheden:**
- Offertes → Opdracht → Werkvoorbereiding (Domein 1): de handoff van Commercie naar Projecten & Uitvoering is het sleutelpunt. De "Project openen"-knop in het offerte-detail navigeert al naar het gebouw — dit patroon blijft werken ongeacht de domeinsectie.
- Klanten (CRM) koppelt aan facturen (Domein 3) en projecten (Domein 1).

---

## Domein 5 — Organisatie & Communicatie

**Doel:** medewerkers, organisatiestructuur, interne communicatie en wagenparkbeheer.  
**Doelgroep:** HR-medewerkers, leidinggevenden, alle medewerkers (communicatie).

### Sub-sectie: Personeel

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Onboarden | `/personeel/onboarden` | Personeel | Blijft |
| Personeel | `/personeel` | Personeel | Blijft |
| Uitboarden | `/personeel/uitboarden` | Personeel | Blijft |
| Oud-medewerkers | `/personeel/oud-medewerkers` | Personeel | Blijft |
| Externen / ZZP | `/personeel/externen` | Personeel | Blijft |
| Contractbewaking | `/personeel/contracten` | Personeel | Blijft |
| Verlofoverzicht | `/personeel/verlof` | Personeel | Blijft |
| Jaarplanning | `/personeel/jaarplanning` | Personeel | Blijft |
| Urenregistratie | `/uren` | Personeel | Blijft |
| Weekstaten | `/weekstaten` | Personeel | Blijft |
| Hall of Fame | `/hall-of-fame` | Personeel | Blijft |

### Sub-sectie: Communicatie

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Berichten | `/berichten` | Communicatie | Blijft |
| Werk-inbox | `/werk-inbox` | Communicatie | Blijft |
| Slim Uploadpunt | `/inbox` | Communicatie | Blijft |

### Sub-sectie: Organisatie (operationeel)

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Wagenpark | `/wagenpark` | Organisatie | Wagenparkbeheer is een operationele organisatietaak |
| Verzekeringen | `/organisatie/verzekeringen` | Organisatie | Blijft |
| Bedrijfsgegevens | `/organisatie/bedrijfsgegevens` | Organisatie | Blijft |
| Werkmaatschappijen | `/organisatie/werkmaatschappijen` | Organisatie | Blijft |
| Jaarverslagen & Rekeningen | `/organisatie/jaarverslagen` | Organisatie | Blijft |
| Bedrijfsdocumenten | `/organisatie/bedrijfsdocumenten` | Organisatie | Organisatorische documenten (geen projectdocumenten) |

**Aantal items:** 19  
**Verplaatsingen t.o.v. huidig:** Documentopmaak, Document Studio en Workflow zijn verhuisd naar Domein 6 (zie aldaar)

**Reden:** Personeel, Communicatie en de operationele Organisatie-items horen bij de interne bedrijfsvoering — mensen en structuur. Documentopmaak en Studio zijn configuratietools, geen dagelijkse organisatietaken.

**Impact:** laag. Documentopmaak/Studio/Workflow verlaten dit domein; Personeel en Communicatie blijven intact.

**Afhankelijkheden:**
- Weekstaten/Uren koppelen aan Salarismutaties (Domein 3): uren zijn invoer voor de loonverwerking.
- Wagenpark-meldingen worden ingediend door medewerkers (Personeel); beheer zit in Wagenpark.
- Verlofoverzicht heeft instellingen in Domein 6 (Verlof-instellingen) en loonverwerking in Domein 3 (Jaarafsluiting verlof).

---

## Domein 6 — Instellingen & Beheer

**Doel:** platformconfiguratie, gebruikersbeheer en systeembeheer.  
**Doelgroep:** hoofdbeheerders, systeembeheerders.

### Sub-sectie: Content & Documentsysteem

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| **Documentopmaak** | `/organisatie/documentopmaak` | **Organisatie** | Opmaakinstellingen voor het Document Design System — systeemconfiguratie, niet dagelijkse org-taak |
| **Document Studio** | `/organisatie/studio` | **Organisatie** | Templatebeheer voor alle documenttypen — systeemconfiguratie |
| **Workflow** | `/workflow` | **Organisatie** | Procesautomatisering configureren — systeemconfiguratie |
| Bibliotheek | `/beheer/bibliotheek` | Instellingen | Applicaties, labels, toepassingen, fabrikanten |
| Spotconfiguratie | `/beheer/spotconfiguratie` | Instellingen | Spottype-indeling en weergave-instellingen |
| Verlof-instellingen | `/personeel/verlof-instellingen` | Instellingen | CAO-instellingen voor verlof; systeemniveau |

### Sub-sectie: Gebruikers & Toegang

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Gebruikers | `/gebruikers` | Instellingen | Accountbeheer |
| Profielen | `/beheer/profielen` | Instellingen | Bevoegdheidsprofielen |
| Rollen & Rechten | `/beheer/rollen-rechten` | Instellingen | Rollenmatrix |

### Sub-sectie: Platform & Systeem

| Nav-item | Route | Huidige sectie | Toelichting |
|---|---|---|---|
| Go-Live Manager | `/beheer/go-live` | Instellingen | Implementatiechecklist |
| Gebouwenarchief | `/beheer/gebouwen-archief` | Instellingen | Gearchiveerde projecten |
| Login-pogingen | `/beheer/login-pogingen` | Instellingen | Beveiligingsauditlog |
| Mailinstellingen | `/beheer/mail` | Instellingen | SMTP/Graph-configuratie |
| Helpdesk | `/beheer/helpdesk` | Instellingen | Supporttickets |
| Feedback | `/beheer/feedback` | Instellingen | Gebruikersfeedback |
| Heatmaps | `/beheer/heatmaps` | Instellingen | Gebruiksanalyse |
| Ontwikkelstatus | `/beheer/ontwikkelstatus` | Instellingen | Module-beoordelingen |
| Projectstatus | `/beheer/projectstatus` | Instellingen | Alle projecten (admin-overzicht) |
| Importeren | `/beheer/import` | Instellingen | Dataimport |
| Back-up & Herstel | `/beheer/backup` | Instellingen | Databaseback-up |
| Systeemstatus | `/beheer/herstel` | Instellingen | Systeemgezondheid |
| Toolbox *(intern)* | `/toolbox` | Instellingen | Toolbox-inhoud aanmaken voor medewerkers |
| Privacy AVG-matrix | `/beheer/privacy` | Instellingen | Verwerkingsregister |
| Mobiele test | `/beheer/pwa-test` | Instellingen | PWA QR-code |
| Info | `/info` | Instellingen | Platforminformatie |

**Aantal items:** 24  
**Verplaatsingen t.o.v. huidig:** Documentopmaak, Document Studio en Workflow van "Organisatie" → hier

**Reden voor Documentopmaak/Studio/Workflow:** Deze drie zijn configuratietools voor hoe het platform zich gedraagt en hoe documenten eruitzien. Ze worden beheerd door hoofdbeheerders, niet door dagelijkse gebruikers. De huidige plaatsing onder "Organisatie" suggereert ten onrechte dat medewerkers ze regelmatig gebruiken.

**Impact:** laag. Documentopmaak/Studio/Workflow verlaten Organisatie; alle overige Instellingen-items blijven intact.

**Afhankelijkheden:**
- Bibliotheek is de data-bron voor spots en toepassingen (Domein 1).
- Documentopmaak is bron voor het Document Design System dat uitvoer levert in Domein 1 (rapporten), Domein 4 (offertes) en Domein 3 (loonstroken via DDS familie B).
- Verlof-instellingen raakt Verlofoverzicht (Domein 5) en Jaarafsluiting (Domein 3).
- AccountView-koppeling (`/beheer/boekhouding`) staat inhoudelijk in Domein 3; de API-sleutel wordt geconfigureerd door systeembeheerders. Overweging: dubbele zichtbaarheid in zowel Domein 3 als Domein 6.

---

## FPS One — klantportaal (ongewijzigd)

FPS One is een aparte portaal-omgeving voor klanten, bereikbaar via de omgevingsswitch. De structuur wordt **niet** gewijzigd.

| Nav-item | Route | Toelichting |
|---|---|---|
| Dashboard | `/one/dashboard` | Ongewijzigd |
| Gebouwen | `/one/gebouwen` | Ongewijzigd (fixed link OPDRACHT 1) |
| Documenten | `/one/documenten` | Ongewijzigd |
| Rapporten | `/one/rapporten` | Ongewijzigd |
| Abonnementen | `/one/abonnementen` | Ongewijzigd |

---

## Samenvatting verplaatsingen

Van de 57 nav-items worden **6 items verplaatst** naar een ander domein. Alle overige items blijven in hun bestaande logische groep — ze krijgen alleen een nieuwe domeinnaam boven hun bestaande sectie.

| Nav-item | Huidig domein | Nieuw domein | Reden |
|---|---|---|---|
| Opnames | Projectaanpak (Calculatiefase) | Commercie | Pre-sales site-survey, niet uitvoering |
| Calculaties | Projectaanpak (Calculatiefase) | Commercie | Commerciële kostenraming |
| Offertes | Projectaanpak (Calculatiefase) | Commercie | Commerciële output |
| Gereedschappen | Organisatie | Inkoop, Magazijn & Veiligheid | Fysiek bedrijfsmiddel, hoort bij materiaal |
| Documentopmaak | Organisatie | Instellingen & Beheer | Systeemconfiguratie, geen dagelijkse taak |
| Document Studio | Organisatie | Instellingen & Beheer | Systeemconfiguratie |
| Workflow | Organisatie | Instellingen & Beheer | Procesautomatisering = systeemconfiguratie |

---

## Overzichtstabel: alle items per nieuw domein

| Domein | Items | Verplaatsingen in | Verplaatsingen uit |
|---|---|---|---|
| Projecten & Uitvoering | 10 | 0 | Opnames, Calculaties, Offertes |
| Inkoop, Magazijn & Veiligheid | 18 | Gereedschappen | 0 |
| Financieel & Loon | 15 | 0 | 0 |
| Commercie | 9 | Opnames, Calculaties, Offertes | 0 |
| Organisatie & Communicatie | 19 | 0 | Gereedschappen, Documentopmaak, Document Studio, Workflow |
| Instellingen & Beheer | 24 | Documentopmaak, Document Studio, Workflow | 0 |

---

## Impact per domein

### Domein 1 — Projecten & Uitvoering
- **Navigatieimpact:** Opnames, Calculaties en Offertes verdwijnen uit de vertrouwde "Projectaanpak"-weergave. Gebruikers die de volledige projectflow in één oogopslag zagen (opname → calculatie → offerte → werkvoorbereiding) zien nu een gesplitste weergave.
- **Aanbeveling:** in het project-detail (`/gebouwen/:id`) contextlinks toevoegen naar gerelateerde offerte (Commercie) en facturen (Financieel & Loon).

### Domein 2 — Inkoop, Magazijn & Veiligheid
- **Navigatieimpact:** Gereedschappen verhuist van Organisatie naar hier. Geringe impact — gereedschappen was al een zelfstandig item, niet ingebed in een sub-workflow.

### Domein 3 — Financieel & Loon
- **Navigatieimpact:** Financieel en Loon worden één domein. Gebruikers die nu scrollen naar de Loon-sectie vinden die terug als sub-sectie van Financieel & Loon.

### Domein 4 — Commercie
- **Navigatieimpact:** CRM-items staan nu ook in Commercie samen met Opnames/Calculaties/Offertes. De volledige commerciële keten staat nu bij elkaar.
- **Aanbeveling:** sub-secties "Pre-sales" (Opnames, Calculaties, Offertes) en "Relatiebeheer" (CRM) benoemen.

### Domein 5 — Organisatie & Communicatie
- **Navigatieimpact:** Documentopmaak, Document Studio en Workflow verlaten dit domein. De resterende items (Personeel, Communicatie, Organisatie-operationeel) zijn inhoudelijk sterk verwant.

### Domein 6 — Instellingen & Beheer
- **Navigatieimpact:** Documentopmaak, Document Studio en Workflow komen erbij. De sectie groeit van 23 naar 24 items (plus 3 nieuwe). Overweging: opsplitsing in twee sub-secties ("Content & Documenten" en "Systeem") is al voorzien in het voorstel.

---

## Aanbevolen implementatievolgorde

1. **Domein 6 (Instellingen & Beheer)** — laagste risico; weinig dagelijkse gebruikers; Documentopmaak/Studio/Workflow zijn beheerderstools
2. **Domein 3 (Financieel & Loon)** — samenvoegen van twee bestaande secties zonder inhoudelijke verschuivingen
3. **Domein 2 (Inkoop, Magazijn & Veiligheid)** — alleen Gereedschappen verplaatst
4. **Domein 5 (Organisatie & Communicatie)** — items verhuizen naar Domein 6; rest blijft intact
5. **Domein 4 (Commercie)** — Opnames/Calculaties/Offertes verhuizen; communiceer dit actief naar gebruikers
6. **Domein 1 (Projecten & Uitvoering)** — als laatste, nadat alle andere domeinen zijn ingericht; eventuele contextlinks naar andere domeinen kunnen dan meteen worden toegevoegd

---

## Openstaande vragen ter beoordeling

1. **Opnames in Commercie of Projecten?** Opname heeft een dubbele karakter: commercieel (scope bepalen voor offerte) én projectmatig (eerste contact met het gebouw). Het voorstel plaatst Opnames in Commercie. Als het team Opnames primair als een uitvoeringstaak ervaart, kan dit worden herzien.

2. **AccountView-koppeling in Financieel & Loon of Instellingen & Beheer?** De koppeling is inhoudelijk een financieel thema (Domein 3) maar wordt geconfigureerd door systeembeheerders (Domein 6). Overwogen: dubbele vermelding in beide domeinen.

3. **Toolbox (intern, `/toolbox`)** — de interne toolbox-aanmaakmodule staat nu in Instellingen & Beheer. Maar de Toolbox Center (uitvoering door medewerkers, `/veiligheid/toolboxen`) staat in Domein 2. Dit creëert een inhoudelijke splitsing: aanmaken in Domein 6, uitvoeren in Domein 2. Alternatief: interne Toolbox ook naar Domein 2 verplaatsen.

4. **Dashboard** — blijft als platform-landing buiten alle domeinen. Optioneel: een domein-switcher op het dashboard tonen zodat gebruikers vanuit het dashboard direct naar hun domein navigeren.

---

*Migratievoorstel aangemaakt op basis van analyse van `artifacts/firevault/src/layouts/beheerder-layout.tsx` (1671 regels, 57 nav-items). Geen code gewijzigd.*
